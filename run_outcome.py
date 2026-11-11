"""Headless outcome logic for a separation run.

The engine can print a GPU-memory error yet still exit 0, and per-file
failures only appear in the log, so the exit code alone can't decide whether
a run succeeded. This module holds the marker scanning, the one-shot chunked
retry decision, and the final success/failure classification as pure
functions plus a small state tracker, so app.py stays a thin Tk shell and
the logic is testable without a display, a model, or a GPU.
"""

# Scraped from the engine's stdout. The CLI logs per-file errors but still
# exits 0 with an empty output list, so exit code alone can't be trusted.
MEM_ERROR_MARKERS = ("[metal::malloc]", "maximum allowed buffer size")
PROCESS_FAIL_MARKER = "Failed to process file"
# On a GPU-memory blow-up, retry once splitting the audio into chunks this many
# seconds long — the Metal buffer size scales with chunk length.
RETRY_CHUNK_SECONDS = 30

SUCCESS = "success"
CANCELLED = "cancelled"
FAILURE = "failure"


def output_has_memory_error(text):
    """True when engine output shows a GPU-memory blow-up."""
    return any(marker in text for marker in MEM_ERROR_MARKERS)


def output_has_process_failure(text):
    """True when engine output reports a per-file processing failure."""
    return PROCESS_FAIL_MARKER in text


def chunked_retry_command(base_cmd, chunk_seconds=RETRY_CHUNK_SECONDS):
    """The base command plus chunking args — never appended twice."""
    cmd = list(base_cmd)
    if "--chunk_duration" not in cmd:
        cmd += ["--chunk_duration", str(chunk_seconds)]
    return cmd


class RunOutcome:
    """What a finished run means, with the exact user-visible strings."""

    def __init__(self, kind, reason=None):
        self.kind = kind
        self.reason = reason

    @property
    def succeeded(self):
        return self.kind == SUCCESS

    @property
    def expand_details(self):
        """Failures auto-open the log panel so the reason is visible."""
        return self.kind == FAILURE

    @property
    def status_text(self):
        if self.kind == SUCCESS:
            return "Done ✓  Your stems are ready."
        if self.kind == CANCELLED:
            return "Cancelled."
        return self.reason

    @property
    def log_text(self):
        if self.kind == SUCCESS:
            return "\n✓ Separation complete.\n"
        if self.kind == CANCELLED:
            return "\n■ Cancelled.\n"
        return f"\n✗ Separation failed — {self.reason}\n"


def classify_result(returncode, *, saw_memory_error, saw_process_failure, cancelled):
    """Decide what a finished run means.

    Success requires all three: exit code 0, no per-file processing failure
    in the output, and no GPU-memory error. Cancel wins over everything — a
    killed process's exit code and partial output say nothing about the run.
    A memory error at this point means the chunked retry already ran and
    still wasn't enough, so say so instead of blaming the exit code.
    """
    if cancelled:
        return RunOutcome(CANCELLED)
    if returncode == 0 and not saw_process_failure and not saw_memory_error:
        return RunOutcome(SUCCESS)
    if saw_memory_error:
        reason = ("Ran out of GPU memory even with chunking — try a shorter "
                  "file or a Mac with more memory.")
    elif saw_process_failure:
        reason = ("The engine reported an error and produced no output — "
                  "see the details below.")
    else:
        reason = f"Something went wrong (exit {returncode}) — see the details below."
    return RunOutcome(FAILURE, reason)


class RunTracker:
    """Mutable per-run state the GUI's worker/queue plumbing feeds into.

    One instance lives for the app's lifetime; begin() starts a fresh
    user-initiated run. The flow mirrors the GUI: scan() every output chunk,
    then on process exit either should_retry()/retry_command() or finish().
    """

    def __init__(self):
        self.base_cmd = None
        self.reset()

    def reset(self):
        self.saw_memory_error = False
        self.saw_process_failure = False
        self.chunked_retry = False   # current run is the auto-retry with chunking
        self.cancelled = False

    def begin(self, cmd):
        """Start a fresh user-initiated run, remembering its command."""
        self.base_cmd = list(cmd)
        self.reset()

    def scan(self, text):
        """Fold one chunk of engine output into the run state."""
        if output_has_memory_error(text):
            self.saw_memory_error = True
        if output_has_process_failure(text):
            self.saw_process_failure = True

    def should_retry(self):
        """One automatic chunked retry: first run only, never after cancel."""
        return (self.saw_memory_error and not self.chunked_retry
                and not self.cancelled)

    def retry_command(self):
        """Mark the chunked retry as used and return its command."""
        cmd = chunked_retry_command(self.base_cmd or [])
        self.chunked_retry = True
        self.saw_memory_error = False
        self.saw_process_failure = False
        return cmd

    def finish(self, returncode):
        """Classify the run; clears the one-shot cancel flag like the GUI did."""
        outcome = classify_result(
            returncode,
            saw_memory_error=self.saw_memory_error,
            saw_process_failure=self.saw_process_failure,
            cancelled=self.cancelled)
        self.cancelled = False
        return outcome
