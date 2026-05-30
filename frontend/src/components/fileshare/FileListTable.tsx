import { useState } from "react";
import { deleteFile, FileInfo, FileVisibility, getDownloadUrl, setArtifactType, setVisibility } from "../../api/fileshare";
import { useAuth } from "../../auth/AuthProvider";

const ARTIFACT_TYPES = [
  "general", "raw_log", "analyzer_report", "pcap", "pcapng",
  "firmware", "test_plan", "screenshot", "customer_evidence",
  "regression_bundle", "config_backup", "other",
];

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type Props = {
  files: FileInfo[];
  onChanged: (updated: FileInfo) => void;
  onDeleted: (id: number) => void;
};

export default function FileListTable({ files, onChanged, onDeleted }: Props) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<number | null>(null);

  if (files.length === 0) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "#999", fontFamily: "sans-serif", fontSize: 14 }}>
        No files yet.
      </div>
    );
  }

  async function handleVisibility(f: FileInfo, v: FileVisibility) {
    setBusy(f.id);
    try {
      const updated = await setVisibility(f.id, v);
      onChanged(updated);
    } finally {
      setBusy(null);
    }
  }

  async function handleArtifactType(f: FileInfo, t: string) {
    setBusy(f.id);
    try {
      const updated = await setArtifactType(f.id, t);
      onChanged(updated);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(f: FileInfo) {
    if (!confirm(`Delete "${f.original_filename}"?`)) return;
    setBusy(f.id);
    try {
      await deleteFile(f.id);
      onDeleted(f.id);
    } finally {
      setBusy(null);
    }
  }

  const th: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    color: "#555",
    borderBottom: "2px solid #e0e0e0",
    background: "#fafafa",
  };

  const td: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: 13,
    borderBottom: "1px solid #f0f0f0",
    verticalAlign: "middle",
  };

  return (
    <div style={{ overflowX: "auto", background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "sans-serif" }}>
        <thead>
          <tr>
            <th style={th}>Filename</th>
            <th style={th}>Owner</th>
            <th style={th}>Size</th>
            <th style={th}>Artifact Type</th>
            <th style={th}>Visibility</th>
            <th style={th}>Downloads</th>
            <th style={th}>Uploaded</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => {
            const isOwner = user?.id === f.owner_user_id;
            const isBusy = busy === f.id;
            return (
              <tr key={f.id} style={{ opacity: isBusy ? 0.5 : 1 }}>
                <td style={td}>
                  <span title={f.description ?? undefined} style={{ fontWeight: 500 }}>{f.original_filename}</span>
                  {f.description && (
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{f.description}</div>
                  )}
                </td>
                <td style={td}>{f.owner_username}</td>
                <td style={td}>{fmt(f.size_bytes)}</td>
                <td style={td}>
                  {isOwner ? (
                    <select
                      value={f.artifact_type}
                      disabled={isBusy}
                      onChange={(e) => void handleArtifactType(f, e.target.value)}
                      style={{ fontSize: 12, padding: "3px 6px", borderRadius: 4, border: "1px solid #ccc" }}
                    >
                      {ARTIFACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontSize: 12, color: "#555" }}>{f.artifact_type}</span>
                  )}
                </td>
                <td style={td}>
                  {isOwner ? (
                    <select
                      value={f.visibility}
                      disabled={isBusy}
                      onChange={(e) => void handleVisibility(f, e.target.value as FileVisibility)}
                      style={{ fontSize: 12, padding: "3px 6px", borderRadius: 4, border: "1px solid #ccc" }}
                    >
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                    </select>
                  ) : (
                    <span style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 10,
                      background: f.visibility === "public" ? "#e8f5e9" : "#fce4ec",
                      color: f.visibility === "public" ? "#2e7d32" : "#880e4f",
                    }}>
                      {f.visibility}
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: "center" }}>{f.download_count}</td>
                <td style={{ ...td, fontSize: 11, color: "#666" }}>
                  {new Date(f.created_at).toLocaleString()}
                </td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <a
                      href={getDownloadUrl(f.id)}
                      download={f.original_filename}
                      style={{
                        padding: "4px 10px",
                        background: "#1565c0",
                        color: "#fff",
                        borderRadius: 4,
                        fontSize: 12,
                        textDecoration: "none",
                        fontWeight: 500,
                      }}
                    >
                      Download
                    </a>
                    {isOwner && (
                      <button
                        onClick={() => void handleDelete(f)}
                        disabled={isBusy}
                        style={{
                          padding: "4px 10px",
                          background: "#c62828",
                          color: "#fff",
                          border: "none",
                          borderRadius: 4,
                          fontSize: 12,
                          cursor: "pointer",
                          fontWeight: 500,
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
