/** `$dsh/exec` — one command in the workspace, under the session's own sandbox mode. */
declare module "$dsh/exec" {
  /** What a command left behind. `truncated` means output was cut, not that it failed. */
  export type ExecResult = {
    stdout: string;
    stderr: string;
    /** The process's exit code, or null when the executor reported no exit code. */
    exitCode: number | null;
    /** The terminating signal (for example, "SIGTERM"), or null when none was reported. */
    signal: string | null;
    truncated: { stdout: boolean; stderr: boolean };
    /** Independent of signal: a timeout before process creation can have signal: null. */
    timedOut: boolean;
  };
  /**
   * Runs `command` and resolves with its output.
   *
   * A non-zero exit RESOLVES — check `exitCode` rather than catching. Only a failure to run
   * at all rejects. Commands are killed after 15 seconds.
   *
   * Pass a `signal` when the card runs commands on a timer or per keystroke: aborting kills
   * the command itself, not just the wait, so a slow run cannot pile up behind the next one.
   * An aborted call REJECTS with an `AbortError` — the one rejection that is not a failure,
   * so ignore it rather than showing it (`if (e.name === "AbortError") return`).
   */
  export function bash(command: string, options?: { signal?: AbortSignal }): Promise<ExecResult>;
}
