"""Unit tests for the read-only safety verifier (no DB required).

Everything runs against controllable fake DB-API connections: no real database
is ever opened. The fakes let each of the seven write probes be scripted
independently (denied / non-permission error / success) so the verdict logic
can be checked against explainable evidence only.
"""

from __future__ import annotations

import pytest

from iblai_ontology.backend.discovery.safety import (
    MISSING_TABLE_INDICATORS,
    PERMISSION_INDICATORS,
    SafetyVerifier,
)
from iblai_ontology.backend.discovery.safety import TestResult as Status

_WRITE_KEYWORDS = ("CREATE", "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE")
_WRITE_TEST_NAMES = (
    "CREATE TABLE",
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP TABLE",
    "ALTER TABLE",
    "TRUNCATE",
)


class FakeCursor:
    """A DB-API-ish cursor whose write behaviour is configurable."""

    def __init__(self, *, deny_writes: bool, has_table: bool = True):
        self.deny_writes = deny_writes
        self.has_table = has_table
        self._result = None

    def execute(self, sql: str):
        upper = sql.strip().upper()
        # Metadata reads used to locate a table / first column.
        if upper.startswith("SELECT") or upper.startswith("SHOW"):
            if "COLUMN_NAME" in upper or "SYS.COLUMNS" in upper:
                self._result = ("some_col",)
            elif (
                "TABLE_SCHEMA, TABLE_NAME" in upper
            ):  # PostgreSQL: schema-qualified probe table
                self._result = ("public", "SOME_TABLE") if self.has_table else None
            elif "TABLE_NAME" in upper or "TABLES" in upper or upper.startswith("SHOW"):
                self._result = ("SOME_TABLE",) if self.has_table else None
            else:
                self._result = ("x",)
            return
        # Any write statement.
        if any(upper.startswith(k) for k in _WRITE_KEYWORDS):
            if self.deny_writes:
                raise Exception("ERROR: permission denied for relation some_table")
            # Write succeeds (dangerous).
            self._result = None
            return
        self._result = None

    def fetchone(self):
        return self._result

    def fetchall(self):
        return [self._result] if self._result else []


class FakeConnection:
    def __init__(self, *, deny_writes: bool, has_table: bool = True):
        self.deny_writes = deny_writes
        self.has_table = has_table
        self.committed = False
        self.rolled_back = False

    def cursor(self):
        return FakeCursor(deny_writes=self.deny_writes, has_table=self.has_table)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


# ---------------------------------------------------------------------------
# Scriptable fakes: each write keyword gets its own behaviour ("deny" /
# "error" / "succeed" / an explicit exception instance), and every SQL string
# is recorded for shape assertions.
# ---------------------------------------------------------------------------
class ScriptedCursor:
    def __init__(self, conn):
        self.conn = conn
        self._result = None

    def execute(self, sql: str):
        self.conn.log.append(sql)
        upper = sql.strip().upper()

        if upper.startswith("SELECT") or upper.startswith("SHOW"):
            if self.conn.find_raises:
                raise self.conn.find_raises
            if "COLUMN_NAME" in upper or "SYS.COLUMNS" in upper:
                self._result = (self.conn.column_name,)
            elif "TABLE_SCHEMA, TABLE_NAME" in upper:
                self.conn._metadata_ready = True
                self._result = (
                    (self.conn.pg_schema, self.conn.table_name)
                    if self.conn.has_table
                    else None
                )
            elif "TABLE_NAME" in upper or "TABLES" in upper or upper.startswith("SHOW"):
                self.conn._metadata_ready = True
                self._result = (self.conn.table_name,) if self.conn.has_table else None
            else:
                self._result = ("x",)
            return

        if any(upper.startswith(k) for k in _WRITE_KEYWORDS):
            behavior = self.conn.behavior_for(upper)
            if isinstance(behavior, BaseException):
                raise behavior
            if behavior == "deny":
                raise Exception(self.conn.permission_message)
            if behavior == "error":
                raise Exception(self.conn.error_message)
            # "succeed": the write goes through without error.
            self._result = None
            return

        self._result = None

    def fetchone(self):
        return self._result

    def fetchall(self):
        return [self._result] if self._result else []


