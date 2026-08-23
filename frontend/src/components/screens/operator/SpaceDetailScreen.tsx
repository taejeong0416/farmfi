"use client";

import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InfoRow,
  PhotoSlot,
  Shell,
  SkeletonBlock,
} from "@/components/ui";
import {
  SPACE_STATUS_LABEL,
  SPACE_TYPE_LABEL,
  useAvailableSpaces,
  won,
} from "../api";

const PREP_STEPS = [
  { seq: 1, title: "공간 협약", note: "지자체·소유자와 사용 협약" },
  { seq: 2, title: "리모델링", note: "일정 확정 후 착공" },
  { seq: 3, title: "스마트팜 설비", note: "설비 자금 모집" },
  { seq: 4, title: "운영자 매칭", note: "지금 신청할 수 있어요" },
];

export function SpaceDetailScreen({ id }: { id: string }) {
  const { data: spaces, isLoading } = useAvailableSpaces();

  if (isLoading) {
    return (
      <Shell>
        <SkeletonBlock height={480} />
      </Shell>
    );
  }

  const space = (spaces ?? []).find((s) => s.id === id);
  if (!space) {
    return (
      <Shell>
        <EmptyState
          title="공간을 찾을 수 없습니다"
          desc="목록에서 다시 선택해 주세요."
          action={<Button href="/operator/spaces">공간 목록</Button>}
        />
      </Shell>
    );
  }

  const openForApply = space.status === "approved";

  return (
    <Shell>
      <Link href="/operator/spaces" className="text-13 font-medium text-brand">
        ← 공간 목록
      </Link>

      <div className="mt-5 flex items-center gap-3">
        <h1 className="text-28 font-bold text-ink">{space.address}</h1>
        <Badge tone={openForApply ? "pass" : "plain"}>
          {SPACE_STATUS_LABEL[space.status] ?? space.status}
        </Badge>
      </div>
      <p className="mt-3 text-14 text-body">
        {SPACE_TYPE_LABEL[space.spaceType] ?? space.spaceType} · {space.area} ·
        희망 조건 {space.preferredMode}
      </p>

      <div className="mt-7 flex items-start gap-8">
        <div className="flex-1">
          <PhotoSlot
            label="공간 사진"
            src="/assets/farm-building-indoor.png"
            className="h-[330px] w-full rounded-10"
          />

          <h2 className="mt-8 text-20 font-semibold text-ink">
            이 공간은 여기까지 준비됐어요
          </h2>
          <div className="mt-4 grid grid-cols-4 gap-4">
            {PREP_STEPS.map((s) => {
              const done = openForApply ? s.seq <= 3 : s.seq <= 2;
              return (
                <div
                  key={s.seq}
                  className="rounded-12 border border-line bg-white px-5 py-5"
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-11 font-medium ${
                      done
                        ? "bg-brand-soft text-brand"
                        : "bg-surface text-muted"
                    }`}
                  >
                    {s.seq}
                  </span>
                  <p className="mt-4 text-14 font-bold text-ink">{s.title}</p>
                  <p className="mt-2 text-12 font-medium text-body">
                    {done ? "완료" : s.seq === 4 && openForApply ? "신청 가능" : "예정"}
                  </p>
                  <p className="mt-2 text-11 text-muted">{s.note}</p>
                </div>
              );
            })}
          </div>

          <Card className="mt-8 flex items-center justify-between rounded-14">
            <div>
              <p className="text-15 font-semibold text-ink">공간을 선택하기 전에</p>
              <p className="mt-2 text-13 text-muted">
                현장 방문을 예약하면 전력·급수 조건, 운영 동선, 주변 상권을 직접 확인할 수 있어요.
              </p>
            </div>
            <Button variant="secondary" href={`/operator/apply/visit?space=${space.id}`}>
              현장 방문 예약
            </Button>
          </Card>
        </div>

        <Card className="w-[444px] shrink-0 rounded-14">
          <h2 className="text-17 font-bold text-ink">운영 조건</h2>
          <div className="mt-5">
            <InfoRow label="전력" value={space.electricity} />
            <InfoRow label="급수" value={space.water} />
            <InfoRow label="채광" value={space.lighting} />
            <InfoRow label="면적" value={space.area} />
            <InfoRow
              label="스마트팜 적합도"
              value={
                space.suitabilityScore != null
                  ? `${space.suitabilityScore}점`
                  : "-"
              }
            />
            <InfoRow
              label="예상 월 임대"
              value={space.estimatedRent ? won(space.estimatedRent) : "-"}
            />
          </div>

          <div className="mt-6 rounded-10 bg-brand-soft px-5 py-4">
            <p className="text-12 font-medium text-brand">
              수익은 실제 매출과 운영비에 따라 달라져요.
            </p>
            <p className="mt-2 text-11 text-body">
              표준안은 일 40봉 판매 기준입니다.
            </p>
          </div>

          <div className="mt-6">
            <Button
              full
              disabled={!openForApply}
              href={openForApply ? `/operator/apply?space=${space.id}` : undefined}
            >
              이 공간에 운영 신청하기
            </Button>
          </div>
          <p className="mt-3 text-center text-11 text-muted">
            신청 후 자격 확인과 교육 일정이 이어집니다.
          </p>
        </Card>
      </div>
    </Shell>
  );
}
