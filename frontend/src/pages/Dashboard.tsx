import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  closeSerial,
  getAppMeta,
  getHealth,
  getSerialLogDownloadUrl,
  listSerialPorts,
  openSerial,
  sendSerial,
  SerialPortInfo,
} from "../api/rest";
import { saveBlob } from "../api/download";
import { cardStyle, SP } from "../theme/dashboard";
import { connectDashboardWebSocket, SnapshotPayload, WifiClient } from "../api/websocket";
import ClientsPanel from "../components/dashboard/ClientsPanel";
import ConsolePanel from "../components/dashboard/ConsolePanel";
import CpuChart, { CpuPoint } from "../components/dashboard/CpuChart";
import LogAnalysisPanel from "../components/dashboard/LogAnalysisPanel";
import MemoryChart, { MemPoint } from "../components/dashboard/MemoryChart";
import SnapshotReplayPanel from "../components/dashboard/SnapshotReplayPanel";
import UpdateChecker from "../components/dashboard/UpdateChecker";
const DEFAULT_SERIAL_PORT = "/dev/ttyUSB0";
const CRITICAL_CRASH_PATTERN = /\b(kernel panic|q6 crash|watchdog(?:\s+reset|\s+bite|\s+timeout)?)\b/i;

function choosePreferredPort(ports: SerialPortInfo[]): string {
  if (ports.length === 0) {
    return "";
  }
  const macosCuPort = ports.find((portInfo) => portInfo.device.startsWith("/dev/cu."));
  return macosCuPort ? macosCuPort.device : ports[0].device;
}

