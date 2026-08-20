-- 지급사 웹훅 검증값 (토스페이먼츠 가상계좌). 추가 전용.
-- 토스는 HMAC 서명이 아니라 발급 때 내려준 secret을 웹훅 본문 secret과 대조한다.
-- 계좌마다 값이 다르므로 전역 시크릿 한 개로는 검증할 수 없다.
ALTER TABLE "VirtualAccount" ADD COLUMN IF NOT EXISTS "providerSecret" TEXT;