class ScriptedConnection:
    """Configurable fake connection used by the new evidence-based tests."""

    def __init__(
        self,
        *,
        db_type: str = "postgresql",
        has_table: bool = True,
        default_behavior: str = "deny",
        overrides: dict | None = None,
        permission_message: str = "ERROR: permission denied for relation some_table",
        error_message: str = "connection reset by peer (SQLSTATE 08006)",
        find_raises: BaseException | None = None,
        table_name: str = "SOME_TABLE",
        pg_schema: str = "public",
        column_name: str = "some_col",
        cursor_raises: BaseException | None = None,
    ):
        self.db_type = db_type
        self.has_table = has_table
        self.default_behavior = default_behavior
        self.overrides = overrides or {}
        self.permission_message = permission_message
        self.error_message = error_message
        self.find_raises = find_raises
        self.table_name = table_name
        self.pg_schema = pg_schema
        self.column_name = column_name
        self.cursor_raises = cursor_raises
        self.log: list[str] = []
        self.rollback_count = 0
        self.commit_count = 0
        self.closed = False
        # Metadata reads open cursors too; only start failing once probing begins.
        self._metadata_ready = False

    def cursor(self):
        if self.cursor_raises and self._metadata_ready:
            raise self.cursor_raises
        return ScriptedCursor(self)

    def rollback(self):
        self.rollback_count += 1

    def commit(self):
        self.commit_count += 1

    def close(self):
        self.closed = True

    def behavior_for(self, upper_sql: str) -> str | BaseException:
        for keyword in self.overrides:
            if upper_sql.startswith(keyword):
                return self.overrides[keyword]
        return self.default_behavior


def _by_name(result, name: str):
    return next(t for t in result.tests if t.test_name == name)


# ---------------------------------------------------------------------------
# Original coverage (kept): read-only pass, writable fail, no-table, remediation
# ---------------------------------------------------------------------------
def test_readonly_credentials_pass():
    conn = FakeConnection(deny_writes=True)
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert result.all_passed
    assert result.overall_status == Status.PASSED
    assert len(result.tests) == 7
    assert all(t.result == Status.PASSED for t in result.tests)
    assert result.remediation_sql is None
    assert result.message is None


def test_write_credentials_fail_and_get_remediation():
    conn = FakeConnection(deny_writes=False)
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert not result.all_passed
    assert result.overall_status == Status.FAILED
    assert any(t.result == Status.FAILED for t in result.tests)
    assert "CREATE ROLE" in result.remediation_sql  # postgres remediation
    # The summary still separates passed / FAILED / errors.
    assert "FAILED" in result.summary


def test_no_tables_is_inconclusive():
    conn = FakeConnection(deny_writes=True, has_table=False)
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert result.overall_status == Status.ERROR
    assert result.tests == []
    assert result.remediation_sql is None
    assert result.message  # an explainable reason is attached


def test_remediation_sql_per_dialect():
    for db_type, marker in [
        ("oracle", "CREATE USER iblai_readonly"),
        ("mysql", "CREATE USER 'iblai_readonly'"),
        ("sqlserver", "db_datareader"),
    ]:
        v = SafetyVerifier(FakeConnection(deny_writes=True), db_type=db_type)
        assert marker in v.remediation_sql()


class RecordingCursor(FakeCursor):
    """Records SQL; a DROP of the never-created probe table reports it missing."""

    def __init__(self, log: list[str], **kw):
        super().__init__(**kw)
        self.log = log

    def execute(self, sql: str):
        self.log.append(sql)
        if sql.strip().upper().startswith("DROP"):
            raise Exception(
                "Table demo.__iblai_safety_test does not exist. (UNKNOWN_TABLE)"
            )
        super().execute(sql)


class RecordingConnection(FakeConnection):
    def __init__(self, **kw):
        super().__init__(**kw)
        self.log: list[str] = []

    def cursor(self):
        return RecordingCursor(
            self.log, deny_writes=self.deny_writes, has_table=self.has_table
        )


