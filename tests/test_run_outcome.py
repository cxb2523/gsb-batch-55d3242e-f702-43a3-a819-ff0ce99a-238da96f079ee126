"""Drive the run-outcome logic with fake engine output — no Tk, model, or GPU.

Covers the three user-visible paths (success, cancel, auto chunked retry)
plus the failure modes the exit code alone used to mislabel as "Done".
"""
import unittest

import run_outcome
from run_outcome import RunTracker


BASE_CMD = ["python", "runner.py", "song.wav", "-m", "model.ckpt",
            "--output_format", "FLAC"]

MEM_LINE = "Error: [metal::malloc] Attempting to allocate 1196032 bytes\n"
MEM_LINE_ALT = "validateBuffer: maximum allowed buffer size exceeded\n"
FAIL_LINE = "Failed to process file song.wav: some engine error\n"
PROGRESS_LINES = ["Loading model…\n", "Separating track 1/1\n", "45%\r", "100%\r"]


def run_once(tracker, lines, rc):
    """Simulate one engine run: scan its output, then handle process exit."""
    for text in lines:
        tracker.scan(text)
    if tracker.should_retry():
        return ("retry", tracker.retry_command())
    return ("finish", tracker.finish(rc))


class ScanTests(unittest.TestCase):
    def test_memory_markers_detected(self):
        self.assertTrue(run_outcome.output_has_memory_error(MEM_LINE))
        self.assertTrue(run_outcome.output_has_memory_error(MEM_LINE_ALT))
        self.assertFalse(run_outcome.output_has_memory_error("all good\n"))

    def test_process_failure_marker_detected(self):
        self.assertTrue(run_outcome.output_has_process_failure(FAIL_LINE))
        self.assertFalse(run_outcome.output_has_process_failure("all good\n"))


class ChunkedRetryCommandTests(unittest.TestCase):
    def test_appends_chunk_duration_once(self):
        cmd = run_outcome.chunked_retry_command(BASE_CMD)
        self.assertEqual(cmd[:len(BASE_CMD)], BASE_CMD)
        self.assertEqual(cmd[len(BASE_CMD):],
                         ["--chunk_duration", str(run_outcome.RETRY_CHUNK_SECONDS)])
        # Re-chunking an already-chunked command must not duplicate the flag.
        again = run_outcome.chunked_retry_command(cmd)
        self.assertEqual(again.count("--chunk_duration"), 1)
        self.assertEqual(again, cmd)


class OutcomeTests(unittest.TestCase):
    def setUp(self):
        self.tracker = RunTracker()
        self.tracker.begin(BASE_CMD)

    def test_normal_completion(self):
        kind, result = run_once(self.tracker, PROGRESS_LINES, 0)
        self.assertEqual(kind, "finish")
        self.assertEqual(result.kind, run_outcome.SUCCESS)
        self.assertTrue(result.succeeded)
        self.assertFalse(result.expand_details)
        self.assertEqual(result.status_text, "Done ✓  Your stems are ready.")

    def test_nonzero_exit_only(self):
        kind, result = run_once(self.tracker, PROGRESS_LINES, 1)
        self.assertEqual(kind, "finish")
        self.assertEqual(result.kind, run_outcome.FAILURE)
        self.assertTrue(result.expand_details)
        self.assertIn("exit 1", result.reason)

    def test_exit_zero_but_process_failure_marker(self):
        kind, result = run_once(self.tracker, PROGRESS_LINES + [FAIL_LINE], 0)
        self.assertEqual(kind, "finish")
        self.assertEqual(result.kind, run_outcome.FAILURE)
        self.assertIn("no output", result.reason)

    def test_first_memory_error_triggers_one_chunked_retry(self):
        kind, cmd = run_once(self.tracker, PROGRESS_LINES + [MEM_LINE], 0)
        self.assertEqual(kind, "retry")
        self.assertIn("--chunk_duration", cmd)
        self.assertEqual(cmd.count("--chunk_duration"), 1)
        self.assertEqual(cmd[:len(BASE_CMD)], BASE_CMD)
        # The retry slot is now used; the tracker won't offer another one.
        self.assertFalse(self.tracker.should_retry())

    def test_retry_still_out_of_memory_is_failure_not_done(self):
        kind, _cmd = run_once(self.tracker, [MEM_LINE], 0)
        self.assertEqual(kind, "retry")
        # Chunked retry runs, hits the memory wall again, yet exits 0.
        kind, result = run_once(self.tracker, [MEM_LINE_ALT], 0)
        self.assertEqual(kind, "finish")
        self.assertEqual(result.kind, run_outcome.FAILURE)
        self.assertIn("even with chunking", result.reason)
        self.assertNotIn("exit", result.reason)

    def test_exit_zero_with_memory_error_never_counts_as_success(self):
        # Direct classification: OOM output + exit 0 must not read as "Done".
        outcome = run_outcome.classify_result(
            0, saw_memory_error=True, saw_process_failure=False, cancelled=False)
        self.assertEqual(outcome.kind, run_outcome.FAILURE)

    def test_cancel_suppresses_retry_and_reports_cancelled(self):
        for text in [MEM_LINE]:
            self.tracker.scan(text)
        self.tracker.cancelled = True  # user hit Cancel while it ran
        self.assertFalse(self.tracker.should_retry())
        outcome = self.tracker.finish(-15)
        self.assertEqual(outcome.kind, run_outcome.CANCELLED)
        self.assertEqual(outcome.status_text, "Cancelled.")
        self.assertFalse(outcome.expand_details)
        # The cancel flag is one-shot; the next run starts clean.
        self.assertFalse(self.tracker.cancelled)

    def test_fresh_run_resets_state(self):
        run_once(self.tracker, [MEM_LINE, FAIL_LINE], 1)
        self.tracker.begin(BASE_CMD)
        self.assertFalse(self.tracker.saw_memory_error)
        self.assertFalse(self.tracker.saw_process_failure)
        self.assertFalse(self.tracker.chunked_retry)
        self.assertFalse(self.tracker.cancelled)


if __name__ == '__main__':
    unittest.main()
