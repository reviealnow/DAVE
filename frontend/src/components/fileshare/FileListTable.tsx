import { useEffect, useMemo, useRef, useState } from "react";
import { deleteFile, FileInfo, FileVisibility, getDownloadUrl, setArtifactType, setVisibility } from "../../api/fileshare";
import { useAuth } from "../../auth/AuthProvider";

const ARTIFACT_TYPES = [
  "general", "raw_log", "analyzer_report", "pcap", "pcapng",
  "firmware", "test_plan", "screenshot", "customer_evidence",
  "regression_bundle", "config_backup", "other",
];

const PAGE_SIZES = [10, 25, 50];

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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  // Re-entry guard for batch delete. setBatchBusy(true) only applies on the
  // next render, and an in-flight boolean won't help when a second synthetic
  // click lands *after* the first run already finished (its finally would have
  // cleared the flag) but still carries the pre-render selection. A short
  // timestamp cooldown blocks any second trigger that arrives within the window
  // regardless of how the first one is timed against the confirm dialog.
  const lastBatchDeleteAt = useRef(0);
  const BATCH_DELETE_COOLDOWN_MS = 2000;
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  // Owned files are the only ones the user can select for batch delete.
  const ownedIds = useMemo(
    () => new Set(files.filter((f) => f.owner_user_id === user?.id).map((f) => f.id)),
    [files, user?.id],
  );

  const pageCount = Math.max(1, Math.ceil(files.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageFiles = useMemo(
    () => files.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [files, safePage, pageSize],
  );

  // Clamp page and prune selections that no longer exist (e.g. after delete/filter).
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ownedIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [ownedIds]);

  if (files.length === 0) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "#999", fontFamily: "sans-serif", fontSize: 14 }}>
        No files yet.
      </div>
    );
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectableOnPage = pageFiles.filter((f) => ownedIds.has(f.id)).map((f) => f.id);
  const allPageSelected = selectableOnPage.length > 0 && selectableOnPage.every((id) => selected.has(id));

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) selectableOnPage.forEach((id) => next.delete(id));
      else selectableOnPage.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleVisibility(f: FileInfo, v: FileVisibility) {
    setBusy(f.id);
    try {
      onChanged(await setVisibility(f.id, v));
    } finally {
      setBusy(null);
    }
  }

  async function handleArtifactType(f: FileInfo, t: string) {
    setBusy(f.id);
    try {
      onChanged(await setArtifactType(f.id, t));
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

  async function handleBatchDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    // Drop a second trigger that arrives within the cooldown (e.g. a rapid
    // double click). Stamp before confirm() so the guard holds even while the
    // dialog is open.
    if (Date.now() - lastBatchDeleteAt.current < BATCH_DELETE_COOLDOWN_MS) return;
    lastBatchDeleteAt.current = Date.now();
    if (!confirm(`Delete ${ids.length} selected file(s)? This cannot be undone.`)) {
      lastBatchDeleteAt.current = 0;
      return;
    }
    setBatchBusy(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => deleteFile(id)));
      const failed: number[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") onDeleted(ids[i]);
        else failed.push(ids[i]);
      });
      setSelected(new Set(failed));
      if (failed.length > 0) {
        alert(`${failed.length} file(s) could not be deleted (ID: ${failed.join(", ")}).`);
      }
    } finally {
      setBatchBusy(false);
    }
  }

  async function copyChecksum(f: FileInfo) {
    if (!f.checksum) return;
    try {
      await navigator.clipboard.writeText(f.checksum);
      setCopiedId(f.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === f.id ? null : cur)), 1500);
    } catch {
      // Clipboard blocked (e.g. non-HTTPS); silently ignore.
    }
  }

  const th: React.CSSProperties = {
    padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 600,
    color: "#555", borderBottom: "2px solid #e0e0e0", background: "#fafafa",
  };
  const td: React.CSSProperties = {
    padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f0f0f0", verticalAlign: "middle",
  };

  const selectedCount = selected.size;

  return (
    <div>
      {/* Batch action bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 10,
        fontFamily: "sans-serif", fontSize: 13, minHeight: 30,
      }}>
        {selectedCount > 0 ? (
          <>
            <span style={{ color: "#555" }}>{selectedCount} selected</span>
            <button
              onClick={() => void handleBatchDelete()}
              disabled={batchBusy}
              style={{
                padding: "5px 14px", background: "#c62828", color: "#fff", border: "none",
                borderRadius: 4, fontSize: 13, cursor: batchBusy ? "default" : "pointer", fontWeight: 500,
              }}
            >
              {batchBusy ? "Deleting…" : `Delete ${selectedCount} selected`}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              disabled={batchBusy}
              style={{ padding: "5px 12px", background: "#fff", border: "1px solid #ccc", borderRadius: 4, fontSize: 13, cursor: "pointer" }}
            >
              Clear
            </button>
          </>
        ) : (
          <span style={{ color: "#aaa" }}>Select your own files to delete in bulk</span>
        )}
      </div>

      <div style={{ overflowX: "auto", background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "sans-serif" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 32 }}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  disabled={selectableOnPage.length === 0}
                  onChange={togglePage}
                  title="Select all your files on this page"
                />
              </th>
              <th style={th}>Filename</th>
              <th style={th}>Owner</th>
              <th style={th}>Size</th>
              <th style={th}>Checksum</th>
              <th style={th}>Artifact Type</th>
              <th style={th}>Visibility</th>
              <th style={th}>Downloads</th>
              <th style={th}>Uploaded</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageFiles.map((f) => {
              const isOwner = user?.id === f.owner_user_id;
              const isBusy = busy === f.id || batchBusy;
              const isSel = selected.has(f.id);
              return (
                <tr key={f.id} style={{ opacity: isBusy ? 0.5 : 1, background: isSel ? "#eef4ff" : undefined }}>
                  <td style={{ ...td, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={isSel}
                      disabled={!isOwner || batchBusy}
                      onChange={() => toggleOne(f.id)}
                      title={isOwner ? "Select" : "You can only bulk-delete your own files"}
                    />
                  </td>
                  <td style={td}>
                    <span title={f.description ?? undefined} style={{ fontWeight: 500 }}>{f.original_filename}</span>
                    {f.description && (
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }} title={f.description}>
                        {f.description.length > 80 ? `${f.description.slice(0, 80)}…` : f.description}
                      </div>
                    )}
                  </td>
                  <td style={td}>{f.owner_username}</td>
                  <td style={td}>{fmt(f.size_bytes)}</td>
                  <td style={td}>
                    {f.checksum ? (
                      <button
                        onClick={() => void copyChecksum(f)}
                        title={`SHA-256: ${f.checksum}\n(click to copy)`}
                        style={{
                          fontFamily: "monospace", fontSize: 11, color: copiedId === f.id ? "#2e7d32" : "#1565c0",
                          background: "none", border: "none", padding: 0, cursor: "pointer",
                        }}
                      >
                        {copiedId === f.id ? "✓ copied" : `${f.checksum.slice(0, 10)}…`}
                      </button>
                    ) : (
                      <span style={{ color: "#bbb", fontSize: 11 }}>—</span>
                    )}
                  </td>
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
                          padding: "4px 10px", background: "#1565c0", color: "#fff", borderRadius: 4,
                          fontSize: 12, textDecoration: "none", fontWeight: 500,
                        }}
                      >
                        Download
                      </a>
                      {isOwner && (
                        <button
                          onClick={() => void handleDelete(f)}
                          disabled={isBusy}
                          style={{
                            padding: "4px 10px", background: "#c62828", color: "#fff", border: "none",
                            borderRadius: 4, fontSize: 12, cursor: "pointer", fontWeight: 500,
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

      {/* Pagination footer */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        marginTop: 10, fontFamily: "sans-serif", fontSize: 13, color: "#555", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            style={{ fontSize: 13, padding: "3px 6px", borderRadius: 4, border: "1px solid #ccc" }}
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>
            {files.length === 0 ? 0 : safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, files.length)} of {files.length}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: safePage === 0 ? "default" : "pointer", fontSize: 13 }}
          >
            ‹ Prev
          </button>
          <span style={{ minWidth: 70, textAlign: "center" }}>Page {safePage + 1} / {pageCount}</span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: safePage >= pageCount - 1 ? "default" : "pointer", fontSize: 13 }}
          >
            Next ›
          </button>
        </div>
      </div>
    </div>
  );
}
