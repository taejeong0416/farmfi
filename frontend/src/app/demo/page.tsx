"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Section } from "@/components/FarmFi";
import { StepList, DEMO_STEPS } from "@/components/farmfi/demo/StepList";
import { StateMirror } from "@/components/farmfi/demo/StateMirror";
import { FailureCases } from "@/components/farmfi/demo/FailureCases";
import { TxToastStack, type ToastItem } from "@/components/farmfi/demo/TxToast";
import { stepTxHash, type DemoStepResponse } from "@/components/farmfi/demo/demoStepUtils";

const AUTO_PLAY_DELAY_MS = 1400;

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? `요청 실패 (${res.status})`);
  }
  return data as T;
}

export default function DemoPage() {
  const [results, setResults] = useState<Record<number, DemoStepResponse>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [loadingStep, setLoadingStep] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showFailureCases, setShowFailureCases] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // 자동 재생 루프는 setState의 비동기성 때문에 state만으로는 "지금 몇 스텝인지"를
  // 안전하게 못 읽는다. ref로 최신 값을 동기적으로 미러링해서 루프 안에서 참조한다.
  const currentStepRef = useRef(0);
  const playingRef = useRef(false);

  const pushToast = useCallback((toast: ToastItem) => {
    setToasts((prev) => [...prev, toast]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const stepMutation = useMutation({
    mutationFn: (step: number) => postJson<DemoStepResponse>("/api/demo/step", { step }),
  });

  const resetMutation = useMutation({
    mutationFn: () => postJson<{ success: boolean }>("/api/demo/reset"),
  });

  const runStep = useCallback(
    async (step: number) => {
      setLoadingStep(step);
      try {
        const data = await stepMutation.mutateAsync(step);
        setResults((prev) => ({ ...prev, [step]: data }));
        setCurrentStep(step);
        currentStepRef.current = step;

        const meta = DEMO_STEPS[step - 1];
        pushToast({
          id: `step-${step}-${Date.now()}`,
          title: `STEP ${step} · ${meta?.title ?? ""} 완료`,
          txHash: stepTxHash(step, data.result),
          fromCache: data.fromCache,
        });
        return true;
      } catch (e) {
        pushToast({
          id: `step-${step}-err-${Date.now()}`,
          title: `STEP ${step} 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
          txHash: null,
          isError: true,
        });
        return false;
      } finally {
        setLoadingStep(null);
      }
    },
    [pushToast, stepMutation],
  );

  const handleNext = useCallback(async () => {
    if (currentStepRef.current >= 8 || playingRef.current) return;
    await runStep(currentStepRef.current + 1);
  }, [runStep]);

  const stopAutoPlay = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
  }, []);

  const handleAutoPlay = useCallback(async () => {
    if (playingRef.current) {
      stopAutoPlay();
      return;
    }
    playingRef.current = true;
    setIsPlaying(true);
    while (playingRef.current && currentStepRef.current < 8) {
      const ok = await runStep(currentStepRef.current + 1);
      if (!ok || !playingRef.current) break;
      await new Promise((resolve) => setTimeout(resolve, AUTO_PLAY_DELAY_MS));
    }
    playingRef.current = false;
    setIsPlaying(false);
  }, [runStep, stopAutoPlay]);

  const handleReset = useCallback(async () => {
    stopAutoPlay();
    setLoadingStep(-1);
    try {
      await resetMutation.mutateAsync();
      setResults({});
      setCurrentStep(0);
      currentStepRef.current = 0;
      setToasts([]);
      pushToast({ id: `reset-${Date.now()}`, title: "데모 초기화 완료 · DB 재시드됨", txHash: null });
    } catch (e) {
      pushToast({
        id: `reset-err-${Date.now()}`,
        title: `초기화 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
        txHash: null,
        isError: true,
      });
    } finally {
      setLoadingStep(null);
    }
  }, [pushToast, resetMutation, stopAutoPlay]);

  const isBusy = loadingStep !== null;
  const isDone = currentStep >= 8;

  return (
    <main className="page">
      <Section
        title="데모 자동재생"
        desc="투자자 청약 → 마일스톤 AI 검증 → 트랜치 해제 → 배당까지 8단계를 한 번에 재생합니다."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <button className="outline" onClick={handleReset} disabled={isBusy}>
            처음부터
          </button>
          <button className="btn" onClick={handleNext} disabled={isBusy || isPlaying || isDone}>
            다음 단계 {isDone ? "(완료)" : `(${currentStep + 1}/8)`}
          </button>
          <button className="ghost" onClick={handleAutoPlay} disabled={isBusy && !isPlaying}>
            {isPlaying ? "자동 재생 정지" : "자동 재생"}
          </button>
          <button className="ghost" onClick={() => setShowFailureCases((v) => !v)}>
            {showFailureCases ? "실패 케이스 닫기" : "실패 케이스 보기"}
          </button>
        </div>

        {showFailureCases ? (
          <div style={{ marginBottom: 24 }}>
            <FailureCases />
          </div>
        ) : null}

        <div className="grid-2">
          <StepList results={results} currentStep={currentStep} loadingStep={loadingStep} />
          <StateMirror results={results} currentStep={currentStep} />
        </div>
      </Section>

      <TxToastStack toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
