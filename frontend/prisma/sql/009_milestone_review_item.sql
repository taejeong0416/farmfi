-- 조건 항목별 판정 (A-08 · Phase T2). 추가 전용.
-- 한 항목이라도 undecided면 승인이 열리지 않는다.
CREATE TABLE IF NOT EXISTS "MilestoneReviewItem" (
  "id"          TEXT NOT NULL,
  "milestoneId" TEXT NOT NULL,
  "signal"      TEXT NOT NULL,
  "verdict"     TEXT NOT NULL DEFAULT 'undecided',
  "evidenceUrl" TEXT,
  "note"        TEXT,
  "autoDraft"   BOOLEAN NOT NULL DEFAULT true,
  "decidedById" TEXT,
  "decidedAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MilestoneReviewItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MilestoneReviewItem_milestoneId_signal_key"
  ON "MilestoneReviewItem"("milestoneId", "signal");
CREATE INDEX IF NOT EXISTS "MilestoneReviewItem_milestoneId_idx"
  ON "MilestoneReviewItem"("milestoneId");

DO $$ BEGIN
  ALTER TABLE "MilestoneReviewItem" ADD CONSTRAINT "MilestoneReviewItem_milestoneId_fkey"
    FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
