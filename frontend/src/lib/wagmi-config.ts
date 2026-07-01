"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { polygonAmoy } from "wagmi/chains";
import { http } from "wagmi";

const AMOY_RPC =
  process.env.NEXT_PUBLIC_AMOY_RPC || "https://rpc-amoy.polygon.technology";

// WalletConnect projectId may be empty in dev. getDefaultConfig requires a
// non-empty string; a placeholder keeps injected/EIP-6963 wallets working while
// WalletConnect-based connectors stay inert until a real id is provided.
const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "FARMFI_DEV_PLACEHOLDER";

export const wagmiConfig = getDefaultConfig({
  appName: "FarmFi",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [polygonAmoy],
  transports: {
    [polygonAmoy.id]: http(AMOY_RPC),
  },
  ssr: true,
});
