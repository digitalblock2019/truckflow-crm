import { useAuthStore } from "./auth";

const BASE = "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().tokens?.access_token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  // A 401 only means "session expired" if we actually sent a session. Without
  // a token it's a plain auth failure — signing in with the wrong password,
  // say — and redirecting to /login there reloads the page and throws away
  // the error before the user can read it.
  if (res.status === 401 && token) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${useAuthStore.getState().tokens?.access_token}`;
      const retry = await fetch(`${BASE}${path}`, { ...options, headers });
      if (retry.ok) {
        return retry.status === 204 ? (undefined as T) : retry.json();
      }
    }
    useAuthStore.getState().logout();
    window.location.href = "/login";
    throw new ApiError(401, "Session expired");
  }

  if (!res.ok) {
    // The API shapes failures as { error: { key, message } } (see
    // server/src/middleware/errorHandler.ts). Reading body.message/body.code
    // silently discarded every real message and left code undefined, so
    // callers keying off it — the duplicate-MC confirm flow, for one — could
    // never match. Older/plainer shapes are still accepted as fallbacks.
    const body = await res.json().catch(() => ({}));
    const message = body?.error?.message || body?.message || res.statusText;
    const code = body?.error?.key || body?.code;
    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  const refresh_token = useAuthStore.getState().tokens?.refresh_token;
  if (!refresh_token) return false;

  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    useAuthStore.getState().setTokens(data);
    return true;
  } catch {
    return false;
  }
}
