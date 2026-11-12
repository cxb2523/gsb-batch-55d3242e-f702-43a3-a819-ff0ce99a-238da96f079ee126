"""Installed-command tests for redirect chains under traversal budgets and policy."""

from __future__ import annotations

import io
import json
import subprocess
import tempfile
import unittest
import urllib.request
import urllib.robotparser
from email.message import Message
from http.client import HTTPResponse
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from unittest import mock
from urllib.response import addinfourl

from site2md import downloader
from tests.cli_test_support import (
    SKIP_PACING_HOOK,
    InstalledCliTestCase,
    RecordingServer,
    Route,
)

HTML = {"Content-Type": "text/html"}
TEXT = {"Content-Type": "text/plain"}
ENTRY = b'<html><body><a href="/hop0">Hop</a></body></html>'
ROBOTS_MISSING: Route = (404, TEXT, b"missing")
MIB = 1024 * 1024


def redirect(location: str, body: bytes = b"") -> Route:
    """Return a redirect response with a fixed body."""
    return (302, {"Location": location}, body)


def stream_redirect(location: str, size: int) -> Route:
    """Return a redirect that writes a large body, ignoring a refused connection."""
    def respond(handler: BaseHTTPRequestHandler) -> None:
        handler.send_response(302)
        handler.send_header("Location", location)
        handler.send_header("Content-Length", str(size))
        handler.end_headers()
        try:
            for offset in range(0, size, 65536):
                handler.wfile.write(b"x" * min(65536, size - offset))
                handler.wfile.flush()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    return respond


def stream_redirect_without_length(location: str, size: int) -> Route:
    """Return a redirect whose body has no Content-Length and ends when the connection closes."""
    def respond(handler: BaseHTTPRequestHandler) -> None:
        handler.send_response(302)
        handler.send_header("Location", location)
        handler.end_headers()
        try:
            for offset in range(0, size, 65536):
                handler.wfile.write(b"x" * min(65536, size - offset))
                handler.wfile.flush()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    return respond


