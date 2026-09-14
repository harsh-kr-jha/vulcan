import json
import logging
import re
from collections.abc import Mapping
from contextvars import ContextVar, Token
from datetime import UTC, datetime
from typing import Any

_request_id: ContextVar[str] = ContextVar("request_id", default="-")
_redacted = "[REDACTED]"
_sensitive_key = re.compile(
    r"(?:password|passwd|pwd|token|secret|authorization|cookie|session|credential|api[_-]?key)",
    re.IGNORECASE,
)
_header_value = re.compile(r"(?im)(?P<key>(?:proxy-)?authorization|(?:set-)?cookie)\s*:\s*[^\r\n]*")
_assigned_value = re.compile(
    r"""
    (?P<prefix>
        ["']?
        [\w.-]*
        (?:password|passwd|pwd|token|secret|authorization|cookie|session|credential|api[_-]?key)
        [\w.-]*
        ["']?
        \s*(?:=|:)\s*
    )
    (?P<value>"[^"]*"|'[^']*'|\[[^\]]*\]|[^\s,;&}\]]+)
    """,
    flags=re.IGNORECASE | re.VERBOSE,
)


def bind_request_id(request_id: str) -> Token[str]:
    return _request_id.set(request_id)


def reset_request_id(token: Token[str]) -> None:
    _request_id.reset(token)


def current_request_id() -> str:
    return _request_id.get()


def _key_is_sensitive(key: object) -> bool:
    return bool(_sensitive_key.search(str(key)))


def redact_sensitive_data(value: Any, *, key: object | None = None) -> Any:
    """Return a log-safe copy without common credential and session values."""
    if key is not None and _key_is_sensitive(key):
        return _redacted
    if isinstance(value, Mapping):
        return {
            item_key: redact_sensitive_data(item_value, key=item_key)
            for item_key, item_value in value.items()
        }
    if isinstance(value, tuple):
        return tuple(redact_sensitive_data(item) for item in value)
    if isinstance(value, list):
        return [redact_sensitive_data(item) for item in value]
    if isinstance(value, set):
        return {redact_sensitive_data(item) for item in value}
    if not isinstance(value, str):
        return value

    redacted = _header_value.sub(lambda match: f"{match.group('key')}: {_redacted}", value)
    return _assigned_value.sub(
        lambda match: f"{match.group('prefix')}{_redacted}",
        redacted,
    )


class SafeLogFilter(logging.Filter):
    """Bind trusted request context and redact likely secrets before any formatter runs."""

    _record_fields_to_skip = {
        "args",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "module",
        "msecs",
        "message",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "thread",
        "threadName",
    }

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except (TypeError, ValueError):
            message = str(record.msg)
        record.msg = redact_sensitive_data(message)
        record.args = ()
        request = getattr(record, "request", None)
        record.request_id = getattr(request, "request_id", current_request_id())

        for field, value in tuple(record.__dict__.items()):
            if field in self._record_fields_to_skip or field == "request_id":
                continue
            record.__dict__[field] = redact_sensitive_data(value, key=field)
        return True


class ReadableFormatter(logging.Formatter):
    """Keep development logs readable while applying the same redaction policy."""

    def format(self, record: logging.LogRecord) -> str:
        return redact_sensitive_data(super().format(record))


class JsonFormatter(logging.Formatter):
    """Emit a small, stable JSON envelope suitable for production log collectors."""

    safe_extra_fields = ("event", "account_fingerprint", "client_ip")

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_sensitive_data(record.getMessage()),
            "request_id": getattr(record, "request_id", current_request_id()),
        }
        for field in self.safe_extra_fields:
            if value := getattr(record, field, None):
                payload[field] = redact_sensitive_data(value, key=field)
        if record.exc_info:
            payload["exception"] = redact_sensitive_data(self.formatException(record.exc_info))
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
