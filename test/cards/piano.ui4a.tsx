import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

/* ---------- 音乐常量 ---------- */

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

const START = 60 // C4
const KEYS = 25 // C4 .. C6（两个八度 + 结尾 C）

// 电脑键盘 → 相对当前起始音的偏移（半音）
const KEY_PAIRS: [string, number][] = [
  ["a", 0], ["w", 1], ["s", 2], ["e", 3], ["d", 4], ["f", 5], ["t", 6], ["g", 7],
  ["y", 8], ["h", 9], ["u", 10], ["j", 11], ["k", 12], ["o", 13], ["l", 14], ["p", 15],
  [";", 16], ["'", 17],
]
const KEY_LABELS: Record<number, string> = {}
for (const [ch, off] of KEY_PAIRS) KEY_LABELS[off] = ch

function keyOffset(key: string): number | null {
  for (const [ch, off] of KEY_PAIRS) if (ch === key) return off
  return null
}

function noteName(m: number): string {
  return NAMES[m % 12] + (Math.floor(m / 12) - 1)
}
function isBlack(m: number): boolean {
  return NAMES[m % 12].includes("#")
}
function freq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

// 分音：[倍频, 幅度, 波形]，层叠后更像琴声而非测试音
const PARTIALS: [number, number, OscillatorType][] = [
  [1, 1.0, "triangle"],
  [2, 0.45, "sine"],
  [3, 0.22, "sine"],
  [4, 0.12, "sine"],
  [5, 0.06, "sine"],
  [6, 0.03, "sine"],
]

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

/* ---------- 组件 ---------- */

