-- 운영자 보증서 (O-08 · Phase Q3). 추가 전용.
--
-- 테이블은 이미 있었다(스키마에는 없이 DB에만). 기존 컬럼을 그대로 쓰고
-- 두 개만 더한다 — projectId(앱이 연결할 매장)와 vcId(Open DID VC 참조).
ALTER TABLE "OperatorCredential" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "OperatorCredential" ADD COLUMN IF NOT EXISTS "vcId" TEXT;

CREATE INDEX IF NOT EXISTS "OperatorCredential_userId_status_idx"
  ON "OperatorCredential"("userId", "status");
CREATE INDEX IF NOT EXISTS "OperatorCredential_status_expiresAt_idx"
  ON "OperatorCredential"("status", "expiresAt");

DO $$ BEGIN
  ALTER TABLE "OperatorCredential" ADD CONSTRAINT "OperatorCredential_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
