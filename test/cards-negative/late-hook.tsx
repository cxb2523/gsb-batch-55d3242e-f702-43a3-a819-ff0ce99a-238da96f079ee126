import { useState, useEffect } from "react"

export default function Late() {
  const [n, setN] = useState(0)
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <p>一段足够长的正文，让默认导出在这里就已经开始绘制了。</p>
      <p>再来一段，继续把这个卡片的可见部分撑开，撑到编译器确实认为它在画东西。</p>
      <p>还要更多的文字，因为 replay 是按 1/60 的步长切片的，太短就一帧跳过去了。</p>
      <p>继续填充内容，保证 paint 早于后面那个迟到的 hook 至少一整帧。</p>
      <button onClick={() => setN(n + 1)}>{n}</button>
      <Tail />
    </div>
  )
}

function Tail() {
  const [t, setT] = useState(0)
  useEffect(() => { const id = setInterval(() => setT(x => x + 1), 1000); return () => clearInterval(id) }, [])
  return <span>{t}</span>
}
