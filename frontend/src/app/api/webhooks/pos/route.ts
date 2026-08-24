import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";

/**
 * POST /api/webhooks/pos — POS 매출 수집 창구 (명세 T4 ① 매장 매출 집계).
 *
 * 기존 `POST /api/sales`는 운영자 세션을 요구한다. POS는 사람이 아니라 세션이
 * 없으므로 그 문을 쓸 수 없다. 그래서 기계용 문을 따로 낸다.
 *
 * 세 가지를 지킨다.
 *
 * 1. **공유 키 인증.** `X-POS-Key`를 상수시간으로 비교한다. 키가 설정돼 있지
 *    않으면 라우트가 아예 열리지 않는다 — 인증 없는 매출 주입은 정산을 조작하는
 *    길이 된다.
 * 2. **멱등.** POS 거래번호(`posTxId`)가 유일 인덱스다. 네트워크가 끊겨 같은
 *    전문을 다시 보내도 매출이 두 번 잡히지 않는다.
 * 3. **취소·환불은 반대 부호.** 기록을 지우지 않고 음수 행을 더한다. 원장에서
 *    지우면 "얼마 팔았다가 얼마 취소됐나"를 잃는다.
 *
 * 품목은 이름으로 찾는다. POS가 우리 내부 ID를 알 리 없다.
 *
 * `webhooks/` 아래 둔 이유는 토스 입금 웹훅과 같은 부류이기 때문이다 — 사람 세션이
 * 아니라 기계 자격으로 들어오는 문이고, 운영자 매장 게이트(operatorGate)가 걸리지
 * 않는다. route-auth.test.ts가 그 경로를 검사에서 빼는 것도 같은 이유다.
 *
 * **알려진 한계:** 키 하나가 모든 매장에 쓸 수 있다. 매장이 여럿인 상태로 POS를
 * 붙이려면 매장별 키(PosCredential)로 나눠야 한다. 지금은 매장이 적고 키가
 * 팀 내부에만 있어 감수한다.
 */

type IngestItem = {
  posTxId?: unknown;
  productName?: unknown;
  quantity?: unknown;
  amount?: unknown;
  soldAt?: unknown;
};

function keyOk(got: string | null): boolean {
  const expected = process.env.POS_INGEST_KEY ?? "";
  if (expected.length < 16 || !got) return false;
  // 길이가 다르면 timingSafeEqual이 던진다. 길이를 먼저 본다.
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!process.env.POS_INGEST_KEY) {
    // fail-closed. 키 없이 열어두면 누구나 매출을 만들어 정산을 흔들 수 있다.
    return NextResponse.json({ error: "POS 수집이 설정되지 않았습니다." }, { status: 503 });
  }
  if (!keyOk(req.headers.get("x-pos-key"))) {
    return NextResponse.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }

  let body: { projectId?: unknown; items?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const items = Array.isArray(body?.items) ? (body.items as IngestItem[]) : [];
  if (!projectId || items.length === 0) {
    return NextResponse.json(
      { error: "projectId와 items(1건 이상)가 필요합니다." },
      { status: 400 },
    );
  }
  if (items.length > 500) {
    return NextResponse.json({ error: "한 번에 500건까지 보낼 수 있습니다." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const products = await prisma.product.findMany({ select: { id: true, name: true } });
  const byName = new Map(products.map((p) => [p.name, p.id]));

  const rows: { posTxId: string; productId: string; quantity: number; amount: number; soldAt: Date }[] = [];
  for (const [i, raw] of items.entries()) {
    const posTxId = typeof raw.posTxId === "string" ? raw.posTxId.trim() : "";
    const productName = typeof raw.productName === "string" ? raw.productName.trim() : "";
    const quantity = typeof raw.quantity === "number" ? raw.quantity : NaN;
    const amount = typeof raw.amount === "number" ? raw.amount : NaN;

    if (!posTxId) {
      return NextResponse.json({ error: `items[${i}]: posTxId가 없습니다.` }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity === 0 || !Number.isInteger(amount)) {
      return NextResponse.json(
        { error: `items[${i}]: quantity(0이 아닌 정수)와 amount(정수)가 필요합니다.` },
        { status: 400 },
      );
    }
    // 판매는 양수, 취소·환불은 음수. 부호가 엇갈리면 어느 쪽이 맞는지 알 수 없다.
    if (Math.sign(quantity) !== Math.sign(amount) && amount !== 0) {
      return NextResponse.json(
        { error: `items[${i}]: quantity와 amount의 부호가 서로 다릅니다.` },
        { status: 400 },
      );
    }
    const productId = byName.get(productName);
    if (!productId) {
      return NextResponse.json(
        { error: `items[${i}]: 알 수 없는 품목 "${productName}"`, known: [...byName.keys()] },
        { status: 400 },
      );
    }
    let soldAt = new Date();
    if (raw.soldAt !== undefined) {
      const d = new Date(String(raw.soldAt));
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: `items[${i}]: invalid soldAt` }, { status: 400 });
      }
      soldAt = d;
    }
    rows.push({ posTxId, productId, quantity, amount, soldAt });
  }

  // skipDuplicates가 posTxId 유일 인덱스를 타고 재전송을 흡수한다.
  const result = await prisma.salesRecord.createMany({
    data: rows.map((r) => ({ ...r, projectId, channel: "pos" })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    received: rows.length,
    inserted: result.count,
    duplicates: rows.length - result.count,
  });
}
