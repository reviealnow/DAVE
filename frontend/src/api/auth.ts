import { apiUrl } from "./runtime";

export type AuthUser = {
  id: number;
  username: string;
  role: string;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function register(username: string, password: string): Promise<{ ok: boolean; user: AuthUser }> {
  return post("/api/auth/register", { username, password });
}

export async function login(username: string, password: string): Promise<{ ok: boolean; user: AuthUser }> {
  return post("/api/auth/login", { username, password });
}

export async function logout(): Promise<void> {
  await post("/api/auth/logout", {});
}

export async function getMe(): Promise<AuthUser> {
  return get<AuthUser>("/api/auth/me");
}
