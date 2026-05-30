import { apiUrl } from "./runtime";

export type OpenSerialParams = {
  port: string;
  baudrate: number;
  mode?: "serial" | "replay";
  replay_path?: string;
  replay_interval_ms?: number;
};

export type OpenSerialResponse = {
  ok: boolean;
  mode: "serial" | "replay";
  log_path?: string | null;
};

export type SerialPortInfo = {
  device: string;
  description: string;
  hwid: string;
};

export type SerialPortsResponse = {
  ports: SerialPortInfo[];
  glob_devices: string[];
};

export type HealthResponse = {
  ok: boolean;
  phase: string;
  version: string;
};

export type AppMeta = {
  product_name: string;
  current_version: string;
  repository: string;
  releases_page: string;
};

export type UpdateCheckResponse = {
  ok: boolean;
  current_version: string;
  latest_version: string;
  update_available: boolean;
  message: string;
  source: string;
  repository: string;
  checked_at: string;
  releases_page: string;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

async function get<T>(url: string): Promise<T> {
  const response = await fetch(apiUrl(url));
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

export async function openSerial(params: OpenSerialParams): Promise<OpenSerialResponse> {
  return post<OpenSerialResponse>("/api/serial/open", params);
}

export async function closeSerial(): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>("/api/serial/close", {});
}

export async function sendSerial(text: string): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>("/api/serial/send", { text });
}

export async function listSerialPorts(): Promise<SerialPortsResponse> {
  return get<SerialPortsResponse>("/api/serial/ports");
}

export async function getHealth(): Promise<HealthResponse> {
  return get<HealthResponse>("/health");
}

export async function getAppMeta(): Promise<AppMeta> {
  return get<AppMeta>("/api/app/meta");
}

export async function getUpdateCheck(force = false): Promise<UpdateCheckResponse> {
  const suffix = force ? "?force=true" : "";
  return get<UpdateCheckResponse>(`/api/app/update-check${suffix}`);
}

export function getSerialLogDownloadUrl(fileName: string): string {
  return apiUrl(`/api/serial/logs/${encodeURIComponent(fileName)}`);
}

export type SnapshotFileInfo = {
  name: string;
  size_bytes: number;
  frames: number;
  mtime: number;
};

export async function listSnapshots(): Promise<SnapshotFileInfo[]> {
  const result = await get<{ files: SnapshotFileInfo[] }>("/api/snapshots/list");
  return result.files;
}

export async function startSnapshotReplay(file: string, speedMs: number): Promise<{ ok: boolean; total: number; file: string }> {
  return post<{ ok: boolean; total: number; file: string }>("/api/snapshots/replay/start", { file, speed_ms: speedMs });
}

export async function stopSnapshotReplay(): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>("/api/snapshots/replay/stop", {});
}

export function getSnapshotDownloadUrl(fileName: string): string {
  return apiUrl(`/api/snapshots/${encodeURIComponent(fileName)}/download`);
}
