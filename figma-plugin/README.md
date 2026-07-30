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

이미 작업물이 있는 파일·페이지에 넣어도 된다. 기존 요소들의 오른쪽 빈 공간에서 시작하므로
겹치지 않는다. 넣을 페이지를 먼저 선택하고 실행한다 — 프레임은 그때 열려 있는 페이지에 생긴다.

실행할 때마다 프레임이 **새로 추가**된다(기존 것을 갱신하지 않는다). 두 번 돌렸다면 이전
8개를 지운다.

## 구조

화면 정의는 `../figma-common/` 에 있고, 이 폴더는 그것을 Figma 노드로 옮기는 일만 한다.

```
figma-common/screens.js         8화면 레이아웃 트리 — 화면을 고치려면 여기
figma-common/icons.js           AppIcon · PixelGlyph 의 SVG path (앱 icons.tsx 와 같은 데이터)
figma-common/assets-spec.js     PNG 합성 규칙 (재배 랙 슬롯·스프라이트 셀)
figma-common/assets-cache.json  표시 크기로 줄인 이미지 (figma-svg/build-assets.js 생성물)
figma-plugin/render.js          트리 → Figma 오토레이아웃 노드
figma-plugin/build.js           위 넷을 이어 붙여 code.js 생성
figma-plugin/code.js            자동 생성물 (직접 고치지 말 것)
```

`code.js` 는 빌드 산출물이다. 피그마 플러그인은 `manifest.main` 파일 하나만 읽고
`require` 도 파일 접근도 없어서, 공유 정의·렌더러·이미지를 한 덩어리로 합쳐야 한다.
이미지가 인라인되므로 `code.js` 는 1MB 정도 된다.

### 화면을 고친 뒤

```
cd figma-plugin
node build.js
```

이미지 표시 크기를 바꿨다면 먼저 캐시를 다시 만든다(헤드리스 Chrome 필요).

```
cd ../figma-svg && node build-assets.js
```

그다음 피그마에서 플러그인을 다시 실행한다. (`Plugins → Development → Hot reload plugin`
을 켜두면 저장만으로 반영된다.)

## 근사치 (앱과 다를 수 있는 부분)

- **재배 랙 씬은 한 장으로 합성**: 앱은 베드 베이스 위에 식물 이미지를 슬롯마다 얹는다.
  같은 규칙으로 계산해 그리지만 결과는 평평한 한 장이라, 피그마에서 식물 하나만 옮길 수는
  없다. 식물 흔들림 애니메이션은 정지 각도로 굳는다.
  선 아이콘(`AppIcon`)과 픽셀 글리프(`PixelGlyph`)는 벡터로 들어온다.
- **이미지는 표시 크기로 축소된 것**: 원본 PNG(0.5~2.3MB)를 화면에 쓰이는 크기로 줄여
  넣는다. 프레임을 크게 늘리면 흐려진다. 원본이 필요하면 `app/assets/farmfi/*.png` 를
  직접 끌어다 채운다.
- **한글 폰트**: Pretendard → Noto Sans KR → Apple SD Gothic Neo → Malgun Gothic 순으로
  찾고, 하나도 없으면 Inter 로 떨어진다. 이때 한글이 네모로 보인다.
- **숫자는 표시용**: 앱 화면은 값을 전부 API에서 받는다. 목업에는 시드
  (`frontend/src/lib/seed-scenario.ts`)와 같은 품목·지점 구성의 대표값이 들어간다.
  라이브 데이터가 아니다.
- **간격용 `spacer` 프레임**: Figma 오토레이아웃에는 자식별 마진이 없어서, 원본의
  `marginTop` 은 높이만 가진 빈 프레임으로 표현된다. 지우고 부모의 gap 으로 옮겨도 된다.
- **모서리 반경은 단일값**: 원본에서 일부 모서리만 둥근 곳(베드 탭 상단, 재배 랙 카드
  하단)은 균일하게 처리된다.
- 화면 진입 fade, 탭 눌림 스케일, 그림자는 옮기지 않는다.
- `minHeight` 는 고정 높이로 굳는다.
- 하단 네비게이션은 앱에서 화면 아래에 고정되지만, 여기서는 스크롤 내용 전체를 펼친 뒤
  맨 아래에 놓는다(한 프레임에 화면 전체를 담기 위함).
