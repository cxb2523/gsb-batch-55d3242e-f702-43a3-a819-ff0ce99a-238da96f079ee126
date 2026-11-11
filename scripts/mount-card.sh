#!/usr/bin/env bash
# Mounts one card on the real GenUISurface and reports what it rendered.
#
# `scripts/compile-cards.ts` says a card compiles and `scripts/screens` say it matches no known
# defect; neither can see a card that throws on its first render. This does — and it is the same
# surface, the same compiler and the same error boundary the plugin ships, so `ERROR: …` here is
# what the user would have seen.
#
# Reading the output: `errors` starting with `render:` is the card's own fault. `compile:
# Unresolvable imports` naming a third-party package is usually the network — the verification
# browser cannot always reach esm.sh — so check that before blaming the card. `lucide-react` is
# stood in for locally and never appears there.
#
# Usage: scripts/mount-card.sh <card.tsx> [clicks]
set -u
card=${1:?usage: mount-card.sh <card.tsx> [clicks]}
clicks=${2:-2}
port=$((47900 + RANDOM % 90))

bun scripts/surface-harness.ts "$port" "$card" >/dev/null 2>&1 &
harness=$!
trap 'kill $harness 2>/dev/null' EXIT
# Wait for the port rather than sleeping: the bundle takes a variable second or two.
for _ in $(seq 40); do curl -sf -o /dev/null "http://127.0.0.1:$port/surface.js" && break; sleep 0.25; done

# Unquoted heredoc: it has to interpolate $port and $clicks. That means every backtick inside runs
# as a command substitution — a comment mentioning `localStorage` printed "command not found" twice
# and the JS never saw the comment. Escape the two that must survive; use none anywhere else.
# The screens first: they are instant, and two of them name exactly what a mount would show you
# slowly (a card stuck on its skeleton, a picker with no state). A flag here is not a reason to
# skip the mount — plenty of cards trip a screen and still work — but it is the cheaper half.
echo "screens:"
bun -e 'const { SCREENS } = await import("./scripts/screens.ts"); const src = await Bun.file(process.argv[1]).text(); const flags = Object.entries(SCREENS).filter(([, fires]) => fires(src)).map(([name]) => name); console.log(flags.length ? "  " + flags.join(", ") : "  (none)")' -- "$card"
echo

ego-browser nodejs <<EOF
await useOrCreateTaskSpace('mount one card')
await openOrReuseTab('http://127.0.0.1:$port/', { wait: true, timeout: 25 })
const out = await js(String.raw\`(async () => {
  localStorage.clear()  // every key: the previous card's state is what makes this one look wrong
  const { GenUISurface, registerModules } = await import("/surface.js")
  const React = globalThis.React, { createRoot } = globalThis.ReactDOM
  const names = await (await fetch("/icons")).json()
  const icon = () => React.createElement("span", { "data-icon": "" })
  if (names.length) registerModules({ "lucide-react": Object.fromEntries(names.map(n => [n, icon])) })
  const code = await (await fetch("/card")).text()
  const errors = []
  const mount = async () => {
    const host = document.createElement("div"); host.style.width = "440px"; document.body.appendChild(host)
    createRoot(host).render(React.createElement(GenUISurface, { code, streaming: false, onError: (e, p) => errors.push(p + ": " + e.message.slice(0, 120)) }))
    await new Promise(r => setTimeout(r, 3000))
    return host
  }
  const host = await mount()
  const before = host.innerText.replace(/\s+/g, " ").slice(0, 100)
  // Prefer buttons that look like they change state over ones that navigate. Clicking the first
  // few in DOM order once meant clicking 上一周 / 下一周 on a tracker and concluding that nothing
  // persisted, which was true and meaningless.
  const NAVIGATIONAL = /prev|next|上一|下一|返回|back|close|关闭|今天|today/i
  const labelOf = (b) => (b.getAttribute("aria-label") || b.textContent || "").trim()
  const candidates = [...host.querySelectorAll("button")]
  const targets = [...candidates.filter(b => !NAVIGATIONAL.test(labelOf(b))), ...candidates].slice(0, $clicks)
  for (const b of targets) {
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) b.dispatchEvent(new MouseEvent(t, { bubbles: true }))
    await new Promise(r => setTimeout(r, 180))
  }
  const after = host.innerText.replace(/\s+/g, " ").slice(0, 100)
  // Selection usually shows in styling, not text: a card whose innerText is unchanged after a
  // click may be working perfectly. Report the states a screen reader would see as well, so
  // "nothing happened" is a finding rather than an artefact of reading only the text.
  const states = [...host.querySelectorAll("[aria-pressed],[aria-selected],[aria-checked],[data-state],:checked")].map(el => (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\s+/g, " ").slice(0, 24) + "=" + (el.getAttribute("aria-pressed") ?? el.getAttribute("aria-selected") ?? el.getAttribute("aria-checked") ?? el.getAttribute("data-state") ?? "checked"))
  // Every key, not just the namespaced ones: a card reaching for localStorage directly picks its
  // own, and filtering to the dsh-genui prefix reported "persists nothing" for cards that persist.
  // (No backticks in this heredoc — it is unquoted so it can interpolate the port, and a backtick
  // inside runs as a command substitution.)
  const stored = Object.keys(localStorage).filter(k => !k.startsWith("__")).map(k => k + " = " + String(localStorage.getItem(k)).slice(0, 80))
  // A remount is what a canvas revision and a transcript re-render both do; anything held only
  // in useState is gone here, which is the whole reason \$dsh/state exists.
  const again = await mount()
  return { nodes: host.querySelectorAll("*").length, before, after, states, stored, afterRemount: again.innerText.replace(/\s+/g, " ").slice(0, 100), errors }
})()\`)
cliLog(JSON.stringify(out, null, 1))
await completeTaskSpace('mount one card', { keep: false })
EOF
