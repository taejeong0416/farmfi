"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Field,
  PhotoSlot,
  Shell,
  SkeletonBlock,
  TextArea,
  TextInput,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getJson, postJson, shortDate, won } from "../api";

const DOC_TYPES = ["계약서", "견적서", "영수증", "세금계산서", "변경합의서"];

const SIGNAL_LABEL: Record<string, string> = {
  contract: "설비 계약서",
  receipt: "설비 영수증",
  photo: "현장 사진",
  iot: "센서 데이터",
};

type MilestoneDetail = {
  id: string;
  seq: number;
  name: string;
  status: string;
  releaseAmount: number;
  requiredSignals: string[];
  evidenceUrls: string[];
  evidenceNote: string | null;
  evidenceSubmittedAt: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  project: { id: string; name: string; location: string | null };
};

export function EvidenceSubmitScreen({ milestoneId }: { milestoneId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["milestone-evidence", milestoneId],
    queryFn: () =>
      getJson<{ milestone: MilestoneDetail }>(
        `/api/milestones/${milestoneId}/evidence`,
      ),
    select: (d) => d.milestone,
  });

  const [docType, setDocType] = useState("영수증");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [docNo, setDocNo] = useState("");
  const [note, setNote] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <Shell>
        <SkeletonBlock height={480} />
      </Shell>
    );
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: form,
          credentials: "include",
        });
        const body = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !body.url) throw new Error(body.error ?? "업로드 실패");
        uploaded.push(body.url);
      }
      setUrls((u) => [...u, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일 업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (urls.length === 0) {
      setError("증빙 파일을 한 개 이상 첨부해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const summary = [
        `문서 유형 ${docType}`,
        amount ? `금액 ${amount}` : null,
        date ? `일자 ${date}` : null,
        counterparty ? `상대방 ${counterparty}` : null,
        docNo ? `문서 번호 ${docNo}` : null,
        note.trim() || null,
      ]
        .filter(Boolean)
        .join(" · ");

      await postJson(`/api/milestones/${milestoneId}/evidence`, {
        urls,
        note: summary,
      });
      await refetch();
      router.push("/operator/milestones");
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const m = data;

  return (
    <Shell>
      <p className="text-12 text-muted">
        <Link href="/operator">운영자 포털</Link>
        <span className="mx-2 text-line">/</span>
        {m.project.name}
        <span className="mx-2 text-line">/</span>
        <span className="text-body">
          {m.seq}단계 {m.name}
        </span>
      </p>

      <div className="mt-6 flex items-start gap-8">
        {/* 왼쪽 · 필수 증빙 상태 */}
        <div className="w-[300px] shrink-0 space-y-8">
          <div>
            <h2 className="text-15 font-bold text-ink">필수 증빙</h2>
            <Card className="mt-4" padded={false}>
              <div className="px-4">
                {m.requiredSignals.map((s) => {
                  const done = m.evidenceUrls.length > 0;
                  return (
                    <div
                      key={s}
                      className="flex items-center justify-between border-b border-surface py-3.5 last:border-b-0"
                    >
                      <span className="text-13 text-ink">
                        {SIGNAL_LABEL[s] ?? s}
                      </span>
                      <span className="flex items-center gap-2">
                        <span
                          className={`h-[7px] w-[7px] rounded-full ${
                            done ? "bg-brand" : "bg-line"
                          }`}
                        />
                        <span
                          className={`text-12 ${done ? "font-medium text-brand" : "text-muted"}`}
                        >
                          {done ? "제출완료" : "제출 전"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {m.reviewNote ? (
            <div className="rounded-8 border border-line bg-surface px-4 py-4">
              <p className="text-12 font-medium text-danger">보완 요청 사유</p>
              <p className="mt-3 text-12 leading-5 text-body">{m.reviewNote}</p>
              <p className="mt-3 text-12 text-muted">
                {m.reviewedAt ? formatDate(m.reviewedAt) : ""}
              </p>
            </div>
          ) : null}

          <div>
            <h2 className="text-15 font-bold text-ink">제출 이력</h2>
            <Card className="mt-4" padded={false}>
              <div className="px-4">
                <div className="flex items-center justify-between border-b border-surface py-3">
                  <span className="text-12 text-ink">최근 제출</span>
                  <span className="text-12 text-muted">
                    {m.evidenceSubmittedAt
                      ? formatDate(m.evidenceSubmittedAt)
                      : "없음"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-12 text-body">재검토 판정</span>
                  <span className="text-12 text-muted">
                    {m.reviewedAt ? formatDate(m.reviewedAt) : "없음"}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* 오른쪽 · 제출 폼 */}
        <Card className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-12 text-muted">{m.project.name}</p>
              <h1 className="mt-2 text-22 font-bold text-ink">
                {m.seq}단계 {m.name} 증빙 제출
              </h1>
              <p className="mt-2 text-12 text-muted">
                집행 예정액 {won(m.releaseAmount)}
              </p>
            </div>
            <Button onClick={submit} disabled={busy}>
              {busy ? "처리 중" : "제출하기"}
            </Button>
          </div>

          <h3 className="mt-8 text-18 font-bold text-ink">문서 · 영수증</h3>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-4 flex h-[106px] w-full flex-col items-center justify-center rounded-10 border border-dashed border-line bg-surface"
          >
            <span className="text-14 font-medium text-brand">
              파일을 끌어다 놓거나 선택하세요
            </span>
            <span className="mt-1.5 text-12 text-muted">
              JPG · PNG · 1건당 8MB 이하
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => void upload(e.target.files)}
          />

          <p className="mt-6 text-12 text-muted">문서 유형</p>
          <div className="mt-2 flex gap-2">
            {DOC_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDocType(t)}
                className={`h-[34px] rounded-6 border px-3.5 text-12 ${
                  docType === t
                    ? "border-brand font-medium text-brand"
                    : "border-line text-body hover:bg-surface"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-4 rounded-8 border border-line p-5">
            <Field label="금액">
              <TextInput
                inputMode="numeric"
                placeholder="18,500,000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="일자">
              <TextInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="상대방">
              <TextInput
                placeholder="(주)그린테이블"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
              />
            </Field>
            <Field label="문서 번호">
              <TextInput
                placeholder="선택 입력"
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
              />
            </Field>
            <Field label="설명">
              <TextArea
                placeholder="검토자가 알아야 할 내용을 적어 주세요."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>

          <h3 className="mt-8 text-15 font-bold text-ink">첨부한 증빙</h3>
          <div className="mt-4 grid grid-cols-4 gap-3">
            {urls.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={u}
                src={u}
                alt={`첨부 ${i + 1}`}
                className="h-[122px] w-full rounded-8 border border-line object-cover"
              />
            ))}
            {m.evidenceUrls.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={u}
                src={u}
                alt={`기존 증빙 ${i + 1}`}
                className="h-[122px] w-full rounded-8 border border-line object-cover opacity-70"
              />
            ))}
            {urls.length + m.evidenceUrls.length === 0 ? (
              <PhotoSlot label="첨부 없음" className="h-[122px]" />
            ) : null}
          </div>

          {error ? <p className="mt-5 text-12 text-danger">{error}</p> : null}

          <p className="mt-6 text-12 text-muted">
            제출한 증빙은 검증 결과 확인 화면에서 판정과 근거를 볼 수 있습니다.
            마지막 제출 {m.evidenceSubmittedAt ? shortDate(m.evidenceSubmittedAt) : "없음"}.
          </p>
        </Card>
      </div>
    </Shell>
  );
}
