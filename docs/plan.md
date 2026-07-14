# FarmFi 구현 플랜

> 이 프로젝트는 STO 자금집행 플랫폼에서 **v18 공실전환 창업 지원 인프라**로 피벗했다.
> 기존 STO 구현 플랜(청약·에스크로·트랜치·배당·마일스톤 검증·온체인)은 폐기되었으며,
> 전체 이력은 git 및 `docs/dev-log.md`에 남아 있다.

## 현재 기준 문서
- **서비스 기획**: `docs/FarmFi_전체서비스_기획안_v18.md`
- **피벗 실행계획**: `docs/피벗_실행계획_v15.md` (STO→운영 인프라 전환의 단계·격차·제거/개조/신규)
- **API 계약**: `docs/api-spec.md`
- **진행 기록**: `docs/dev-log.md`

## 구현 요약 (v18)
- **인증**: 이메일 + 비밀번호 (bcrypt, jose 세션 JWT)
- **데이터**: Prisma 7 + Supabase(PostgreSQL) — `User`·`Space`·`OperatorApplication`·`Project`(지점)·`IotData`·`Notification`·`Institution`·`Product`·`Inventory`·`HarvestRecord`·`SalesRecord`
- **핵심 3기능**: 재고-생육 연동('오늘 할 일') · 판매-재배 연동 · 기관 성과 리포트
- **생육 모니터링**: IoT 수집·시각화 + 이상 탐지·알림 (정상범위는 수직농장 상추 문헌 기반)
- **화면**: 프론트엔드 담당이 별도 구축. 백엔드는 API 계약 + 시드 제공.
