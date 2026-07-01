// Shared types for the investor portfolio view.
// Mirrors serializeBigInt() output of GET /api/portfolio — see
// src/app/api/portfolio/route.ts and docs/api-spec.md.
// BigInt fields (avgPrice, investedAmount, claimAmount, ...) are
// serialized to `number` before they reach the client.

export type PortfolioSummary = {
  totalInvested: number;
  totalCurrentValue: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  totalDividendReceived: number;
};

// One row per project the signed-in user holds tokens in.
export type PortfolioHolding = {
  projectId: string;
  projectName: string;
  tokenSymbol: string;
  projectStatus: string;
  imageUrl: string | null;
  tokenAmount: number;
  avgPrice: number;
  investedAmount: number; // tokenAmount * avgPrice (원가)
  currentNav: number; // 좌당 NAV (nav-calculator.ts 기준)
  currentValue: number; // tokenAmount * currentNav (평가금액)
  profitLoss: number; // currentValue - investedAmount
  profitLossPercent: number;
  dividendReceived: number; // 이 프로젝트에서 받은 누적 배당액
  recoveryPercent: number; // dividendReceived / investedAmount * 100 (원금 회수율, 100 초과 가능)
};

export type PortfolioDividend = {
  id: string;
  projectId: string;
  projectName: string;
  period: string;
  perToken: number;
  tokenAmount: number;
  claimAmount: number;
  claimed: boolean;
  claimedAt: string | null;
};

export type PortfolioTransaction = {
  id: string;
  projectId: string;
  projectName: string;
  type: string;
  amount: number;
  tokenAmount: number | null;
  txHash: string | null;
  createdAt: string;
};

export type PortfolioResponse = {
  summary: PortfolioSummary;
  holdings: PortfolioHolding[];
  dividends: PortfolioDividend[];
  transactions: PortfolioTransaction[];
};
