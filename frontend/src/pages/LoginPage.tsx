import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/dashboard";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(username, password);
      } else {
        await register(username, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setBusy(false);
    }
  }

  const card: React.CSSProperties = {
    maxWidth: 360,
    margin: "80px auto",
    background: "#fff",
    borderRadius: 10,
    boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
    padding: "32px 28px",
    fontFamily: "sans-serif",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid #ccc",
    fontSize: 14,
    marginBottom: 12,
    boxSizing: "border-box",
  };

  const btn: React.CSSProperties = {
    width: "100%",
    padding: "10px",
    background: "#1a1a2e",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.7 : 1,
  };

  return (
    <div style={{ background: "#f0f2f5", minHeight: "100vh" }}>
      <div style={card}>
        <h2 style={{ textAlign: "center", marginBottom: 4, color: "#1a1a2e" }}>DAVE</h2>
        <p style={{ textAlign: "center", color: "#777", marginBottom: 24, fontSize: 13 }}>
          DUT Lab Portal
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: 6,
                border: mode === m ? "none" : "1px solid #ccc",
                background: mode === m ? "#1a1a2e" : "#fff",
                color: mode === m ? "#fff" : "#555",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: mode === m ? 600 : 400,
              }}
            >
              {m === "login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          {mode === "register" && (
            <ul style={{ fontSize: 12, color: "#555", background: "#f8f8f8", border: "1px solid #e0e0e0", borderRadius: 6, padding: "8px 12px 8px 24px", marginBottom: 14, lineHeight: 1.8 }}>
              <li>Username: 3–32 characters, letters / numbers / underscore only</li>
              <li>Password: at least 6 characters</li>
            </ul>
          )}
          <input
            style={input}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
          <input
            style={input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <div style={{ color: "#c00", fontSize: 13, marginBottom: 10, background: "#fff0f0", padding: "8px 10px", borderRadius: 5 }}>
              {error}
            </div>
          )}
          <button type="submit" style={btn} disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
