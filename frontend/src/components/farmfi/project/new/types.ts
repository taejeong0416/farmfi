// 공모 개설(Project 생성) 폼 타입. Prisma `Project`/`Milestone` 필드명과 1:1로 맞춘다.
// (schema.prisma: Milestone.releasePct — "3500 = 35%" 관례. 여기서는 사람이 읽는
// 퍼센트(35)로 다루고, 서버(POST /api/projects)에서 저장용 값(*100)으로 변환한다.)

export const SIGNAL_OPTIONS = [
  { code: "contract", label: "계약서" },
  { code: "receipt", label: "영수증" },
  { code: "photo", label: "사진" },
  { code: "iot", label: "IoT 센서" },
] as const;

export type SignalCode = (typeof SIGNAL_OPTIONS)[number]["code"];

export type MilestoneDraft = {
  seq: number;
  name: string;
  description: string;
  releasePct: number; // 사람이 읽는 퍼센트 (예: 35 = 35%)
  conditionText: string;
  requiredSignals: SignalCode[];
  iotMinDays: number;
};

// 4단계 기본값 — api-spec.md 시드 기준값(공간준비35/시운전30/첫수확20/지속운영15)과 동일.
// 운영자가 그대로 쓸 수도, 프로젝트 특성에 맞게 수정할 수도 있다.
export const DEFAULT_MILESTONES: MilestoneDraft[] = [
  {
    seq: 1,
    name: "공간 준비",
    description: "임대차 계약 체결, 설비 구매, 공간 셋업 완료",
    releasePct: 35,
    conditionText: "임대차 계약서, 설비 구매 영수증, 현장 사진 제출",
    requiredSignals: ["contract", "receipt", "photo"],
    iotMinDays: 0,
  },
  {
    seq: 2,
    name: "시운전 + 안정성",
    description: "설비 가동 테스트 및 안정성 검증",
    releasePct: 30,
    conditionText: "IoT 가동률 90% 이상 (온도·습도·조도 정상 범위)",
    requiredSignals: ["iot"],
    iotMinDays: 14,
  },
  {
    seq: 3,
    name: "첫 수확 + 판매",
    description: "첫 작물 수확 및 판매 실적 확인",
    releasePct: 20,
    conditionText: "수확 사진, 판매 영수증",
    requiredSignals: ["photo", "receipt"],
    iotMinDays: 0,
  },
  {
    seq: 4,
    name: "지속 운영",
    description: "지속 운영 검증 및 BEP 접근 확인",
    releasePct: 15,
    conditionText: "IoT 가동률 90% 이상, 복수 판매 영수증",
    requiredSignals: ["iot", "receipt"],
    iotMinDays: 60,
  },
];

export type ProjectFormState = {
  name: string;
  description: string;
  location: string;
  buildingType: string;
  areaSqm: string;
  tokenSymbol: string;
  tokenPrice: string;
  totalTokens: string;
  targetAmount: string;
};

export const INITIAL_FORM_STATE: ProjectFormState = {
  name: "",
  description: "",
  location: "",
  buildingType: "",
  areaSqm: "",
  tokenSymbol: "",
  tokenPrice: "",
  totalTokens: "",
  targetAmount: "",
};

export type CreateProjectPayload = {
  name: string;
  description: string | null;
  location: string | null;
  buildingType: string | null;
  areaSqm: number | null;
  tokenSymbol: string;
  tokenPrice: number;
  totalTokens: number;
  targetAmount: number;
  milestones: MilestoneDraft[];
};

export type CreateProjectResponse = {
  project: {
    id: string;
    name: string;
  };
};