def test_drop_of_never_created_probe_table_counts_as_denied():
    result = SafetyVerifier(
        RecordingConnection(deny_writes=True), db_type="postgresql"
    ).run_all_tests()
    assert result.all_passed
    drop = next(t for t in result.tests if t.test_name == "DROP TABLE")
    assert drop.result == Status.PASSED


def test_missing_table_excuses_only_the_drop_probe():
    class MissingOnInsert(RecordingCursor):
        def execute(self, sql: str):
            if sql.strip().upper().startswith("INSERT"):
                raise Exception('relation "some_table" does not exist')
            super().execute(sql)

    class Conn(RecordingConnection):
        def cursor(self):
            return MissingOnInsert(self.log, deny_writes=True)

    result = SafetyVerifier(
        Conn(deny_writes=True), db_type="postgresql"
    ).run_all_tests()
    insert = next(t for t in result.tests if t.test_name == "INSERT")
    assert insert.result == Status.ERROR
    assert not result.all_passed


def test_alter_probe_uses_add_column_except_on_oracle():
    pg = RecordingConnection(deny_writes=True)
    SafetyVerifier(pg, db_type="postgresql").run_all_tests()
    assert any(
        s.startswith('ALTER TABLE "public"."SOME_TABLE" ADD COLUMN ') for s in pg.log
    )

    ora = RecordingConnection(deny_writes=True)
    SafetyVerifier(ora, db_type="oracle").run_all_tests()
    assert any(
        s.startswith("ALTER TABLE SOME_TABLE ADD __iblai_safety_col") for s in ora.log
    )


def test_postgres_probe_targets_any_readable_schema():
    # A CRM keeps its tables outside public; the probes name them quoted, camelCase intact.
    class WorkspaceCursor(RecordingCursor):
        def execute(self, sql: str):
            if "TABLE_SCHEMA, TABLE_NAME" in sql.upper():
                self.log.append(sql)
                self._result = ("workspace_x", "workspaceMember")
                return
            super().execute(sql)

    class Conn(RecordingConnection):
        def cursor(self):
            return WorkspaceCursor(self.log, deny_writes=True)

    conn = Conn(deny_writes=True)
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert result.all_passed
    assert any(
        s.startswith('INSERT INTO "workspace_x"."workspaceMember" ("some_col")')
        for s in conn.log
    )


# ---------------------------------------------------------------------------
# Evidence discipline: only explainable permission refusals count as PASSED
# ---------------------------------------------------------------------------
def test_non_permission_error_is_error_not_passed():
    # A network/transport error contains no permission signature and must not
    # be mistaken for a refusal.
    conn = ScriptedConnection(default_behavior="error")
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()

    assert len(result.tests) == 7
    assert all(t.result == Status.ERROR for t in result.tests)
    assert result.overall_status == Status.ERROR
    assert result.remediation_sql is None
    assert not result.all_passed


def test_bare_permission_word_inside_unrelated_error_is_not_a_pass():
    # The old tuple contained a bare "permission", so this driver message was
    # misread as a refusal. Specific indicators prevent that.
    conn = ScriptedConnection(
        default_behavior="error",
        error_message="internal error while checking driver permission cache",
    )
    assert "permission denied" not in conn.error_message.lower()
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert result.overall_status == Status.ERROR
    assert all(t.result == Status.ERROR for t in result.tests)


def test_one_inconclusive_probe_keeps_overall_error_even_if_rest_denied():
    # Six clean refusals plus one unexplainable error => ERROR, never PASSED
    # and never FAILED (no write actually succeeded).
    conn = ScriptedConnection(default_behavior="deny", overrides={"INSERT": "error"})
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()

    assert _by_name(result, "INSERT").result == Status.ERROR
    assert sum(1 for t in result.tests if t.result == Status.PASSED) == 6
    assert sum(1 for t in result.tests if t.result == Status.ERROR) == 1
    assert result.overall_status == Status.ERROR
    assert result.remediation_sql is None
    assert not result.all_passed


