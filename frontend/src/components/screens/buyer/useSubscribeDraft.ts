"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "../api";

const KEY = "farmfi.subscribe.draft";

export type SubscribeDraft = {
  projectId: string | null;
  packSize: 3 | 5 | 7 | null;
  perWeek: 1 | 2;
  productIds: string[];
  dressings: string[];
  couponCode: string | null;
  discount: number;
  paymentMethod: string | null;
};

const EMPTY: SubscribeDraft = {
  projectId: null,
  packSize: null,
  perWeek: 2,
  productIds: [],
  dressings: [],
  couponCode: null,
  discount: 0,
  paymentMethod: null,
};

/**
 * 신청 5단계(B-01~B-05)가 나눠 갖는 선택값. 새로고침해도 남도록 sessionStorage에 둔다.
 * 서버에는 마지막 단계에서 한 번만 보낸다.
 */
export function useSubscribeDraft() {
  const [draft, setDraft] = useState<SubscribeDraft>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setDraft({ ...EMPTY, ...(JSON.parse(raw) as SubscribeDraft) });
    } catch {
      // 저장된 값이 깨졌으면 빈 상태로 시작한다.
    }
    setReady(true);
  }, []);

  const update = useCallback((patch: Partial<SubscribeDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      try {
        sessionStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // 저장 실패는 흐름을 막지 않는다.
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // 무시
    }
    setDraft(EMPTY);
  }, []);

  return { draft, update, clear, ready };
}

export type CropOption = {
  productId: string;
  name: string;
  category: string;
  unitPrice: number;
  available: boolean;
  growing: boolean;
  expectedHarvestAt: string | null;
};

export type PickupPoint = {
  id: string;
  name: string;
  location: string | null;
};

export function useCatalog(projectId: string | null) {
  return useQuery({
    queryKey: ["subscription-catalog", projectId],
    queryFn: () =>
      getJson<{
        pickupPoints: PickupPoint[];
        crops: CropOption[];
        dressings: string[];
      }>(
        projectId
          ? `/api/subscriptions/catalog?projectId=${projectId}`
          : "/api/subscriptions/catalog",
      ),
  });
}
