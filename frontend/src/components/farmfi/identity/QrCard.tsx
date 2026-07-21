"use client";

import type { IdentityOffer } from "./types";

/**
 * "OmniOne CX 표준인증창" 느낌의 QR/딥링크 발급 카드.
 * 실제 QR 렌더링 라이브러리 없이 qrData를 텍스트로 노출하고, 딥링크 버튼으로 대체한다.
 */
export function QrCard({ offer }: { offer: IdentityOffer }) {
  return (
    <article className="card report-card">
      <span className="badge">OmniOne CX 표준인증창</span>
      <h3 style={{ marginTop: 14 }}>모바일 신분증 앱으로 인증해주세요</h3>
      <p className="muted">
        지갑 앱의 QR 스캔으로 아래 코드를 인식하거나, 버튼으로 바로 열 수 있어요.
      </p>
      <div
        className="fake-control"
        style={{
          marginTop: 16,
          wordBreak: "break-all",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {offer.qrData}
      </div>
      <a
        className="btn"
        href={offer.deeplink}
        style={{ display: "block", width: "100%", marginTop: 16, textAlign: "center" }}
      >
        지갑 앱으로 열기 →
      </a>
      <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        요청 ID: {offer.txId}
      </p>
    </article>
  );
}
