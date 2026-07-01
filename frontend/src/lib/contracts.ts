import type { Abi } from "viem";
import farmTokenAbi from "./abi/FarmToken.json";
import escrowAbi from "./abi/Escrow.json";
import dividendAbi from "./abi/Dividend.json";

// Deployed on Polygon Amoy (chain 80002). Addresses come from NEXT_PUBLIC_*
// env vars so they are available in both server and client bundles.
function requireAddress(value: string | undefined): `0x${string}` {
  if (value && /^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value as `0x${string}`;
  }
  // Zero address fallback keeps the app buildable when env is unset; on-chain
  // calls against it will no-op / revert rather than crash the bundle.
  return "0x0000000000000000000000000000000000000000";
}

export const CONTRACTS = {
  farmToken: {
    address: requireAddress(process.env.NEXT_PUBLIC_FARM_TOKEN_ADDRESS),
    abi: farmTokenAbi as Abi,
  },
  escrow: {
    address: requireAddress(process.env.NEXT_PUBLIC_ESCROW_ADDRESS),
    abi: escrowAbi as Abi,
  },
  dividend: {
    address: requireAddress(process.env.NEXT_PUBLIC_DIVIDEND_ADDRESS),
    abi: dividendAbi as Abi,
  },
} as const;

export type ContractKey = keyof typeof CONTRACTS;
