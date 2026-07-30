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

1. 먼저 미리보기: 해당 `.svg` 를 **브라우저로 열어** 확인.
2. 피그마 웹에서 파일 열기 → 탐색기에서 `.svg` 를 **캔버스로 드래그**.
   (또는 상단 메뉴 → `File → Place image/video…` 로 선택)
3. 텍스트는 편집 가능한 텍스트, 아이콘·박스·테두리는 벡터, 재배 랙·평면도 등은
   이미지로 들어온다.

## 재생성

```
node gen.js              # 8화면 전부
node gen.js store sales  # 지정한 화면만
```

`metrics.json`(글자 폭)과 `figma-common/assets-cache.json`(이미지)이 저장되어 있으므로
평소에는 `gen.js` 만 돌리면 된다. 아래 두 경우에만 캐시를 다시 만든다.

```
node measure.js       # 문구·글자 크기를 바꿨을 때  → metrics.json
node build-assets.js  # 이미지 표시 크기를 바꿨을 때 → figma-common/assets-cache.json
```

둘 다 헤드리스 Chrome(또는 Edge)을 쓴다. 없으면 경로를 각 스크립트의
`CHROME_CANDIDATES` 에 추가한다. 캐시에 없는 항목이 생기면 `gen.js` 가 경고로 알려준다.

## 구조

```
figma-common/screens.js       8화면 레이아웃 트리 — 화면을 고치려면 여기
figma-common/icons.js         AppIcon · PixelGlyph 의 SVG path
figma-common/assets-spec.js   PNG 합성 규칙 (재배 랙 슬롯·스프라이트 셀)
figma-common/assets-cache.json  표시 크기로 줄인 이미지 (생성물)

figma-svg/layout.js       간이 flex 레이아웃 엔진 (2패스: 폭 확정 → 줄바꿈 → 재배치)
figma-svg/measure.js      글자 폭 실측 → metrics.json
figma-svg/build-assets.js PNG 축소·합성 → assets-cache.json
figma-svg/assets.js       이미지 캐시 조회
figma-svg/gen.js          배치 결과를 SVG 로 직렬화
```

같은 화면 정의를 쓰는 데스크톱 앱 플러그인은 `../figma-plugin/` 에 있다. 오토레이아웃이
살아 있어 편집하기엔 그쪽이 낫다.

## 왜 글자 폭을 실측하는가

레이아웃이 글자 폭에 좌우된다 — 가운데 정렬 위치, 줄바꿈 지점, 1줄 말줄임 여부가 모두
글자 폭에서 나온다. 글자 종류별 평균 비율로 어림하면 한글 문장에서 수십 px 씩 틀어져
마름모 간격이 벌어지거나 한 줄에 들어갈 문장이 두 줄로 접힌다. 그래서 헤드리스 Chrome 의
`canvas.measureText` 로 실제 폰트 메트릭을 재서 쓴다.

## 근사치 (앱과 다를 수 있는 부분)

- **오토레이아웃 없음**: 위치가 절대좌표로 굳는다. 편집은 되지만 프레임을 늘려도 자동
  재배치는 안 된다. 오토레이아웃이 필요하면 `../figma-plugin/` 을 쓴다.
- **줄바꿈은 측정 시점 폰트 기준**: `metrics.json` 은 측정 PC 에 설치된 폰트로 잰 값이다.
  피그마에 다른 폰트가 깔려 있으면 줄바꿈·말줄임 위치가 한 글자 정도 달라질 수 있다.
  폰트 우선순위는 Pretendard → Noto Sans KR → Apple SD Gothic Neo → Malgun Gothic.
- **모서리 반경은 단일값**: 원본에서 일부 모서리만 둥근 곳(베드 탭 상단, 재배 랙 카드
  하단)은 균일하게 처리된다.
- **재배 랙 씬은 한 장으로 합성**: 앱은 베드 베이스 위에 식물 이미지를 슬롯마다 얹는다.
  같은 규칙으로 계산해 그리지만 결과는 평평한 한 장이라, 피그마에서 식물 하나만 옮길 수는
  없다. 식물 흔들림 애니메이션은 정지 각도로 굳는다.
- **숫자는 표시용**: 앱 화면은 값을 전부 API에서 받는다. 여기 들어간 값은 시드
  (`frontend/src/lib/seed-scenario.ts`)와 같은 품목·지점 구성의 대표값이며 라이브
  데이터가 아니다.
- 화면 진입 fade, 탭 눌림 스케일, 그림자는 옮기지 않는다.
- 하단 네비게이션은 앱에서 화면 아래에 고정되지만, 여기서는 스크롤 내용 전체를 펼친 뒤
  맨 아래에 놓는다(한 프레임에 화면 전체를 담기 위함).
