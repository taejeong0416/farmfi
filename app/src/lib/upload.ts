import { apiFetch, getToken } from "./api";
import { API_BASE_URL } from "./config";

/**
 * 이미지 한 장을 서버에 올린다.
 *
 * 서버가 업로드 시점에 sha256을 계산해 돌려준다 — 나중에 URL로 다시 받아
 * 계산하면 그 사이 파일이 바뀌었는지 알 수 없다. 그 해시가 증빙의 지문이 된다.
 *
 * multipart라 apiFetch(JSON 전용)를 쓰지 못하고 토큰만 빌려 쓴다.
 * Content-Type을 직접 넣지 않는다 — boundary는 런타임이 붙여야 한다.
 */
export type UploadedFile = {
  url: string;
  sha256: string;
  bytes: number;
  mime: string;
};

export async function uploadImage(uri: string, filename: string): Promise<UploadedFile> {
  const token = await getToken();
  const form = new FormData();
  // RN의 FormData는 { uri, name, type } 객체를 파일로 받는다.
  form.append("file", {
    uri,
    name: filename,
    type: filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
  } as unknown as Blob);

  const res = await fetch(`${API_BASE_URL}/api/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  const data = (await res.json().catch(() => null)) as
    | (UploadedFile & { error?: string })
    | null;
  if (!res.ok || !data?.url) {
    throw new Error(data?.error ?? "사진을 올리지 못했습니다.");
  }
  return data;
}

/** 증빙 제출. urls와 hashes는 같은 순서여야 한다. */
export async function submitEvidence(
  milestoneId: string,
  input: { urls: string[]; hashes: string[]; note: string },
): Promise<void> {
  await apiFetch(`/api/milestones/${milestoneId}/evidence`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
