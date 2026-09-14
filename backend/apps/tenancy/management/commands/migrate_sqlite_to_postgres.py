import sqlite3
import tempfile
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction


class Command(BaseCommand):
    help = "Copy a Vulcan SQLite database into the configured PostgreSQL database."

    def add_arguments(self, parser):
        parser.add_argument("--source", required=True, type=Path)
        parser.add_argument("--replace-target", action="store_true")
        parser.add_argument("--batch-size", type=int, default=500)

    def handle(self, *args, **options):
        source_path = options["source"].expanduser().resolve()
        if not source_path.is_file():
            raise CommandError(f"SQLite source does not exist: {source_path}")
        if connection.vendor != "postgresql":
            raise CommandError("DJANGO_DATABASE_URL must point to PostgreSQL.")
        if not options["replace_target"]:
            raise CommandError(
                "This replaces the target contents. Re-run with --replace-target after "
                "confirming the PostgreSQL database is dedicated to Vulcan."
            )
        if options["batch_size"] < 1:
            raise CommandError("--batch-size must be positive.")

        snapshot_path = None
        try:
            with tempfile.NamedTemporaryFile(
                prefix="vulcan-sqlite-", suffix=".sqlite3", delete=False
            ) as snapshot:
                snapshot_path = Path(snapshot.name)
            with sqlite3.connect(source_path) as source, sqlite3.connect(snapshot_path) as snapshot:
                source.backup(snapshot)
            self._copy(snapshot_path, options["batch_size"])
        finally:
            if snapshot_path:
                snapshot_path.unlink(missing_ok=True)

    def _copy(self, source_path, batch_size):
        source = sqlite3.connect(source_path)
        source.row_factory = sqlite3.Row
        try:
            source_tables = {
                row[0]
                for row in source.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            }
            with connection.cursor() as cursor:
                target_tables = set(connection.introspection.table_names(cursor))
            missing = source_tables - target_tables
            if missing:
                raise CommandError(
                    "Run Django migrations on PostgreSQL first. Missing tables: "
                    + ", ".join(sorted(missing))
                )

            quote = connection.ops.quote_name
            tables = sorted(source_tables)
            with transaction.atomic(), connection.cursor() as cursor:
                cursor.execute(
                    "TRUNCATE TABLE "
                    + ", ".join(quote(table) for table in tables)
                    + " RESTART IDENTITY CASCADE"
                )
                cursor.execute("SET CONSTRAINTS ALL DEFERRED")
                for table in tables:
                    columns = [
                        row[1] for row in source.execute(f"PRAGMA table_info({quote(table)})")
                    ]
                    boolean_columns = self._boolean_columns(cursor, table)
                    placeholders = ", ".join(["%s"] * len(columns))
                    statement = (
                        f"INSERT INTO {quote(table)} "
                        f"({', '.join(quote(column) for column in columns)}) "
                        f"VALUES ({placeholders})"
                    )
                    count = 0
                    rows = source.execute(f"SELECT * FROM {quote(table)}")
                    while batch := rows.fetchmany(batch_size):
                        values = [
                            tuple(
                                bool(row[column])
                                if column in boolean_columns and row[column] is not None
                                else row[column]
                                for column in columns
                            )
                            for row in batch
                        ]
                        cursor.executemany(statement, values)
                        count += len(values)
                    self.stdout.write(f"{table}: {count}")
                self._reset_sequences(cursor, tables, quote)
                self._verify_counts(source, cursor, tables, quote)
        finally:
            source.close()
        self.stdout.write(self.style.SUCCESS("PostgreSQL migration completed and verified."))

    @staticmethod
    def _boolean_columns(cursor, table):
        cursor.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND table_name = %s "
            "AND data_type = 'boolean'",
            [table],
        )
        return {row[0] for row in cursor.fetchall()}

    @staticmethod
    def _reset_sequences(cursor, tables, quote):
        for table in tables:
            cursor.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND table_name = %s",
                [table],
            )
            for (column,) in cursor.fetchall():
                cursor.execute("SELECT pg_get_serial_sequence(%s, %s)", [table, column])
                sequence = cursor.fetchone()[0]
                if not sequence:
                    continue
                cursor.execute(f"SELECT MAX({quote(column)}) FROM {quote(table)}")
                maximum = cursor.fetchone()[0]
                cursor.execute(
                    "SELECT setval(%s, %s, %s)",
                    [sequence, maximum or 1, maximum is not None],
                )

    @staticmethod
    def _verify_counts(source, cursor, tables, quote):
        mismatches = []
        for table in tables:
            source_count = source.execute(f"SELECT COUNT(*) FROM {quote(table)}").fetchone()[0]
            cursor.execute(f"SELECT COUNT(*) FROM {quote(table)}")
            target_count = cursor.fetchone()[0]
            if source_count != target_count:
                mismatches.append(f"{table}: SQLite={source_count}, PostgreSQL={target_count}")
        if mismatches:
            raise CommandError("Row-count verification failed: " + "; ".join(mismatches))
