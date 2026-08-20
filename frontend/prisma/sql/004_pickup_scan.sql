-- 픽업 바코드 스캔·수령 처리 (Phase R). 추가 전용.
--
-- code에 unique를 건다: 스캔도 수동입력도 이 값 하나로 찾는다. 중복이 있으면
-- "어느 픽업인지"가 결정되지 않고, 같은 번호로 두 건이 수령 처리될 수 있다.

ALTER TABLE "PickupOrder" ADD COLUMN IF NOT EXISTS "preparedAt" TIMESTAMP(3);
ALTER TABLE "PickupOrder" ADD COLUMN IF NOT EXISTS "pickedById" TEXT;

-- unique를 걸기 전에 기존 중복을 확인한다. 있으면 인덱스 생성이 실패하고
-- 트랜잭션이 통째로 롤백되므로, 데이터를 말없이 고치지 않고 그대로 멈춘다.
DO $$
DECLARE dup_count INT;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT "code" FROM "PickupOrder" GROUP BY "code" HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION '확인번호 중복 %건. unique를 걸기 전에 사람이 정리해야 한다.', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PickupOrder_code_key" ON "PickupOrder"("code");
CREATE INDEX IF NOT EXISTS "PickupOrder_status_scheduledAt_idx"
  ON "PickupOrder"("status", "scheduledAt");
