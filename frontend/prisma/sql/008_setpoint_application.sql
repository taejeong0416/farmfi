-- 설정점 적용 기록 (Phase W2). 추가 전용.
-- 산출값과 적용값을 둘 다 남긴다. 정산·판정에는 적용값을 쓴다.
CREATE TABLE IF NOT EXISTS "SetpointApplication" (
  "id"          TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "cropKey"     TEXT NOT NULL,
  "decisions"   JSONB NOT NULL,
  "adjusted"    INTEGER NOT NULL DEFAULT 0,
  "surface"     TEXT NOT NULL,
  "samples"     INTEGER NOT NULL DEFAULT 0,
  "note"        TEXT,
  "appliedById" TEXT,
  "appliedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SetpointApplication_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SetpointApplication_projectId_appliedAt_idx"
  ON "SetpointApplication"("projectId", "appliedAt");

DO $$ BEGIN
  ALTER TABLE "SetpointApplication" ADD CONSTRAINT "SetpointApplication_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
