import { useState, useEffect, useCallback, useRef, useMemo } from "react"

type Direction = "up" | "down" | "left" | "right"

interface Tile {
  id: number
  value: number
  row: number
  col: number
  isNew: boolean
  isMerged: boolean
}

const SIZE = 4
const WIN_VALUE = 2048

function createTile(id: number, row: number, col: number): Tile {
  return { id, value: Math.random() < 0.9 ? 2 : 4, row, col, isNew: true, isMerged: false }
}

function emptyBoard(): Tile[] {
  return []
}

function getEmptyCells(board: Tile[]): [number, number][] {
  const occupied = new Set(board.map((t) => `${t.row},${t.col}`))
  const cells: [number, number][] = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!occupied.has(`${r},${c}`)) cells.push([r, c])
    }
  }
  return cells
}

function cloneBoard(board: Tile[]): Tile[] {
  return board.map((t) => ({ ...t }))
}

function moveBoard(board: Tile[], dir: Direction): { board: Tile[]; score: number; moved: boolean } {
  const b = cloneBoard(board)
  let score = 0
  let moved = false
  const mergedIds = new Set<number>()

  const dr = dir === "up" ? -1 : dir === "down" ? 1 : 0
  const dc = dir === "left" ? -1 : dir === "right" ? 1 : 0

  const order = (iterate: (cb: (r: number, c: number) => void) => void) => {
    if (dir === "left" || dir === "up") {
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) cb(r, c)
    } else {
      for (let r = SIZE - 1; r >= 0; r--) for (let c = SIZE - 1; c >= 0; c--) cb(r, c)
    }
  }

  const getLineCells = (row: number, col: number): [number, number][] => {
    const line: [number, number][] = []
    let r = row
    let c = col
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
      line.push([r, c])
      r += dr
      c += dc
    }
    return line
  }

  const iterate = (cb: (r: number, c: number) => void) => {
    if (dir === "left" || dir === "up") {
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) cb(r, c)
    } else {
      for (let r = SIZE - 1; r >= 0; r--) for (let c = SIZE - 1; c >= 0; c--) cb(r, c)
    }
  }

  const visited = new Set<string>()
  const process = (row: number, col: number) => {
    const key = `${row},${col}`
    if (visited.has(key)) return
    visited.add(key)
    const line = getLineCells(row, col)
    const tiles = line.map(([r, c]) => b.find((t) => t.row === r && t.col === c)).filter(Boolean) as Tile[]
    const merged: Tile[] = []
    let i = 0
    while (i < tiles.length) {
      if (i + 1 < tiles.length && tiles[i].value === tiles[i + 1].value) {
        const newVal = tiles[i].value * 2
        score += newVal
        const mergedTile = { ...tiles[i], value: newVal, isMerged: true, id: tiles[i].id }
        merged.push(mergedTile)
        mergedIds.add(mergedTile.id)
        i += 2
      } else {
        merged.push({ ...tiles[i] })
        i++
      }
    }
    for (let j = 0; j < merged.length; j++) {
      const [r, c] = line[j]
      const t = merged[j]
      if (t.row !== r || t.col !== c) moved = true
      t.row = r
      t.col = c
      t.isNew = false
      t.isMerged = false
    }
    for (const t of tiles) {
      if (!merged.find((m) => m.id === t.id)) {
        moved = true
        t.row = -1
        t.col = -1
      }
    }
    for (const t of merged) {
      if (t.row < 0 || t.col < 0) {
        moved = true
        t.row = line[merged.indexOf(t)][0]
        t.col = line[merged.indexOf(t)][1]
      }
    }
  }

  order(iterate)
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b.find((t) => t.row === r && t.col === c)) process(r, c)
    }
  }

  return { board: b, score, moved }
}

function addRandomTile(board: Tile[]): Tile[] {
  const empty = getEmptyCells(board)
  if (empty.length === 0) return board
  const [r, c] = empty[Math.floor(Math.random() * empty.length)]
  return [...board, createTile(Math.random() * 10000, r, c)]
}

