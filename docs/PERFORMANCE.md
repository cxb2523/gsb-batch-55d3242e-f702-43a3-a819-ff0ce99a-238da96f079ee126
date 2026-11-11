# Performance gates

NextDJ measures the packaged renderer behavior from a real Electron process.
Every scenario loads a deterministic WAV fixture, waits for renderer startup,
resets the profiler, and only then records the interaction.

Run the default deck-load gate:

```bash
npm run perf:snapshot
```

Run a specific scenario or retain a machine-readable report:

```bash
npm run perf:snapshot -- --scenario deck-play --repetitions 3
npm run perf:snapshot -- --scenario deck-record --out artifacts/performance/deck-record.json
```

The gate builds production assets first. Each capture runs in an isolated
Electron user-data directory, performs a warm-up, and fails when it observes a
long task, a slow measured frame, a missing required measure, or a duration
above the scenario budget in `scripts/lib/performance-budget.mjs`.

Use `npm run perf:capture -- --scenario deck-load` only when diagnosing a
single raw capture without repetitions or budget enforcement.
