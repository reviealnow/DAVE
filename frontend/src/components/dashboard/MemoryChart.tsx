import { useMemo } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type MemPoint = {
  ts: string;
  used_mb: number;
  free_mb: number;
  total_mb: number;
};

type Props = {
  data: MemPoint[];
};

export default function MemoryChart({ data }: Props) {
  const latest = data[data.length - 1];

  const domainMax = useMemo(() => {
    if (data.length === 0) return 512;
    const max = Math.max(...data.map((p) => p.total_mb));
    return Math.ceil(max / 64) * 64;
  }, [data]);

  if (data.length === 0) {
    return (
      <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 12, height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 13 }}>
        Memory chart — run <code style={{ margin: "0 4px", background: "#f0f0f0", padding: "1px 4px", borderRadius: 3 }}>top</code> on the DUT to populate
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 12, height: 280 }}>
      <h3 style={{ marginTop: 0 }}>Memory Usage Chart</h3>
      <ResponsiveContainer width="100%" height="80%">
        <LineChart data={data}>
          <XAxis dataKey="ts" minTickGap={24} />
          <YAxis domain={[0, domainMax]} unit=" MB" />
          <Tooltip formatter={(value: number | string) => `${Number(value).toFixed(1)} MB`} />
          <Legend />
          <Line type="monotone" dataKey="used_mb" name="Used" dot={false} stroke="#e53935" />
          <Line type="monotone" dataKey="free_mb" name="Free" dot={false} stroke="#43a047" />
        </LineChart>
      </ResponsiveContainer>
      {latest ? (
        <div style={{ display: "flex", gap: 16, fontFamily: "monospace", fontSize: 12, marginTop: 6 }}>
          <span style={{ color: "#e53935" }}>Used: {latest.used_mb.toFixed(1)} MB</span>
          <span style={{ color: "#43a047" }}>Free: {latest.free_mb.toFixed(1)} MB</span>
          <span style={{ color: "#555" }}>Total: {latest.total_mb.toFixed(1)} MB</span>
        </div>
      ) : null}
    </div>
  );
}
