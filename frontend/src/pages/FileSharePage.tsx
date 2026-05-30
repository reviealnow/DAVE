import { useCallback, useEffect, useState } from "react";
import { FileInfo, FileFilters, listFiles } from "../api/fileshare";
import FileListTable from "../components/fileshare/FileListTable";
import FileUploadPanel from "../components/fileshare/FileUploadPanel";
import { useAuth } from "../auth/AuthProvider";

const ARTIFACT_TYPES = [
  "", "general", "raw_log", "analyzer_report", "pcap", "pcapng",
  "firmware", "test_plan", "screenshot", "customer_evidence",
  "regression_bundle", "config_backup", "other",
];

export default function FileSharePage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<FileFilters>({});
  const [myFilesOnly, setMyFilesOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const eff: FileFilters = {
        ...filters,
        owner_id: myFilesOnly ? user?.id : undefined,
      };
      const result = await listFiles(eff);
      setFiles(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [filters, myFilesOnly, user?.id]);

  useEffect(() => { void load(); }, [load]);

  function handleUploaded(f: FileInfo) {
    setFiles((prev) => [f, ...prev]);
  }

  function handleChanged(updated: FileInfo) {
    setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }

  function handleDeleted(id: number) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  const filterRow: React.CSSProperties = {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 16,
    fontFamily: "sans-serif",
    fontSize: 13,
  };

  const sel: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 5,
    border: "1px solid #ccc",
    fontSize: 13,
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontFamily: "sans-serif", margin: 0 }}>File Share</h2>
        <span style={{ fontSize: 12, color: "#888" }}>Artifact repository for lab files</span>
      </div>

      <FileUploadPanel onUploaded={handleUploaded} />

      <div style={filterRow}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={myFilesOnly}
            onChange={(e) => setMyFilesOnly(e.target.checked)}
          />
          My files only
        </label>

        <select
          value={filters.visibility ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, visibility: (e.target.value as "public" | "private") || undefined }))}
          style={sel}
        >
          <option value="">All visibility</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>

        <select
          value={filters.artifact_type ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, artifact_type: e.target.value || undefined }))}
          style={sel}
        >
          <option value="">All types</option>
          {ARTIFACT_TYPES.filter(Boolean).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <input
          value={filters.keyword ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value || undefined }))}
          placeholder="Search filename…"
          style={{ ...sel, minWidth: 180 }}
        />

        <button
          onClick={() => void load()}
          style={{ padding: "6px 14px", borderRadius: 5, border: "1px solid #ccc", cursor: "pointer", fontSize: 13 }}
        >
          Refresh
        </button>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading…</div>}
      {error && (
        <div style={{ color: "#c00", background: "#fff0f0", padding: "10px 14px", borderRadius: 5, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {!loading && !error && (
        <FileListTable files={files} onChanged={handleChanged} onDeleted={handleDeleted} />
      )}
    </div>
  );
}
