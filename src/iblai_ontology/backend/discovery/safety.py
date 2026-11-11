"""Read-only safety verification suite (Component 5.2).

Before iblai-ontology touches a single row, it must prove the supplied
credentials are read-only by attempting a comprehensive suite of write
operations. Every one must be *denied*. ``PASSED`` therefore means "the write
was correctly refused". If ANY write succeeds, the overall result is ``FAILED``
and nothing else runs.

Evidence discipline — a verdict is only ever built on explainable evidence:

* A single probe is ``PASSED`` only when the database rejects it with a
  recognisable permission error (or the DROP probe finds no probe table, which
  proves CREATE never succeeded). Every other exception is ``ERROR``
  (inconclusive) — a network glitch, a syntax problem or an unknown driver
  message must never be mistaken for a refusal.
* The suite only returns ``PASSED`` when all seven probes are ``PASSED``.
  Any ``ERROR`` makes the overall verdict ``ERROR``; any successful write makes
  it ``FAILED`` with the dialect's remediation SQL.
* With no probeable table the verdict is ``ERROR`` (not ``PASSED`` — there is
  no evidence either way), and no unhandled exception escapes the verifier.

This module is intentionally Django-free: it operates on any DB-API 2.0
connection (oracledb, psycopg2, pymysql, pyodbc) or the auto-ontology connector
shim in ``connectors.py``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger("iblai_ontology.safety")

_UNPROBED = object()


class TestResult(Enum):
    PASSED = "passed"  # write correctly DENIED (what we want)
    FAILED = "failed"  # write SUCCEEDED (dangerous)
    ERROR = "error"  # could not interpret the outcome (inconclusive)


@dataclass
class SafetyTestResult:
    test_name: str
    sql_attempted: str
    result: TestResult
    error_message: Optional[str] = None
    detail: Optional[str] = None


@dataclass
class SafetyVerificationResult:
    overall_status: TestResult
    db_type: str
    tests: list[SafetyTestResult] = field(default_factory=list)
    remediation_sql: Optional[str] = None
    message: Optional[str] = None

    @property
    def all_passed(self) -> bool:
        return bool(self.tests) and all(
            t.result == TestResult.PASSED for t in self.tests
        )

    @property
    def summary(self) -> str:
        passed = sum(1 for t in self.tests if t.result == TestResult.PASSED)
        failed = sum(1 for t in self.tests if t.result == TestResult.FAILED)
        errors = sum(1 for t in self.tests if t.result == TestResult.ERROR)
        return f"{passed} passed, {failed} FAILED, {errors} errors out of {len(self.tests)} tests"


# Substrings that indicate a write was *correctly* refused. These are kept
# specific: a bare word like "permission" could appear in an unrelated driver
# message, which would turn an inconclusive error into a false PASS.
PERMISSION_INDICATORS = (
    # PostgreSQL / psycopg
    "permission denied",
    "must be owner",
    "must be superuser",
    "must have",
    "is not permitted",
    # Oracle / oracledb
    "ora-01031",  # insufficient privileges
    "ora-01950",  # no privileges on tablespace
    "ora-01749",  # may not access table
    "ora-20000",  # custom security-policy rejection prefix
    "insufficient privileges",
    # MySQL / pymysql
    "access denied",
    "command denied",
    "denied to user",
    "super privilege",
    "read-only",
    "readonly mode",  # ClickHouse rejects writes while readonly settings apply
    # SQL Server / pyodbc
    "the select permission",
    "the insert permission",
    "the update permission",
    "the delete permission",
    "the alter permission",
    "the drop permission",
    "create table permission",
    "alter table permission",
    "database is read-only",
    # Snowflake / Trino (auto-ontology connectors)
    "sql access control error",
    "access control",
    "access control denied",
    "not authorized",
    "authorization denied",
    "user does not have privilege",
    "does not have privilege",
    "privilege not granted",
    # Generic wording kept only where the phrase is unambiguously an RDBMS refusal
    "not allowed",
    "operation not allowed",
    "statement not allowed",
)

# The DROP probe targets a probe table that CREATE was supposed to make.
# "Nothing to drop" is itself evidence that CREATE never succeeded — but this
# excuse applies to the DROP probe only; any other probe hitting a missing
# table stays inconclusive.
MISSING_TABLE_INDICATORS = (
    "does not exist",
    "doesn't exist",
    "unknown table",
    "no such table",
    "ora-00942",  # Oracle: table or view does not exist
    "cannot drop",
    "not found",
)


def _pg_quoted(schema: str, table: str) -> str:
    """PostgreSQL probe target: schema-qualified and quoted, since camelCase names fold otherwise."""
    return f'"{schema}"."{table}"'


def _pg_split(quoted: str) -> tuple[str, str]:
    schema, _, table = quoted.partition('"."')
    return schema.strip('"'), table.strip('"')


class SafetyVerifier:
    """Verifies that DB credentials are read-only by attempting writes."""

    WRITE_TESTS = [
        {"name": "CREATE TABLE", "description": "Attempt to create a new table"},
        {"name": "INSERT", "description": "Attempt to insert a row"},
        {"name": "UPDATE", "description": "Attempt to update a row"},
        {"name": "DELETE", "description": "Attempt to delete a row"},
        {"name": "DROP TABLE", "description": "Attempt to drop a table"},
        {"name": "ALTER TABLE", "description": "Attempt to alter a table"},
        {"name": "TRUNCATE", "description": "Attempt to truncate a table"},
    ]

    def __init__(self, connection, db_type: Optional[str] = None) -> None:
        self.connection = connection
        self._probe_target = _UNPROBED
        self.db_type = db_type or self._detect_db_type()

    # -- detection -------------------------------------------------------
    def _detect_db_type(self) -> str:
        declared = getattr(self.connection, "db_type", None)
        if declared:
            return declared
        module_name = type(self.connection).__module__
        if "cx_Oracle" in module_name or "oracledb" in module_name:
            return "oracle"
        if "psycopg" in module_name:
            return "postgresql"
        if "pymysql" in module_name or "MySQLdb" in module_name:
            return "mysql"
        if "pyodbc" in module_name:
            return "sqlserver"
        raise ValueError(f"Unknown database driver module: {module_name}")

    # -- helpers ---------------------------------------------------------
    def _find_existing_table(self) -> Optional[str]:
        connector = getattr(self.connection, "connector", None)
        if connector is not None:
            target = self._connector_probe_target(connector)
            return target[0] if target else None
        cursor = self.connection.cursor()
        queries = {
            "oracle": "SELECT table_name FROM user_tables WHERE ROWNUM = 1",
            # Any readable base table, not only public: a CRM keeps its data in its own schemas.
            "postgresql": (
                "SELECT table_schema, table_name FROM information_schema.tables "
                "WHERE table_type = 'BASE TABLE' AND table_schema NOT IN "
                "('pg_catalog', 'information_schema') ORDER BY table_schema, table_name LIMIT 1"
            ),
            "mysql": "SHOW TABLES",
            "sqlserver": "SELECT TOP 1 name FROM sys.tables",
        }
        cursor.execute(queries[self.db_type])
        row = cursor.fetchone()
        if not row:
            return None
        return _pg_quoted(*row) if self.db_type == "postgresql" else row[0]

    def _get_first_column(self, table_name: str) -> str:
        connector = getattr(self.connection, "connector", None)
        if connector is not None:
            target = self._connector_probe_target(connector)
            return target[1] if target else "id"
        cursor = self.connection.cursor()
        schema, table = _pg_split(table_name)
        queries = {
            "oracle": (
                "SELECT column_name FROM user_tab_columns "
                f"WHERE table_name = '{table_name.upper()}' AND ROWNUM = 1"
            ),
            "postgresql": (
                "SELECT column_name FROM information_schema.columns "
                f"WHERE table_schema = '{schema}' AND table_name = '{table}' "
                "ORDER BY ordinal_position LIMIT 1"
            ),
            "mysql": (
                "SELECT column_name FROM information_schema.columns "
                f"WHERE table_name = '{table_name}' LIMIT 1"
            ),
            "sqlserver": (
                "SELECT TOP 1 name FROM sys.columns "
                f"WHERE object_id = OBJECT_ID('{table_name}')"
            ),
        }
        cursor.execute(queries[self.db_type])
        row = cursor.fetchone()
        if not row:
            return "id"
        return f'"{row[0]}"' if self.db_type == "postgresql" else row[0]

    def _connector_probe_target(self, connector) -> Optional[tuple[str, str]]:
        """One metadata round-trip: the quoted table and column the write probes target."""
        if self._probe_target is _UNPROBED:
            from iblai_ontology.backend.discovery.connectors import (
                first_table_and_column,
            )

            self._probe_target = first_table_and_column(connector)
        return self._probe_target

    def _get_test_sql(self, test_name: str, existing_table: str) -> str:
        col = self._get_first_column(existing_table)
        # Oracle rejects the COLUMN keyword; Trino and ClickHouse require it.
        add = "ADD" if self.db_type == "oracle" else "ADD COLUMN"
        # ClickHouse before 25.7 parses no UPDATE statement; its mutation form works on every version.
        update = (
            f"ALTER TABLE {existing_table} UPDATE {col} = {col} WHERE 1=0"
            if self.db_type == "clickhouse"
            else f"UPDATE {existing_table} SET {col} = {col} WHERE 1=0"
        )
        return {
            "CREATE TABLE": "CREATE TABLE __iblai_safety_test (id INTEGER)",
            "INSERT": f"INSERT INTO {existing_table} ({col}) VALUES (NULL)",
            "UPDATE": update,
            "DELETE": f"DELETE FROM {existing_table} WHERE 1=0",
            "DROP TABLE": "DROP TABLE __iblai_safety_test",
            "ALTER TABLE": f"ALTER TABLE {existing_table} {add} __iblai_safety_col INTEGER",
            "TRUNCATE": f"TRUNCATE TABLE {existing_table}",
        }[test_name]

    # -- runner ----------------------------------------------------------
    def run_all_tests(self) -> SafetyVerificationResult:
        logger.info("Starting safety verification for %s database", self.db_type)
        try:
            existing_table = self._find_existing_table()
        except Exception as exc:  # metadata read itself is broken: no evidence at all
            logger.warning(
                "Safety verification could not locate a probe table: %s", exc
            )
            self._safe_rollback()
            return SafetyVerificationResult(
                overall_status=TestResult.ERROR,
                db_type=self.db_type,
                tests=[],
                message=(
                    "Could not locate a probe table to test against "
                    f"({str(exc)[:200]}); read-only status is unverified."
                ),
            )

        if not existing_table:
            # No table means no write was ever attempted: there is zero evidence
            # about the account's privileges. ERROR (inconclusive), never PASSED.
            logger.warning(
                "Safety verification inconclusive: no probeable table found for %s",
                self.db_type,
            )
            self._safe_rollback()
            return SafetyVerificationResult(
                overall_status=TestResult.ERROR,
                db_type=self.db_type,
                tests=[],
                message=(
                    "No probeable table was found, so the write probes could not "
                    "run; read-only status is unverified."
                ),
            )

        results: list[SafetyTestResult] = []
        for test in self.WRITE_TESTS:
            # All seven probes run and each leaves its own result, even if one
            # probe (or the harness around it) misbehaves unexpectedly.
            try:
                result = self._run_single_test(test["name"], existing_table)
            except Exception as exc:  # defensive: an escape must not kill the suite
                logger.exception("Safety probe %s raised unexpectedly", test["name"])
                result = SafetyTestResult(
                    test_name=test["name"],
                    sql_attempted="",
                    result=TestResult.ERROR,
                    error_message=str(exc)[:500],
                    detail="Probe crashed before producing a verdict — inconclusive",
                )
            results.append(result)
            if result.result == TestResult.FAILED:
                logger.critical(
                    "SAFETY FAILURE: %s SUCCEEDED on %s — these credentials have "
                    "write access!",
                    test["name"],
                    self.db_type,
                )

        # Leave the connection exactly as we found it.
        self._safe_rollback()

        any_failed = any(r.result == TestResult.FAILED for r in results)
        all_passed = bool(results) and all(
            r.result == TestResult.PASSED for r in results
        )
        if any_failed:
            # A single successful write proves the account is writable.
            overall = TestResult.FAILED
            remediation: Optional[str] = self.remediation_sql()
            message = (
                "At least one write operation succeeded — credentials are writable."
            )
        elif all_passed:
            overall = TestResult.PASSED
            remediation = None
            message = None
        else:
            # No write succeeded, but at least one probe was inconclusive.
            # ERROR must never be silently promoted to PASSED (or FAILED).
            overall = TestResult.ERROR
            remediation = None
            message = (
                "No write succeeded, but one or more probes were inconclusive; "
                "read-only status is not proven."
            )

        verification = SafetyVerificationResult(
            overall_status=overall,
            db_type=self.db_type,
            tests=results,
            remediation_sql=remediation,
            message=message,
        )
        logger.info("Safety verification complete: %s", verification.summary)
        return verification

    def _run_single_test(self, test_name: str, existing_table: str) -> SafetyTestResult:
        try:
            sql = self._get_test_sql(test_name, existing_table)
        except Exception as exc:  # building the SQL needs a read; surface as ERROR
            return SafetyTestResult(
                test_name, "", TestResult.ERROR, error_message=str(exc)[:500]
            )

        try:
            cursor = self.connection.cursor()
        except Exception as exc:
            return SafetyTestResult(
                test_name=test_name,
                sql_attempted=sql,
                result=TestResult.ERROR,
                error_message=str(exc)[:500],
                detail="Could not open a cursor — test inconclusive",
            )

        try:
            cursor.execute(sql)
        except Exception as exc:
            error_str = str(exc).lower()
            denied = any(ind in error_str for ind in PERMISSION_INDICATORS) or (
                test_name == "DROP TABLE"
                and any(ind in error_str for ind in MISSING_TABLE_INDICATORS)
            )
            self._safe_rollback()
            if denied:
                return SafetyTestResult(
                    test_name=test_name,
                    sql_attempted=sql,
                    result=TestResult.PASSED,
                    detail=f"Correctly denied: {str(exc)[:200]}",
                )
            # An unexplainable error proves nothing either way.
            return SafetyTestResult(
                test_name=test_name,
                sql_attempted=sql,
                result=TestResult.ERROR,
                error_message=str(exc)[:500],
                detail="Non-permission error — test inconclusive",
            )

        # If we reach here, the write SUCCEEDED — dangerous. Undo it.
        logger.critical(
            "Safety probe %s executed successfully on %s; the credentials can write.",
            test_name,
            self.db_type,
        )
        self._safe_rollback()
        if test_name == "CREATE TABLE":
            # DDL often auto-commits, so a rollback may not undo the probe table:
            # make a best effort to drop it and never let cleanup mask the verdict.
            try:
                cursor.execute("DROP TABLE __iblai_safety_test")
                try:
                    self.connection.commit()
                except Exception:
                    pass
            except Exception:
                logger.warning(
                    "Could not clean up probe table __iblai_safety_test; "
                    "manual removal may be required."
                )
        self._safe_rollback()
        return SafetyTestResult(
            test_name=test_name,
            sql_attempted=sql,
            result=TestResult.FAILED,
            detail=f"DANGEROUS: {test_name} succeeded — user has write access.",
        )

    def _safe_rollback(self) -> None:
        """Roll back whatever the last probe left behind; never raise."""
        try:
            self.connection.rollback()
        except Exception:
            pass

    # -- remediation -----------------------------------------------------
    def remediation_sql(self) -> str:
        return REMEDIATION_SQL.get(
            self.db_type,
            "Unknown database type. Please create a read-only user manually.",
        )


REMEDIATION_SQL = {
    "oracle": """\