function canMove(board: Tile[]): boolean {
  if (getEmptyCells(board).length > 0) return true
  for (const t of board) {
    const neighbors = [
      [t.row - 1, t.col],
      [t.row + 1, t.col],
      [t.row, t.col - 1],
      [t.row, t.col + 1],
    ]
    for (const [nr, nc] of neighbors) {
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
        const n = board.find((x) => x.row === nr && x.col === nc)
        if (n && n.value === t.value) return true
      }
    }
  }
  return false
}

function hasWon(board: Tile[]): boolean {
  return board.some((t) => t.value >= WIN_VALUE)
}

const TILE_COLORS: Record<number, { bg: string; fg: string }> = {
  2: { bg: "var(--dsw-alias-bg-layer-2)", fg: "var(--dsw-alias-label-primary)" },
  4: { bg: "var(--dsw-alias-bg-layer-2)", fg: "var(--dsw-alias-label-primary)" },
  8: { bg: "var(--dsw-alias-state-warn-primary)", fg: "#fff" },
  16: { bg: "var(--dsw-alias-state-warn-primary)", fg: "#fff" },
  32: { bg: "var(--dsw-alias-state-warn-primary)", fg: "#fff" },
  64: { bg: "var(--dsw-alias-state-error-primary)", fg: "#fff" },
  128: { bg: "var(--dsw-alias-state-error-primary)", fg: "#fff" },
  256: { bg: "var(--dsw-alias-state-error-primary)", fg: "#fff" },
  512: { bg: "var(--dsw-alias-state-error-primary)", fg: "#fff" },
  1024: { bg: "var(--dsw-alias-state-error-primary)", fg: "#fff" },
  2048: { bg: "var(--dsw-alias-state-success-primary)", fg: "#fff" },
}

function tileStyle(value: number, isNew: boolean, isMerged: boolean): React.CSSProperties {
  const c = TILE_COLORS[value] || { bg: "var(--dsw-alias-state-error-primary)", fg: "#fff" }
  return {
    position: "absolute",
    width: "22%",
    aspectRatio: "1",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: value >= 1024 ? 16 : value >= 128 ? 20 : 24,
    color: c.fg,
    background: c.bg,
    transition: "left 120ms ease, top 120ms ease, transform 120ms ease",
    transform: isNew ? "scale(0)" : isMerged ? "scale(1.15)" : "scale(1)",
    zIndex: value,
  }
}