def test_error_and_success_mix_is_failed_with_remediation():
    # A successful write outranks inconclusive probes: the account is writable.
    conn = ScriptedConnection(
        default_behavior="deny",
        overrides={"INSERT": "succeed", "DELETE": "error"},
    )
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()

    assert result.overall_status == Status.FAILED
    assert _by_name(result, "INSERT").result == Status.FAILED
    assert _by_name(result, "DELETE").result == Status.ERROR
    assert "CREATE ROLE" in result.remediation_sql
    counts = result.summary
    assert "1 FAILED" in counts and "1 errors" in counts


def test_all_seven_probes_always_run_and_recorded():
    # Even after an earlier write succeeds, the remaining probes still run.
    conn = ScriptedConnection(default_behavior="succeed")
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()

    assert [t.test_name for t in result.tests] == list(_WRITE_TEST_NAMES)
    assert len(result.tests) == 7
    assert all(t.result == Status.FAILED for t in result.tests)
    # Every probe carries the SQL it attempted.
    assert all(t.sql_attempted for t in result.tests)


def test_summary_counts_each_category():
    conn = ScriptedConnection(
        default_behavior="deny",
        overrides={"INSERT": "succeed", "UPDATE": "error", "DELETE": "error"},
    )
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert result.summary == "4 passed, 1 FAILED, 2 errors out of 7 tests"


def test_no_table_is_error_even_when_writes_would_be_denied():
    conn = ScriptedConnection(has_table=False, default_behavior="deny")
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert result.overall_status == Status.ERROR
    assert result.tests == []
    # No write SQL was ever attempted.
    assert not any(
        s.strip().upper().startswith(k) for s in conn.log for k in _WRITE_KEYWORDS
    )


def test_metadata_failure_is_inconclusive_without_escaping():
    # The table-discovery read itself blows up: ERROR, no uncaught exception.
    conn = ScriptedConnection(find_raises=RuntimeError("metadata catalog unreachable"))
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert result.overall_status == Status.ERROR
    assert result.tests == []
    assert "unverified" in (result.message or "")


def test_cursor_open_failure_is_inconclusive_per_probe():
    conn = ScriptedConnection(
        cursor_raises=RuntimeError("cursor pool exhausted"),
        default_behavior="deny",
    )
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert len(result.tests) == 7
    assert all(t.result == Status.ERROR for t in result.tests)
    assert result.overall_status == Status.ERROR


def test_unexpected_probe_crash_is_caught_and_recorded(monkeypatch):
    # Defensive guard: even if _run_single_test itself raises, the suite keeps
    # going and the crashed probe is recorded as ERROR.
    conn = ScriptedConnection(default_behavior="deny")
    verifier = SafetyVerifier(conn, db_type="postgresql")

    def boom(name, table):  # noqa: ARG001
        if name == "UPDATE":
            raise RuntimeError("unexpected driver crash")
        return original(verifier, name, table)

    original = SafetyVerifier._run_single_test
    monkeypatch.setattr(SafetyVerifier, "_run_single_test", boom)

    result = verifier.run_all_tests()
    assert len(result.tests) == 7
    assert _by_name(result, "UPDATE").result == Status.ERROR
    assert result.overall_status == Status.ERROR


# ---------------------------------------------------------------------------
# Connection hygiene: rollback after probing, cleanup of a created probe table
# ---------------------------------------------------------------------------
def test_connection_is_rolled_back_after_the_suite():
    conn = ScriptedConnection(default_behavior="deny")
    SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert conn.rollback_count >= 1


def test_cleanup_failure_does_not_mask_the_failed_verdict():
    class FlakyCursor(ScriptedCursor):
        def execute(self, sql: str):
            if sql.strip().upper() == "DROP TABLE __IBLAI_SAFETY_TEST":
                raise RuntimeError("cleanup failed: lock timeout")
            super().execute(sql)

    class FlakyConn(ScriptedConnection):
        def cursor(self):
            return FlakyCursor(self)

    conn = FlakyConn(default_behavior="deny", overrides={"CREATE": "succeed"})
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert result.overall_status == Status.FAILED
    assert _by_name(result, "CREATE TABLE").result == Status.FAILED


