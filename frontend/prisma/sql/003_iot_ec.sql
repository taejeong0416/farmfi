-- IotData에 양액 EC 컬럼을 추가한다 (추가 전용).
--
-- 배경: 센서 6종 중 pH는 재는데 EC는 재지 않았다. 정작 crop-profiles에는
-- 품종별 ecTarget이 이미 있어, 목표는 아는데 실측이 없는 상태였다.
-- 생육 레시피(9.4)가 학습하는 6요인 중 하나라 이 칸이 비면 EC를 상수로
-- 고정해야 하고, 그러면 EC×DLI 상호작용이 모델에서 사라진다.
--
-- nullable로 두는 이유: EC를 재지 않는 원천이 실제로 섞인다. seed-opendata가
-- 넣는 스마트팜코리아 온실 계열에는 EC 항목이 없다. @default(0)으로 두면
-- "안 쟀다"와 "0으로 쟀다"가 같은 값이 되어 학습이 물리적으로 불가능한
-- EC 0을 실측으로 먹는다. 판정할 수 없으면 판정하지 않는다.
--
-- `prisma db push`는 쓰지 않는다 (001의 사유와 같다 — 팀 테이블을 드롭하려 한다).
-- 아래 문장은 ADD뿐이고 IF NOT EXISTS로 재실행 가능하다.
--
-- 적용: psql "$SESSION_POOLER_URL" -f prisma/sql/003_iot_ec.sql
--       DDL이므로 세션 pooler(5432)가 필요하다. 트랜잭션 pooler(6543)는 멈춘다.

ALTER TABLE "IotData" ADD COLUMN IF NOT EXISTS "ecLevel" DOUBLE PRECISION;
