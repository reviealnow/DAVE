import { DragEvent, FormEvent, useRef, useState } from "react";
import { FileInfo, FileVisibility, uploadFile } from "../../api/fileshare";

const ARTIFACT_TYPES = [
  "general", "raw_log", "analyzer_report", "pcap", "pcapng",
  "firmware", "test_plan", "screenshot", "customer_evidence",
  "regression_bundle", "config_backup", "other",
];

type UploadStatus = "queued" | "uploading" | "done" | "error";

type UploadItem = {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
};

type Props = { onUploaded: (f: FileInfo) => void };

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function FileUploadPanel({ onUploaded }: Props) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [visibility, setVisibility] = useState<FileVisibility>("private");
  const [artifactType, setArtifactType] = useState("general");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files).map<UploadItem>((file) => ({
      id: makeId(),
      file,
      status: "queued",
      progress: 0,
    }));
    if (incoming.length === 0) return;
    setItems((prev) => [...prev, ...incoming]);
    setError("");
  }

  function patchItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const pending = items.filter((it) => it.status === "queued" || it.status === "error");
    if (pending.length === 0) return;
    setBusy(true);
    setError("");

    for (const item of pending) {
      patchItem(item.id, { status: "uploading", progress: 0, error: undefined });
      try {
        const info = await uploadFile(item.file, {
          visibility,
          artifact_type: artifactType,
          description: description || undefined,
          onProgress: (pct) => patchItem(item.id, { progress: pct }),
        });
        patchItem(item.id, { status: "done", progress: 100 });
        onUploaded(info);
      } catch (err) {
        patchItem(item.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleClear() {
    if (busy) return;
    setItems([]);
    setDescription("");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  const pendingCount = items.filter((it) => it.status === "queued" || it.status === "error").length;

  const panel: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: "16px 20px",
    marginBottom: 20,
    fontFamily: "sans-serif",
  };

  const row: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" };

  const select: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 5,
    border: "1px solid #ccc",
    fontSize: 13,
  };

  const dropZone: React.CSSProperties = {
    border: `2px dashed ${dragOver ? "#1565c0" : "#c5c5c5"}`,
    borderRadius: 8,
    background: dragOver ? "#eef4ff" : "#fafafa",
    padding: "18px 16px",
    textAlign: "center",
    color: dragOver ? "#1565c0" : "#777",
    fontSize: 13,
    cursor: "pointer",
    marginBottom: 10,
    transition: "background 0.12s, border-color 0.12s",
  };

  const statusMeta: Record<UploadStatus, { color: string; label: string }> = {
    queued: { color: "#777", label: "Queued" },
    uploading: { color: "#1565c0", label: "Uploading…" },
    done: { color: "#2e7d32", label: "✓ Done" },
    error: { color: "#c00", label: "✗ Error" },
  };

  return (
    <div style={panel}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>Upload Files</h3>
      <form onSubmit={(e) => void handleSubmit(e)}>
        {/* Drag-and-drop zone (click to browse, multi-file) */}
        <div
          style={dropZone}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <span>Drag &amp; drop files here, or click to browse (multiple allowed)</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); }}
            style={{ display: "none" }}
          />
        </div>

        {items.length > 0 && (
          <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((item) => {
              const meta = statusMeta[item.status];
              return (
                <div
                  key={item.id}
                  style={{ border: "1px solid #eee", borderRadius: 6, padding: "8px 10px", background: "#fcfcfc" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#1a1a2e", fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📄 {item.file.name}{" "}
                      <span style={{ color: "#999", fontWeight: 400 }}>({(item.file.size / 1024).toFixed(1)} KB)</span>
                    </span>
                    <span style={{ color: meta.color, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{meta.label}</span>
                  </div>
                  {(item.status === "uploading" || item.status === "done") && (
                    <div style={{ height: 6, background: "#eee", borderRadius: 4, overflow: "hidden", marginTop: 6 }}>
                      <div
                        style={{
                          width: `${item.progress}%`,
                          height: "100%",
                          background: item.status === "done" ? "#2e7d32" : "#1565c0",
                          transition: "width 0.1s linear",
                        }}
                      />
                    </div>
                  )}
                  {item.status === "error" && item.error && (
                    <div style={{ color: "#c00", fontSize: 11, marginTop: 4 }}>{item.error}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ ...row, marginBottom: 10 }}>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as FileVisibility)} style={select}>
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
          <select value={artifactType} onChange={(e) => setArtifactType(e.target.value)} style={select}>
            {ARTIFACT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div style={{ ...row, marginBottom: 10 }}>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional, applies to all)"
            style={{ flex: 1, padding: "7px 10px", borderRadius: 5, border: "1px solid #ccc", fontSize: 13 }}
          />
          <button
            type="submit"
            disabled={pendingCount === 0 || busy}
            style={{
              padding: "7px 18px",
              background: "#1a1a2e",
              color: "#fff",
              border: "none",
              borderRadius: 5,
              cursor: pendingCount === 0 || busy ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              opacity: pendingCount === 0 || busy ? 0.6 : 1,
            }}
          >
            {busy ? "Uploading…" : `Upload${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={busy || items.length === 0}
            style={{
              padding: "7px 14px",
              background: "#fff",
              color: "#555",
              border: "1px solid #ccc",
              borderRadius: 5,
              cursor: busy || items.length === 0 ? "not-allowed" : "pointer",
              fontSize: 13,
              opacity: busy || items.length === 0 ? 0.6 : 1,
            }}
          >
            Clear
          </button>
        </div>

        {error && (
          <div style={{ color: "#c00", fontSize: 12, background: "#fff0f0", padding: "6px 10px", borderRadius: 4 }}>
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
