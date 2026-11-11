"""Failure-path and byte-budget tests for deterministic static context.

These tests build their own throw-away repositories. They never invoke a model or the network;
tree-sitter parsing is exercised only for supported-language success paths, and the dependency
failure path is simulated by monkeypatching so it also passes on a machine without grammars.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import argo.static_analysis as static_analysis
from argo.static_analysis import (
    _FALLBACK_CONTEXT,
    _MAX_ANALYZED_FILE_BYTES,
    _OMISSION_NOTE,
    _TRUNCATION_NOTE,
    _serialized_static_context,
    analyze_location,
    build_static_context,
)


@pytest.fixture
def sample_repo(tmp_path: Path) -> Path:
    (tmp_path / "sample.py").write_text(
        "def helper(value):\n"
        "    return value\n\n"
        "def handler(request):\n"
        "    raw = request.value\n"
        "    clean = helper(raw)\n"
        "    sink(clean)\n",
        encoding="utf-8",
    )
    (tmp_path / "notes.txt").write_text("not source\n", encoding="utf-8")
    return tmp_path


@pytest.mark.parametrize(
    ("ref", "fragment"),
    [
        ("../outside.py:1", "outside the repository"),
        ("notes.txt:1", "unsupported source extension"),
        ("sample.py", "has no line number"),
        ("sample.py:", "has no line number"),
        ("sample.py:main()", "has no line number"),
        ("sample.py:abc", "not an integer"),
        ("sample.py:not_an_int", "not an integer"),
        ("sample.py:1.5", "not an integer"),
        ("sample.py:12abc", "not an integer"),
        ("missing.py:3", "static parse unavailable"),
    ],
)
def test_analyze_location_reports_specific_reason_without_raising(
    sample_repo, ref, fragment
):
    ctx = analyze_location(sample_repo, ref)

    assert ctx.symbol is None
    assert any(fragment in note for note in ctx.notes), ctx.notes


def test_oversized_cited_file_is_noted(sample_repo):
    (sample_repo / "large.py").write_bytes(b"x" * (_MAX_ANALYZED_FILE_BYTES + 1))

    ctx = analyze_location(sample_repo, "large.py:1")

    assert ctx.symbol is None
    assert any("exceeds static-analysis byte limit" in note for note in ctx.notes)


def test_missing_parser_dependency_is_noted(monkeypatch, sample_repo):
    def unavailable(_language: str):
        raise ImportError("tree-sitter grammar is not installed")

    monkeypatch.setattr(static_analysis, "_parser", unavailable)

    ctx = analyze_location(sample_repo, "sample.py:7")

    assert ctx.symbol is None
    assert any("parser dependencies are unavailable" in note for note in ctx.notes)


def test_partial_failures_preserve_successful_locations(sample_repo):
    rendered = build_static_context(
        sample_repo,
        ["sample.py:7", "../outside.py:1", "notes.txt:1"],
    )

    payload = json.loads(rendered.split("\n", 1)[1])

    assert len(payload) == 3
    assert payload[0]["symbol"]["name"] == "handler"
    assert any("outside the repository" in note for note in payload[1]["notes"])
    assert any("unsupported source extension" in note for note in payload[2]["notes"])


def test_max_locations_only_reads_the_prefix(sample_repo):
    refs = ["sample.py:7", "../outside.py:1", "notes.txt:1"]

    rendered = build_static_context(sample_repo, refs, max_locations=2)
    payload = json.loads(rendered.split("\n", 1)[1])

    assert [item["location"] for item in payload] == refs[:2]


@pytest.mark.parametrize("affected", [[], ["sample.py:7"]])
def test_no_locations_returns_the_empty_placeholder(sample_repo, affected):
    rendered = build_static_context(
        sample_repo, affected, max_locations=0 if affected else 3
    )

    assert rendered == "(no deterministic static context available)"


def _synthetic_context(
    *,
    calls: int = 30,
    incoming: int = 2,
    def_use: int = 2,
    symbol_name: str = "handler",
    location: str = "sample.py:7",
    call_padding: int = 40,
) -> dict:
    return {
        "location": location,
        "language": "python",
        "symbol": {
            "name": symbol_name,
            "kind": "function",
            "file": "sample.py",
            "start_line": 1,
            "end_line": 50,
        },
        "calls": [
            {"name": f"call_{i}_" + ("x" * call_padding), "file": "sample.py", "line": i + 1}
            for i in range(calls)
        ],
        "possible_incoming": [
            {"name": "handler", "file": f"routes_{i}.py", "line": i + 1, "caller": "route"}
            for i in range(incoming)
        ],
        "local_def_use": [
            {
                "name": f"value_{i}",
                "defined_at_line": i + 1,
                "used_at_line": 7,
                "depends_on": [],
            }
            for i in range(def_use)
        ],
        "notes": [],
    }


def _render(contexts: list[dict], max_bytes: int) -> str:
    rendered = _serialized_static_context(contexts, max_bytes)
    assert len(rendered.encode("utf-8")) <= max_bytes
    return rendered


def _payload(rendered: str) -> object:
    return json.loads(rendered.split("\n", 1)[1])


def test_budget_trims_calls_first_and_keeps_other_evidence_parseable():
    context = _synthetic_context(calls=30, incoming=2, def_use=2)
    full_size = len(_serialized_static_context([context], 10**9).encode("utf-8"))
    budget = full_size - 120

    rendered = _render([context], budget)
    item = _payload(rendered)[0]

    assert len(item["calls"]) < 30
    assert len(item["possible_incoming"]) == 2
    assert len(item["local_def_use"]) == 2
    assert _TRUNCATION_NOTE in item["notes"]


def test_budget_trim_order_moves_from_calls_to_incoming_to_def_use():
    context = _synthetic_context(calls=2, incoming=2, def_use=2, call_padding=200)
    full_size = len(_serialized_static_context([context], 10**9).encode("utf-8"))
    # Small enough that calls alone cannot absorb the overage: incoming/def-use must follow.
    budget = full_size - 2 * 500

    rendered = _render([context], budget)
    item = _payload(rendered)[0]

    assert item["calls"] == []
    # ``local_def_use`` may only be touched once ``possible_incoming`` is exhausted.
    if len(item["local_def_use"]) < 2:
        assert item["possible_incoming"] == []
    assert _TRUNCATION_NOTE in item["notes"]


def test_budget_degrades_to_location_only_minimal_structure():
    # A huge symbol cannot fit even after every list is emptied, forcing the minimal shape.
    context = _synthetic_context(calls=10, incoming=2, def_use=2, symbol_name="s" * 1000)
    budget = 400

    rendered = _render([context], budget)
    item = _payload(rendered)[0]

    assert set(item) == {"location", "notes"}
    assert item["location"] == "sample.py:7"
    assert item["notes"] == [_OMISSION_NOTE]


def test_budget_falls_back_to_fixed_placeholder_then_empty_string():
    context = _synthetic_context()

    assert _render([context], len(_FALLBACK_CONTEXT)) == _FALLBACK_CONTEXT
    assert _render([context], len(_FALLBACK_CONTEXT) - 1) == ""
    assert _render([context], 0) == ""


def test_byte_limit_is_measured_in_utf8_bytes_for_non_ascii_locations():
    context = _synthetic_context(location="源码/漏洞.py:7", symbol_name="漏洞处理函数")

    rendered = _render([context], 400)
    encoded = rendered.encode("utf-8")

    assert len(encoded) <= 400
    if rendered not in ("", _FALLBACK_CONTEXT):
        assert isinstance(_payload(rendered), list)


def test_every_budget_stays_within_the_hard_limit_and_keeps_json_when_possible():
    context = _synthetic_context(calls=40, incoming=8, def_use=12)
    full_size = len(_serialized_static_context([context], 10**9).encode("utf-8"))

    for budget in (full_size, full_size - 1, 2500, 1200, 700, 400, 300, 200, 61, 60, 1, 0):
        rendered = _render([context], budget)
        if rendered in ("", _FALLBACK_CONTEXT):
            continue
        payload = _payload(rendered)
        assert isinstance(payload, list)
        assert payload[0]["location"] == "sample.py:7"
