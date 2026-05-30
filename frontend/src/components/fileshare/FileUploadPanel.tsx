import { FormEvent, useRef, useState } from "react";
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
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const info = await uploadFile(file, { visibility, artifact_type: artifactType, description: description || undefined });
      onUploaded(info);
      setFile(null);
      setDescription("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
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

  return (
    <div style={panel}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>Upload File</h3>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div style={{ ...row, marginBottom: 10 }}>
          <input
            ref={inputRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 13 }}
          />
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
        {error && (
          <div style={{ color: "#c00", fontSize: 12, background: "#fff0f0", padding: "6px 10px", borderRadius: 4 }}>
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