def test_successful_create_table_is_cleaned_up():
    conn = ScriptedConnection(
        default_behavior="deny",
        overrides={"CREATE": "succeed", "DROP": "succeed"},
    )
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()

    assert result.overall_status == Status.FAILED
    # The verifier drops the probe table it accidentally created, then commits.
    assert any(s.strip().upper() == "DROP TABLE __IBLAI_SAFETY_TEST" for s in conn.log)
    assert conn.commit_count >= 1


# ---------------------------------------------------------------------------
# Dialect-specific SQL shapes
# ---------------------------------------------------------------------------
def test_postgres_alter_and_update_shapes():
    conn = ScriptedConnection(default_behavior="deny")
    SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert any(
        s == 'ALTER TABLE "public"."SOME_TABLE" ADD COLUMN __iblai_safety_col INTEGER'
        for s in conn.log
    )
    assert any(
        s == 'UPDATE "public"."SOME_TABLE" SET "some_col" = "some_col" WHERE 1=0'
        for s in conn.log
    )
    assert any(
        s == 'INSERT INTO "public"."SOME_TABLE" ("some_col") VALUES (NULL)'
        for s in conn.log
    )
    assert any(s == 'DELETE FROM "public"."SOME_TABLE" WHERE 1=0' for s in conn.log)
    assert any(s == 'TRUNCATE TABLE "public"."SOME_TABLE"' for s in conn.log)


def test_oracle_alter_uses_add_without_column_keyword():
    conn = ScriptedConnection(db_type="oracle", default_behavior="deny")
    SafetyVerifier(conn, db_type="oracle").run_all_tests()
    assert any(
        s == "ALTER TABLE SOME_TABLE ADD __iblai_safety_col INTEGER" for s in conn.log
    )
    # ADD COLUMN would be an Oracle syntax error, not a permission refusal.
    assert not any("ADD COLUMN" in s for s in conn.log)


def _connector_conn(db_type: str, **kwargs) -> ScriptedConnection:
    """A ScriptedConnection posing as an auto-ontology connector-backed link."""

    class DummyConnector:
        pass

    conn = ScriptedConnection(db_type=db_type, **kwargs)
    conn.connector = DummyConnector()
    return conn


def test_clickhouse_update_uses_alter_table_mutation(monkeypatch):
    # Connector-backed connections resolve the probe target via first_table_and_column.
    monkeypatch.setattr(
        "iblai_ontology.backend.discovery.connectors.first_table_and_column",
        lambda connector: ("demo.events", "event_id"),
    )
    conn = _connector_conn("clickhouse", default_behavior="deny")
    SafetyVerifier(conn, db_type="clickhouse").run_all_tests()
    assert any(
        s == "ALTER TABLE demo.events UPDATE event_id = event_id WHERE 1=0"
        for s in conn.log
    )
    # A plain UPDATE statement must never be generated for ClickHouse.
    assert not any(s.strip().upper().startswith("UPDATE ") for s in conn.log)


def test_clickhouse_alter_keeps_add_column(monkeypatch):
    monkeypatch.setattr(
        "iblai_ontology.backend.discovery.connectors.first_table_and_column",
        lambda connector: ("demo.events", "event_id"),
    )
    conn = _connector_conn("clickhouse", default_behavior="deny")
    SafetyVerifier(conn, db_type="clickhouse").run_all_tests()
    assert any(
        s == "ALTER TABLE demo.events ADD COLUMN __iblai_safety_col INTEGER"
        for s in conn.log
    )


def test_mysql_and_sqlserver_shapes_are_unquoted():
    my = ScriptedConnection(db_type="mysql", default_behavior="deny")
    SafetyVerifier(my, db_type="mysql").run_all_tests()
    assert any(
        s == "UPDATE SOME_TABLE SET some_col = some_col WHERE 1=0" for s in my.log
    )
    assert any(
        s == "ALTER TABLE SOME_TABLE ADD COLUMN __iblai_safety_col INTEGER"
        for s in my.log
    )

    ms = ScriptedConnection(db_type="sqlserver", default_behavior="deny")
    SafetyVerifier(ms, db_type="sqlserver").run_all_tests()
    assert any(s == "TRUNCATE TABLE SOME_TABLE" for s in ms.log)