-- Oracle: create a read-only user for iblai-ontology (run as SYSDBA/DBA)
CREATE USER iblai_readonly IDENTIFIED BY "<STRONG_PASSWORD_HERE>";
GRANT CREATE SESSION TO iblai_readonly;
BEGIN
    FOR t IN (SELECT table_name FROM all_tables WHERE owner = 'SYSADM') LOOP
        EXECUTE IMMEDIATE 'GRANT SELECT ON SYSADM.' || t.table_name || ' TO iblai_readonly';
    END LOOP;
END;
/
""",
    "postgresql": """\
-- PostgreSQL: create a read-only role (run as superuser/owner); what it can SELECT is what discovery sees
CREATE ROLE iblai_readonly WITH LOGIN PASSWORD '<STRONG_PASSWORD_HERE>';
GRANT CONNECT ON DATABASE your_database TO iblai_readonly;
GRANT USAGE ON SCHEMA your_schema TO iblai_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA your_schema TO iblai_readonly;  -- or a list of tables
ALTER DEFAULT PRIVILEGES IN SCHEMA your_schema GRANT SELECT ON TABLES TO iblai_readonly;
""",
    "mysql": """\
-- MySQL: create a read-only user
CREATE USER 'iblai_readonly'@'%' IDENTIFIED BY '<STRONG_PASSWORD_HERE>';
GRANT SELECT ON your_database.* TO 'iblai_readonly'@'%';
FLUSH PRIVILEGES;
""",
    "sqlserver": """\
