// Inside JSX those braces are an expression, so this card throws `ts is not defined` at render
// and shows nothing. A card explaining glob syntax breaks by quoting a glob.
export default function Globs() {
  return (
    <div>
      <p>试试 <code>src/*.{ts,tsx}</code> 看深层文件怎么消失。</p>
    </div>
  )
}
