import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { reconcileIssuances } from "@/lib/reconcile";

// GET /api/admin/reconciliation — 발행 대사 (명세 P5).
// 밀린 발행을 다시 태우고 DB↔체인 수량을 맞춰 본다. 불일치는 보고만 한다.
export async function GET() {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const report = await reconcileIssuances();
  return NextResponse.json(report);
}
