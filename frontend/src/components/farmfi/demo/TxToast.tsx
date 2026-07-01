"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { shortenHash } from "@/lib/format";

const EXPLORER_TX_BASE = "https://amoy.polygonscan.com/tx/";

export interface ToastItem {
  id: string;
  title: string;
  txHash: string | null;
  isError?: boolean;
  fromCache?: boolean;
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="card"
      style={{
        padding: 14,
        borderColor: toast.isError ? "#c0392b" : undefined,
      }}
    >
      <p style={{ fontWeight: 900, fontSize: 13 }}>{toast.title}</p>
      {toast.txHash ? (
        <a
          href={`${EXPLORER_TX_BASE}${toast.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="link"
          style={{ marginTop: 4, fontSize: 12 }}
        >
          {shortenHash(toast.txHash)} · Polygonscan ↗
        </a>
      ) : !toast.isError ? (
        <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
          온체인 연동 대기 · 모의 처리됨
        </p>
      ) : null}
      {toast.fromCache ? (
        <span className="badge" style={{ marginTop: 6 }}>
          캐시
        </span>
      ) : null}
    </motion.div>
  );
}

export function TxToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: 300,
      }}
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}
