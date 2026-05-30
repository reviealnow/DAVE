import { useCallback, useEffect, useState } from "react";

import { getUpdateCheck, UpdateCheckResponse } from "../../api/rest";

type Tone = "neutral" | "success" | "warning" | "error";

const TONE_STYLES: Record<Tone, { border: string; bg: string; fg: string }> = {
  neutral: { border: "#d7d7d7", bg: "#f7f7f7", fg: "#333" },
  success: { border: "#b7dfb9", bg: "#eefbf0", fg: "#166534" },
  warning: { border: "#e0b84d", bg: "#fff7e6", fg: "#7c5200" },
  error: { border: "#f5c2c7", bg: "#fff1f1", fg: "#7f1d1d" },
};

function formatCheckedAt(iso: string): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function resolveTone(data: UpdateCheckResponse | null): Tone {
  if (!data) {
    return "neutral";
  }
  if (!data.ok) {
    return "error";
  }
  if (data.update_available) {
    return "warning";
  }
  return "success";
}

function resolveBadge(data: UpdateCheckResponse | null, checking: boolean): string {
  if (checking) {
    return "checking…";
  }
  if (!data) {
    return "—";
  }
  if (!data.ok) {
    return "⚠️ check failed";
  }
  if (data.update_available) {
    return "⬆️ update available";
  }
  return "✅ up to date";
}

export default function UpdateChecker({ currentVersion }: { currentVersion: string }) {
  const [data, setData] = useState<UpdateCheckResponse | null>(null);
  const [checking, setChecking] = useState(false);

  const runCheck = useCallback(async (force: boolean) => {
    setChecking(true);
    try {
      const result = await getUpdateCheck(force);
      setData(result);
    } catch (err) {
      setData({
        ok: false,
        current_version: "",
        latest_version: "",
        update_available: false,
        message: err instanceof Error ? err.message : "Update check failed.",
        source: "client",
        repository: "",
        checked_at: new Date().toISOString(),
        releases_page: "",
      });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void runCheck(false);
  }, [runCheck]);

  const tone = resolveTone(data);
  const style = TONE_STYLES[tone];
  const displayCurrent = data?.current_version || currentVersion || "unknown";
  const displayLatest = data?.latest_version || "—";
  const checkedAt = data ? formatCheckedAt(data.checked_at) : "";

  return (
    <div
      style={{
        border: `1px solid ${style.border}`,
        background: style.bg,
        color: style.fg,
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600 }}>{resolveBadge(data, checking)}</span>
          <span style={{ fontSize: 13 }}>
            current <strong>{displayCurrent}</strong>
            <span style={{ margin: "0 6px", opacity: 0.5 }}>→</span>
            latest <strong>{displayLatest}</strong>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {data?.update_available && data.releases_page ? (
            <a href={data.releases_page} target="_blank" rel="noreferrer" style={{ color: style.fg }}>
              Releases
            </a>
          ) : null}
          <button type="button" onClick={() => void runCheck(true)} disabled={checking}>
            {checking ? "Checking…" : "Re-check"}
          </button>
        </div>
      </div>
      {data?.message ? <div style={{ fontSize: 12, marginTop: 6 }}>{data.message}</div> : null}
      {checkedAt ? (
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>Last checked: {checkedAt} (Asia/Taipei)</div>
      ) : null}
    </div>
  );
}
