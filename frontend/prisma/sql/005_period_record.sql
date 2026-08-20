-- 기간 정산 입력 (Phase S1). 추가 전용.
-- 확정(confirmed)된 행만 배당 계산에 들어간다.

CREATE TABLE IF NOT EXISTS "PeriodRecord" (
  "id"            TEXT NOT NULL,
  "projectId"     TEXT NOT NULL,
  "period"        TEXT NOT NULL,
  "revenue"       BIGINT NOT NULL DEFAULT 0,
  "costs"         JSONB NOT NULL DEFAULT '[]',
  "totalCost"     BIGINT NOT NULL DEFAULT 0,
  "status"        TEXT NOT NULL DEFAULT 'draft',
  "confirmNote"   TEXT,
  "confirmedById" TEXT,
  "confirmedAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PeriodRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PeriodRecord_projectId_period_key"
  ON "PeriodRecord"("projectId", "period");
CREATE INDEX IF NOT EXISTS "PeriodRecord_status_period_idx"
  ON "PeriodRecord"("status", "period");

DO $$ BEGIN
  ALTER TABLE "PeriodRecord" ADD CONSTRAINT "PeriodRecord_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