export default function Game2048() {
  const [board, setBoard] = useState<Tile[]>(() => {
    let b = addRandomTile(addRandomTile(emptyBoard()))
    return b
  })
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [won, setWon] = useState(false)
  const [over, setOver] = useState(false)
  const [auto, setAuto] = useState(false)
  const [autoSpeed, setAutoSpeed] = useState(200)
  const [animating, setAnimating] = useState(false)
  const boardRef = useRef(board)
  const autoRef = useRef(auto)
  const speedRef = useRef(autoSpeed)
  const overRef = useRef(over)
  const wonRef = useRef(won)
  const animRef = useRef(animating)

  boardRef.current = board
  autoRef.current = auto
  speedRef.current = autoSpeed
  overRef.current = over
  wonRef.current = won
  animRef.current = animating

  useEffect(() => {
    if (score > best) setBest(score)
  }, [score, best])

  const move = useCallback(
    (dir: Direction) => {
      if (animRef.current || overRef.current) return
      setAnimating(true)
      const b = boardRef.current
      const { board: nb, score: ns, moved } = moveBoard(b, dir)
      if (!moved) {
        setAnimating(false)
        return
      }
      const finalBoard = addRandomTile(nb)
      setBoard(finalBoard)
      setScore((s) => s + ns)
      if (hasWon(finalBoard) && !wonRef.current) setWon(true)
      if (!canMove(finalBoard)) setOver(true)
      setAnimating(false)
    },
    [],
  )

  const reset = useCallback(() => {
    setBoard(() => {
      let b = addRandomTile(addRandomTile(emptyBoard()))
      return b
    })
    setScore(0)
    setWon(false)
    setOver(false)
    setAuto(false)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        w: "up",
        s: "down",
        a: "left",
        d: "right",
      }
      const dir = map[e.key]
      if (dir) {
        e.preventDefault()
        move(dir)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [move])

  const touch = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    touch.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!touch.current) return
    const dx = e.clientX - touch.current.x
    const dy = e.clientY - touch.current.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    if (Math.max(absDx, absDy) < 20) return
    if (absDx > absDy) move(dx > 0 ? "right" : "left")
    else move(dy > 0 ? "down" : "up")
    touch.current = null
  }

  const autoMove = useCallback(() => {
    if (!autoRef.current || overRef.current) return
    const dirs: Direction[] = ["up", "down", "left", "right"]
    const b = boardRef.current
    let bestDir = dirs[0]
    let bestScore = -1
    for (const d of dirs) {
      const { moved, score: ns } = moveBoard(b, d)
      if (moved && ns > bestScore) {
        bestScore = ns
        bestDir = d
      }
    }
    move(bestDir)
  }, [move])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(autoMove, speedRef.current)
    return () => clearInterval(id)
  }, [auto, autoMove])

  const boardStyle: React.CSSProperties = useMemo(
    () => ({
      position: "relative",
      width: "100%",
      aspectRatio: "1",
      background: "var(--dsw-alias-bg-layer-2)",
      borderRadius: 12,
      padding: "2%",
      boxSizing: "border-box",
    }),
    [],
  )

  const cellStyle = (r: number, c: number): React.CSSProperties => ({
    position: "absolute",
    left: `${(c + 1) * 2}%`,
    top: `${(r + 1) * 2}%`,
    width: "22%",
    aspectRatio: "1",
    background: "var(--dsw-alias-bg-layer-1)",
    borderRadius: 8,
  })

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 16, padding: 16, boxSizing: "border-box" }}>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important }
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--dsw-alias-label-primary)" }}>2048</h2>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ background: "var(--dsw-alias-bg-layer-1)", borderRadius: 8, padding: "6px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--dsw-alias-label-secondary)" }}>分数</div>
            <div style={{ fontWeight: 700, color: "var(--dsw-alias-label-primary)" }}>{score}</div>
          </div>
          <div style={{ background: "var(--dsw-alias-bg-layer-1)", borderRadius: 8, padding: "6px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--dsw-alias-label-secondary)" }}>最高</div>
            <div style={{ fontWeight: 700, color: "var(--dsw-alias-label-primary)" }}>{best}</div>
          </div>
        </div>
      </div>

      <div
        style={boardStyle}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => (touch.current = null)}
      >
        {Array.from({ length: SIZE * SIZE }).map((_, i) => (
          <div key={i} style={cellStyle(Math.floor(i / SIZE), i % SIZE)} />
        ))}
        {board.map((t) => (
          <div key={t.id} style={tileStyle(t.value, t.isNew, t.isMerged)}>
            {t.value}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setAuto((a) => !a)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: auto ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-state-business-primary)",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 14,
          }}
          aria-label={auto ? "暂停自动演示" : "开始自动演示"}
        >
          {auto ? "⏸ 暂停演示" : "▶ 自动演示"}
        </button>
        <button type="button" onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
          新游戏
        </button>
        {auto && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>
            速度
            <input
              type="range"
              min={50}
              max={800}
              step={50}
              value={autoSpeed}
              onChange={(e) => setAutoSpeed(Number(e.target.value))}
              style={{ width: 80 }}
              aria-label="演示速度"
            />
            <span>{autoSpeed}ms</span>
          </div>
        )}
      </div>

      {(won || over) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.5)",
            borderRadius: 12,
            zIndex: 100,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, color: won ? "var(--dsw-alias-state-success-primary)" : "#fff", marginBottom: 8 }}>
            {won ? "🎉 你赢了！" : "游戏结束"}
          </div>
          <div style={{ fontSize: 16, color: "#fff", marginBottom: 16 }}>最终分数: {score}</div>
          <button
            type="button"
            onClick={reset}
            style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "var(--dsw-alias-state-business-primary)", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 16 }}
          >
            再来一局
          </button>
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)", textAlign: "center" }}>
        键盘方向键 / WASD / 滑动操作
      </div>
    </div>
  )
}