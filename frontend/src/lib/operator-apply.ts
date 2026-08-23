import { createHash } from "crypto";
import { prisma } from "@/lib/db";

/**
 * 운영 신청 단계 (명세 O-04 · O-05 · O-07).
 *
 * 방문 예약·교육 이수·계약 서명은 각자 상태를 가진다. 신청 행의 칸 하나로는
 * 예약을 바꾼 이력도, 어느 강의에서 멈췄는지도, 무엇에 서명했는지도 담을 수 없다.
 * 여기서는 세 갈래가 공통으로 쓰는 계산만 둔다.
 */

type Client = Pick<typeof prisma, "operatorCourse">;

/** 필수 교육 과정. 비중의 합이 100이라 전체 진도를 가중평균으로 낼 수 있다. */
export const DEFAULT_COURSES = [
  {
    code: "basics",
    title: "기초 교육",
    summary: "미니팜 구조, 재배 주기, 하루 운영 흐름",
    seq: 1,
    weight: 40,
    durationSec: 900,
  },
  {
    code: "safety",
    title: "안전·위생",
    summary: "설비 취급, 식품 위생 기준, 사고 대응",
    seq: 2,
    weight: 40,
    durationSec: 900,
  },
  {
    code: "completion",
    title: "수료 확인",
    summary: "운영 기준 점검과 수료 퀴즈",
    seq: 3,
    weight: 20,
    durationSec: 600,
  },
] as const;

export async function syncCourses(client: Client = prisma): Promise<number> {
  for (const c of DEFAULT_COURSES) {
    await client.operatorCourse.upsert({
      where: { code: c.code },
      update: {
        title: c.title,
        summary: c.summary,
        seq: c.seq,
        weight: c.weight,
        durationSec: c.durationSec,
        isActive: true,
      },
      create: { ...c },
    });
  }
  return DEFAULT_COURSES.length;
}

/**
 * 과정별 진도를 신청 한 건의 진도로 합친다.
 *
 * 신청 행의 `educationProgress`는 이제 파생값이다. 진행 표시줄과 개점 준비 현황이
 * 이미 그 값을 보고 있어 지우지 않고, 과정 진도가 바뀔 때마다 다시 계산해 넣는다.
 * 두 곳에 같은 사실이 있는 셈이지만, 화면마다 가중평균을 다시 계산하게 두는 것보다
 * 한 곳에서 갱신하는 쪽이 어긋날 여지가 적다.
 */
export async function rollUpEducation(applicationId: string): Promise<{
  progress: number;
  done: boolean;
}> {
  const courses = await prisma.operatorCourse.findMany({
    where: { isActive: true },
    select: { id: true, weight: true },
  });
  const totalWeight = courses.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return { progress: 0, done: false };

  const rows = await prisma.operatorCourseProgress.findMany({
    where: { applicationId, courseId: { in: courses.map((c) => c.id) } },
    select: { courseId: true, progress: true },
  });
  const byCourse = new Map(rows.map((r) => [r.courseId, r.progress]));

  const weighted = courses.reduce(
    (s, c) => s + (byCourse.get(c.id) ?? 0) * c.weight,
    0,
  );
  const progress = Math.round(weighted / totalWeight);
  const done = courses.every((c) => (byCourse.get(c.id) ?? 0) >= 100);

  const application = await prisma.operatorApplication.findUnique({
    where: { id: applicationId },
    select: { status: true, educationDoneAt: true },
  });

  await prisma.operatorApplication.update({
    where: { id: applicationId },
    data: {
      educationProgress: progress,
      // 한 번 수료한 뒤에 과정이 늘어도 수료 시각을 지우지 않는다.
      educationDoneAt: done ? (application?.educationDoneAt ?? new Date()) : null,
      status: done ? "education" : (application?.status ?? "docs"),
    },
  });

  return { progress, done };
}

/**
 * 계약서 본문. 확정된 공간·기간·정산 기준을 그대로 적는다.
 * 본문이 곧 서명 대상이므로 화면 문구가 아니라 여기서 만든다.
 */
export function buildContractBody(input: {
  operatorName: string;
  region: string;
  spaceName: string | null;
  termStart: Date;
  termEnd: Date;
}): string {
  const d = (v: Date) => v.toISOString().slice(0, 10);
  return [
    "FarmFi 운영 계약서",
    "",
    `운영자: ${input.operatorName}`,
    `운영 지역: ${input.region}`,
    `운영 공간: ${input.spaceName ?? "배정 예정"}`,
    `운영 기간: ${d(input.termStart)} ~ ${d(input.termEnd)}`,
    "",
    "제1조(목적) 이 계약은 FarmFi가 배정한 지점에서 운영자가 재배·판매·픽업 운영을",
    "수행하는 조건을 정한다.",
    "",
    "제2조(운영 기준) 운영자는 교육 과정에서 정한 재배·위생·안전 기준을 지킨다.",
    "설비 이상과 생육 이상은 확인 즉시 기록하고 보고한다.",
    "",
    "제3조(정산) 매출과 비용은 월 단위로 확정하고, 확정된 값에 정산 규칙을 적용해",
    "운영자 몫을 지급한다. 확정 전 값은 정산에 쓰지 않는다.",
    "",
    "제4조(증빙) 단계별 자금 집행은 사전에 정한 증빙이 승인된 뒤에만 이뤄진다.",
    "",
    "제5조(중도 해지) 어느 쪽이든 30일 전에 통지하고 인수인계를 마친 뒤 해지할 수 있다.",
    "교육·안전점검이 만료되거나 중대한 위반이 확인되면 운영 자격이 정지된다.",
    "",
    "제6조(효력) 이 계약은 전자서명이 완료된 시점부터 효력이 생긴다.",
  ].join("\n");
}

export function hashContract(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/** 지금 진행 중인 내 신청. 목록이 최신순이라 첫 건이다. */
export async function getMyApplication(userId: string) {
  return prisma.operatorApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
