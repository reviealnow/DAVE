import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/fileshare", label: "File Share" },
];

export default function NavBar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

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
