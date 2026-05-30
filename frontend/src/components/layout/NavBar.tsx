import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { fetchAppStatus, type AppStatus } from "../../api/status";

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/fileshare", label: "File Share" },
];

function useAppStatus(intervalMs = 5000) {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetchAppStatus()
        .then((s) => { if (!cancelled) setStatus(s); })
        .catch(() => { if (!cancelled) setStatus(null); });
    };
    poll();
    timerRef.current = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, [intervalMs]);

  return status;
}

function StatusDot({ status }: { status: AppStatus | null }) {
  const connected = status?.serial.connected ?? false;
  const color = status === null ? "#666" : connected ? "#4caf50" : "#888";
  const label = status === null
    ? "Backend unreachable"
    : connected
      ? `Connected — ${status.serial.mode === "replay" ? "replay" : status.serial.port ?? "serial"}`
      : "Serial disconnected";

  return (
    <span
      title={label}
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: color,
        marginRight: 12,
        boxShadow: connected ? "0 0 6px #4caf50" : "none",
        cursor: "default",
        flexShrink: 0,
      }}
    />
  );
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const appStatus = useAppStatus();

  const navStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 0,
    background: "#1a1a2e",
    padding: "0 20px",
    height: 48,
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
    fontFamily: "sans-serif",
    fontSize: 14,
  };

  const brandStyle: React.CSSProperties = {
    color: "#7ecfff",
    fontWeight: 700,
    fontSize: 16,
    textDecoration: "none",
    marginRight: 24,
    letterSpacing: 1,
  };

  const linkBase: React.CSSProperties = {
    color: "#ccc",
    textDecoration: "none",
    padding: "4px 10px",
    borderRadius: 4,
  };

  const linkActive: React.CSSProperties = {
    ...linkBase,
    color: "#fff",
    background: "rgba(255,255,255,0.1)",
  };

  const spacer: React.CSSProperties = { flex: 1 };

  const userInfo: React.CSSProperties = {
    color: "#aaa",
    marginRight: 12,
    fontSize: 13,
  };

  return (
    <nav style={navStyle}>
      <Link to="/dashboard" style={brandStyle}>DAVE</Link>
      <StatusDot status={appStatus} />
      {NAV_LINKS.map(({ to, label }) => (
        <Link key={to} to={to} style={pathname.startsWith(to) ? linkActive : linkBase}>
          {label}
        </Link>
      ))}
      <div style={spacer} />
      {user && <span style={userInfo}>{user.username}</span>}
      <button
        onClick={() => void logout()}
        style={{
          background: "transparent",
          border: "1px solid #555",
          color: "#ccc",
          borderRadius: 4,
          padding: "4px 10px",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Logout
      </button>
    </nav>
  );
}
