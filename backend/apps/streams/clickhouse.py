"""Minimal ClickHouse HTTP client and telemetry schema management."""

from __future__ import annotations

import base64
import json
import re
import ssl
import uuid
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings

IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class ClickHouseError(RuntimeError):
    pass


class ClickHouseTelemetryStore:
    def __init__(self):
        self.url = settings.CLICKHOUSE_URL.rstrip("/")
        self.database = settings.CLICKHOUSE_DATABASE
        if not IDENTIFIER.fullmatch(self.database):
            raise ValueError("CLICKHOUSE_DATABASE is not a safe identifier.")

    def _request(self, query: str, body: bytes = b"") -> bytes:
        url = f"{self.url}/?{urlencode({'query': query})}"
        headers = {"Content-Type": "application/x-ndjson"}
        if settings.CLICKHOUSE_USER:
            token = base64.b64encode(
                f"{settings.CLICKHOUSE_USER}:{settings.CLICKHOUSE_PASSWORD}".encode()
            ).decode()
            headers["Authorization"] = f"Basic {token}"
        context = None
        if self.url.startswith("https://") and not settings.CLICKHOUSE_VERIFY_TLS:
            context = ssl._create_unverified_context()  # noqa: S323 - explicit operator setting
        try:
            with urlopen(
                Request(url, data=body or None, headers=headers, method="POST"),
                timeout=settings.CLICKHOUSE_CONNECT_TIMEOUT_SECONDS,
                context=context,
            ) as response:
                return response.read()
        except Exception as exc:
            raise ClickHouseError(str(exc)) from exc

    def initialize(self) -> None:
        retention = settings.CLICKHOUSE_RETENTION_DAYS
        self._request(f"CREATE DATABASE IF NOT EXISTS {self.database}")
        self._request(
            f"""
            CREATE TABLE IF NOT EXISTS {self.database}.machine_telemetry
            (
                tenant_id UUID,
                factory_id UUID,
                machine_id UUID,
                event_id UUID,
                stream_id Nullable(UUID),
                channel_id LowCardinality(String),
                schema_version LowCardinality(String),
                observed_at DateTime64(3, 'UTC') CODEC(Delta, ZSTD(3)),
                received_at DateTime64(3, 'UTC') CODEC(Delta, ZSTD(3)),
                sequence_no UInt64 CODEC(Delta, ZSTD(3)),
                run_id String CODEC(ZSTD(3)),
                cycle_id String CODEC(ZSTD(3)),
                cycle_number Nullable(UInt64),
                cycle_phase LowCardinality(String),
                recipe_id LowCardinality(String),
                values_json String CODEC(ZSTD(6))
            )
            ENGINE = MergeTree
            PARTITION BY toYYYYMM(observed_at)
            ORDER BY (tenant_id, factory_id, machine_id, observed_at, event_id)
            TTL observed_at + INTERVAL {retention} DAY DELETE
            SETTINGS index_granularity = 8192
            """
        )
        self._request(
            f"""
            CREATE TABLE IF NOT EXISTS {self.database}.machine_telemetry_1m
            (
                tenant_id UUID,
                factory_id UUID,
                machine_id UUID,
                minute DateTime('UTC'),
                sample_count SimpleAggregateFunction(sum, UInt64),
                first_observed_at SimpleAggregateFunction(min, DateTime64(3, 'UTC')),
                last_observed_at SimpleAggregateFunction(max, DateTime64(3, 'UTC'))
            )
            ENGINE = AggregatingMergeTree
            PARTITION BY toYYYYMM(minute)
            ORDER BY (tenant_id, factory_id, machine_id, minute)
            TTL minute + INTERVAL {retention} DAY DELETE
            """
        )
        self._request(
            f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {self.database}.machine_telemetry_1m_mv
            TO {self.database}.machine_telemetry_1m AS
            SELECT tenant_id, factory_id, machine_id,
                   toStartOfMinute(observed_at) AS minute,
                   count() AS sample_count,
                   min(observed_at) AS first_observed_at,
                   max(observed_at) AS last_observed_at
            FROM {self.database}.machine_telemetry
            GROUP BY tenant_id, factory_id, machine_id, minute
            """
        )

    def insert(self, records: list[dict]) -> None:
        if not records:
            return
        body = b"".join(
            json.dumps(record, separators=(",", ":"), default=str).encode() + b"\n"
            for record in records
        )
        self._request(
            f"INSERT INTO {self.database}.machine_telemetry FORMAT JSONEachRow", body
        )

    def ping(self) -> bool:
        return self._request("SELECT 1") == b"1\n"

    def latest_for_machine(self, *, tenant_id, machine_id, limit: int) -> list[dict]:
        """Read a tenant-bound machine slice; identifiers are validated before SQL interpolation."""
        tenant = str(uuid.UUID(str(tenant_id)))
        machine = str(uuid.UUID(str(machine_id)))
        safe_limit = min(500, max(1, int(limit)))
        raw = self._request(
            f"""
            SELECT event_id AS id, event_id, observed_at, received_at, sequence_no,
                   run_id, cycle_id, cycle_number, cycle_phase, recipe_id,
                   schema_version, values_json
            FROM {self.database}.machine_telemetry
            WHERE tenant_id = toUUID('{tenant}') AND machine_id = toUUID('{machine}')
            ORDER BY observed_at DESC
            LIMIT {safe_limit}
            FORMAT JSONEachRow
            """
        )
        results = []
        for line in raw.splitlines():
            if not line:
                continue
            row = json.loads(line)
            row["values"] = json.loads(row.pop("values_json"))
            results.append(row)
        return results