-- SQL Server: create a read-only login/user
CREATE LOGIN iblai_readonly WITH PASSWORD = '<STRONG_PASSWORD_HERE>';
USE your_database;
CREATE USER iblai_readonly FOR LOGIN iblai_readonly;
ALTER ROLE db_datareader ADD MEMBER iblai_readonly;
""",
    "snowflake": """\
-- Snowflake: create a read-only role and user (run as SECURITYADMIN)
CREATE ROLE iblai_readonly;
GRANT USAGE ON WAREHOUSE your_warehouse TO ROLE iblai_readonly;
GRANT USAGE ON DATABASE your_database TO ROLE iblai_readonly;
GRANT USAGE ON ALL SCHEMAS IN DATABASE your_database TO ROLE iblai_readonly;
GRANT SELECT ON ALL TABLES IN DATABASE your_database TO ROLE iblai_readonly;
GRANT SELECT ON FUTURE TABLES IN DATABASE your_database TO ROLE iblai_readonly;
CREATE USER iblai_readonly PASSWORD = '<STRONG_PASSWORD_HERE>' DEFAULT_ROLE = iblai_readonly;
GRANT ROLE iblai_readonly TO USER iblai_readonly;
""",
    "clickhouse": """\
-- ClickHouse: create a read-only user
-- readonly = 2, not 1: the connector sets per-query limits, which readonly = 1 rejects
CREATE USER iblai_readonly IDENTIFIED BY '<STRONG_PASSWORD_HERE>' SETTINGS readonly = 2;
GRANT SELECT ON your_database.* TO iblai_readonly;
""",
}
