import json
from typing import List, Set, Tuple

import pytest

from cfripper.model.enums import RuleGranularity, RuleMode, RuleRisk
from cfripper.model.result import Failure, Result
from cfripper.rules.base_rules import Rule
from tests.utils import compare_lists_of_failures


def test_result_valid_after_removing_failures():
    result = Result()
    result.add_failure(
        rule="mock_rule",
        reason="mock_reason",
        rule_mode=RuleMode.BLOCKING,
        risk_value=RuleRisk.HIGH,
        granularity=RuleGranularity.STACK,
    )
    # Result has a blocking failure, so it should be invalid
    assert result.valid is False

    result.failures = []
    # Result has no failures, so it should be valid
    assert result.valid is True


def test_result_addition():
    failure1 = Failure(
        granularity=RuleGranularity.STACK,
        reason="reason1",
        risk_value=RuleRisk.HIGH,
        rule="rule1",
        rule_mode=RuleMode.BLOCKING,
    )
    failure2 = Failure(
        granularity=RuleGranularity.STACK,
        reason="reason2",
        risk_value=RuleRisk.HIGH,
        rule="rule2",
        rule_mode=RuleMode.BLOCKING,
    )
    result1 = Result(failures=[failure1])
    result2 = Result(failures=[failure2])
    assert result1 + result2 == Result(failures=[failure1, failure2])


@pytest.mark.parametrize(
    "failures, include_rule_modes, exclude_rule_modes, expected_result",
    [
        (
            [("A", "A", RuleMode.BLOCKING, RuleRisk.HIGH, RuleGranularity.STACK)],
            set(),
            set(),
            [
                Failure(
                    granularity=RuleGranularity.STACK,
                    reason="A",
                    risk_value=RuleRisk.HIGH,
                    rule="A",
                    rule_mode=RuleMode.BLOCKING,
                    actions=None,
                    resource_ids=None,
                    resource_types=None,
                )
            ],
        ),
        (
            [
                ("A", "A", RuleMode.BLOCKING, RuleRisk.HIGH, RuleGranularity.STACK),
                ("B", "B", RuleMode.MONITOR, RuleRisk.LOW, RuleGranularity.RESOURCE),
            ],
            set(),
            set(),
            [
                Failure(
                    granularity=RuleGranularity.STACK,
                    reason="A",
                    risk_value=RuleRisk.HIGH,
                    rule="A",
                    rule_mode=RuleMode.BLOCKING,
                    actions=None,
                    resource_ids=None,
                    resource_types=None,
                ),
                Failure(
                    granularity=RuleGranularity.RESOURCE,
                    reason="B",
                    risk_value=RuleRisk.LOW,
                    rule="B",
                    rule_mode=RuleMode.MONITOR,
                    actions=None,
                    resource_ids=None,
                    resource_types=None,
                ),
            ],
        ),
        (
            [
                ("A", "A", RuleMode.BLOCKING, RuleRisk.HIGH, RuleGranularity.STACK),
                ("B", "B", RuleMode.MONITOR, RuleRisk.LOW, RuleGranularity.RESOURCE),
            ],
            {RuleMode.MONITOR},
            set(),
            [
                Failure(
                    granularity=RuleGranularity.RESOURCE,
                    reason="B",
                    risk_value=RuleRisk.LOW,
                    rule="B",
                    rule_mode=RuleMode.MONITOR,
                    actions=None,
                    resource_ids=None,
                    resource_types=None,
                )
            ],
        ),
        (
            [
                ("A", "A", RuleMode.BLOCKING, RuleRisk.HIGH, RuleGranularity.STACK),
                ("B", "B", RuleMode.MONITOR, RuleRisk.LOW, RuleGranularity.RESOURCE),
            ],
            set(),
            {RuleMode.MONITOR},
            [
                Failure(
                    granularity=RuleGranularity.STACK,
                    reason="A",
                    risk_value=RuleRisk.HIGH,
                    rule="A",
                    rule_mode=RuleMode.BLOCKING,
                    actions=None,
                    resource_ids=None,
                    resource_types=None,
                ),
            ],
        ),
        (
            [
                ("A", "A", RuleMode.BLOCKING, RuleRisk.HIGH, RuleGranularity.STACK),
                ("B", "B", RuleMode.MONITOR, RuleRisk.LOW, RuleGranularity.RESOURCE),
            ],
            set(),
            {RuleMode.MONITOR},
            [
                Failure(
                    granularity=RuleGranularity.STACK,
                    reason="A",
                    risk_value=RuleRisk.HIGH,
                    rule="A",
                    rule_mode=RuleMode.BLOCKING,
                    actions=None,
                    resource_ids=None,
                    resource_types=None,
                ),
            ],
        ),
        (
            [
                ("A", "A", RuleMode.BLOCKING, RuleRisk.HIGH, RuleGranularity.STACK),
                ("B", "B", RuleMode.MONITOR, RuleRisk.LOW, RuleGranularity.RESOURCE),
            ],
            {RuleMode.MONITOR},
            {RuleMode.MONITOR},
            [],
        ),
        (
            [
                ("A", "A", RuleMode.BLOCKING, RuleRisk.HIGH, RuleGranularity.STACK),
                ("B", "B", RuleMode.MONITOR, RuleRisk.LOW, RuleGranularity.RESOURCE),
            ],
            {RuleMode.MONITOR, RuleMode.BLOCKING},
            {RuleMode.MONITOR},
            [
                Failure(
                    granularity=RuleGranularity.STACK,
                    reason="A",
                    risk_value=RuleRisk.HIGH,
                    rule="A",
                    rule_mode=RuleMode.BLOCKING,
                    actions=None,
                    resource_ids=None,
                    resource_types=None,
                ),
            ],
        ),
    ],
)
def test_get_failures(
    failures: List[Tuple],
    include_rule_modes: Set[RuleMode],
    exclude_rule_modes: Set[RuleMode],
    expected_result: List[Failure],
):
    result = Result()
    for failure in failures:
        result.add_failure(*failure)

    assert compare_lists_of_failures(result.get_failures(include_rule_modes, exclude_rule_modes), expected_result)


