import { useMemo } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type CpuPoint = {
  device_ts: string;
  [key: string]: number | string;
};

type Props = {
  data: CpuPoint[];
  coreKeys: string[];
};

const COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f"];

export default function CpuChart({ data, coreKeys }: Props) {
  const latestValues = useMemo(() => {
    const latestPoint = data[data.length - 1];
    if (!latestPoint) {
      return [];
    }
    return coreKeys
      .map((coreKey) => {
        const value = latestPoint[coreKey];
        return typeof value === "number" ? { coreKey, value } : null;
      })
      .filter((item): item is { coreKey: string; value: number } => item !== null);
  }, [data, coreKeys]);

  return (
    <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 12, height: 320 }}>
      <h3 style={{ marginTop: 0 }}>CPU Usage Chart</h3>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={data}>
          <XAxis dataKey="device_ts" minTickGap={24} />
          <YAxis domain={[0, 100]} unit="%" />
          <Tooltip formatter={(value: number | string) => `${Number(value).toFixed(2)}%`} />
          <Legend />
          {coreKeys.map((coreKey, index) => (
            <Line key={coreKey} type="monotone" dataKey={coreKey} dot={false} stroke={COLORS[index % COLORS.length]} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, fontFamily: "monospace", fontSize: 12 }}>
        {latestValues.map((item) => (
          <span key={item.coreKey}>{`${item.coreKey}: ${item.value.toFixed(2)}%`}</span>
        ))}
      </div>
    </div>
  );
}
