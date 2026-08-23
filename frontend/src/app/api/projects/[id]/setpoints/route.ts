import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { guardProject } from "@/lib/operator-scope";
import { recordAudit } from "@/lib/audit";
import { applyEnvelope, type EnvelopeDecision } from "@/lib/setpoint-envelope";
import { analyzeGrowthRecipe } from "@/lib/growth-recipe";
import { generateObservations, LEAFY_SPEC } from "@/lib/growth-recipe-synth";
import { buildObservations } from "@/lib/growth-observations";
import { cropKeyFor } from "@/lib/crop-profiles";

/**
 * 설정점 적용 (Phase W2).
 *
 * 학습된 레시피 산출을 **결정론적 봉투**에 통과시켜 적용값을 정한다.
 * 규칙이 먼저 판단하고, 학습은 규칙이 허용한 범위를 넓히지 못한다.
 *
 * 이 값이 설비 운전점이 되고 → IoT 가동률이 되고 → 마일스톤 2·4단계 판정이 되고
 * → 트랜치 집행으로 이어진다. 그래서 마지막 결정은 규칙이 갖는다.
 */

/** 직전 적용값 — 변화폭은 산출값이 아니라 실제 운전점 기준이어야 한다. */
async function lastApplied(projectId: string): Promise<Record<string, number>> {
  const prev = await prisma.setpointApplication.findFirst({
    where: { projectId },
    orderBy: { appliedAt: "desc" },
  });
  if (!prev) return {};
  const rows = prev.decisions as unknown as EnvelopeDecision[];
  return Object.fromEntries(rows.map((d) => [d.feature, d.applied]));
}

/**
 * 반응표면을 적합하려면 계수 수보다 관측이 넉넉히 많아야 한다. 6요인 설계행렬은
 * 주효과 6 + 이차 6 + 교호 15 = 27열이라, 이보다 적은 사이클로 적합하면 잔차가
 * 0이 되고 R²가 1이 나온다 — 아무것도 학습하지 못했는데 완벽해 보인다.
 */
const MIN_MEASURED_CYCLES = 30;

/**
 * 학습 입력을 고른다. 실 수확·환경이 충분히 쌓인 매장은 그 관측으로 학습하고,
 * 아직 모자란 매장은 합성 관측으로 파이프라인을 돌린다.
 *
 * **어느 쪽을 썼는지 응답에 싣는다.** 합성으로 낸 설정점을 실측인 줄 알고 설비에
 * 넣으면, 그 매장에서 한 번도 관측되지 않은 값이 운전점이 된다.
 */
async function buildProposal(projectId: string, cropKey: string, areaSqm?: number | null) {
  const measured = await buildObservations(projectId, areaSqm);

  const useMeasured = measured.cycles >= MIN_MEASURED_CYCLES;
  let observations = measured.observations;
  if (!useMeasured) {
    // 시드를 프로젝트 id에서 유도해 같은 매장은 같은 관측을 본다(재현 가능).
    const seed = [...projectId].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 100000, 7);
    observations = generateObservations(LEAFY_SPEC, 60, seed, cropKey).observations;
  }

  const recipe = analyzeGrowthRecipe(observations, { cropKey });
  const baseline = await lastApplied(projectId);
  return {
    recipe,
    envelope: applyEnvelope(recipe, { cropKey, baseline }),
    input: {
      source: useMeasured ? ("measured" as const) : ("synthetic" as const),
      measuredCycles: measured.cycles,
      minCycles: MIN_MEASURED_CYCLES,
      ecCoverage: measured.ecCoverage,
      droppedFeatures: useMeasured ? measured.droppedFeatures : [],
      skippedNoEnvironment: measured.skippedNoEnvironment,
    },
  };
}

// GET — 지금 적용하면 어떤 값이 되는지 미리 본다. 아무것도 바꾸지 않는다.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const { id } = await params;
  const denied = await guardProject(session, id);
  if (denied) return denied;

  const cropKey = request.nextUrl.searchParams.get("crop") ?? cropKeyFor();
  const project = await prisma.project.findUnique({
    where: { id },
    select: { areaSqm: true },
  });
  const { recipe, envelope, input } = await buildProposal(id, cropKey, project?.areaSqm);
  const history = await prisma.setpointApplication.findMany({
    where: { projectId: id },
    orderBy: { appliedAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    envelope,
    surface: recipe.surface,
    samples: recipe.samples,
    modelR2: recipe.modelR2,
    // 관측의 출처를 숨기지 않는다. 합성으로 낸 값이 실측으로 보고되면 안 된다.
    observationSource: input.source,
    input,
    history,
  });
}

// POST — 적용한다. 산출값과 적용값을 함께 남긴다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const { id } = await params;
  const denied = await guardProject(session, id);
  if (denied) return denied;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // 본문 없이 부르면 기본 품종
  }
  const cropKey =
    typeof (body as { cropKey?: unknown } | null)?.cropKey === "string"
      ? ((body as { cropKey: string }).cropKey)
      : cropKeyFor();

  const project = await prisma.project.findUnique({
    where: { id },
    select: { areaSqm: true },
  });
  const { recipe, envelope, input } = await buildProposal(id, cropKey, project?.areaSqm);

  // 하나도 채택되지 않았다면 적용할 이유가 없다. 기록만 남기고 끝내면
  // "적용했다"는 잘못된 인상을 준다.
  if (!envelope.anyApplied) {
    return NextResponse.json(
      { error: envelope.note, envelope, applied: false },
      { status: 400 },
    );
  }

  const saved = await prisma.setpointApplication.create({
    data: {
      projectId: id,
      cropKey: envelope.cropKey,
      decisions: envelope.decisions as unknown as object[],
      adjusted: envelope.adjusted,
      surface: recipe.surface,
      samples: recipe.samples,
      // 관측 출처를 적용 기록에 남긴다. 나중에 "이 설정점이 무엇을 보고 나온
      // 값이냐"를 물을 때, 합성으로 낸 건인지 여기서만 갈린다.
      note: `${envelope.note} · 관측 ${input.source === "measured" ? `실측 ${input.measuredCycles}사이클` : "합성"}`,
      appliedById: session.userId,
    },
  });

  await recordAudit({
    actorId: session.userId,
    actorRole: session.role,
    action: "setpoint.applied",
    entityType: "project",
    entityId: id,
    projectId: id,
    summary: `설정점 적용 · ${envelope.decisions.length}개 중 ${envelope.adjusted}개를 규칙이 조정`,
    detail: {
      decisions: envelope.decisions as unknown as object[],
      surface: recipe.surface,
      input,
    },
  });

  return NextResponse.json({ applied: true, application: saved, envelope, input });
}
