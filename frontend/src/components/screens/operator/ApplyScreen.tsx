"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Field,
  PanelShell,
  Select,
  TextInput,
} from "@/components/ui";
import { useAuth } from "@/lib/useAuth";
import {
  patchApplication,
  postJson,
  useOperatorApplication,
  type OperatorApplication,
} from "../api";
import { ApplyStepLine } from "./ApplyStepLine";

const REQUIREMENTS = [
  { key: "business", label: "사업자 등록", doc: "사업자등록증" },
  { key: "identity", label: "대표자 실명 확인", doc: "모바일 신분증 확인" },
  { key: "history", label: "스마트팜 운영 이력", doc: "운영 실적 자료" },
  { key: "education", label: "교육 이수", doc: "교육 이수증" },
  { key: "tax", label: "세무 신고", doc: "국세 납세증명서" },
  { key: "insurance", label: "배상 책임보험", doc: "보험 가입증명서" },
];

const HOURS = ["주 10시간 이하", "주 10~20시간", "주 20~30시간", "주 30시간 이상"];

export function ApplyScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const spaceId = params?.get("space") ?? null;
  const { user } = useAuth();
  const { data: application, refetch } = useOperatorApplication();
  const fileRef = useRef<HTMLInputElement>(null);

  const [region, setRegion] = useState("");
  const [cropExperience, setCropExperience] = useState("");
  const [availableHours, setAvailableHours] = useState(HOURS[1]);
  const [documents, setDocuments] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!application) return;
    setRegion(application.region);
    setCropExperience(application.cropExperience);
    setAvailableHours(application.availableHours);
    setDocuments(application.documents);
  }, [application]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const urls: string[] = [];
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
        urls.push(body.url);
      }
      setDocuments((d) => [...d, ...urls]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일 업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let app: OperatorApplication | null = application ?? null;
      if (!app) {
        const created = await postJson<{ application: OperatorApplication }>(
          "/api/operator-applications",
          { region, cropExperience, availableHours },
        );
        app = created.application;
      }
      await patchApplication(app.id, {
        step: "docs",
        documents,
        spaceId,
      });
      await refetch();
      router.push("/operator/apply/visit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const met = [
    Boolean(region),
    Boolean(user?.identityVerified),
    Boolean(cropExperience),
    Boolean(application?.educationDoneAt),
    documents.length > 0,
    documents.length > 1,
  ].filter(Boolean).length;

  return (
    <PanelShell>
      <ApplyStepLine application={application ?? null} current="docs" />

      <h1 className="text-24 font-bold text-ink">운영 자격을 확인해요</h1>
      <p className="mt-3 text-14 text-body">
        {user?.name ?? "운영자"} · 신청 요건 6가지 중 {met}가지를 채웠습니다.
      </p>

      <Card className="mt-6" padded={false}>
        <div className="grid grid-cols-3">
          <Cell label="심사 상태" value={application ? "검토 중" : "작성 중"} />
          <Cell label="충족 요건" value={`${met} / 6`} bordered />
          <Cell label="인증 유효기간" value="2년" bordered />
        </div>
      </Card>

      <h2 className="mt-8 text-14 font-bold text-ink">자격 요건</h2>
      <Card className="mt-4" padded={false}>
        <div className="px-6">
          {REQUIREMENTS.map((r, i) => {
            const ok = i < met;
            return (
              <div
                key={r.key}
                className="flex items-center justify-between border-b border-surface py-3.5 last:border-b-0"
              >
                <span className="text-12 text-ink">{r.label}</span>
                <span className="flex items-center gap-6">
                  <span className="text-12 text-body">{r.doc}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-[7px] w-[7px] rounded-full ${ok ? "bg-brand" : "bg-line"}`}
                    />
                    <span
                      className={`w-[56px] text-12 ${ok ? "font-medium text-brand" : "text-muted"}`}
                    >
                      {ok ? "제출완료" : "확인 전"}
                    </span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {application?.reviewNote ? (
        <div className="mt-5 rounded-8 border border-line bg-surface px-5 py-4">
          <p className="text-12 font-medium text-danger">보완 요청 사유</p>
          <p className="mt-2 text-12 leading-5 text-body">
            {application.reviewNote}
          </p>
        </div>
      ) : null}

      <h2 className="mt-8 text-14 font-bold text-ink">신청 정보</h2>
      <div className="mt-4 space-y-4">
        <Field label="희망 운영 지역">
          <TextInput
            placeholder="부산 부산진구"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        </Field>
        <Field label="작물 재배 경험">
          <TextInput
            placeholder="엽채류 스마트팜 2년"
            value={cropExperience}
            onChange={(e) => setCropExperience(e.target.value)}
          />
        </Field>
        <Field label="주간 투입 가능 시간">
          <Select
            value={availableHours}
            onChange={(e) => setAvailableHours(e.target.value)}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <h2 className="mt-8 text-14 font-bold text-ink">서류 제출</h2>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="mt-4 flex h-[90px] w-full flex-col items-center justify-center rounded-10 border border-dashed border-line bg-surface"
      >
        <span className="text-13 font-medium text-brand">
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

      {documents.length > 0 ? (
        <Card className="mt-4" padded={false}>
          <div className="px-5">
            {documents.map((d, i) => (
              <div
                key={d}
                className="flex items-center justify-between border-b border-surface py-3 last:border-b-0"
              >
                <span className="text-12 text-ink">제출 서류 {i + 1}</span>
                <span className="text-12 text-brand">첨부됨</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

      <div className="mt-7">
        <Button
          full
          disabled={busy || !region || !cropExperience}
          onClick={submit}
        >
          {busy ? "처리 중" : "자격 심사 요청"}
        </Button>
      </div>

      <p className="mt-5 text-12 text-muted">
        자격 인증은 승인일로부터 2년간 유효하며 만료 60일 전에 갱신 안내가 발송됩니다.
      </p>
    </PanelShell>
  );
}

function Cell({
  label,
  value,
  bordered,
}: {
  label: string;
  value: string;
  bordered?: boolean;
}) {
  return (
    <div className={`px-6 py-5 ${bordered ? "border-l border-line-soft" : ""}`}>
      <p className="text-13 text-muted">{label}</p>
      <p className="mt-1.5 font-num text-20 font-medium text-ink">{value}</p>
    </div>
  );
}
