import { DocBuilder } from "./pdf-doc";
import { PROJECT_DOCUMENTS, type DocumentSlug } from "./project-document-list";

type Milestone = {
  seq: number;
  name: string;
  releasePct: number;
  releaseAmount: bigint | number | string;
  status: string;
  conditionText: string | null;
  requiredSignals: string[];
  iotMinDays: number;
  crossCheck: string | null;
  deadlineAt: Date | string | null;
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  buildingType: string | null;
  areaSqm: number | null;
  tokenSymbol: string | null;
  tokenPrice: bigint | number | string | null;
  totalTokens: number | null;
  soldTokens: number;
  targetAmount: bigint | number | string | null;
  currentAmount: bigint | number | string;
  totalCapex: bigint | number | string;
  fundingStart: Date | string | null;
  fundingEnd: Date | string | null;
  contractAddress: string | null;
  status: string;
  esgTag: string | null;
  targetReturnPct: number | null;
  paybackMonths: number | null;
  escrow: {
    totalLocked: bigint | number | string;
    totalReleased: bigint | number | string;
    remaining: bigint | number | string;
    contractAddress: string | null;
  } | null;
  milestones: Milestone[];
};

const num = (v: bigint | number | string | null | undefined) => Number(v ?? 0);
const won = (v: bigint | number | string | null | undefined) =>
  `${num(v).toLocaleString("ko-KR")}원`;
const pct = (basisPoints: number) => `${(basisPoints / 100).toFixed(0)}%`;

