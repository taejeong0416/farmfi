"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Field } from "@/components/FarmFi";
import {
  operatorApplicationsQueryKey,
  submitOperatorApplication,
  type SubmitApplicationInput,
} from "./api";

const REGIONS = ["부산 전역", "부산진구", "해운대구", "사상구", "기타 지역"] as const;
const CROP_EXPERIENCE = ["없음", "1년 미만", "1~3년", "3년 이상"] as const;
const AVAILABLE_HOURS = ["주 10시간 미만", "주 10~20시간", "주 20~30시간", "주 30시간 이상"] as const;

const ERROR_MESSAGES: Record<string, string> = {
  Unauthorized: "로그인이 필요합니다. 로그인 후 다시 시도해주세요.",
  "Invalid request body": "입력값을 다시 확인해주세요.",
};

function translateError(message: string): string {
  return ERROR_MESSAGES[message] ?? "지원서 제출에 실패했습니다. 잠시 후 다시 시도해주세요.";
}

export function ApplicationForm({ isAuthenticated }: { isAuthenticated: boolean }) {
  const queryClient = useQueryClient();

  const [region, setRegion] = useState<string>(REGIONS[0]);
  const [cropExperience, setCropExperience] = useState<string>(CROP_EXPERIENCE[0]);
  const [availableHours, setAvailableHours] = useState<string>(AVAILABLE_HOURS[0]);

  const mutation = useMutation({
    mutationFn: (input: SubmitApplicationInput) => submitOperatorApplication(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operatorApplicationsQueryKey() });
    },
  });

  const handleSubmit = () => {
    if (!isAuthenticated || mutation.isPending) return;
    mutation.mutate({ region, cropExperience, availableHours });
  };

  return (
    <article className="card form-panel">
      <h2>운영자 지원서 제출</h2>
      <div className="field-grid" style={{ marginTop: 26 }}>
        <Field
          label="희망 지역"
          control={<SegGroup options={REGIONS} value={region} onChange={setRegion} />}
        />
        <Field
          label="재배 경험"
          control={
            <SegGroup options={CROP_EXPERIENCE} value={cropExperience} onChange={setCropExperience} />
          }
        />
        <Field
          label="운영 가능 시간"
          control={
            <SegGroup options={AVAILABLE_HOURS} value={availableHours} onChange={setAvailableHours} />
          }
        />
      </div>

      {mutation.isError && (
        <p style={{ color: "#c0392b", fontSize: 13, marginTop: 12 }}>
          {translateError(mutation.error.message)}
        </p>
      )}
      {!isAuthenticated && (
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          로그인하면 지원서를 제출할 수 있어요.
        </p>
      )}

      <button
        className="btn"
        type="button"
        style={{ width: "100%", marginTop: 24, opacity: mutation.isPending ? 0.7 : 1 }}
        disabled={!isAuthenticated || mutation.isPending}
        onClick={handleSubmit}
      >
        {mutation.isPending ? "제출 중..." : "지원서 제출하기 →"}
      </button>
    </article>
  );
}

function SegGroup({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="seg is-interactive" role="radiogroup">
      {options.map((option) => {
        const active = option === value;
        return (
          <span
            key={option}
            role="radio"
            aria-checked={active}
            tabIndex={0}
            className={active ? "is-active" : undefined}
            onClick={() => onChange(option)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onChange(option);
              }
            }}
          >
            {option}
          </span>
        );
      })}
    </div>
  );
}
