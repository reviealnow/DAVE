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
  opts: { visibility?: FileVisibility; artifact_type?: string; description?: string } = {},
): Promise<FileInfo> {
  const form = new FormData();
  form.append("file", file);
  form.append("visibility", opts.visibility ?? "private");
  form.append("artifact_type", opts.artifact_type ?? "general");
  if (opts.description) form.append("description", opts.description);

  const res = await fetch(apiUrl("/api/fileshare/upload"), {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { ok: boolean; file: FileInfo };
  return data.file;
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
