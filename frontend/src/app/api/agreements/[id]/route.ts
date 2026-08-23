import { NextResponse } from "next/server";
import { resolveAgreement } from "@/lib/agreements";

// GET /api/agreements/[id] — 문서 본문. id는 행 id 또는 코드(investment_contract 등).
// 코드로 부르면 지금 유효한 버전이 나온다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const agreement = await resolveAgreement(id);
  if (!agreement) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ agreement });
}