function date(v: Date | string | null | undefined) {
  if (!v) return "-";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const BUILDING_TYPE: Record<string, string> = {
  vacant_store: "유휴 상가",
  vacant_office: "유휴 사무실",
  public_space: "공공 유휴공간",
};

const SIGNAL_LABEL: Record<string, string> = {
  contract: "계약서",
  receipt: "영수증",
  photo: "현장 사진",
  iot: "센서 데이터",
  inspection: "검수확인서",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  evidence_submitted: "증빙 제출됨",
  in_progress: "검증 중",
  revision_required: "보완 요청",
  verified: "승인",
  completed: "집행 완료",
  failed: "실패",
  manual_review: "수동 검토",
};

const DISCLAIMER =
  "이 문서는 투자 판단을 돕기 위한 참고 자료이며 투자 권유가 아닙니다. 기재된 수치는 작성 시점의 계획값으로, 실제 운영 실적에 따라 달라질 수 있습니다. 투자 결과에 대한 책임은 투자자 본인에게 있습니다.";

function header(b: DocBuilder, p: Project, title: string, issuedAt: string) {
  b.title(title, `${p.name} · ${p.location ?? "-"}   |   발행일 ${issuedAt}`);
}

function overview(b: DocBuilder, p: Project) {
  const target = num(p.targetAmount);
  const unit = num(p.tokenPrice);
  b.h2("1. 사업 개요")
    .para(
      p.description ??
        "도심 유휴공실을 스마트팜 기반 24시간 신선식품 매장으로 전환하는 프로젝트입니다. 조성에 필요한 설비 자금을 토큰증권(STO)으로 모집하고, 단계별 증빙이 확인될 때마다 자금을 나누어 집행합니다.",
    )
    .kv([
      ["대상 공간", `${p.location ?? "-"} · ${BUILDING_TYPE[p.buildingType ?? ""] ?? p.buildingType ?? "-"}`],
      ["전용 면적", p.areaSqm ? `${p.areaSqm}㎡` : "-"],
      ["프로젝트 상태", p.status],
      ["ESG 분류", p.esgTag ?? "-"],
    ]);

  b.h2("2. 모집 조건").kv([
    ["종목 기호", p.tokenSymbol ?? "-"],
    ["1구좌 금액", unit ? won(unit) : "-"],
    ["총 발행 구좌", p.totalTokens ? `${p.totalTokens.toLocaleString("ko-KR")}구좌` : "-"],
    ["목표 조달액", target ? won(target) : "-"],
    ["현재 조달액", `${won(p.currentAmount)} (${p.soldTokens.toLocaleString("ko-KR")}구좌)`],
    ["모집 기간", `${date(p.fundingStart)} ~ ${date(p.fundingEnd)}`],
  ]);

  b.h2("3. 회수 조건").kv([
    ["목표 총 회수율", p.targetReturnPct ? `${p.targetReturnPct}%` : "-"],
    ["예상 회수기간", p.paybackMonths ? `${p.paybackMonths}개월` : "-"],
    ["배당 방식", "매장 운영실적을 월 단위로 정산해 보유 구좌 비율대로 분배"],
    ["원금 보장", "없음 — 운영 실적에 따라 회수액이 달라집니다"],
  ]);

  b.h2("4. 투자자 보호 장치").bullets([
    "자금은 팜피 에스크로에 분리보관되며, 마일스톤 증빙이 확인된 단계에 한해서만 집행됩니다.",
    "집행 대금은 에스크로에서 설비업체 계좌로 직접 지급됩니다. 운영자는 조성자금을 직접 수령하지 않습니다.",
    "각 마일스톤에는 기한이 있고, 기한이 지나면 누구나 실패 전환을 요청해 환불 절차로 넘길 수 있습니다.",
    "실패 전환 시 집행되지 않은 잔여 자금은 보유 구좌 비율대로 환불됩니다.",
    "매장 수익이 계획에 미치지 못하면 회수기간을 최대 36개월까지 연장하고, 설비 처리대금의 90%를 투자자에게 지급합니다.",
  ]);

  b.h2("5. 유의사항").note(DISCLAIMER);
}

function lease(b: DocBuilder, p: Project) {
  b.h2("1. 계약 개요")
    .para(
      "본 요약본은 프로젝트 대상 공간에 대한 공간사용 계약의 주요 조건을 투자자에게 공개하기 위해 작성된 것입니다. 계약 원본은 팜피가 보관하며, 마일스톤 1단계 증빙으로 제출·검증됩니다.",
    )
    .kv([
      ["소재지", p.location ?? "-"],
      ["공간 유형", BUILDING_TYPE[p.buildingType ?? ""] ?? p.buildingType ?? "-"],
      ["전용 면적", p.areaSqm ? `${p.areaSqm}㎡` : "-"],
      ["사용 목적", "스마트팜 재배 및 신선식품 소매"],
      ["계약 주체", "팜피(임차인) ↔ 공간 소유주(임대인)"],
    ]);

  b.h2("2. 주요 조건").table(
    ["항목", "내용"],
    [
      [{ text: "계약 형태" }, { text: "공간사용 협약 — 매장 운영 기간 동안의 배타적 사용권" }],
      [{ text: "원상복구" }, { text: "재배 설비는 모듈형으로 철거·반출이 가능하며, 계약 종료 시 원상복구 후 반환" }],
      [{ text: "설비 소유권" }, { text: "설비는 대금 완납 전까지 설비업체에 소유권이 유보되며, 완납 후 프로젝트에 귀속" }],
      [{ text: "중도 해지" }, { text: "임대인 사정으로 해지될 경우 설비를 회수해 타 매장에 재배치하고 처리대금을 정산" }],
      [{ text: "관리비·공과금" }, { text: "매장 운영비로 처리하며 조성자금(에스크로)에서 집행하지 않음" }],
    ],
    [0.26, 0.74],
  );

  b.h2("3. 검증 방식").bullets([
    "계약서 원본은 마일스톤 1단계 증빙으로 제출되며, AI 판독으로 소재지·면적·계약 주체가 프로젝트 정보와 일치하는지 대조합니다.",
    "원본 파일의 SHA-256 해시를 함께 기록해, 이후 원본이 바뀌면 해시가 어긋나 드러납니다.",
    "검증이 통과해야 1단계 집행이 열립니다. 강제 통과 경로는 없습니다.",
  ]);

  b.h2("4. 유의사항").note(
    "본 요약본은 계약 원본을 대체하지 않습니다. 개인정보와 임대인 요청에 따른 비공개 조항은 제외되어 있습니다.",
  );
  b.note(DISCLAIMER);
}

function milestones(b: DocBuilder, p: Project) {
  const ms = [...p.milestones].sort((a, c) => a.seq - c.seq);
  const total = ms.reduce((s, m) => s + num(m.releaseAmount), 0);

  b.h2("1. 집행 원칙")
    .para(
      "조성자금은 한 번에 지급되지 않습니다. 각 단계의 증빙이 제출·검증된 뒤에 해당 단계 비율만큼만 에스크로에서 설비업체 계좌로 직접 지급됩니다. 앞 단계가 끝나지 않으면 다음 단계는 열리지 않습니다.",
    )
    .kv([
      ["보관 총액", p.escrow ? won(p.escrow.totalLocked) : won(total)],
      ["집행 완료", p.escrow ? won(p.escrow.totalReleased) : "0원"],
      ["잔여 보관액", p.escrow ? won(p.escrow.remaining) : won(total)],
      ["에스크로 주소", p.escrow?.contractAddress ?? p.contractAddress ?? "-"],
    ]);

  b.h2("2. 단계별 집행 계획");
  if (ms.length === 0) {
    b.para("등록된 마일스톤이 없습니다.");
  } else {
    let acc = 0;
    b.table(
      ["단계", "집행 비율", "누적", "집행액", "상태"],
      ms.map((m) => {
        acc += m.releasePct;
        return [
          { text: `${m.seq}. ${m.name}` },
          { text: pct(m.releasePct), align: "right" as const },
          { text: pct(acc), align: "right" as const },
          { text: won(m.releaseAmount), align: "right" as const },
          { text: STATUS_LABEL[m.status] ?? m.status },
        ];
      }),
      [0.34, 0.14, 0.12, 0.24, 0.16],
    );

    b.h2("3. 단계별 검증 조건");
    for (const m of ms) {
      const signals = m.requiredSignals
        .map((s) => SIGNAL_LABEL[s] ?? s)
        .join(" · ");
      b.para(`${m.seq}. ${m.name}`);
      b.kv([
        ["검증 신호", signals || "-"],
        ["통과 조건", m.conditionText ?? "-"],
        ...(m.crossCheck ? ([["교차검증", m.crossCheck]] as [string, string][]) : []),
        ...(m.iotMinDays > 0
          ? ([["센서 관측 기간", `${m.iotMinDays}일`]] as [string, string][])
          : []),
        ["기한", date(m.deadlineAt)],
      ]);
    }
  }

  b.h2("4. 기한이 지난 경우").bullets([
    "마일스톤 기한이 지나면 누구나 실패 전환을 요청할 수 있습니다. 운영사의 판단을 기다리지 않습니다.",
    "실패로 전환되면 집행되지 않은 잔여 보관액이 보유 구좌 비율대로 환불됩니다.",
    "미집행 잔여 재원은 설비업체의 미회수 대금 보전에 우선 배정된 뒤 남는 금액이 환불 재원이 됩니다.",
  ]);

  b.note(DISCLAIMER);
}

function operator(b: DocBuilder, p: Project) {
  b.h2("1. 운영 주체")
    .para(
      "매장은 팜피의 자격 확인과 필수 교육을 마친 지역 운영자가 맡습니다. 운영자는 조성자금을 직접 수령하지 않으며, 노동과 성과연동 보수, 운영보증서로 책임을 집니다.",
    )
    .kv([
      ["운영 매장", `${p.name} · ${p.location ?? "-"}`],
      ["운영 면적", p.areaSqm ? `${p.areaSqm}㎡` : "-"],
      ["운영자 자기부담", "없음 — 설비 조성비는 전액 투자금으로 충당"],
      ["보수 방식", "매장 운영실적에 연동된 월 보수"],
    ]);

  b.h2("2. 운영자 자격 절차").table(
    ["단계", "내용"],
    [
      [{ text: "1. 자격 확인" }, { text: "본인 확인과 운영 가능 여부 심사, 배정 매장·조건 확정" }],
      [{ text: "2. 필수 교육" }, { text: "재배·위생·매장 운영 교육 수료 (진행률 기록, 수료 처리)" }],
      [{ text: "3. 현장 방문" }, { text: "배정 공간을 직접 확인하고 운영 조건을 검토" }],
      [{ text: "4. 운영보증서" }, { text: "자격·교육·계약 확인 후 검증 가능한 자격증명(VC) 발급" }],
      [{ text: "5. 운영 계약" }, { text: "최종 배정 공간·조건으로 운영 계약 서명" }],
    ],
    [0.26, 0.74],
  );

  b.h2("3. 재배 계획")
    .para(
      "엽채류를 중심으로 회전율이 높은 품목을 조합해 재배합니다. 품목별 생육 일수를 어긋나게 배치해 수확이 한 시점에 몰리지 않도록 하고, 판매 데이터를 다음 파종 계획에 반영합니다.",
    )
    .table(
      ["구분", "내용"],
      [
        [{ text: "재배 방식" }, { text: "LED 인공광 수직재배 — 계절·기후의 영향을 받지 않음" }],
        [{ text: "주요 품목" }, { text: "상추 · 루꼴라 · 바질 등 엽채류 및 허브" }],
        [{ text: "환경 관리" }, { text: "온도 · 습도 · CO₂ · 광량 · EC를 센서로 상시 측정, 권장 범위 이탈 시 경고" }],
        [{ text: "생산 계획" }, { text: "판매 추이를 분석해 다음 재배 사이클의 품목·수량을 조정" }],
        [{ text: "품질 관리" }, { text: "수확 후 세척·소분해 당일 매장 진열, 재고 회전 상태를 앱으로 관리" }],
      ],
      [0.22, 0.78],
    );

  b.h2("4. 운영자 이탈 시").bullets([
    "설비를 철거하지 않습니다. 매장과 자산을 유지한 채 운영자만 교체합니다.",
    "필수 교육과 운영보증서를 마친 대기 운영자 풀에서 후임을 배정합니다.",
    "교체 기간 중 발생한 운영 공백은 팜피가 관리하며, 투자자 배당 기준은 실제 운영실적을 따릅니다.",
  ]);

  b.note(DISCLAIMER);
}

const BUILDERS: Record<DocumentSlug, (b: DocBuilder, p: Project) => void> = {
  overview,
  lease,
  milestones,
  operator,
};

export async function buildProjectDocument(
  slug: DocumentSlug,
  project: Project,
): Promise<Uint8Array> {
  const meta = PROJECT_DOCUMENTS.find((d) => d.slug === slug)!;
  const b = await DocBuilder.create();
  header(b, project, meta.name, meta.issuedAt);
  BUILDERS[slug](b, project);
  b.footer(`FarmFi · ${project.name} · ${meta.name}`);
  return b.save();
}
