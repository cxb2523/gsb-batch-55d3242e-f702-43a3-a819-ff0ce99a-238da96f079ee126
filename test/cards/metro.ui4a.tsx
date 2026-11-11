import { useState, useEffect, useRef, useCallback } from "react"
import { usePersistedState } from "$dsh/state"
import { Play, Square, Music } from "lucide-react"

const BEAT_SOUNDS = [
  { label: "木鱼", freq: 800, type: "sine" as OscillatorType },
  { label: "电子", freq: 1200, type: "square" as OscillatorType },
  { label: "鼓", freq: 200, type: "sine" as OscillatorType },
]

const TIME_SIGNATURES = [
  { beats: 4, note: 4, label: "4/4" },
  { beats: 3, note: 4, label: "3/4" },
  { beats: 6, note: 8, label: "6/8" },
  { beats: 2, note: 2, label: "2/2" },
  { beats: 5, note: 4, label: "5/4" },
]

export default function Metronome() {
  const [bpm, setBpm] = usePersistedState<number>("metronome-bpm", 120)
  const [timeSig, setTimeSig] = usePersistedState<number>("metronome-timesig", 4)
  const [running, setRunning] = useState(false)
  const [currentBeat, setCurrentBeat] = useState(-1)
  const [soundIdx, setSoundIdx] = usePersistedState<number>("metronome-sound", 0)
  const [tapTimes, setTapTimes] = useState<number[]>([])

  const ctxRef = useRef<AudioContext | null>(null)
  const nextNoteTimeRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const beatRef = useRef(0)
  const runningRef = useRef(false)
  const bpmRef = useRef(bpm)
  const timeSigRef = useRef(timeSig)

  bpmRef.current = bpm
  timeSigRef.current = timeSig

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext()
    }
    return ctxRef.current
  }, [])

  const playClick = useCallback((isAccent: boolean) => {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const s = BEAT_SOUNDS[soundIdx]
    osc.type = s.type
    osc.frequency.value = isAccent ? s.freq * 1.5 : s.freq
    gain.gain.setValueAtTime(isAccent ? 0.6 : 0.35, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)
    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.06)
  }, [getCtx, soundIdx])

  const scheduler = useCallback(() => {
    const ctx = getCtx()
    const secondsPerBeat = 60.0 / bpmRef.current
    while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
      const beat = beatRef.current % timeSigRef.current
      const isAccent = beat === 0
      playClick(isAccent)
      const t = nextNoteTimeRef.current
      nextNoteTimeRef.current += secondsPerBeat
      setTimeout(() => setCurrentBeat(beat), Math.max(0, (t - ctx.currentTime) * 1000))
      beatRef.current++
    }
  }, [getCtx, playClick])

  const start = useCallback(() => {
    const ctx = getCtx()
    if (ctx.state === "suspended") ctx.resume()
    runningRef.current = true
    nextNoteTimeRef.current = ctx.currentTime
    beatRef.current = 0
    timerRef.current = window.setInterval(scheduler, 25)
    setRunning(true)
  }, [getCtx, scheduler])

  const stop = useCallback(() => {
    runningRef.current = false
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setCurrentBeat(-1)
    setRunning(false)
  }, [])

  useEffect(() => {
    if (running) start()
    else stop()
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current)
    }
  }, [running, start, stop])

  useEffect(() => {
    return () => {
      ctxRef.current?.close()
    }
  }, [])

  const handleTap = useCallback(() => {
    const now = Date.now()
    const times = [...tapTimes, now].slice(-8)
    setTapTimes(times)
    if (times.length >= 3) {
      const intervals = times.slice(1).map((t, i) => t - times[i])
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const newBpm = Math.round(60000 / avg)
      if (newBpm >= 30 && newBpm <= 300) setBpm(newBpm)
    }
  }, [tapTimes, setBpm])

  const handleBpmChange = (val: string) => {
    const n = parseInt(val, 10)
    if (val === "" || (n >= 30 && n <= 300)) setBpm(n)
  }

  const sig = TIME_SIGNATURES.find((s) => s.beats === timeSig) || TIME_SIGNATURES[0]

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "24px", gap: "24px", fontFamily: "system-ui, sans-serif", color: "var(--dsw-alias-label-primary)", background: "var(--dsw-alias-bg-base)" }}>
      <style>{`
        .metronome-btn {
          border: none;
          cursor: pointer;
          transition: transform 90ms ease, background 120ms ease;
        }
        .metronome-btn:hover { transform: scale(1.05); }
        .metronome-btn:active { transform: scale(0.95); }
        .metronome-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
        .beat-dot { transition: transform 80ms ease, background 80ms ease; }
        .beat-dot.active { transform: scale(1.3); }
        @media (prefers-reduced-motion: reduce) {
          .metronome-btn, .beat-dot { transition: none !important; }
        }
      `}</style>

      {/* Beat display */}
      <div style={{ display: "flex", justifyContent: "center", gap: "12px", padding: "20px 0" }}>
        {Array.from({ length: timeSig }).map((_, i) => (
          <div
            key={i}
            className={`beat-dot ${currentBeat === i ? "active" : ""}`}
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: currentBeat === i
                ? "var(--dsw-alias-state-business-primary)"
                : "var(--dsw-alias-border-l1)",
              transition: "background 80ms ease",
            }}
          />
        ))}
      </div>

      {/* BPM */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "48px", fontWeight: 700, lineHeight: 1.1, color: "var(--dsw-alias-label-primary)" }}>
          {bpm}
        </div>
        <div style={{ fontSize: "13px", color: "var(--dsw-alias-label-secondary)", marginTop: "4px" }}>BPM</div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
        <input
          type="range"
          min={30}
          max={300}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          aria-label="BPM"
          style={{ width: "100%", maxWidth: "280px", accentColor: "var(--dsw-alias-state-business-primary)" }}
        />
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            className="metronome-btn"
            onClick={() => setBpm((b) => Math.max(30, b - 5))}
            aria-label="BPM 减 5"
            style={{ background: "var(--dsw-alias-bg-layer-1)", border: `1px solid var(--dsw-alias-border-l1)`, borderRadius: "8px", padding: "6px 12px", fontSize: "14px", color: "var(--dsw-alias-label-primary)" }}
          >
            −5
          </button>
          <button
            className="metronome-btn"
            onClick={() => setBpm((b) => Math.min(300, b + 5))}
            aria-label="BPM 加 5"
            style={{ background: "var(--dsw-alias-bg-layer-1)", border: `1px solid var(--dsw-alias-border-l1)`, borderRadius: "8px", padding: "6px 12px", fontSize: "14px", color: "var(--dsw-alias-label-primary)" }}
          >
            +5
          </button>
          <input
            type="number"
            min={30}
            max={300}
            value={bpm}
            onChange={(e) => handleBpmChange(e.target.value)}
            aria-label="BPM 数值"
            style={{ width: "64px", textAlign: "center", border: `1px solid var(--dsw-alias-border-l1)`, borderRadius: "8px", padding: "6px", fontSize: "14px", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)" }}
          />
        </div>
      </div>

      {/* Time signature */}
      <div>
        <div style={{ fontSize: "13px", color: "var(--dsw-alias-label-secondary)", marginBottom: "8px" }}>拍号</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
          {TIME_SIGNATURES.map((s) => (
            <button
              key={s.label}
              className="metronome-btn"
              onClick={() => setTimeSig(s.beats)}
              aria-pressed={timeSig === s.beats}
              style={{
                background: timeSig === s.beats ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-bg-layer-1)",
                color: timeSig === s.beats ? "#fff" : "var(--dsw-alias-label-primary)",
                border: `1px solid ${timeSig === s.beats ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-border-l1)"}`,
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "14px",
                fontWeight: timeSig === s.beats ? 600 : 400,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sound & tap */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--dsw-alias-label-secondary)" }}>
          <Music size={14} />
          <select
            value={soundIdx}
            onChange={(e) => setSoundIdx(Number(e.target.value))}
            aria-label="节拍声音"
            style={{ border: `1px solid var(--dsw-alias-border-l1)`, borderRadius: "6px", padding: "4px 6px", fontSize: "13px", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)" }}
          >
            {BEAT_SOUNDS.map((s, i) => (
              <option key={i} value={i}>{s.label}</option>
            ))}
          </select>
        </div>
        <button
          className="metronome-btn"
          onClick={handleTap}
          aria-label="点按测速"
          style={{
            background: "var(--dsw-alias-bg-layer-1)",
            border: `1px solid var(--dsw-alias-border-l1)`,
            borderRadius: "8px",
            padding: "6px 12px",
            fontSize: "13px",
            color: "var(--dsw-alias-label-secondary)",
          }}
        >
          点按测速
        </button>
      </div>

      {/* Play / Stop */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: "auto" }}>
        <button
          className="metronome-btn"
          onClick={running ? stop : start}
          aria-label={running ? "停止" : "开始"}
          style={{
            background: running ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-state-business-primary)",
            color: "#fff",
            border: "none",
            borderRadius: "12px",
            padding: "14px 40px",
            fontSize: "16px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {running ? <Square size={18} /> : <Play size={18} />}
          {running ? "停止" : "开始"}
        </button>
      </div>
    </div>
  )
}