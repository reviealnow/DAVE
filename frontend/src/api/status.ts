import { apiUrl } from "./runtime";

export type SerialStatus = {
  connected: boolean;
  mode: "serial" | "replay" | null;
  port: string | null;
  log_path: string | null;
};

export type DutSummary = {
  timestamp: string | null;
  cpu_avg_idle_pct: number | null;
  memory: { used_kb: number; free_kb: number } | null;
  wifi_client_count: number;
} | null;

export type AppStatus = {
  serial: SerialStatus;
  dut: DutSummary;
};

export async function fetchAppStatus(): Promise<AppStatus> {
  const res = await fetch(apiUrl("/api/app/status"), { credentials: "include" });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json() as Promise<AppStatus>;
}