def test_non_public_postgres_schema_is_quoted_in_every_probe():
    conn = ScriptedConnection(
        default_behavior="deny", pg_schema="crm", table_name="workspaceMember"
    )
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    assert result.overall_status == Status.PASSED
    targeted = [
        s
        for s in conn.log
        if any(
            s.strip().upper().startswith(k)
            for k in ("INSERT", "UPDATE", "DELETE", "ALTER", "TRUNCATE")
        )
    ]
    assert targeted  # probes were generated
    assert all('"crm"."workspaceMember"' in s for s in targeted)


# ---------------------------------------------------------------------------
# Permission indicators cover each dialect's real refusal vocabulary
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "message",
    [
        "ERROR: permission denied for table customers",  # PostgreSQL
        "ORA-01031: insufficient privileges",  # Oracle
        "1142 (42000): INSERT command denied to user 'ro'@'%' for table 't'",  # MySQL
        "1045 (28000): Access denied for user 'ro'@'%'",  # MySQL
        "The INSERT permission was denied on the object 't'",  # SQL Server
        "SQL access control error: Insufficient privileges to operate on table 'T'",  # Snowflake
        "Access Denied: Cannot insert into table",  # Trino
        "Exception: Cannot execute query in readonly mode",  # ClickHouse
    ],
)
def test_real_world_permission_messages_pass(message):
    conn = ScriptedConnection(
        default_behavior="error",
        overrides={"INSERT": RuntimeError(message)},
    )
    result = SafetyVerifier(conn, db_type="postgresql").run_all_tests()
    insert = _by_name(result, "INSERT")
    assert insert.result == Status.PASSED
    # The other six probes still hit the generic non-permission error.
    assert result.overall_status == Status.ERROR


def test_oracle_missing_table_only_passes_the_drop_probe():
    conn = ScriptedConnection(
        default_behavior="deny",
        overrides={"DROP": RuntimeError("ORA-00942: table or view does not exist")},
    )
    result = SafetyVerifier(conn, db_type="oracle").run_all_tests()
    assert _by_name(result, "DROP TABLE").result == Status.PASSED
    assert result.overall_status == Status.PASSED

    # Same message on INSERT is inconclusive, not a pass.
    conn2 = ScriptedConnection(
        default_behavior="deny",
        overrides={"INSERT": RuntimeError("ORA-00942: table or view does not exist")},
    )
    result2 = SafetyVerifier(conn2, db_type="oracle").run_all_tests()
    assert _by_name(result2, "INSERT").result == Status.ERROR
    assert result2.overall_status == Status.ERROR


def test_indicator_tuples_contain_only_specific_phrases():
    # Regression guard against reintroducing bare catch-all words.
    for word in ("permission", "privilege", "readonly", "denied"):
        assert word not in PERMISSION_INDICATORS
        assert word not in MISSING_TABLE_INDICATORS
    assert "permission denied" in PERMISSION_INDICATORS
    assert "ora-00942" in MISSING_TABLE_INDICATORS


def test_every_dialect_has_remediation_for_a_writable_account(monkeypatch):
    monkeypatch.setattr(
        "iblai_ontology.backend.discovery.connectors.first_table_and_column",
        lambda connector: ("demo.events", "event_id"),
    )
    for db_type in (
        "oracle",
        "postgresql",
        "mysql",
        "sqlserver",
        "snowflake",
        "clickhouse",
    ):
        # Connector-only dialects resolve their probe table through the shim.
        conn = (
            _connector_conn(db_type, default_behavior="succeed")
            if db_type in ("snowflake", "clickhouse")
            else ScriptedConnection(db_type=db_type, default_behavior="succeed")
        )
        result = SafetyVerifier(conn, db_type=db_type).run_all_tests()
        assert result.overall_status == Status.FAILED
        assert result.remediation_sql and "read-only" in result.remediation_sql.lower()