class RedirectAccountingCliTests(InstalledCliTestCase):
    """Follow mode counts redirect hops and stops before an unaffordable request."""

    def run_follow(
        self,
        server: RecordingServer,
        output: Path,
        *arguments: object,
        extra_environment: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        """Run follow mode without pacing, keeping lines whole."""
        return self.run_site2md(
            "build",
            f"{server.origin}/entry",
            "--mode",
            "follow",
            "--follow-selector",
            "a",
            "--output",
            output,
            "--no-progress",
            *arguments,
            extra_environment=extra_environment,
        )

    def test_redirect_chain_that_wastes_its_budget_stops_before_the_next_request(self) -> None:
        remaining = MIB - len(ENTRY)
        first = remaining // 2
        second = remaining - first
        routes: dict[str, Route] = {
            "/entry": (200, HTML, ENTRY),
            "/robots.txt": ROBOTS_MISSING,
            "/hop0": redirect("/hop1", b"x" * first),
            "/hop1": redirect("/final", b"x" * second),
            "/final": (200, HTML, b"<html><body>must not be requested</body></html>"),
        }
        with RecordingServer(routes) as server, tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "exact-budget.md"
            extra_environment = self.startup_hook_environment(Path(temp_dir), SKIP_PACING_HOOK)

            result = self.run_follow(
                server,
                output,
                "--max-total-size-mib",
                "1",
                "--keep-temp",
                extra_environment=extra_environment,
            )

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(server.requests, ["/entry", "/robots.txt", "/hop0", "/hop1"])
            self.assertIn("Reached limit: aggregate content (1 MiB)", result.stdout)
            workspace = self.retained_workspace(result.stdout)
            index = json.loads((workspace / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(index["pages"][1]["body_bytes"], remaining)

    def test_redirect_hops_without_content_length_fail_while_reading_the_chain(self) -> None:
        routes: dict[str, Route] = {
            "/entry": (200, HTML, ENTRY),
            "/robots.txt": ROBOTS_MISSING,
            "/hop0": stream_redirect_without_length("/hop1", 700 * 1024),
            "/hop1": stream_redirect_without_length("/final", 700 * 1024),
            "/final": (200, HTML, b"<html><body>must not be requested</body></html>"),
        }
        with RecordingServer(routes) as server, tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "streamed-budget.md"
            extra_environment = self.startup_hook_environment(Path(temp_dir), SKIP_PACING_HOOK)

            result = self.run_follow(
                server,
                output,
                "--max-total-size-mib",
                "1",
                extra_environment=extra_environment,
            )

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(server.requests, ["/entry", "/robots.txt", "/hop0", "/hop1"])
            self.assertIn("Reached limit: aggregate content (1 MiB)", result.stdout)
            self.assertIn("aggregate content budget", result.stdout)

    def test_cross_origin_redirect_is_refused_before_its_body_or_request(self) -> None:
        # The hop body alone is over the aggregate budget, so a late check would report the budget instead.
        with RecordingServer(
            {"/final": (200, HTML, b"<html><body>outside</body></html>")}
        ) as other_server:
            routes: dict[str, Route] = {
                "/entry": (200, HTML, ENTRY),
                "/robots.txt": ROBOTS_MISSING,
                "/hop0": stream_redirect(f"{other_server.origin}/final", 2 * MIB),
            }
            with RecordingServer(routes) as server, tempfile.TemporaryDirectory() as temp_dir:
                output = Path(temp_dir) / "cross-origin.md"
                extra_environment = self.startup_hook_environment(Path(temp_dir), SKIP_PACING_HOOK)

                result = self.run_follow(
                    server,
                    output,
                    "--max-total-size-mib",
                    "1",
                    extra_environment=extra_environment,
                )

                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(server.requests, ["/entry", "/robots.txt", "/hop0"])
                self.assertEqual(other_server.requests, [])
                self.assertIn("Child redirect left the traversal origin", result.stdout)
                self.assertNotIn("Reached limit: aggregate content", result.stdout)

    def test_robots_disallowed_redirect_target_is_refused_without_a_request(self) -> None:
        redirect_body = b"non-empty redirect response"
        routes: dict[str, Route] = {
            "/entry": (200, HTML, ENTRY),
            "/robots.txt": (200, TEXT, b"User-agent: *\nDisallow: /blocked\n"),
            "/hop0": redirect("/blocked", redirect_body),
            "/blocked": (200, HTML, b"<html><body>must not be requested</body></html>"),
        }
        with RecordingServer(routes) as server, tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "robots.md"
            extra_environment = self.startup_hook_environment(Path(temp_dir), SKIP_PACING_HOOK)

            result = self.run_follow(
                server,
                output,
                "--keep-temp",
                extra_environment=extra_environment,
            )

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(server.requests, ["/entry", "/robots.txt", "/hop0"])
            self.assertIn("Robots policy disallows", result.stdout)
            workspace = self.retained_workspace(result.stdout)
            index = json.loads((workspace / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(index["pages"][1]["body_bytes"], len(redirect_body))

    def test_same_origin_redirect_returns_the_final_page_and_url(self) -> None:
        routes: dict[str, Route] = {
            "/entry": (200, HTML, ENTRY),
            "/robots.txt": ROBOTS_MISSING,
            "/hop0": redirect("/final", b"hop body"),
            "/final": (200, HTML, b"<html><body>final page</body></html>"),
        }
        with RecordingServer(routes) as server, tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "same-origin.md"
            extra_environment = self.startup_hook_environment(Path(temp_dir), SKIP_PACING_HOOK)

            result = self.run_follow(server, output, extra_environment=extra_environment)

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(server.requests, ["/entry", "/robots.txt", "/hop0", "/final"])
            markdown = output.read_text(encoding="utf-8")
            self.assertIn(f"<!-- Source: {server.origin}/final -->", markdown)
            self.assertIn("final page", markdown)
            self.assertIn("Fetched 2; skipped 0; failed 0.", result.stdout)

    def test_robots_redirect_that_leaves_the_origin_stops_child_traversal(self) -> None:
        routes: dict[str, Route] = {
            "/entry": (200, HTML, ENTRY),
            "/hop0": (200, HTML, b"<html><body>child</body></html>"),
        }
        with RecordingServer({"/robots-final": (200, TEXT, b"User-agent: *\nAllow: /\n")}) as other_server:
            routes["/robots.txt"] = redirect(f"{other_server.origin}/robots-final", b"robots redirect")
            with RecordingServer(routes) as server, tempfile.TemporaryDirectory() as temp_dir:
                output = Path(temp_dir) / "robots-origin.md"
                extra_environment = self.startup_hook_environment(Path(temp_dir), SKIP_PACING_HOOK)

                result = self.run_follow(server, output, extra_environment=extra_environment)

                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(server.requests, ["/entry", "/robots.txt"])
                self.assertEqual(other_server.requests, [])
                self.assertIn("child traversal stopped", " ".join(result.stdout.split()))


class RedirectDowngradeTests(unittest.TestCase):
    """An HTTPS-to-HTTP redirect is refused before an HTTP request exists."""

    def test_downgrade_is_refused_before_the_http_request_leaves(self) -> None:
        https_requests: list[str] = []
        http_requests: list[str] = []

        class FakeHTTPSHandler(urllib.request.HTTPSHandler):
            def __init__(self) -> None:
                urllib.request.AbstractHTTPHandler.__init__(self)

            # A fake handler returns a redirect response instead of opening a real TLS connection.
            def https_open(  # type: ignore[override]
                self, request: urllib.request.Request
            ) -> addinfourl:
                https_requests.append(request.full_url)
                headers = Message()
                headers["Location"] = "http://example.test/final"
                response = addinfourl(io.BytesIO(b""), headers, request.full_url, 302)
                response.msg = "Found"  # type: ignore[attr-defined]
                return response

        class RecordingHTTPHandler(urllib.request.HTTPHandler):
            def http_open(self, request: urllib.request.Request) -> HTTPResponse:
                http_requests.append(request.full_url)
                raise AssertionError("an out-of-policy HTTP request was sent")

        policy = downloader.TraversalRequestPolicy.for_entry(
            "https://example.test/start", _robots_policy()
        )
        with tempfile.TemporaryDirectory() as temp_dir, mock.patch.object(
            downloader, "_SharedHTTPSHandler", FakeHTTPSHandler
        ), mock.patch.object(
            urllib.request, "HTTPHandler", RecordingHTTPHandler
        ), self.assertRaises(downloader.RemoteFetchError) as raised:
            downloader.fetch_remote(
                "https://example.test/start",
                "follow",
                request_policy=policy,
                content_path=Path(temp_dir) / "page.html",
            )

        self.assertEqual(
            str(raised.exception), "Refusing HTTPS-to-HTTP redirect downgrade."
        )
        self.assertEqual(https_requests, ["https://example.test/start"])
        self.assertEqual(http_requests, [])


def _robots_policy() -> urllib.robotparser.RobotFileParser:
    """Return a policy that allows everything."""
    policy = urllib.robotparser.RobotFileParser()
    policy.parse(["User-agent: *", "Allow: /"])
    return policy


if __name__ == "__main__":
    unittest.main()
