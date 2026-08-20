-- Phase U 스키마를 운영 DB에 반영한다 (추가 전용).
--
-- 배경: schema.prisma에는 병합돼 있었지만 실제 DB에는 반영되지 않아
-- User 조회가 P2022 ColumnNotFound로 전부 실패했다 — 로그인 500.
-- `prisma db push`는 팀 테이블 40개를 드롭하려 해서 쓰지 않는다.
-- 여기 있는 문장은 전부 ADD/CREATE뿐이고 IF NOT EXISTS로 재실행 가능하다.
--
-- RLS: 이 스키마의 33개 기존 테이블 모두 RLS 미사용이다. DB는 브라우저의
-- anon 키가 아니라 Next 서버의 특권 커넥션으로만 접근하고, Prisma가 쓰는
-- 롤은 RLS를 우회한다. 5개 테이블만 켜면 일관성만 깨지고 얻는 게 없어
-- 기존 관례를 따른다. 접근 통제는 라우트의 requireRole/세션 게이트가 맡는다.

-- ─── User · 실명확인 식별자 (OACX 모바일 신분증) ───
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ciHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "identityProvider" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_ciHash_key" ON "User"("ciHash");

-- ─── 센서 임계값 ───
CREATE TABLE IF NOT EXISTS "SensorThreshold" (
  "id"        TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sensor"    TEXT NOT NULL,
  "minValue"  DOUBLE PRECISION NOT NULL,
  "maxValue"  DOUBLE PRECISION NOT NULL,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SensorThreshold_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SensorThreshold_projectId_sensor_key"
  ON "SensorThreshold"("projectId", "sensor");

-- ─── 설비 ───
CREATE TABLE IF NOT EXISTS "Device" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "bed"          TEXT NOT NULL,
  "kind"         TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "isOn"         BOOLEAN NOT NULL DEFAULT false,
  "controllable" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Device_projectId_bed_idx" ON "Device"("projectId", "bed");

-- ─── 설비 제어 명령 ───
CREATE TABLE IF NOT EXISTS "DeviceCommand" (
  "id"          TEXT NOT NULL,
  "deviceId"    TEXT NOT NULL,
  "requestedBy" TEXT,
  "targetState" BOOLEAN NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'pending',
  "failReason"  TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"  TIMESTAMP(3),
  CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DeviceCommand_deviceId_requestedAt_idx"
  ON "DeviceCommand"("deviceId", "requestedAt");

-- ─── 알림 설정 ───
CREATE TABLE IF NOT EXISTS "NotificationPref" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "channel"   TEXT NOT NULL DEFAULT 'push',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPref_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPref_userId_type_key"
  ON "NotificationPref"("userId", "type");

-- ─── 재고 조정 이력 ───
CREATE TABLE IF NOT EXISTS "StockAdjustment" (
  "id"         TEXT NOT NULL,
  "projectId"  TEXT NOT NULL,
  "productId"  TEXT NOT NULL,
  "delta"      INTEGER NOT NULL,
  "beforeQty"  INTEGER NOT NULL,
  "afterQty"   INTEGER NOT NULL,
  "reason"     TEXT NOT NULL,
  "adjustedBy" TEXT,
  "adjustedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockAdjustment_projectId_adjustedAt_idx"
  ON "StockAdjustment"("projectId", "adjustedAt");

-- ─── 외래키 (중복 실행 시 무시) ───
DO $$ BEGIN
  ALTER TABLE "SensorThreshold" ADD CONSTRAINT "SensorThreshold_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Device" ADD CONSTRAINT "Device_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationPref" ADD CONSTRAINT "NotificationPref_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