export default function Dashboard() {
  const [lines, setLines] = useState<string[]>([]);
  const [appName, setAppName] = useState("DUT Browser");
  const [appVersion, setAppVersion] = useState("unknown");
  const [backendReady, setBackendReady] = useState(false);
  const [startupMessage, setStartupMessage] = useState("Starting local engine...");
  const [startupTone, setStartupTone] = useState<"neutral" | "success" | "error">("neutral");
  const [mode, setMode] = useState<"serial" | "replay">("serial");
  const [selectedPort, setSelectedPort] = useState(DEFAULT_SERIAL_PORT);
  const [manualPort, setManualPort] = useState("");
  const [baudrate, setBaudrate] = useState(115200);
  const [replayPath, setReplayPath] = useState("logs/sample.log");
  const [replayIntervalMs, setReplayIntervalMs] = useState(100);
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [globDevices, setGlobDevices] = useState<string[]>([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [portsError, setPortsError] = useState("");
  const [currentLogFileName, setCurrentLogFileName] = useState("");
  const [lastSeenCriticalCrashCount, setLastSeenCriticalCrashCount] = useState(0);
  const [criticalCrashKeywordInput, setCriticalCrashKeywordInput] = useState("");
  const [lockedCriticalCrashKeywords, setLockedCriticalCrashKeywords] = useState<string[]>([]);
  const [crashExpanded, setCrashExpanded] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<{ message: string; tone: "blue" | "green" } | null>(null);
  const [cpuHistory, setCpuHistory] = useState<CpuPoint[]>([]);
  const [cpuCoreKeys, setCpuCoreKeys] = useState<string[]>([]);
  const [memHistory, setMemHistory] = useState<MemPoint[]>([]);
  const [clientsByRadio, setClientsByRadio] = useState<Record<"2G" | "5G" | "6G", WifiClient[]>>({
    "2G": [],
    "5G": [],
    "6G": [],
  });
  const [isSerialOpen, setIsSerialOpen] = useState(false);
  const [reconnectStatus, setReconnectStatus] = useState<string | null>(null);
  const [replayProgress, setReplayProgress] = useState<{ frame: number; total: number } | null>(null);
  const [replayStatus, setReplayStatus] = useState<"idle" | "playing" | "done" | "stopped">("idle");

  type OpenParams = { mode: "serial" | "replay"; port: string; baudrate: number; replay_path?: string; replay_interval_ms: number };
  const lastOpenParamsRef = useRef<OpenParams | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const MAX_RECONNECT = 5;
  const scheduleReconnectRef = useRef<() => void>(() => {});
  const doReconnectRef = useRef<() => Promise<void>>(async () => {});
  const rescanInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const meta = await getAppMeta();
        if (cancelled) {
          return;
        }
        setAppName(meta.product_name);
        setAppVersion(meta.current_version);
      } catch {
        // Falls back to defaults; version widget reports details separately.
      }

      for (let attempt = 1; attempt <= 30; attempt += 1) {
        try {
          const health = await getHealth();
          if (cancelled) {
            return;
          }

          setBackendReady(true);
          setAppVersion(health.version);
          setStartupTone("success");
          setStartupMessage(`Local engine ready on version ${health.version}.`);
          return;
        } catch {
          if (cancelled) {
            return;
          }
          setStartupTone("neutral");
          setStartupMessage(`Starting local engine... attempt ${attempt}/30`);
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      }

      if (!cancelled) {
        setStartupTone("error");
        setStartupMessage("Local engine failed to start. Restart the app and inspect backend logs.");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!backendReady) {
      return;
    }
    const ws = connectDashboardWebSocket((event) => {
      if (event.type === "console_line") {
        const { text } = event as { type: string; text: string };
        setLines((prev) => [...prev, text].slice(-1000));
        return;
      }
      if (event.type === "console_line_batch") {
        const { lines: batchLines } = event as { type: string; lines: string[] };
        setLines((prev) => [...prev, ...batchLines].slice(-1000));
        return;
      }
      if (event.type === "snapshot_update") {
        const { snapshot } = event as { type: string; snapshot: SnapshotPayload };
        const coreIds = Object.keys(snapshot.cpu).sort((a, b) => Number(a) - Number(b));
        const point: CpuPoint = { device_ts: snapshot.device_ts };
        for (const id of coreIds) {
          const core = snapshot.cpu[id];
          point[`CPU${id}`] = parseFloat((100 - core.idle).toFixed(2));
        }
        setCpuHistory((prev) => [...prev, point].slice(-60));
        const newKeys = coreIds.map((id) => `CPU${id}`);
        setCpuCoreKeys((prev) =>
          prev.length === newKeys.length && prev.every((k, i) => k === newKeys[i]) ? prev : newKeys,
        );
        return;
      }
      if (event.type === "wifi_clients_update") {
        const { radio, clients } = event as { type: string; radio: "2G" | "5G" | "6G"; clients: WifiClient[] };
        setClientsByRadio((prev) => ({ ...prev, [radio]: clients }));
        return;
      }
      if (event.type === "memory_update") {
        const { used_kb, free_kb, total_kb } = event as { type: string; used_kb: number; free_kb: number; total_kb: number };
        const point: MemPoint = {
          ts: new Date().toLocaleTimeString(),
          used_mb: parseFloat((used_kb / 1024).toFixed(1)),
          free_mb: parseFloat((free_kb / 1024).toFixed(1)),
          total_mb: parseFloat((total_kb / 1024).toFixed(1)),
        };
        setMemHistory((prev) => [...prev, point].slice(-60));
        return;
      }
      if (event.type === "serial_disconnected") {
        setIsSerialOpen(false);
        scheduleReconnectRef.current();
        return;
      }
      if (event.type === "replay_progress") {
        const { frame, total } = event as { type: string; frame: number; total: number };
        setReplayProgress({ frame, total });
        setReplayStatus("playing");
        return;
      }
      if (event.type === "replay_done") {
        const { total } = event as { type: string; total: number };
        setReplayProgress((prev) => (prev ? { ...prev, frame: total } : { frame: total, total }));
        setReplayStatus("done");
        return;
      }
      if (event.type === "replay_stopped") {
        setReplayStatus("stopped");
        return;
      }
    });
    return () => ws.close();
  }, [backendReady]);

  const effectivePort = manualPort.trim() || selectedPort;

  scheduleReconnectRef.current = () => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT || !lastOpenParamsRef.current) {
      setReconnectStatus("Serial disconnected. Auto-reconnect gave up.");
      return;
    }
    reconnectAttemptsRef.current += 1;
    const attempt = reconnectAttemptsRef.current;
    setReconnectStatus(`Serial disconnected. Reconnecting... (${attempt}/${MAX_RECONNECT})`);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void doReconnectRef.current();
    }, 2000);
  };

  doReconnectRef.current = async () => {
    const params = lastOpenParamsRef.current;
    if (!params) return;
    try {
      const response = await openSerial(params);
      const logPath = response.log_path || "";
      const fileName = logPath.split(/[\\/]/).pop() || "";
      setCurrentLogFileName(fileName);
      setIsSerialOpen(true);
      setReconnectStatus(null);
      reconnectAttemptsRef.current = 0;
    } catch {
      scheduleReconnectRef.current();
    }
  };

  async function handleOpen() {
    const params: OpenParams = {
      mode,
      port: effectivePort,
      baudrate,
      replay_path: mode === "replay" ? replayPath : undefined,
      replay_interval_ms: replayIntervalMs,
    };
    const response = await openSerial(params);
    lastOpenParamsRef.current = params;
    reconnectAttemptsRef.current = 0;
    setReconnectStatus(null);
    const logPath = response.log_path || "";
    const fileName = logPath.split(/[\\/]/).pop() || "";
    setCurrentLogFileName(fileName);
    setIsSerialOpen(true);
  }

  async function handleClose() {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    setReconnectStatus(null);
    await closeSerial();
    setIsSerialOpen(false);
  }

  async function handleSend(text: string) {
    await sendSerial(text);
  }

  async function handleRunTop() {
    await sendSerial("top\n");
  }

  async function handleStopCommand() {
    await sendSerial("\u0003");
  }

  function parseDownloadFileName(contentDisposition: string | null, fallbackName: string): string {
    if (!contentDisposition) {
      return fallbackName;
    }
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch {
        return utf8Match[1];
      }
    }
    const asciiMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
    return asciiMatch?.[1] || fallbackName;
  }

  async function handleDownloadLog() {
    if (!currentLogFileName) {
      return;
    }
    const fallbackName = currentLogFileName;
    const response = await fetch(getSerialLogDownloadUrl(currentLogFileName), { credentials: "include" });
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const fileName = parseDownloadFileName(response.headers.get("content-disposition"), fallbackName);
    const blob = await response.blob();

    // Browser <a download> is ignored inside the Tauri webview, so route through
    // the shared helper (native Save-As dialog in desktop, blob+anchor in browser).
    const result = await saveBlob(blob, fileName);
    if (!result.saved) {
      return; // user cancelled the native save dialog
    }

    if (contentType.includes("text/plain")) {
      setDownloadNotice({ message: "The log file is ready.", tone: "blue" });
      return;
    }
    setDownloadNotice({ message: "DUT CPU and Memory usage plots are created.", tone: "green" });
  }

  useEffect(() => {
    if (!downloadNotice) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDownloadNotice(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [downloadNotice]);

  function handleLockCriticalCrashKeyword() {
    const keyword = criticalCrashKeywordInput.trim();
    if (!keyword) {
      return;
    }
    setLockedCriticalCrashKeywords((prev) => {
      if (prev.some((item) => item.toLowerCase() === keyword.toLowerCase())) {
        return prev;
      }
      return [...prev, keyword];
    });
    setCriticalCrashKeywordInput("");
  }

  function handleRemoveCriticalCrashKeyword(keywordToRemove: string) {
    setLockedCriticalCrashKeywords((prev) =>
      prev.filter((item) => item.toLowerCase() !== keywordToRemove.toLowerCase()),
    );
  }

  const refreshSerialPorts = useCallback(async () => {
    setPortsLoading(true);
    setPortsError("");
    try {
      const { ports, glob_devices } = await listSerialPorts();
      setSerialPorts(ports);
      setGlobDevices(glob_devices);
      if (ports.length > 0) {
        const preferredPort = choosePreferredPort(ports);
        setSelectedPort((prev) => {
          if (ports.some((portInfo) => portInfo.device === prev)) {
            return prev;
          }
          if (prev && prev !== DEFAULT_SERIAL_PORT) {
            return prev;
          }
          return preferredPort;
        });
      }
    } catch (error) {
      setPortsError(error instanceof Error ? error.message : "Failed to list serial ports");
    } finally {
      setPortsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (backendReady && mode === "serial") {
      void refreshSerialPorts();
    }
  }, [backendReady, mode, refreshSerialPorts]);

  useEffect(() => {
    if (!backendReady || mode !== "serial") return;
    const id = setInterval(async () => {
      if (rescanInFlightRef.current) return;
      rescanInFlightRef.current = true;
      try {
        const { ports, glob_devices } = await listSerialPorts();
        setSerialPorts(ports);
        setGlobDevices(glob_devices);
        setSelectedPort((prev) => {
          if (ports.some((p) => p.device === prev)) return prev;
          if (prev && prev !== DEFAULT_SERIAL_PORT) return prev;
          return ports.length > 0 ? choosePreferredPort(ports) : prev;
        });
      } catch {
        // silent — don't surface background poll errors
      } finally {
        rescanInFlightRef.current = false;
      }
    }, 3000);
    return () => clearInterval(id);
  }, [backendReady, mode]);

  const controls = useMemo(
    () => (
      <div style={{ ...cardStyle, position: "relative" }}>
        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={handleClose}
            disabled={!backendReady || !isSerialOpen}
            style={{
              width: 28,
              height: 28,
              background: "#d32f2f",
              color: "#fff",
              border: "1px solid #b71c1c",
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1,
              cursor: "pointer",
            }}
            aria-label="Close serial connection"
            title="Close"
          >
            X
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button onClick={() => setMode("serial")} disabled={mode === "serial"}>
            Serial Mode
          </button>
          <button onClick={() => setMode("replay")} disabled={mode === "replay"}>
            Replay Mode
          </button>
        </div>

        {mode === "serial" ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                style={{
                  width: 240,
                  opacity: manualPort.trim() ? 0.45 : 1,
                  pointerEvents: manualPort.trim() ? "none" : "auto",
                }}
              >
                <option value="">Select detected serial port</option>
                {serialPorts.map((serialPort) => (
                  <option key={serialPort.device} value={serialPort.device}>
                    {serialPort.description ? `${serialPort.device} (${serialPort.description})` : serialPort.device}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void refreshSerialPorts()} disabled={!backendReady || portsLoading}>
                {portsLoading ? "Refreshing..." : "Refresh Ports"}
              </button>
              <button
                type="button"
                onClick={() => void handleOpen()}
                disabled={!backendReady}
                style={{
                  background: "#1976d2",
                  color: "#fff",
                  border: "1px solid #1565c0",
                  padding: "6px 12px",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 6,
                }}
              >
                Open
              </button>
              <span style={{ width: 1, alignSelf: "stretch", background: "#e0e0e0", margin: "0 2px" }} />
              <button
                type="button"
                onClick={() => void handleRunTop()}
                disabled={!backendReady || !isSerialOpen}
                style={{
                  background: "#fff",
                  color: "#374151",
                  border: "1px solid #cfd4dc",
                  padding: "6px 12px",
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 6,
                  cursor: !backendReady || !isSerialOpen ? "default" : "pointer",
                }}
              >
                Run top
              </button>
              <button
                type="button"
                onClick={() => void handleStopCommand()}
                disabled={!backendReady || !isSerialOpen}
                style={{
                  background: "#fff",
                  color: "#b42318",
                  border: "1px solid #f1c0bb",
                  padding: "6px 12px",
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 6,
                  cursor: !backendReady || !isSerialOpen ? "default" : "pointer",
                }}
              >
                Stop
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                <datalist id="port-datalist">
                  {[...new Set([...globDevices, ...serialPorts.map((p) => p.device)])].map((dev) => (
                    <option key={dev} value={dev} />
                  ))}
                </datalist>
                <input
                  value={manualPort}
                  onChange={(e) => setManualPort(e.target.value)}
                  placeholder="Manual override (e.g. /dev/cu.usbserial-0001)"
                  list="port-datalist"
                  style={{ width: 240, paddingRight: manualPort ? 24 : undefined }}
                />
                {manualPort ? (
                  <button
                    type="button"
                    onClick={() => setManualPort("")}
                    title="Clear manual override"
                    style={{
                      position: "absolute",
                      right: 4,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      color: "#666",
                      padding: "0 2px",
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
            {manualPort.trim() ? (
              <div style={{ fontSize: 11, color: "#1565c0" }}>Using manual port: {manualPort.trim()}</div>
            ) : null}
            <input
              type="number"
              value={baudrate}
              onChange={(e) => setBaudrate(Number(e.target.value || 0))}
              placeholder="Baudrate"
              style={{ width: 88 }}
            />
            {portsError ? <div style={{ color: "#b00020", fontSize: 12 }}>{portsError}</div> : null}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <input value={replayPath} onChange={(e) => setReplayPath(e.target.value)} placeholder="Replay file" />
            <input
              type="number"
              value={replayIntervalMs}
              onChange={(e) => setReplayIntervalMs(Number(e.target.value || 0))}
              placeholder="Replay interval ms"
            />
            <button
              type="button"
              onClick={() => void handleOpen()}
              disabled={!backendReady}
              style={{
                background: "#1976d2",
                color: "#fff",
                border: "1px solid #1565c0",
                padding: "6px 12px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 6,
              }}
            >
              Open
            </button>
          </div>
        )}
      </div>
    ),
    [
      mode,
      selectedPort,
      manualPort,
      baudrate,
      replayPath,
      replayIntervalMs,
      serialPorts,
      portsLoading,
      portsError,
      backendReady,
      isSerialOpen,
      refreshSerialPorts,
      globDevices,
    ],
  );

  const allCriticalCrashLines = useMemo(() => {
    return lines.filter((line) => {
      if (CRITICAL_CRASH_PATTERN.test(line)) {
        return true;
      }
      const lowerCasedLine = line.toLowerCase();
      return lockedCriticalCrashKeywords.some((keyword) => lowerCasedLine.includes(keyword.toLowerCase()));
    });
  }, [lines, lockedCriticalCrashKeywords]);

  const newCriticalCrashCount = Math.max(0, allCriticalCrashLines.length - lastSeenCriticalCrashCount);
  const criticalCrashRows = useMemo(() => {
    const rows = allCriticalCrashLines.map((text, index) => ({
      text,
      isNew: index >= lastSeenCriticalCrashCount,
    }));
    return rows.slice(-20);
  }, [allCriticalCrashLines, lastSeenCriticalCrashCount]);

  // Auto-expand the Critical Crash card the instant new matching lines arrive,
  // so a crash surfaces immediately instead of hiding behind the collapsed
  // header. We force it open only on the *rising edge* (unseen count goes up),
  // not on every render — so the user can still manually collapse it while a
  // crash sits unseen.
  const prevCriticalCrashCount = useRef(newCriticalCrashCount);
  useEffect(() => {
    if (newCriticalCrashCount > prevCriticalCrashCount.current) {
      setCrashExpanded(true);
    }
    prevCriticalCrashCount.current = newCriticalCrashCount;
  }, [newCriticalCrashCount]);

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        maxWidth: 1100,
        margin: "0 auto",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: SP.md,
      }}
    >
      <h1 style={{ textAlign: "center", margin: 0 }}>{appName}</h1>
      <UpdateChecker currentVersion={appVersion} />
      <div
        style={{
          border: "1px solid",
          borderColor: startupTone === "error" ? "#f5c2c7" : startupTone === "success" ? "#b7dfb9" : "#d7d7d7",
          background: startupTone === "error" ? "#fff1f1" : startupTone === "success" ? "#eefbf0" : "#f7f7f7",
          color: startupTone === "error" ? "#7f1d1d" : startupTone === "success" ? "#166534" : "#333",
          borderRadius: 8,
          padding: "10px 12px",
        }}
      >
        {startupMessage}
      </div>
      {controls}
      {reconnectStatus ? (
        <div
          style={{
            border: "1px solid #e0a030",
            background: "#fff8e1",
            color: "#7c5200",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
          }}
        >
          {reconnectStatus}
        </div>
      ) : null}
      {/* Compact, collapsible Critical Crash row. Run top / Stop now live on the
          port card's Open row; this section stays collapsed by default so the
          console + log analyzer below get the vertical space. The New badge
          still alerts when crashes arrive while collapsed. */}
      <div style={{ ...cardStyle, padding: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setCrashExpanded((v) => !v)}
            aria-expanded={crashExpanded}
            title={crashExpanded ? "Collapse" : "Expand"}
            style={{
              border: "none", background: "none", cursor: "pointer",
              fontSize: 12, color: "#b71c1c", padding: "2px 4px", lineHeight: 1,
            }}
          >
            {crashExpanded ? "▾" : "▸"}
          </button>
          <h3
            onClick={() => setCrashExpanded((v) => !v)}
            style={{ margin: 0, color: "#b71c1c", fontSize: 15, cursor: "pointer", flex: 1 }}
          >
            Critical Crash ({allCriticalCrashLines.length})
          </h3>
          <span
            style={{
              background: newCriticalCrashCount > 0 ? "#b71c1c" : "#9e9e9e",
              color: "#fff",
              borderRadius: 999,
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            New {newCriticalCrashCount}
          </span>
          <button
            type="button"
            onClick={() => setLastSeenCriticalCrashCount(allCriticalCrashLines.length)}
            disabled={newCriticalCrashCount === 0}
          >
            Mark as seen
          </button>
        </div>
        {crashExpanded ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={criticalCrashKeywordInput}
                onChange={(e) => setCriticalCrashKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleLockCriticalCrashKeyword();
                  }
                }}
                placeholder="Lock in critical crash keyword"
                style={{ minWidth: 220, flex: "1 1 220px" }}
              />
              <button type="button" onClick={handleLockCriticalCrashKeyword}>
                Lock in
              </button>
            </div>
            {lockedCriticalCrashKeywords.length > 0 ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {lockedCriticalCrashKeywords.map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    onClick={() => handleRemoveCriticalCrashKeyword(keyword)}
                    title="Remove keyword"
                    style={{
                      border: "1px solid #f3b7b7",
                      background: "#fff",
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontSize: 12,
                      color: "#4a1515",
                      cursor: "pointer",
                    }}
                  >
                    {keyword} x
                  </button>
                ))}
              </div>
            ) : null}
            <div
              style={{
                border: "1px solid #f3b7b7",
                background: "#fff6f6",
                color: "#4a1515",
                borderRadius: 6,
                minHeight: 56,
                maxHeight: 96,
                overflowY: "auto",
                padding: 8,
                fontFamily: "monospace",
                fontSize: 12,
                whiteSpace: "pre-wrap",
              }}
            >
              {criticalCrashRows.length > 0 ? (
                criticalCrashRows.map((row, index) => (
                  <div
                    key={`${index}-${row.text}`}
                    style={{
                      background: row.isNew ? "#ffe0e0" : "transparent",
                      padding: row.isNew ? "1px 2px" : 0,
                      borderRadius: 2,
                    }}
                  >
                    {row.text}
                  </div>
                ))
              ) : (
                <div>No critical crash detected yet (kernel panic / Q6 crash / watchdog).</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
      {/* CPU + Memory sit side by side on wide screens (Luna 2-up grid),
          stacking below ~420px. The grid's own 16px gap owns the gutter. */}
      <div style={{ display: "grid", gap: SP.md, gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))" }}>
        {cpuHistory.length > 0 ? <CpuChart data={cpuHistory} coreKeys={cpuCoreKeys} /> : null}
        <MemoryChart data={memHistory} />
      </div>
      {backendReady ? <ClientsPanel clientsByRadio={clientsByRadio} /> : null}
      {backendReady ? (
        <SnapshotReplayPanel
          replayStatus={replayStatus}
          replayProgress={replayProgress}
          onReplayStatusChange={setReplayStatus}
        />
      ) : null}
      <ConsolePanel
        lines={lines}
        onSend={handleSend}
        onDownloadLog={handleDownloadLog}
        canDownloadLog={backendReady && Boolean(currentLogFileName)}
        canSend={isSerialOpen}
      />
      <LogAnalysisPanel
        fileName={currentLogFileName}
        canAnalyze={backendReady && Boolean(currentLogFileName)}
      />
      {downloadNotice ? (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            background: downloadNotice.tone === "blue" ? "#1565c0" : "#1b5e20",
            color: "#fff",
            padding: "10px 12px",
            borderRadius: 8,
            boxShadow: "0 4px 10px rgba(0, 0, 0, 0.2)",
            fontSize: 13,
            zIndex: 9999,
          }}
        >
          {downloadNotice.message}
        </div>
      ) : null}
    </div>
  );
}
