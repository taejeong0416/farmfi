"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { shortenHash } from "@/lib/format";

/**
 * 지갑 연결 상태를 보여주는 카드형 버튼. Header.tsx의 ConnectButton.Custom
 * 패턴과 동일한 상태머신(ready → connected → chain)을 재사용하되, 로그인/가입
 * 폼 안에서 전체 폭으로 쓰기 좋게 별도 컴포넌트로 뺐다.
 */
export function WalletConnectPanel() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, openChainModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!ready) {
          return (
            <button className="btn" type="button" disabled aria-hidden style={{ width: "100%" }}>
              지갑 연결
            </button>
          );
        }

        if (!connected) {
          return (
            <button
              className="btn"
              type="button"
              style={{ width: "100%" }}
              onClick={openConnectModal}
            >
              지갑 연결하기 →
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              className="ghost"
              type="button"
              style={{ width: "100%" }}
              onClick={openChainModal}
            >
              네트워크 전환 (Polygon Amoy)
            </button>
          );
        }

        return (
          <button
            className="ghost"
            type="button"
            style={{ width: "100%" }}
            onClick={openAccountModal}
          >
            ✓ {shortenHash(account.address)} 연결됨
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