def test_add_failure_without_context_keeps_serializable_structure():
    result = Result()
    result.add_failure(
        rule="mock_rule",
        reason="mock_reason",
        rule_mode=RuleMode.BLOCKING,
        risk_value=RuleRisk.HIGH,
        granularity=RuleGranularity.STACK,
    )

    failure = result.failures[0]
    assert failure.context is None
    assert failure.serializable() == {
        "rule": "mock_rule",
        "reason": "mock_reason",
        "rule_mode": RuleMode.BLOCKING,
        "risk_value": RuleRisk.HIGH,
        "resource_ids": [],
        "resource_types": [],
        "actions": [],
        "granularity": RuleGranularity.STACK,
    }


def test_add_failure_with_context_is_serializable():
    context = {
        "ingress_ip": "0.0.0.0/0",
        "open_ports": [22],
        "non_allowed_open_ports": [22],
    }
    result = Result()
    result.add_failure(
        rule="mock_rule",
        reason="mock_reason",
        rule_mode=RuleMode.BLOCKING,
        risk_value=RuleRisk.HIGH,
        granularity=RuleGranularity.STACK,
        context=context,
    )

    failure = result.failures[0]
    assert failure.context == context
    assert failure.serializable()["context"] == context
    # The serialized failure must be JSON serializable
    assert json.loads(json.dumps(failure.serializable()))["context"] == context


def test_rule_add_failure_to_result_passes_context_to_failure():
    class MockRule(Rule):
        def invoke(self, cfmodel, extras=None):
            return Result()

    result = Result()
    MockRule(None).add_failure_to_result(result, "mock_reason", context={"mock_key": "mock_value"})

    assert len(result.failures) == 1
    assert result.failures[0].context == {"mock_key": "mock_value"}
