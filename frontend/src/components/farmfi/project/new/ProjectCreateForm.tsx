"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Field } from "@/components/FarmFi";
import { formatKRW } from "@/lib/format";
import { createProject } from "./api";
import { MilestoneEditor } from "./MilestoneEditor";
import {
  DEFAULT_MILESTONES,
  INITIAL_FORM_STATE,
  type MilestoneDraft,
  type ProjectFormState,
} from "./types";

function parsePositiveNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parsePositiveInt(raw: string): number | null {
  const n = parsePositiveNumber(raw);
  if (n === null || !Number.isInteger(n)) return null;
  return n;
}

export function ProjectCreateForm() {
  const router = useRouter();
  const [form, setForm] = useState<ProjectFormState>(INITIAL_FORM_STATE);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(DEFAULT_MILESTONES);
  const [formError, setFormError] = useState<string | null>(null);

  const updateField = (key: keyof ProjectFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateMilestone = (seq: number, patch: Partial<MilestoneDraft>) => {
    setMilestones((prev) => prev.map((m) => (m.seq === seq ? { ...m, ...patch } : m)));
  };

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (data) => {
      router.push(`/projects/${data.project.id}`);
    },
  });

  const tokenPriceNum = Number(form.tokenPrice) || 0;
  const totalTokensNum = Number(form.totalTokens) || 0;
  const targetAmountNum = Number(form.targetAmount) || 0;
  const maxRaise = tokenPriceNum * totalTokensNum;

  const pctSum = useMemo(
    () => milestones.reduce((sum, m) => sum + (Number.isFinite(m.releasePct) ? m.releasePct : 0), 0),
    [milestones],
  );

  const handleSubmit = () => {
    setFormError(null);

    const name = form.name.trim();
    const tokenSymbol = form.tokenSymbol.trim().toUpperCase();
    const tokenPrice = parsePositiveInt(form.tokenPrice);
    const totalTokens = parsePositiveInt(form.totalTokens);
    const targetAmount = parsePositiveInt(form.targetAmount);
    const areaSqm = form.areaSqm.trim() === "" ? null : parsePositiveNumber(form.areaSqm);

    if (!name) {
      setFormError("프로젝트명을 입력해주세요.");
      return;
    }
    if (!tokenSymbol) {
      setFormError("토큰 심볼을 입력해주세요.");
      return;
    }
    if (tokenPrice === null) {
      setFormError("토큰 가격은 0보다 큰 숫자로 입력해주세요.");
      return;
    }
    if (totalTokens === null) {
      setFormError("총 토큰 수는 0보다 큰 정수로 입력해주세요.");
      return;
    }
    if (targetAmount === null) {
      setFormError("모집 목표 금액은 0보다 큰 숫자로 입력해주세요.");
      return;
    }
    if (form.areaSqm.trim() !== "" && areaSqm === null) {
      setFormError("면적은 0보다 큰 숫자로 입력해주세요.");
      return;
    }
    if (targetAmount > tokenPrice * totalTokens) {
      setFormError("모집 목표 금액을 토큰가격 × 총 토큰 수 이하로 맞추면 개설할 수 있어요.");
      return;
    }
    if (pctSum !== 100) {
      setFormError(`마일스톤 집행비율 합계를 100%로 맞추면 개설할 수 있어요 (현재 ${pctSum}%).`);
      return;
    }
    for (const m of milestones) {
      if (!m.name.trim()) {
        setFormError(`마일스톤 ${m.seq}단계 이름을 입력해주세요.`);
        return;
      }
      if (m.requiredSignals.length === 0) {
        setFormError(`마일스톤 ${m.seq}단계는 검증 신호를 1개 이상 선택하면 자동 검증할 수 있어요.`);
        return;
      }
      if (m.requiredSignals.includes("iot") && m.iotMinDays <= 0) {
        setFormError(`마일스톤 ${m.seq}단계는 IoT 최소 가동일수를 입력하면 자동 검증할 수 있어요.`);
        return;
      }
    }

    mutation.mutate({
      name,
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      buildingType: form.buildingType.trim() || null,
      areaSqm,
      tokenSymbol,
      tokenPrice,
      totalTokens,
      targetAmount,
      milestones,
    });
  };

  return (
    <div className="form-grid">
      <article className="card form-panel">
        <h2>프로젝트 기본 정보</h2>
        <div className="field-grid" style={{ marginTop: 22 }}>
          <Field
            label="프로젝트명"
            control={
              <input
                className="fake-control"
                style={{ width: "100%", font: "inherit" }}
                placeholder="예: 금정구 미니팜 1호"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            }
          />
          <Field
            label="설명"
            control={
              <textarea
                className="fake-control"
                style={{ width: "100%", font: "inherit", minHeight: 72, resize: "vertical" }}
                placeholder="프로젝트 소개, 작물, 설비 등을 입력해주세요"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
              />
            }
          />
          <Field
            label="위치"
            control={
              <input
                className="fake-control"
                style={{ width: "100%", font: "inherit" }}
                placeholder="예: 부산 금정구 장전동"
                value={form.location}
                onChange={(e) => updateField("location", e.target.value)}
              />
            }
          />
          <Field
            label="건물 유형"
            control={
              <input
                className="fake-control"
                style={{ width: "100%", font: "inherit" }}
                placeholder="예: 상가 1층"
                value={form.buildingType}
                onChange={(e) => updateField("buildingType", e.target.value)}
              />
            }
          />
          <Field
            label="면적 (㎡)"
            control={
              <input
                type="number"
                min={0}
                className="fake-control"
                style={{ width: "100%", font: "inherit" }}
                placeholder="예: 83"
                value={form.areaSqm}
                onChange={(e) => updateField("areaSqm", e.target.value)}
              />
            }
          />
          <Field
            label="토큰 심볼"
            control={
              <input
                className="fake-control"
                style={{ width: "100%", font: "inherit", textTransform: "uppercase" }}
                placeholder="예: MF01"
                maxLength={15}
                value={form.tokenSymbol}
                onChange={(e) => updateField("tokenSymbol", e.target.value)}
              />
            }
          />
          <Field
            label="토큰 가격"
            control={
              <input
                type="number"
                min={1}
                className="fake-control"
                style={{ width: "100%", font: "inherit" }}
                placeholder="예: 10000"
                value={form.tokenPrice}
                onChange={(e) => updateField("tokenPrice", e.target.value)}
              />
            }
          />
          <Field
            label="총 토큰 수"
            control={
              <input
                type="number"
                min={1}
                className="fake-control"
                style={{ width: "100%", font: "inherit" }}
                placeholder="예: 1750"
                value={form.totalTokens}
                onChange={(e) => updateField("totalTokens", e.target.value)}
              />
            }
          />
          <Field
            label="모집 목표"
            control={
              <input
                type="number"
                min={1}
                className="fake-control"
                style={{ width: "100%", font: "inherit" }}
                placeholder="예: 17500000"
                value={form.targetAmount}
                onChange={(e) => updateField("targetAmount", e.target.value)}
              />
            }
          />
        </div>

        <h2 style={{ marginTop: 32 }}>마일스톤 4단계 정의</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          자금은 이 4단계 순서대로, 정의된 비율만큼 에스크로에서 집행돼요.
        </p>
        <div className="grid-2" style={{ marginTop: 16 }}>
          {milestones.map((m) => (
            <MilestoneEditor
              key={m.seq}
              milestone={m}
              onChange={(patch) => updateMilestone(m.seq, patch)}
            />
          ))}
        </div>
      </article>

      <aside className="card report-card">
        <h2>개설 미리보기</h2>
        <p className="muted">마일스톤 집행비율 합계</p>
        <p className="big-number">{pctSum}%</p>
        <div className="progress">
          <span
            className="bar"
            style={{
              width: `${Math.min(pctSum, 100)}%`,
              background: pctSum === 100 ? undefined : "#c0392b",
            }}
          />
        </div>
        {pctSum !== 100 && (
          <p style={{ color: "#c0392b", fontSize: 12, marginTop: 8 }}>
            100%로 맞추면 자금 집행 계획이 완성돼요 (현재 {pctSum}%)
          </p>
        )}

        <div className="kv" style={{ gridTemplateColumns: "1fr" }}>
          <div>
            <span>최대 조달 가능액 (토큰가격 × 총 토큰 수)</span>
            <b>{maxRaise > 0 ? formatKRW(maxRaise) : "—"}</b>
          </div>
          <div>
            <span>모집 목표 금액</span>
            <b>{targetAmountNum > 0 ? formatKRW(targetAmountNum) : "—"}</b>
          </div>
          <div>
            <span>목표 / 최대 조달액 비율</span>
            <b>{maxRaise > 0 ? `${Math.round((targetAmountNum / maxRaise) * 100)}%` : "—"}</b>
          </div>
        </div>

        {formError && (
          <p style={{ color: "#c0392b", fontSize: 13, marginTop: 16 }} role="alert">
            {formError}
          </p>
        )}
        {mutation.isError && (
          <p style={{ color: "#c0392b", fontSize: 13, marginTop: 12 }} role="alert">
            {mutation.error.message}
          </p>
        )}

        <button
          className="btn"
          type="button"
          style={{ width: "100%", marginTop: 20, opacity: mutation.isPending ? 0.7 : 1 }}
          disabled={mutation.isPending}
          onClick={handleSubmit}
        >
          {mutation.isPending ? "개설 중..." : "공모 개설하기 →"}
        </button>
      </aside>
    </div>
  );
}
