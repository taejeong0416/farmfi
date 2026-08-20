-- 증빙 파일 해시 (명세 9.2 · 체인에는 검증 해시만 기록). 추가 전용.
ALTER TABLE "Milestone"
  ADD COLUMN IF NOT EXISTS "evidenceHashes" TEXT[] NOT NULL DEFAULT '{}';
