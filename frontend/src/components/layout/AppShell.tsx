import { Outlet } from "react-router-dom";
import NavBar from "./NavBar";

export default function AppShell() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f5f5f5" }}>
      <NavBar />
      <main style={{ flex: 1, padding: "16px" }}>
        <Outlet />
      </main>
    </div>
  );
}
