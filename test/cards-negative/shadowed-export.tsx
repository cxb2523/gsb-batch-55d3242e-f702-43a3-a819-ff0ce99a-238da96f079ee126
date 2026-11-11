// `export default function Pie` shadows recharts' `Pie`, so the card renders itself recursively
// and dies with no useful error. Seen once in 362 real cards.
import { PieChart, Pie, ResponsiveContainer } from "recharts"

export default function Pie() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart><Pie data={[]} dataKey="v" /></PieChart>
    </ResponsiveContainer>
  )
}
