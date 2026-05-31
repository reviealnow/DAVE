import { apiUrl } from "./runtime";

export type FileVisibility = "public" | "private";

export type FileInfo = {
  id: number;
  owner_user_id: number;
  owner_username: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  visibility: FileVisibility;
  artifact_type: string;
  description: string | null;
  download_count: number;
  checksum: string | null;
  created_at: string;
  updated_at: string;
};

type FilesResponse = { files: FileInfo[] };

export type FileFilters = {
  visibility?: FileVisibility;
  artifact_type?: string;
  owner_id?: number;
  keyword?: string;
};

function buildQuery(filters: FileFilters): string {
  const p = new URLSearchParams();
  if (filters.visibility) p.set("visibility", filters.visibility);
  if (filters.artifact_type) p.set("artifact_type", filters.artifact_type);
  if (filters.owner_id != null) p.set("owner_id", String(filters.owner_id));
  if (filters.keyword) p.set("keyword", filters.keyword);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export async function listFiles(filters: FileFilters = {}): Promise<FileInfo[]> {
  const res = await fetch(apiUrl(`/api/fileshare/files${buildQuery(filters)}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as FilesResponse;
  return data.files;
}

export async function uploadFile(
  file: File,
  opts: {
    visibility?: FileVisibility;
    artifact_type?: string;
    description?: string;
    onProgress?: (pct: number) => void;
  } = {},
): Promise<FileInfo> {
  const form = new FormData();
  form.append("file", file);
  form.append("visibility", opts.visibility ?? "private");
  form.append("artifact_type", opts.artifact_type ?? "general");
  if (opts.description) form.append("description", opts.description);

  // XMLHttpRequest (not fetch) so we can report upload progress via
  // xhr.upload.onprogress — fetch has no upload-progress event.
  return new Promise<FileInfo>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl("/api/fileshare/upload"));
    xhr.withCredentials = true;

    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress!(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as { ok: boolean; file: FileInfo };
          resolve(data.file);
        } catch {
          reject(new Error("Invalid server response"));
        }
      } else {
        reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload aborted"));

    xhr.send(form);
  });
}

export function getDownloadUrl(fileId: number): string {
  return apiUrl(`/api/fileshare/download/${fileId}`);
}

export async function deleteFile(fileId: number): Promise<void> {
  const res = await fetch(apiUrl(`/api/fileshare/files/${fileId}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) throw new Error(await res.text());
}

export type BatchDeleteResult = {
  deleted: number[];
  failed: { id: number; reason: string }[];
};

export async function batchDeleteFiles(ids: number[]): Promise<BatchDeleteResult> {
  const res = await fetch(apiUrl("/api/fileshare/files/batch-delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as BatchDeleteResult;
}

export async function setVisibility(fileId: number, visibility: FileVisibility): Promise<FileInfo> {
  const res = await fetch(apiUrl(`/api/fileshare/files/${fileId}/visibility`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ visibility }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { ok: boolean; file: FileInfo };
  return data.file;
}

export async function setArtifactType(fileId: number, artifact_type: string): Promise<FileInfo> {
  const res = await fetch(apiUrl(`/api/fileshare/files/${fileId}/artifact-type`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ artifact_type }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { ok: boolean; file: FileInfo };
  return data.file;
}

export async function listArtifactTypes(): Promise<string[]> {
  const res = await fetch(apiUrl("/api/fileshare/artifact-types"), { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { types: string[] };
  return data.types;
}
