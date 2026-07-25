import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "./config";

const TOKEN_KEY = "farmfi.token";

// ─── 토큰 저장소 (SecureStore = 안드 Keystore 기반 보안 저장) ───
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ─── API 오류 — 화면이 401/403(로그인·권한)과 그 외를 구분해 안내할 수 있도록
// HTTP 상태를 함께 싣는다. status 0은 네트워크 도달 실패. ───
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ─── 공용 API 클라이언트 — 저장된 토큰을 Bearer로 자동 첨부 ───
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    // DNS/오프라인/타임아웃 — 서버 응답 자체가 없는 경우.
    throw new ApiError("서버에 연결할 수 없습니다. 네트워크를 확인해주세요.", 0);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // 응답 바디가 JSON이 아닐 수 있음 (204 등)
  }

  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? `요청 실패 (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// 화면에 그대로 띄울 수 있는 한국어 오류 문구. 401/403은 원문("Unauthorized"/
// "Forbidden")이 사용자에게 무의미하므로 행동 지시로 바꾼다.
export function describeApiError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "로그인이 필요합니다. 운영자 계정으로 로그인해주세요.";
    if (error.status === 403) return "운영자 권한이 필요합니다. 운영자 계정으로 로그인해주세요.";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

// 재시도가 아니라 로그인으로 유도해야 하는 오류인지.
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}
