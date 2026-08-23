import { createHash } from "crypto";
import { prisma } from "@/lib/db";

/**
 * 동의 문서 (명세 5.2 · 10.6).
 *
 * 문서는 고쳐 쓰지 않고 버전을 올린다. 이미 동의한 사람이 본 문장이 나중에 바뀌면
 * "무엇에 동의했는지"를 증명할 수 없다. 그래서 본문을 바꾸려면 `version`을 올려
 * 새 행을 만들고, 옛 행은 `isActive = false`로 두되 지우지 않는다 — 과거 동의가
 * 가리키는 문서다.
 *
 * 동의 기록에는 문서 해시를 복사해 둔다. 문서 행을 잘못 건드려도 동의 시점의
 * 본문이 무엇이었는지 남는다.
 */

type Client = Pick<typeof prisma, "agreement">;

export function hashBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/** 동의 한 건을 가리키는 키. Postgres는 NULL을 서로 다르게 보므로 복합 unique로는 부족하다. */
export function consentKeyFor(
  userId: string,
  agreementId: string,
  investmentId?: string | null,
): string {
  return `${userId}:${agreementId}:${investmentId ?? "-"}`;
}

/** I-03이 요구하는 필수 문서 3종 (명세 5.2). */
export const DEFAULT_AGREEMENTS = [
  {
    code: "investment_contract",
    version: "1.0",
    title: "투자계약서",
    required: true,
    sortOrder: 1,
    body: [
      "제1조(목적) 이 계약은 투자자가 FarmFi가 모집하는 미니팜 지점 사업에 자금을 납입하고,",
      "그 대가로 사업 성과에 따른 회수금을 지급받는 조건을 정한다.",
      "",
      "제2조(납입) 투자자는 신청 건별로 발급된 가상계좌에 입금기한 내 신청 금액을 납입한다.",
      "입금이 확인되기 전에는 신청이 확정되지 않는다.",
      "",
      "제3조(보유 구좌) 납입이 확인되면 신청 금액에 해당하는 보유 구좌가 투자자 앞으로 기록된다.",
      "보유 구좌는 사업 성과 분배의 기준 단위이며, 원금을 보장하지 않는다.",
      "",
      "제4조(자금 집행) 납입된 자금은 운영 자금과 분리해 보관하고, 사전에 공개된 단계별 조건이",
      "충족되었음이 확인된 뒤에만 해당 단계 금액이 집행된다.",
      "",
      "제5조(회수) 사업에서 발생한 수익은 정산 규칙에 따라 계산해 투자자가 등록한 계좌로 지급한다.",
      "지급 시기와 금액은 사업 성과에 따라 달라진다.",
      "",
      "제6조(해지) 입금기한이 지나 납입이 확인되지 않은 신청은 자동으로 취소된다.",
    ].join("\n"),
  },
  {
    code: "risk_disclosure",
    version: "1.0",
    title: "핵심위험 안내서",
    required: true,
    sortOrder: 2,
    body: [
      "이 투자는 원금을 보장하지 않습니다. 아래 위험을 확인한 뒤 투자를 결정하십시오.",
      "",
      "1. 원금 손실 위험",
      "   지점 사업이 부진하면 납입 금액의 일부 또는 전부를 회수하지 못할 수 있습니다.",
      "",
      "2. 회수 지연 위험",
      "   회수금은 사업에서 실제로 수익이 발생한 뒤에 지급됩니다. 지급 시기는 정해져 있지 않습니다.",
      "",
      "3. 중도 회수 제한",
      "   보유 구좌는 자유롭게 사고팔 수 있는 대상이 아닙니다. 필요할 때 현금화하지 못할 수 있습니다.",
      "",
      "4. 운영 위험",
      "   작물 생육 실패, 설비 고장, 지점 운영 중단은 매출과 회수금을 직접 줄입니다.",
      "",
      "5. 사업 중단 위험",
      "   단계별 조건이 충족되지 않아 집행이 멈추면 사업이 중단될 수 있습니다.",
      "   이 경우 이미 집행된 금액은 회수 대상에서 제외될 수 있습니다.",
    ].join("\n"),
  },
  {
    code: "privacy_consent",
    version: "1.0",
    title: "개인정보 제공 동의",
    required: true,
    sortOrder: 3,
    body: [
      "FarmFi는 투자 신청 처리를 위해 아래 정보를 수집·이용합니다.",
      "",
      "수집 항목",
      "  이름, 생년월일, 연락처, 본인확인 결과, 회수 계좌 정보(예금주·마스킹된 계좌번호)",
      "",
      "이용 목적",
      "  본인확인, 투자 적합성 판단, 연간 투자한도 산정, 납입·회수 처리, 법령상 기록 보존",
      "",
      "제공받는 자와 목적",
      "  본인확인 기관 — 실명 및 명의 확인",
      "  금융기관 — 가상계좌 발급, 입금 확인, 회수금 지급",
      "",
      "보유 기간",
      "  관계 법령이 정한 기간까지 보관한 뒤 파기합니다.",
      "",
      "동의를 거부할 수 있으나, 거부하면 투자 신청을 진행할 수 없습니다.",
    ].join("\n"),
  },
] as const;

