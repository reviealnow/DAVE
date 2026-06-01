import { useMemo, useState } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CpuRow, getLogAnalysis, LogAnalysisResponse, LogEvent, MemRow } from "../../api/rest";

type Props = {
  fileName: string;
  canAnalyze: boolean;
};

const CPU_COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f"];
const MEM_SERIES: { key: keyof MemRow; name: string; color: string }[] = [
  { key: "MemAvailable_kB", name: "MemAvailable", color: "#1565c0" },
  { key: "EffectiveAvailable_kB", name: "EffectiveAvailable", color: "#2e7d32" },
  { key: "Slab_kB", name: "Slab", color: "#ef6c00" },
  { key: "SUnreclaim_kB", name: "SUnreclaim", color: "#8e24aa" },
];

function severityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "#c62828";
    case "high":
    case "warning":
      return "#ef6c00";
    case "medium":
      return "#f9a825";
    default:
      return "#757575";
  }
}

function cpuCoreKeys(rows: CpuRow[]): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0])
    .filter((k) => /^CPU\d+_UsagePct$/.test(k))
    .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
}

export default function LogAnalysisPanel({ fileName, canAnalyze }: Props) {
  const [result, setResult] = useState<LogAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const coreKeys = useMemo(() => cpuCoreKeys(result?.cpu ?? []), [result]);

  async function handleAnalyze() {
    if (!fileName) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await getLogAnalysis(fileName);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Log Analysis</h3>
        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={!canAnalyze || loading}
          style={{
            background: "#1976d2",
            color: "#fff",
            border: "1px solid #1565c0",
            padding: "6px 12px",
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 6,
            cursor: !canAnalyze || loading ? "not-allowed" : "pointer",
            opacity: !canAnalyze || loading ? 0.6 : 1,
          }}
        >
          {loading ? "Analyzing…" : "Analyze log"}
        </button>
        {fileName ? <span style={{ fontSize: 12, color: "#777" }}>{fileName}</span> : null}
      </div>

      {error ? (
        <div style={{ color: "#c00", fontSize: 12, background: "#fff0f0", padding: "6px 10px", borderRadius: 4 }}>
          {error}
        </div>
      ) : null}

      {result && !result.analyzed ? (
        <div style={{ fontSize: 13, color: "#777" }}>
          Log not analyzed{result.reason ? ` — ${result.reason}` : ""}.
        </div>
      ) : null}

      {result && result.analyzed ? (
        <div>
          {result.cpu && result.cpu.length > 0 ? (
            <div style={{ height: 300, marginBottom: 12 }}>
              <h4 style={{ margin: "0 0 4px" }}>CPU Usage (%)</h4>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={result.cpu}>
                  <XAxis dataKey="Timestamp_MMDD_HHMMSS" minTickGap={24} />
                  <YAxis domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(value: number | string) => `${Number(value).toFixed(2)}%`} />
                  <Legend />
                  {coreKeys.map((coreKey, index) => (
                    <Line
                      key={coreKey}
                      type="monotone"
                      dataKey={coreKey}
                      name={coreKey.replace("_UsagePct", "")}
                      dot={false}
                      stroke={CPU_COLORS[index % CPU_COLORS.length]}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {result.memory && result.memory.length > 0 ? (
            <div style={{ height: 300, marginBottom: 12 }}>
              <h4 style={{ margin: "0 0 4px" }}>Memory (kB)</h4>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={result.memory}>
                  <XAxis dataKey="Timestamp_MMDD_HHMMSS" minTickGap={24} />
                  <YAxis unit=" kB" width={80} />
                  <Tooltip formatter={(value: number | string) => `${Number(value).toLocaleString()} kB`} />
                  <Legend />
                  {MEM_SERIES.map((s) => (
                    <Line
                      key={String(s.key)}
                      type="monotone"
                      dataKey={s.key as string}
                      name={s.name}
                      dot={false}
                      stroke={s.color}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {result.spike_report ? (
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ margin: "0 0 4px" }}>CPU Spike Report</h4>
              <pre
                style={{
                  background: "#f7f7f7",
                  border: "1px solid #e0e0e0",
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 12,
                  maxHeight: 220,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {result.spike_report}
              </pre>
            </div>
          ) : null}

          <div>
            <h4 style={{ margin: "0 0 4px" }}>
              Crash / Abnormal Events ({result.event_summary?.merged_event_count ?? result.events?.length ?? 0})
            </h4>
            {result.events && result.events.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                    <th style={{ padding: "4px 6px" }}>Time</th>
                    <th style={{ padding: "4px 6px" }}>Severity</th>
                    <th style={{ padding: "4px 6px" }}>Keywords</th>
                    <th style={{ padding: "4px 6px" }}>Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {result.events.map((ev: LogEvent) => (
                    <tr key={ev.event_id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "4px 6px", fontFamily: "monospace" }}>{ev.event_time || "—"}</td>
                      <td style={{ padding: "4px 6px" }}>
                        <span
                          style={{
                            background: severityColor(ev.severity),
                            color: "#fff",
                            borderRadius: 4,
                            padding: "1px 6px",
                            fontWeight: 600,
                          }}
                        >
                          {ev.severity}
                        </span>
                      </td>
                      <td style={{ padding: "4px 6px" }}>{(ev.matched_keywords || []).join(", ")}</td>
                      <td style={{ padding: "4px 6px", fontFamily: "monospace" }}>
                        {(ev.hit_line_numbers || []).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: 13, color: "#777" }}>No crash / abnormal events detected.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
