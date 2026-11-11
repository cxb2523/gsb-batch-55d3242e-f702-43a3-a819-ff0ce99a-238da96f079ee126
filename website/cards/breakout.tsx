import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";

// Written so it plays while it streams. The level and the physics come first because a component
// that names something not yet written is held back whole; after them the JSX arrives tag by tag —
// the board, the paddle, the ball, then the bricks — and each one is live the moment it closes.
const COLORS: Record<string, string> = { a: "#7aaaff", b: "#8b9cff", c: "#a78bfa", d: "#f472b6", e: "#fb923c" };

const LEVEL = ["aaaaaaaaaa", "bbbbbbbbbb", "cc.cccc.cc", "dddddddddd", "e.eeeeee.e"];

// The board is 1.6 × 1 so a step is the same length in both directions.
function step(g: any, dt: number) {
  const b = (g.ball ??= { x: g.paddle * 1.6, y: 0.86, vx: 0.5, vy: -0.8 });
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.x < 0.02 || b.x > 1.58) {
    b.vx *= -1;
    b.x = Math.min(1.58, Math.max(0.02, b.x));
  }
  if (b.y < 0.02) b.vy = Math.abs(b.vy);
  const px = g.paddle * 1.6;
  if (b.vy > 0 && b.y > 0.89 && b.y < 0.95 && Math.abs(b.x - px) < 0.15) {
    b.vy = -Math.abs(b.vy);
    b.vx = (b.x - px) * 5;
  }
  if (b.y > 1.05) g.ball = null;
  const col = Math.floor(b.x / 0.16);
  const row = Math.floor((b.y - 0.08) / 0.07);
  const cell = LEVEL[row]?.[col];
  if (cell && cell !== "." && !g.hit.includes(`${col},${row}`)) {
    g.hit.push(`${col},${row}`);
    b.vy *= -1;
    g.score += 10;
    if (LEVEL.join("").replace(/\./g, "").length === g.hit.length) cheer(g);
  }
}

function cheer(g: any) {
  confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, colors: Object.values(COLORS) });
  setTimeout(() => {
    g.hit = [];
  }, 900);
}

export default function Breakout() {
  const game = useRef<any>({ paddle: 0.5, hit: [], score: 0 });
  const [g, setView] = useState<any>({ paddle: 0.5, hit: [], score: 0 });
  useEffect(() => {
    let id = 0;
    let last = performance.now();
    const loop = (now: number) => {
      step(game.current, Math.min(0.033, (now - last) / 1000));
      last = now;
      setView({ ...game.current });
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="rounded-2xl border border-[#ffffff1f] bg-[#232324] p-4 text-[#f9fafb]">
      <div className="mb-3 flex justify-between text-[13px] text-[#adb2b8]">
        <span>Breakout · move to play</span>
        <span className="tabular-nums text-[#f9fafb]">{g.score} pts</span>
      </div>
      <div
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          game.current.paddle = Math.min(0.92, Math.max(0.08, (e.clientX - r.left) / r.width));
        }}
        data-board
        className="relative aspect-[16/10] w-full touch-none overflow-hidden rounded-xl bg-[#151517]"
      >
        <style>{"@keyframes brick{from{opacity:0;transform:translateY(-8px) scale(.5)}}"}</style>
        <div className="absolute bottom-[6%] h-[3%] w-[16%] -translate-x-1/2 rounded-full bg-[#f9fafb]" style={{ left: `${g.paddle * 100}%` }} />
        {g.ball && <div data-ball className="absolute h-[4%] w-[2.5%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7aaaff] shadow-[0_0_14px_#7aaaff]" style={{ left: `${(g.ball.x / 1.6) * 100}%`, top: `${g.ball.y * 100}%` }} />}
        {LEVEL.map((row, y) =>
          [...row].map(
            (c, x) => c !== "." && !g.hit.includes(`${x},${y}`) && <div key={`${x},${y}`} className="absolute rounded-[3px]" style={{ left: `${x * 10 + 0.5}%`, top: `${8 + y * 7}%`, width: "9%", height: "5%", background: COLORS[c], animation: `brick .5s cubic-bezier(.2,.9,.3,1.25) ${(x + y) * 28}ms both` }} />,
          ),
        )}
      </div>
    </div>
  );
}
