## Running a command

`bash(command)` from `$dsh/exec` runs one command in the workspace and resolves
with `{stdout, stderr, exitCode, signal, truncated, timedOut}`. It runs under the session's own sandbox
mode, so it opens nothing your own bash tool has not already opened.

**Fetch the first screen from a `useEffect(…, [])`.** Defining the loader and never calling it renders your skeleton forever — measured, on a card whose `load` appeared exactly once in the file, at its own definition. It compiled, it painted, and a browser showed `加载中…` before a click, after a click, and after a remount. The whole shape:

```tsx
const [loading, setLoading] = useState(true);
const load = async (p: string) => {
  try {
    setRows(await readdir(p));
  } finally {
    setLoading(false);
  }
};
useEffect(() => {
  void load(path);
}, [path]); // ← the line that is missing when a card hangs
```

**A card that re-runs a command needs `signal`.** Polling on a timer, or running one per
keystroke, stacks a second command on top of a slow first — and the panel then paints whichever
finishes last, which is not necessarily the newest. Pass an `AbortController`'s signal and abort
the previous run: it kills the command itself, not just your wait.

Measured across 378 real cards: 11 poll or re-run a command and **0** pass a signal, while the
rule immediately below — check `exitCode` — is followed by 18 of 19. The difference is that one
of them names a field you can see and the other describes a shape. So, the shape:

```tsx
useEffect(() => {
  const ctrl = new AbortController();
  const tick = async () => {
    // A canvas nobody is looking at should not be shelling out every two seconds.
    if (document.hidden) return;
    try {
      const { stdout, exitCode } = await bash("git status --porcelain", { signal: ctrl.signal });
      setStatus({ stdout, exitCode });
    } catch (error) {
      // The abort is the expected path here, not a failure: every re-run causes one.
      if ((error as Error).name === "AbortError") return;
      throw error;
    }
  };
  void tick();
  const timer = setInterval(tick, 2000);
  return () => {
    ctrl.abort();
    clearInterval(timer);
  };
}, []);
```

**A non-zero exit resolves.** Check `exitCode` and show what the command said —
`git status` failing outside a repo is a thing the card should display, not an
exception to swallow. Only a failure to run at all rejects.

`exitCode: null` means the executor reported no exit code. `signal` carries a terminating signal
such as `"SIGTERM"`, or `null` when none was reported. Read `timedOut` independently: a timeout
can happen before a process starts and report no signal, and a signal can terminate a command
without a timeout.

This is the shortest path to anything the filesystem alone cannot answer: history
(`git log`), state (`git status`, `git diff --stat`),
search at speed (`rg -n pattern`), sizes (`du -sh *`). A whole test suite usually will
not fit in 15 seconds — one file's tests might, and `timedOut` is the honest thing to show when
it does not. Prefer one
command over many `readFile` calls: a card that walks a tree with twenty round trips is slower and
more code than one `ls -R`.

**A card's commands are invisible in a way yours are not.** When you run a command, it is in
the transcript before it runs, attributed, and the user can see it. When a card runs one, it is
inside code they did not read, behind a button whose label they trust, and it can fire on mount
with no click at all. The sandbox is the same; their ability to notice is not. So:

- **Nothing destructive, ever** — no `rm`, no `git clean`, no `git reset --hard`, no
  `checkout` that discards, no `kill`, no package installs. A card observes; when something
  should change, hand it to the user through `sendMessage` and let them agree to it in the open.
- **Show what you ran.** A card that shells out should say so — the command in small type near
  the result, or under a disclosure. It costs one line and turns "permitted" into "seen".

**This is about commands, not about `writeFile`.** A command can do something there is no
way back from; a file write leaves a diff, sits in version control, and a read-only session
refuses it. So a card that edits a config, fills in a missing key, renames in bulk or saves a
draft should **write the file** — with the change visible before it lands and a button that
commits it. Turning that into a question ("which values do you want to change?") gives back the
one thing the card was for. Reserve `sendMessage` for what the card genuinely cannot do:
running the destructive command, or a change big enough that the user wants you to think about
it first.

Two limits worth designing around. Commands are killed after **15 seconds**, so nothing that
watches, serves, or waits. And the card is on the user's page — a command runs while they
look at a spinner, so keep it to one round trip per interaction rather than one per row.

**A timeout is not an empty result, and the two arrive as the same value.** A killed command
resolves — 200, `stdout: ""`, `timedOut: true` — so `bash()` does not throw and a card that
renders `stdout` shows the reader **"no matches"** for a search that never finished. Check
`timedOut` before you report emptiness. Measured on a real card: a workspace search that
reported no matches for `*.ts` under a directory holding 5,327 of them.

**And in `find`, exclude by pruning, not by filtering.** `-not -path '*/node_modules/*'` is a
predicate: `find` still descends into every excluded directory and stats every file inside
before discarding it. `-prune` stops the walk. Same tree, same 5,327 results, measured:

    find . -type f -not -path '*/node_modules/*' …          # 55-65s -> killed at 15s, 0 rows
    find . \( -name node_modules -o -name .git \) -prune -o -type f … -print   # 6.3s, 5327 rows

The filtering spelling is the one that reads more naturally and it is the one that times out.