export default function Piano() {
  const [transpose, setTranspose] = useState(() => load("piano.transpose", 0))
  const [volume, setVolume] = useState(() => load("piano.volume", 0.7))
  const [sustain, setSustain] = useState(() => load("piano.sustain", false))
  const [active, setActive] = useState<Set<number>>(() => new Set())

  const audioRef = useRef<AudioContext & { master?: GainNode } | null>(null)
  const voicesRef = useRef<Map<number, { gain: GainNode; oscs: OscillatorNode[] }>>(new Map())

  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const sustainRef = useRef(sustain)
  sustainRef.current = sustain
  const transposeRef = useRef(transpose)
  transposeRef.current = transpose

  useEffect(() => save("piano.transpose", transpose), [transpose])
  useEffect(() => save("piano.volume", volume), [volume])
  useEffect(() => save("piano.sustain", sustain), [sustain])

  const ensureAudio = useCallback((): (AudioContext & { master?: GainNode }) | null => {
    let ctx = audioRef.current
    if (!ctx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return null
      ctx = new Ctx()
      const master = ctx.createGain()
      const comp = ctx.createDynamicsCompressor()
      master.gain.value = volumeRef.current
      master.connect(comp)
      comp.connect(ctx.destination)
      ;(ctx as any).master = master
      audioRef.current = ctx
    }
    if (ctx.state === "suspended") ctx.resume()
    return ctx
  }, [])

  const press = useCallback((midi: number) => {
    const ctx = ensureAudio()
    if (!ctx) return
    setActive((prev) => {
      const s = new Set(prev)
      s.add(midi)
      return s
    })
    if (voicesRef.current.has(midi)) return

    const now = ctx.currentTime
    const f = freq(midi)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(volumeRef.current, now + 0.01)
    gain.connect(ctx.master!)

    const oscs = PARTIALS.map(([ratio, amp, type]) => {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = f * ratio
      const og = ctx.createGain()
      og.gain.value = amp
      osc.connect(og)
      og.connect(gain)
      osc.start(now)
      return osc
    })
    voicesRef.current.set(midi, { gain, oscs })
  }, [ensureAudio])

  const release = useCallback((midi: number) => {
    setActive((prev) => {
      const s = new Set(prev)
      s.delete(midi)
      return s
    })
    const voice = voicesRef.current.get(midi)
    if (!voice) return
    voicesRef.current.delete(midi)
    const ctx = audioRef.current
    if (!ctx) return
    const now = ctx.currentTime
    const rel = sustainRef.current ? 1.6 : 0.28
    const g = voice.gain.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(Math.max(g.value, 0.0001), now)
    g.exponentialRampToValueAtTime(0.0001, now + rel)
    voice.oscs.forEach((o) => o.stop(now + rel + 0.05))
  }, [])

  // 音量实时反映到总增益
  useEffect(() => {
    const ctx = audioRef.current
    if (ctx?.master) ctx.master.gain.setValueAtTime(volume, ctx.currentTime)
  }, [volume])

  // 卸载时关闭音频上下文，避免每次重载残留
  useEffect(() => {
    return () => {
      const ctx = audioRef.current
      audioRef.current = null
      ctx?.close().catch(() => {})
    }
  }, [])

  // 电脑键盘
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key
      if (k === "z" || k === "ArrowLeft") {
        setTranspose((t) => Math.max(-24, t - 12))
        return
      }
      if (k === "x" || k === "ArrowRight") {
        setTranspose((t) => Math.min(24, t + 12))
        return
      }
      if (k === " ") {
        e.preventDefault()
        setSustain((s) => !s)
        return
      }
      const off = keyOffset(k)
      if (off == null) return
      if (e.repeat) return
      e.preventDefault()
      press(START + transposeRef.current + off)
    }
    const up = (e: KeyboardEvent) => {
      const off = keyOffset(e.key)
      if (off == null) return
      release(START + transposeRef.current + off)
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [press, release])

  // 键位布局
  const layout = useMemo(() => {
    const start = START + transpose
    const all: number[] = []
    for (let m = start; m < start + KEYS; m++) all.push(m)

    const whites = all.filter((m) => !isBlack(m))
    const whiteIndexByMidi = new Map(whites.map((m, i) => [m, i]))
    const whiteW = 100 / whites.length

    const labelFor = (m: number) => KEY_LABELS[m - start] ?? ""

    const whiteKeys = whites.map((m) => ({ midi: m, name: noteName(m), label: labelFor(m) }))
    const blackKeys = all
      .filter((m) => isBlack(m))
      .map((m) => {
        const prevIdx = whiteIndexByMidi.get(m - 1)!
        const w = whiteW * 0.62
        return {
          midi: m,
          name: noteName(m),
          label: labelFor(m),
          leftPct: (prevIdx + 1) * whiteW - w / 2,
          widthPct: w,
        }
      })

    return { whiteKeys, blackKeys, start }
  }, [transpose])

  const rangeLabel = `${noteName(layout.start)} – ${noteName(layout.start + KEYS - 1)}`

  return (
    <div className="root">
      <div className="toolbar">
        <div className="octave">
          <button className="tb-btn" onClick={() => setTranspose((t) => Math.max(-24, t - 12))} aria-label="低一个八度">−</button>
          <span className="range">{rangeLabel}</span>
          <button className="tb-btn" onClick={() => setTranspose((t) => Math.min(24, t + 12))} aria-label="高一个八度">+</button>
        </div>

        <label className="volume">
          <span>音量</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ accentColor: "var(--dsw-alias-state-business-primary)" }}
          />
        </label>

        <button
          className={`sustain ${sustain ? "on" : ""}`}
          onClick={() => setSustain((s) => !s)}
          aria-pressed={sustain}
        >
          延音 {sustain ? "开" : "关"}
        </button>
      </div>

      <div className="keys" style={{ touchAction: "none" }}>
        {layout.whiteKeys.map((k) => (
          <button
            key={k.midi}
            className={`white ${active.has(k.midi) ? "active" : ""}`}
            aria-label={k.name}
            onPointerDown={(e) => {
              e.preventDefault()
              press(k.midi)
            }}
            onPointerEnter={(e) => {
              if (e.buttons & 1) press(k.midi)
            }}
            onPointerUp={() => release(k.midi)}
            onPointerLeave={() => release(k.midi)}
          >
            <span className="name">{k.name}</span>
            {k.label && <span className="key">{k.label}</span>}
          </button>
        ))}

        {layout.blackKeys.map((k) => (
          <button
            key={k.midi}
            className={`black ${active.has(k.midi) ? "active" : ""}`}
            aria-label={k.name}
            style={{ left: `${k.leftPct}%`, width: `${k.widthPct}%` }}
            onPointerDown={(e) => {
              e.preventDefault()
              press(k.midi)
            }}
            onPointerEnter={(e) => {
              if (e.buttons & 1) press(k.midi)
            }}
            onPointerUp={() => release(k.midi)}
            onPointerLeave={() => release(k.midi)}
          >
            {k.label && <span className="key">{k.label}</span>}
          </button>
        ))}
      </div>

      <div className="hint">
        电脑键盘 A–' 弹奏 · Z / X 八度 · 空格 延音 · 鼠标按住可滑动
      </div>

      <style>{`
        .root {
          height: 100%;
          min-height: 320px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 14px 14px 10px;
          box-sizing: border-box;
        }
        .toolbar {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .octave {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tb-btn {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: 1px solid var(--dsw-alias-border-l1);
          background: var(--dsw-alias-bg-layer-1);
          color: var(--dsw-alias-label-primary);
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
        }
        .tb-btn:hover {
          background: var(--dsw-alias-interactive-bg-hover);
        }
        .tb-btn:active {
          transform: translateY(1px);
        }
        .range {
          min-width: 92px;
          text-align: center;
          font-variant-numeric: tabular-nums;
          color: var(--dsw-alias-label-primary);
          font-size: 13px;
        }
        .volume {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--dsw-alias-label-secondary);
          font-size: 13px;
        }
        .volume input {
          width: 120px;
        }
        .sustain {
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid var(--dsw-alias-border-l1);
          background: var(--dsw-alias-bg-layer-1);
          color: var(--dsw-alias-label-secondary);
          font-size: 13px;
          cursor: pointer;
        }
        .sustain.on {
          color: #fff;
          background: var(--dsw-alias-state-business-primary);
          border-color: transparent;
        }

        .keys {
          position: relative;
          flex: 1;
          min-height: 170px;
          display: flex;
          user-select: none;
          -webkit-user-select: none;
        }
        .white {
          flex: 1;
          position: relative;
          border: 1px solid #c9c9c9;
          border-top: none;
          border-radius: 0 0 6px 6px;
          background: linear-gradient(#ffffff, #f1f1f2 92%);
          cursor: pointer;
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          padding-bottom: 10px;
          box-sizing: border-box;
        }
        .white + .white {
          border-left: none;
        }
        .white.active {
          background: linear-gradient(#cfe0ff, #b7ccff 92%);
        }
        .white .name {
          position: absolute;
          top: 10px;
          font-size: 11px;
          color: #9a9a9a;
        }
        .white .key {
          font-size: 11px;
          color: #8a8a8a;
        }

        .black {
          position: absolute;
          top: 0;
          height: 60%;
          border: none;
          border-radius: 0 0 5px 5px;
          background: linear-gradient(#3a3a3e, #111113);
          cursor: pointer;
          z-index: 2;
          padding: 0;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 10px;
          box-sizing: border-box;
        }
        .black.active {
          background: linear-gradient(#4a7dff, #2f5fe0);
        }
        .black .key {
          font-size: 10px;
          color: #cfcfcf;
        }

        .hint {
          font-size: 12px;
          color: var(--dsw-alias-label-secondary);
          text-align: center;
        }
      `}</style>
    </div>
  )
}
