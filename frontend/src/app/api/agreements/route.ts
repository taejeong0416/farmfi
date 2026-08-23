import { NextResponse } from "next/server";
import { listActiveAgreements } from "@/lib/agreements";

// GET /api/agreements — 지금 유효한 동의 문서 목록.
// I-03이 필수 문서를 늘어놓는 데 쓴다. 본문은 단건 조회에서 준다.
export async function GET() {
  const agreements = await listActiveAgreements();
  return NextResponse.json({
    agreements: agreements.map((a) => ({
      id: a.id,
      code: a.code,
      version: a.version,
      title: a.title,
      required: a.required,
      contentHash: a.contentHash,
      effectiveFrom: a.effectiveFrom,
    })),
  });
}
