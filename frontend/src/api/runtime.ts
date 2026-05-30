declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI__);
}

export function getApiBaseUrl(): string {
  const override = import.meta.env.VITE_API_BASE_URL;
  if (override) return override as string;
  if (import.meta.env.DEV) return "";
  if (isTauriRuntime()) return "http://127.0.0.1:8765";
  return "";
}

export function apiUrl(path: string): string {
  return `${getApiBaseUrl()}${path}`;
}

export function websocketUrl(path: string): string {
  const base = getApiBaseUrl();
  if (!base) {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}${path}`;
  }
  return `${base.replace(/^http/i, "ws")}${path}`;
}
