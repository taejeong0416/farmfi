import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAICache } from "@/lib/ai-cache";
import { extractFromImage } from "@/lib/ai-vision";

// 영수증 관련 키워드 — 마일스톤 conditionText에서 영수증으로 검증 가능한 절만 추린다.
const RECEIPT_KEYWORDS = ["영수증", "판매", "매출", "거래", "구매", "receipt"];

// 운영 빈도·기간을 나타내는 수량 수식어. 영수증 1건으로는 "여러 번/지속적으로"
// 판매했는지 증명할 수 없다(IoT 가동일수처럼 별도 신호로 검증되는 운영 지표).
// 영수증 검증에서는 이 수식어를 제거해 "정상적인 외부 판매/거래 증빙"인지만 본다.
const FREQUENCY_QUALIFIERS = ["복수", "다수", "여러", "반복", "지속", "추가", "정기"];

// M4처럼 "IoT 60일 가동률 90% 이상, 복수 판매 영수증"으로 IoT+영수증이 한 문장에
// 묶여 있으면, 영수증 검증기가 IoT 절이나 "복수(여러 건)" 빈도 요건까지 대조하려다
// 실패한다. 쉼표/구분자로 절을 분리해 영수증 관련 절만 남기고, 빈도 수식어를 제거한다
// (dev-log 06-21 이슈 재발 방지 — 영수증은 "판매 발생" 사실만 증명 가능).
function extractReceiptCondition(conditionText: string | null): string | null {
  if (!conditionText) return null;
  const clauses = conditionText
    .split(/[,、·/]|그리고|및/g)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const receiptClauses = clauses.filter((c) =>
    RECEIPT_KEYWORDS.some((k) => c.toLowerCase().includes(k.toLowerCase()))
  );
  const picked = receiptClauses.length > 0 ? receiptClauses : [conditionText];
  const cleaned = picked
    .map((c) => {
      const qualifierRe = new RegExp(`(${FREQUENCY_QUALIFIERS.join("|")})\\s*`, "g");
      return c.replace(qualifierRe, "").replace(/\s{2,}/g, " ").trim();
    })
    .filter((c) => c.length > 0);
  return cleaned.join(", ");
}

function buildPrompt(conditionText: string | null): string {
  const base =
    "영수증 이미지에서 금액, 항목, 일자를 JSON으로 추출해주세요.";
  const receiptCondition = extractReceiptCondition(conditionText);
  const condition = receiptCondition
    ? ` 그리고 이 영수증이 다음 영수증 요건에 부합하는 증빙인지 판단해주세요: "${receiptCondition}". 판단 기준: 이 이미지가 해당 요건에 해당하는 정상적인 외부 거래 증빙(구매 또는 판매 영수증)이면 matchesCondition=true 입니다. IoT 가동률·센서 데이터·현장 사진, 그리고 '여러 번/지속' 같은 거래 빈도·기간 요건은 영수증 1건만으로 확인할 수 없어 별도 신호로 검증되므로 판단에서 제외하고, 이 영수증이 요건에 맞는 거래 증빙인지 여부만 평가하세요.`
    : "";
  return (
    base +
    condition +
    " 응답 형식: { amount: number, items: string[], date: string, matchesCondition: boolean, matchReason: string }"
  );
}

interface ExtractedData {
  amount: number;
  items: string[];
  date: string;
  matchesCondition?: boolean;
  matchReason?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { milestoneId, imageBase64 } = await req.json();

    if (!milestoneId || !imageBase64) {
      return NextResponse.json(
        { error: "milestoneId and imageBase64 are required" },
        { status: 400 }
      );
    }

    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
    });

    const result = await withAICache(milestoneId, "receipt", async () => {
      const prompt = buildPrompt(milestone?.conditionText ?? null);
      const extractedData = await extractFromImage<ExtractedData>(
        imageBase64,
        prompt
      );

      const extractionOk =
        extractedData != null &&
        extractedData.amount > 0 &&
        Array.isArray(extractedData.items) &&
        extractedData.items.length > 0 &&
        typeof extractedData.date === "string" &&
        extractedData.date.length > 0;

      // 마일스톤 조건과의 부합 여부까지 통과해야 passed (conditionText 대조)
      const matchesCondition = milestone?.conditionText
        ? extractedData?.matchesCondition === true
        : true;

      const passed = extractionOk && matchesCondition;

      const confidence = passed ? 0.9 : 0.3;
      const reason = passed
        ? `영수증 인식 성공: ${extractedData.items.length}개 항목, 총 ${extractedData.amount}원`
        : !extractionOk
          ? "영수증에서 유효한 데이터를 추출하지 못했습니다."
          : `마일스톤 조건 불일치: ${extractedData?.matchReason ?? "사유 미상"}`;

      return { passed, extractedData, confidence, reason };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { passed: false, extractedData: null, confidence: 0, reason: message },
      { status: 500 }
    );
  }
}
