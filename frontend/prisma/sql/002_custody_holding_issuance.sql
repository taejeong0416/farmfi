-- v2.1 수탁 지갑 + 보유 구좌 발행 원장 (추가 전용).
-- 투자자에게는 아무것도 보이지 않는다. 백엔드 원장 구조만 바뀐다.

CREATE TABLE IF NOT EXISTS "CustodyWallet" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "chainAddress" TEXT NOT NULL,
  "keyRef"       TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'ACTIVE',
  "registeredAt" TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustodyWallet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustodyWallet_userId_key" ON "CustodyWallet"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "CustodyWallet_chainAddress_key" ON "CustodyWallet"("chainAddress");

CREATE TABLE IF NOT EXISTS "HoldingIssuance" (
  "id"            TEXT NOT NULL,
  "eventId"       TEXT NOT NULL,
  "investmentId"  TEXT NOT NULL,
  "walletId"      TEXT NOT NULL,
  "units"         INTEGER NOT NULL,
  "method"        TEXT NOT NULL DEFAULT 'mint',
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "chainTxHash"   TEXT,
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastError"     TEXT,
  "occurredAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt"     TIMESTAMP(3),
  CONSTRAINT "HoldingIssuance_pkey" PRIMARY KEY ("id")
);
-- 멱등의 근거. 은행 웹훅 재전송이 두 번째 발행을 만들지 못하게 DB가 막는다.
CREATE UNIQUE INDEX IF NOT EXISTS "HoldingIssuance_eventId_key" ON "HoldingIssuance"("eventId");
CREATE INDEX IF NOT EXISTS "HoldingIssuance_status_nextAttemptAt_idx"
  ON "HoldingIssuance"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "HoldingIssuance_investmentId_idx" ON "HoldingIssuance"("investmentId");

DO $$ BEGIN
  ALTER TABLE "CustodyWallet" ADD CONSTRAINT "CustodyWallet_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "HoldingIssuance" ADD CONSTRAINT "HoldingIssuance_investmentId_fkey"
    FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "HoldingIssuance" ADD CONSTRAINT "HoldingIssuance_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "CustodyWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
