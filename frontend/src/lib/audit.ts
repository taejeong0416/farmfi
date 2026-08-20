// 감사 추적 (명세 2.5) — 청약·검증·집행·정산·권한 변경 등 핵심 이벤트를 남긴다.
//
// 설계 두 가지:
// ① 실패해도 본 작업을 깨지 않는다. 감사 기록은 부수 효과이므로 여기서 던진 예외가
//    청약이나 트랜치 집행을 롤백시키면 안 된다 (기록보다 거래가 우선).
// ② 트랜잭션 클라이언트를 받을 수 있다. 트랜잭션 안에서 남기고 싶으면 tx를 넘긴다.
//    이때는 예외를 삼키지 않는다 — 트랜잭션 안에서 삼키면 롤백 상태가 꼬인다.

import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export type AuditActorRole =
  | "investor"
  | "operator"
  | "landlord"
  | "admin"
  | "auditor"
  | "system";

/** 남기는 이벤트 종류. 화면 필터의 선택지가 이 목록이다. */
export const AUDIT_ACTIONS = [
  "subscription.created",
  "milestone.evidence.submitted",
  "milestone.evidence.approved",
  "milestone.evidence.revision_requested",
  "milestone.verified",
  "milestone.rejected",
  "milestone.completed",
  "milestone.timeout",
  "appeal.submitted",
  "appeal.commented",
  "appeal.decided",
  "dividend.distributed",
  "settlement_rule.updated",
  "payout.scheduled",
  "payout.processed",
  "project.status_changed",
  "pickup.completed",
  "user.role_changed",
  "project.refunded",
  "notification.sent",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: AuditActorRole | null;
  action: AuditAction;
  entityType:
    | "project"
    | "milestone"
    | "dividend"
    | "payout"
    | "appeal"
    | "settlement_rule"
    | "pickup"
    | "user";
  entityId?: string | null;
  projectId?: string | null;
  summary: string;
  detail?: Prisma.InputJsonValue;
}

type Client = Pick<typeof prisma, "auditLog">;

/**
 * 감사 로그 한 줄을 남긴다.
 *
 * @param entry 남길 이벤트
 * @param tx 트랜잭션 안에서 기록할 경우의 트랜잭션 클라이언트. 넘기면 실패가 전파된다.
 */
export async function recordAudit(entry: AuditEntry, tx?: Client): Promise<void> {
  const data = {
    actorId: entry.actorId ?? null,
    actorRole: entry.actorRole ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    projectId: entry.projectId ?? null,
    summary: entry.summary,
    ...(entry.detail === undefined ? {} : { detail: entry.detail }),
  };

  if (tx) {
    await tx.auditLog.create({ data });
    return;
  }

  try {
    await prisma.auditLog.create({ data });
  } catch (error) {
    // 기록 실패가 본 작업을 되돌리지 않게 한다 (설계 ①).
    console.error("recordAudit failed:", entry.action, error);
  }
}
