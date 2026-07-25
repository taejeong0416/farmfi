import { useCallback, useEffect, useState } from "react";

import { apiFetch, describeApiError } from "@/lib/api";

type Resource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

// GET 한 건을 로딩/오류/재시도 상태와 함께 들고 있는다.
// path가 null이면(예: 아직 지점 미선택) 요청하지 않고 로딩 상태로 대기한다.
// 실패 시 data는 null로 두어 화면이 옛 값이나 목데이터를 계속 그리지 못하게 한다.
export function useApiResource<T>(path: string | null, fallbackMessage: string): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!path) {
      setData(null);
      setError(null);
      setLoading(true);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    apiFetch<T>(path)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setData(null);
        setError(describeApiError(e, fallbackMessage));
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [path, nonce, fallbackMessage]);

  return { data, loading, error, reload };
}
