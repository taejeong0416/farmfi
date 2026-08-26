/**
 * 공개 문서 목록. 화면(클라이언트)과 생성기(서버)가 같이 쓴다.
 * 생성기(`project-documents.ts`)는 node:fs로 폰트를 읽으므로 클라이언트가
 * 그 파일을 직접 import하면 번들이 깨진다 — 목록만 여기 따로 둔 이유다.
 */
export const PROJECT_DOCUMENTS = [
  { slug: "overview", name: "프로젝트 핵심 안내서", issuedAt: "2026.02.28" },
  { slug: "lease", name: "임대차 계약서 요약본", issuedAt: "2026.02.20" },
  { slug: "milestones", name: "마일스톤 · 집행 계획서", issuedAt: "2026.02.28" },
  { slug: "operator", name: "운영사 소개 · 재배 계획", issuedAt: "2026.03.02" },
] as const;

export type DocumentSlug = (typeof PROJECT_DOCUMENTS)[number]["slug"];

export function isDocumentSlug(v: string): v is DocumentSlug {
  return PROJECT_DOCUMENTS.some((d) => d.slug === v);
}
