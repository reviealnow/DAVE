import { save } from "@tauri-apps/api/dialog";
import { writeBinaryFile } from "@tauri-apps/api/fs";
import { downloadDir, join } from "@tauri-apps/api/path";

import { isTauriRuntime } from "./runtime";

/**
 * Pre-fill the native "Save As" dialog inside the user's Downloads folder.
 * If the path API is unavailable (older runtime / missing `path` allowlist),
 * fall back to the bare filename so saving still works — it just opens
 * wherever the OS last left the dialog.
 */
async function defaultSavePath(filename: string): Promise<string> {
  try {
    return await join(await downloadDir(), filename);
  } catch {
    return filename;
  }
}

export interface SaveResult {
  /** false when the user cancelled the native "Save As" dialog (Tauri only). */
  saved: boolean;
  /** Absolute path written to, when saved via the native dialog. */
  path?: string;
}

/**
 * Save an in-memory blob to disk.
 *
 * Inside the Tauri webview a browser `<a download>` / object-URL click is
 * silently ignored (no OS download is triggered), so we use the native
 * "Save As" dialog + `fs.writeBinaryFile`. In a normal browser / server mode
 * we keep the classic object-URL + anchor approach.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<SaveResult> {
  if (isTauriRuntime()) {
    const path = await save({ defaultPath: await defaultSavePath(filename) });
    if (!path) {
      return { saved: false };
    }
    const buffer = new Uint8Array(await blob.arrayBuffer());
    await writeBinaryFile(path, buffer);
    return { saved: true, path };
  }

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
  return { saved: true };
}

/**
 * Fetch a URL (sending the auth cookie) and save the response body to disk.
 * Used for endpoints where the caller doesn't need to inspect the response.
 */
export async function downloadFromUrl(url: string, filename: string): Promise<SaveResult> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const blob = await response.blob();
  return saveBlob(blob, filename);
}
