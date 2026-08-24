"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Field,
  Shell,
  Select,
  TextInput,
} from "@/components/ui";
import { useAuth } from "@/lib/useAuth";
import {
  patchApplication,
  postJson,
  shortDate,
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

  /** 심사 요청 없이 지금까지 쓴 것만 남긴다 (`.fig` O-03 `임시 저장`). */
  async function saveDraft() {
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
      await patchApplication(app.id, { documents, spaceId });
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
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

  // 요건마다 따로 본다. 개수만 세어 앞에서부터 채우면 실제로 낸 서류와 어긋난다.
  const state: Record<string, { ok: boolean; label: string }> = {
    business: {
      ok: documents.length > 0,
      label: documents.length > 0 ? "제출 완료" : "확인 전",
    },
    identity: {
      ok: Boolean(user?.identityVerified),
      label: user?.identityVerified ? "확인 완료" : "확인 전",
    },
    history: {
      ok: Boolean(cropExperience),
      label: cropExperience ? "제출 완료" : "확인 전",
    },
    education: {
      ok: Boolean(application?.educationDoneAt),
      label: application?.educationDoneAt
        ? "제출 완료"
        : application?.reviewNote
          ? "보완 요청"
          : "확인 전",
    },
    tax: {
      ok: documents.length > 1,
      label: documents.length > 1 ? "제출 완료" : "확인 전",
    },
    insurance: {
      ok: documents.length > 2,
      label: documents.length > 2 ? "제출 완료" : "확인 전",
    },
  };
  const met = Object.values(state).filter((v) => v.ok).length;

  // `.fig` O-03 Review Timeline — 네 칸이 고정이고 상태만 바뀐다.
  const timeline = [
    {
      at: application ? shortDate(application.createdAt) : null,
      title: "신청 접수",
      note: application ? "통과" : "예정",
      tone: application ? "pass" : "idle",
    },
    {
      at: application?.reviewNote ? shortDate(application.createdAt) : null,
      title: "서류 확인",
      note: application?.reviewNote ? "보완 요청" : met === 6 ? "통과" : "예정",
      tone: application?.reviewNote ? "fail" : met === 6 ? "pass" : "idle",
      desc: application?.reviewNote ? "보완 제출 시 심사가 이어집니다" : undefined,
    },
    {
      at: null,
      title: "운영 이력 검토",
      note: application?.visitDoneAt ? "통과" : "예정",
      tone: application?.visitDoneAt ? "pass" : "idle",
    },
    {
      at: null,
      title: "자격 승인",
      note: application?.confirmedAt ? "통과" : "예정",
      tone: application?.confirmedAt ? "pass" : "idle",
    },
  ];

  return (
    <Shell>
      <ApplyStepLine application={application ?? null} current="docs" />

      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-24 font-bold text-ink">운영 자격을 인증해주세요</h1>
          <p className="mt-3 text-14 text-body">
            자격 요건을 확인하고 보완 서류를 제출해주세요.
          </p>
          <p className="mt-2 text-12 text-muted">
            {user?.name ?? "운영자"} · 신청 요건 6가지 중 {met}가지를 채웠습니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveDraft()}
            className="h-[37px] rounded-6 border border-line px-4 text-11 font-medium text-ink hover:bg-surface disabled:opacity-50"
          >
            임시 저장
          </button>
          <button
            type="button"
            disabled={busy || !region || !cropExperience}
            onClick={() => void submit()}
            className="h-8 rounded-6 bg-brand px-4 text-11 font-medium text-white disabled:opacity-50"
          >
            자격 심사 요청
          </button>
        </div>
      </div>

      {/* `.fig` O-03 Content — 658 두 열. 왼쪽은 자격, 오른쪽은 심사와 제출. */}
      <div className="mt-6 flex items-start gap-4">
        <div className="flex-1">
          <Card padded={false}>
            <div className="grid grid-cols-3">
              <Cell label="심사 상태" value={application ? "검토 중" : "작성 중"} />
              <Cell label="충족 요건" value={`${met} / 6`} bordered />
              <Cell label="인증 유효기간" value="2년" bordered />
            </div>
          </Card>

          <h2 className="mt-8 text-14 font-medium text-ink">자격 요건</h2>
          <Card className="mt-4" padded={false}>
            <div className="px-6">
              <div className="grid grid-cols-[140px_1fr_100px] border-b border-surface py-3.5 text-12 text-muted">
                <span>요건</span>
                <span>제출 서류</span>
                <span>상태</span>
              </div>
              {REQUIREMENTS.map((r) => {
                const st = state[r.key];
                const bad = st.label === "보완 요청";
                return (
                  <div
                    key={r.key}
                    className="grid grid-cols-[140px_1fr_100px] items-center border-b border-surface py-3.5 last:border-b-0"
                  >
                    <span className="text-12 text-ink">{r.label}</span>
                    <span className="text-12 text-body">{r.doc}</span>
                    <span className="flex items-center gap-2">
                      <span
                        className={`h-[7px] w-[7px] rounded-full ${
                          bad ? "bg-danger" : st.ok ? "bg-brand" : "bg-muted"
                        }`}
                      />
                      <span
                        className={`text-11 font-medium ${
                          bad ? "text-danger" : st.ok ? "text-brand" : "text-body"
                        }`}
                      >
                        {st.label}
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

        </div>

        <div className="flex-1">
          <h2 className="text-14 font-medium text-ink">심사 진행</h2>
          <Card className="mt-4" padded={false}>
            <div className="px-6 py-2">
              {timeline.map((t) => (
                <div key={t.title} className="flex gap-4 py-3.5">
                  <span
                    className={`mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full border ${
                      t.tone === "pass"
                        ? "border-brand bg-brand"
                        : t.tone === "fail"
                          ? "border-muted bg-white"
                          : "border-line bg-white"
                    }`}
                  />
                  <div>
                    <p className="text-12 text-muted">{t.at ?? "—"}</p>
                    <p className="mt-0.5">
                      <span
                        className={`text-14 font-medium ${t.tone === "idle" ? "text-body" : "text-ink"}`}
                      >
                        {t.title}
                      </span>
                      <span
                        className={`ml-1.5 text-12 font-medium ${
                          t.tone === "fail"
                            ? "text-danger"
                            : t.tone === "pass"
                              ? "text-brand"
                              : "text-muted"
                        }`}
                      >
                        · {t.note}
                      </span>
                    </p>
                    {t.desc ? (
                      <p className="mt-1 text-12 text-muted">{t.desc}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <h2 className="mt-8 text-14 font-medium text-ink">보완 서류 제출</h2>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-4 flex h-[90px] w-full flex-col items-center justify-center rounded-10 border border-dashed border-line bg-surface"
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

          {documents.length > 0 ? (
            <Card className="mt-4" padded={false}>
              <div className="px-5">
                {documents.map((d, i) => (
                  <div
                    key={d}
                    className="flex items-center justify-between border-b border-surface py-3 last:border-b-0"
                  >
                    <span className="text-12 text-ink">
                      {decodeURIComponent(d.split("/").pop() ?? `제출 서류 ${i + 1}`)}
                    </span>
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

          <p className="mt-5 text-12 leading-5 text-muted">
            자격 인증은 승인일로부터 2년간 유효하며 만료 60일 전에 갱신 안내가 발송됩니다.
            <br />
            인증이 없으면 프로젝트 등록과 마일스톤 집행 신청을 할 수 없습니다.
          </p>
        </div>
      </div>
    </Shell>
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