/**
 * 코드에 적힌 문서를 DB에 맞춘다. 같은 (code, version)이면 본문만 갱신하고,
 * 같은 코드의 다른 버전은 비활성으로 내린다.
 */
export async function syncAgreements(client: Client = prisma): Promise<number> {
  for (const doc of DEFAULT_AGREEMENTS) {
    const contentHash = hashBody(doc.body);
    await client.agreement.upsert({
      where: { code_version: { code: doc.code, version: doc.version } },
      update: {
        title: doc.title,
        body: doc.body,
        contentHash,
        required: doc.required,
        sortOrder: doc.sortOrder,
        isActive: true,
      },
      create: {
        code: doc.code,
        version: doc.version,
        title: doc.title,
        body: doc.body,
        contentHash,
        required: doc.required,
        sortOrder: doc.sortOrder,
      },
    });
    await client.agreement.updateMany({
      where: { code: doc.code, version: { not: doc.version } },
      data: { isActive: false },
    });
  }
  return DEFAULT_AGREEMENTS.length;
}

/** 지금 유효한 문서들. 화면은 이 순서로 늘어놓는다. */
export async function listActiveAgreements() {
  return prisma.agreement.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * 문서 하나를 찾는다. 화면은 코드(`investment_contract`)로 부르고 감사 조회는
 * 행 id로 부른다 — 어느 쪽이든 받는다. 코드로 부르면 지금 유효한 버전이 나온다.
 */
export async function resolveAgreement(idOrCode: string) {
  const byId = await prisma.agreement.findUnique({ where: { id: idOrCode } });
  if (byId) return byId;
  return prisma.agreement.findFirst({
    where: { code: idOrCode, isActive: true },
    orderBy: { effectiveFrom: "desc" },
  });
}

/**
 * 동의를 남긴다. 같은 사람이 같은 문서를 같은 신청 건에 두 번 눌러도 기록은 하나다 —
 * 처음 누른 시각이 동의 시각이므로 나중 호출로 덮지 않는다.
 */
export async function recordConsent(input: {
  userId: string;
  agreement: { id: string; contentHash: string };
  investmentId?: string | null;
  signature: string;
  identityVerificationId?: string | null;
}) {
  const consentKey = consentKeyFor(
    input.userId,
    input.agreement.id,
    input.investmentId,
  );
  const existing = await prisma.agreementConsent.findUnique({ where: { consentKey } });
  if (existing) return { consent: existing, created: false };

  const consent = await prisma.agreementConsent.create({
    data: {
      consentKey,
      userId: input.userId,
      agreementId: input.agreement.id,
      investmentId: input.investmentId ?? null,
      contentHash: input.agreement.contentHash,
      signature: input.signature,
      identityVerificationId: input.identityVerificationId ?? null,
    },
  });
  return { consent, created: true };
}

/**
 * 이 신청 건에 아직 동의하지 않은 필수 문서. 비어 있어야 투자 신청이 넘어간다.
 * 신청 건과 무관하게 남긴 동의는 세지 않는다 — 명세 5.2는 신청마다 재동의를 요구한다.
 */
export async function missingRequiredConsents(userId: string, investmentId: string) {
  const required = await prisma.agreement.findMany({
    where: { isActive: true, required: true },
    orderBy: { sortOrder: "asc" },
  });
  if (required.length === 0) return [];

  const consents = await prisma.agreementConsent.findMany({
    where: { userId, investmentId, agreementId: { in: required.map((a) => a.id) } },
    select: { agreementId: true },
  });
  const done = new Set(consents.map((c) => c.agreementId));
  return required.filter((a) => !done.has(a.id));
}

/**
 * 이 신청에서 동의한 문서들을 하나로 묶은 해시. 체인에 올릴 계약 해시다(명세 10.4).
 * 문서 원문도, 개별 해시도 체인으로 나가지 않는다 — 이 값 하나만 나간다.
 *
 * 순서에 따라 값이 달라지면 같은 동의가 다른 해시를 내므로 코드 기준으로 정렬한다.
 */
export async function agreementHashFor(
  userId: string,
  investmentId: string,
): Promise<string | null> {
  const consents = await prisma.agreementConsent.findMany({
    where: { userId, investmentId },
    include: { agreement: { select: { code: true, version: true } } },
  });
  if (consents.length === 0) return null;

  const lines = consents
    .map((c) => `${c.agreement.code}:${c.agreement.version}:${c.contentHash}`)
    .sort();
  return hashBody(lines.join("\n"));
}
