# FarmFi 앱 UI → Figma (플러그인)

앱(`app/`, Expo RN) 8화면을 피그마의 **오토레이아웃 프레임 + 편집 가능한 텍스트·벡터**
레이어로 생성하는 로컬 플러그인.

같은 목적의 SVG 드래그 방식은 `../figma-svg/` 에 있다. 데스크톱 앱을 쓸 수 있으면
오토레이아웃이 살아있는 이쪽이 낫다.

## 생성되는 화면

| 프레임 | 출처 |
|---|---|
| `App / 1 Store` | `app/src/farmfi/screens/StoreScreen.tsx` |
| `App / 2 Assignment` | `app/src/farmfi/screens/AssignmentScreen.tsx` |
| `App / 3 Growth` | `app/src/farmfi/screens/GrowthScreen.tsx` |
| `App / 4 Inventory` | `app/src/farmfi/screens/InventoryScreen.tsx` |
| `App / 5 Monitoring` | `app/src/farmfi/screens/MonitoringScreen.tsx` |
| `App / 6 Sales` | `app/src/farmfi/screens/SalesScreen.tsx` |
| `App / 7 Home` | `app/src/app/index.tsx` |
| `App / 8 Login` | `app/src/app/login.tsx` |

프레임 폭은 앱과 같은 430(`FRAME_MAX_WIDTH`). 1~6번은 하단 5탭 네비게이션까지 포함한
앱 셸 전체이고, 7·8번은 FarmFi 픽셀 디자인계열이 아닌 Expo 스캐폴딩 화면이다.

## 실행 방법 (피그마 데스크톱 앱 필요)

1. 피그마 **데스크톱 앱**을 연다. (웹 버전은 로컬 플러그인 로드 불가)
2. 아무 파일이나 새로 연다.
3. 메뉴 → **Plugins → Development → Import plugin from manifest…**
4. 이 폴더의 `manifest.json` 선택.
5. 메뉴 → **Plugins → Development → FarmFi → Figma** 실행.
6. 캔버스에 8개 프레임이 가로로 나열된다.

## 구조

화면 정의는 `../figma-common/` 에 있고, 이 폴더는 그것을 Figma 노드로 옮기는 일만 한다.

```
figma-common/icons.js     AppIcon · PixelGlyph 의 SVG path (앱 icons.tsx 와 같은 데이터)
figma-common/screens.js   8화면 레이아웃 트리 — 화면을 고치려면 여기
figma-plugin/render.js    트리 → Figma 오토레이아웃 노드
figma-plugin/build.js     위 셋을 이어 붙여 code.js 생성
figma-plugin/code.js      자동 생성물 (직접 고치지 말 것)
```

`code.js` 는 빌드 산출물이다. 피그마 플러그인은 `manifest.main` 파일 하나만 읽고
`require` 가 없어서, 공유 정의와 렌더러를 한 덩어리로 합쳐야 한다.

### 화면을 고친 뒤

```
cd figma-plugin
node build.js
```

그다음 피그마에서 플러그인을 다시 실행한다. (`Plugins → Development → Hot reload plugin`
을 켜두면 저장만으로 반영된다.)

## 근사치 (앱과 다를 수 있는 부분)

- **래스터 PNG 는 자리표시자**: 재배 랙 씬, 운영자 사진, 매장 평면도, 작물 스프라이트는
  `⬚ 라벨` 박스로 들어온다. 원본 에셋이 0.5~2.3MB라 플러그인 코드에 임베드하지 않는다.
  정확히 넣으려면 해당 프레임에 `app/assets/farmfi/*.png` 를 직접 끌어다 채운다.
  선 아이콘(`AppIcon`)과 픽셀 글리프(`PixelGlyph`)는 실제 벡터로 들어온다.
- **한글 폰트**: Pretendard → Noto Sans KR → Apple SD Gothic Neo → Malgun Gothic 순으로
  찾고, 하나도 없으면 Inter 로 떨어진다. 이때 한글이 네모로 보인다.
- **숫자는 표시용**: 앱 화면은 값을 전부 API에서 받는다. 목업에는 시드
  (`frontend/src/lib/seed-scenario.ts`)와 같은 품목·지점 구성의 대표값이 들어간다.
  라이브 데이터가 아니다.
- **간격용 `spacer` 프레임**: Figma 오토레이아웃에는 자식별 마진이 없어서, 원본의
  `marginTop` 은 높이만 가진 빈 프레임으로 표현된다. 지우고 부모의 gap 으로 옮겨도 된다.
- **모서리 반경은 단일값**: 원본에서 일부 모서리만 둥근 곳(베드 탭 상단, 재배 랙 카드
  하단)은 균일하게 처리된다.
- 애니메이션(식물 sway, 화면 진입 fade, 탭 눌림 스케일)과 그림자는 옮기지 않는다.
- `minHeight` 는 고정 높이로 굳는다.
