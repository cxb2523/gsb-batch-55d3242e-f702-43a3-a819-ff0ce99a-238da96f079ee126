## Sound

Every fact here was measured in a real browser, not recalled — the failure modes are silent
ones, so guessing costs a card that looks fine and makes no noise.

**A context built before any click is born suspended, and starting an oscillator on it throws
nothing.** It schedules against a clock that never advances: no error, no sound. Worse,
`await ctx.resume()` on a document nobody has ever clicked **never settles** — it does not
reject, so a `try/catch` buys nothing and an `await` in front of your setup deadlocks the card
at first render.

**But one click unlocks the whole page, not just that handler.** Chromium's gate is
"has this document ever been activated", so after a single press anywhere in the card, a
context created later — on a timer, in an effect — is born `running`. **And the context you already built wakes up with it** — the `resume()` promise that was hanging since load resolves on that same press, and its state flips to `running`. So there is no need to delay construction: build the context whenever you like, keep the `resume()` off the render path, and the first real press repairs it. That is what makes a
metronome or a sequencer possible: only the _first_ press has to be a real gesture. Build the
context lazily inside that first click, or build it eagerly and gate every sound behind a
"someone has pressed something" flag.

**Drawing sound needs no gesture at all.** `decodeAudioData` works on a suspended context, and
`OfflineAudioContext` renders with no interaction whatever. So a card can `readBytes` a wav,
decode it and paint its waveform the moment it opens; only _hearing_ it is gated. An
`AnalyserNode` resolves to `sampleRate / fftSize`, so the default `fftSize = 2048` gives 1024 bins
at 21.5Hz and halving it gives 512 bins at **43Hz** — fine for a picture, never enough for a
tuner (use autocorrelation on the time-domain data for pitch).

A bare `OscillatorNode` sine reads as a test tone. Layer two or three partials and shape a
`GainNode` envelope and it reads as an instrument instead. Close the context on unmount, or
every reload leaves another one behind.
