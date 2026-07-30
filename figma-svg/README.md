# FarmFi 앱 UI → SVG (피그마 웹 드래그용)

앱(`app/`, Expo RN) 8화면을 SVG로 뽑아 **피그마 웹에 드래그**하면 편집 가능한 레이어로
들어온다. 데스크톱 앱·플러그인 설치 불필요.

## 생성되는 파일

| 파일 | 출처 |
|---|---|
| `store.svg` | `app/src/farmfi/screens/StoreScreen.tsx` |
| `assignment.svg` | `app/src/farmfi/screens/AssignmentScreen.tsx` |
| `growth.svg` | `app/src/farmfi/screens/GrowthScreen.tsx` |
| `inventory.svg` | `app/src/farmfi/screens/InventoryScreen.tsx` |
| `monitoring.svg` | `app/src/farmfi/screens/MonitoringScreen.tsx` |
| `sales.svg` | `app/src/farmfi/screens/SalesScreen.tsx` |
| `home.svg` | `app/src/app/index.tsx` |
| `login.svg` | `app/src/app/login.tsx` |

폭은 앱과 같은 430(`FRAME_MAX_WIDTH`). 앞 6개는 하단 5탭 네비게이션까지 포함한 앱 셸
전체이고, `home`·`login` 은 FarmFi 픽셀 디자인계열이 아닌 Expo 스캐폴딩 화면이다.

## 사용법

1. 먼저 미리보기: 해당 `.svg` 를 **브라우저로 열어** 대략 맞는지 확인.
2. 피그마 웹에서 파일 열기 → 탐색기에서 `.svg` 를 **캔버스로 드래그**.
   (또는 상단 메뉴 → `File → Place image/video…` 로 선택)
3. 텍스트는 편집 가능한 텍스트, 아이콘·박스·테두리는 벡터로 들어온다.

## 재생성

```
cd figma-svg
node gen.js              # 8화면 전부
node gen.js store sales  # 지정한 화면만
```

화면 정의는 `../figma-common/screens.js` 한 곳에 있다. 거기를 고치면 이 SVG와
`../figma-plugin/` 플러그인이 함께 바뀐다.

## 근사치 (앱과 다를 수 있는 부분)

- **오토레이아웃 없음**: 위치가 절대좌표로 굳는다. 편집은 되지만 프레임을 늘려도 자동
  재배치는 안 된다. 오토레이아웃이 필요하면 `../figma-plugin/` 을 쓴다.
- **래스터 PNG 는 자리표시자**: 재배 랙 씬, 운영자 사진, 매장 평면도, 작물 스프라이트는
  라벨이 붙은 박스로 대체된다. 원본 에셋이 0.5~2.3MB라 data URI 로 임베드하지 않는다.
  정확히 넣으려면 피그마에서 해당 박스 위에 `app/assets/farmfi/*.png` 를 끌어다 얹는다.
  선 아이콘(`AppIcon`)과 픽셀 글리프(`PixelGlyph`)는 실제 벡터로 들어온다.
- **줄바꿈은 폭 추정치**: 실제 폰트 메트릭이 없어 글자 종류별 평균 비율로 폭을 잡는다.
  긴 한글 문장의 줄바꿈 위치가 앱과 한 글자 정도 다를 수 있다. 1줄 말줄임(`…`)도 같은
  추정치로 계산된다.
- 폰트는 피그마에 Pretendard / Noto Sans KR / Apple SD Gothic Neo / Malgun Gothic 중
  하나가 있으면 자동으로 쓰인다.
- **숫자는 표시용**: 앱 화면은 값을 전부 API에서 받는다. 여기 들어간 값은 시드
  (`frontend/src/lib/seed-scenario.ts`)와 같은 품목·지점 구성의 대표값이며 라이브
  데이터가 아니다.
- **모서리 반경은 단일값**: 원본에서 일부 모서리만 둥근 곳(베드 탭 상단, 재배 랙 카드
  하단)은 균일하게 처리된다.
- 애니메이션(식물 sway, 화면 진입 fade, 탭 눌림 스케일)과 그림자는 옮기지 않는다.

## 참고

`../figma-plugin/` 은 같은 화면 정의를 쓰는 **데스크톱 앱 플러그인**이다. 오토레이아웃이
살아 있어 품질이 더 좋다. 데스크톱 앱을 쓸 수 있으면 그쪽이 낫다.
