import { DragEvent, FormEvent, useRef, useState } from "react";
import { FileInfo, FileVisibility, uploadFile } from "../../api/fileshare";

const ARTIFACT_TYPES = [
  "general", "raw_log", "analyzer_report", "pcap", "pcapng",
  "firmware", "test_plan", "screenshot", "customer_evidence",
  "regression_bundle", "config_backup", "other",
];

type Props = { onUploaded: (f: FileInfo) => void };

export default function FileUploadPanel({ onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<FileVisibility>("private");
  const [artifactType, setArtifactType] = useState("general");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      const info = await uploadFile(file, {
        visibility,
        artifact_type: artifactType,
        description: description || undefined,
        onProgress: setProgress,
      });
      onUploaded(info);
      setFile(null);
      setDescription("");
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setError("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

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

  return (
    <div style={panel}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>Upload File</h3>
      <form onSubmit={(e) => void handleSubmit(e)}>
        {/* Drag-and-drop zone (click to browse) */}
        <div
          style={dropZone}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {file ? (
            <span style={{ color: "#1a1a2e", fontWeight: 500 }}>
              📄 {file.name} <span style={{ color: "#999", fontWeight: 400 }}>({(file.size / 1024).toFixed(1)} KB)</span>
            </span>
          ) : (
            <span>Drag &amp; drop a file here, or click to browse</span>
          )}
          <input
            ref={inputRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ display: "none" }}
          />
        </div>

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
            placeholder="Description (optional)"
            style={{ flex: 1, padding: "7px 10px", borderRadius: 5, border: "1px solid #ccc", fontSize: 13 }}
          />
          <button
            type="submit"
            disabled={!file || busy}
            style={{
              padding: "7px 18px",
              background: "#1a1a2e",
              color: "#fff",
              border: "none",
              borderRadius: 5,
              cursor: !file || busy ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              opacity: !file || busy ? 0.6 : 1,
            }}
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>

        {/* Upload progress bar */}
        {busy && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ height: 8, background: "#eee", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background: "#1565c0",
                  transition: "width 0.1s linear",
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: "#777", marginTop: 4, textAlign: "right" }}>{progress}%</div>
          </div>
        )}

        {error && (
          <div style={{ color: "#c00", fontSize: 12, background: "#fff0f0", padding: "6px 10px", borderRadius: 4 }}>
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
