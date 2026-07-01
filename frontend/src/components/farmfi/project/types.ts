// Shared types for the investor flow (project list / detail / subscribe).
// Mirrors the actual Prisma model + serializeBigInt() output in
// src/app/api/projects/route.ts and src/app/api/projects/[id]/route.ts.
// BigInt fields (tokenPrice, targetAmount, currentAmount, ...) are
// serialized to `number` before they reach the client — see api-spec.md.

export type Escrow = {
  id: string;
  projectId: string;
  totalLocked: number;
  totalReleased: number;
  remaining: number;
  status: string;
  contractAddress: string | null;
};

export type Milestone = {
  id: string;
  projectId: string;
  seq: number;
  name: string;
  description: string | null;
  releasePct: number;
  releaseAmount: number;
  status: string;
  conditionText: string | null;
  requiredSignals: string[];
  iotMinDays: number;
  retryCount: number;
  crossCheck: string | null;
  assetValue: number;
  evidenceUrl: string | null;
  aiVerificationResult: unknown;
  completedAt: string | null;
};

export type Transaction = {
  id: string;
  projectId: string;
  userId: string | null;
  type: string;
  amount: number;
  tokenAmount: number | null;
  txHash: string | null;
  blockNumber: number | null;
  memo: string | null;
  createdAt: string;
};

export type TokenHolding = {
  id: string;
  userId: string;
  projectId: string;
  amount: number;
  avgPrice: number;
};

// GET /api/projects — each item = Project + escrow + milestones +
// computed fundingPercent/investorCount (see route.ts).
export type ProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  buildingType: string | null;
  areaSqm: number | null;
  tokenSymbol: string;
  tokenPrice: number;
  totalTokens: number;
  soldTokens: number;
  targetAmount: number;
  currentAmount: number;
  totalCapex: number;
  status: string;
  fundingStart: string | null;
  fundingEnd: string | null;
  imageUrl: string | null;
  contractAddress: string | null;
  createdAt: string;
  escrow: Escrow | null;
  milestones: Milestone[];
  fundingPercent: number;
  investorCount: number;
};

// GET /api/projects/[id] — NOTE this route does NOT compute
// fundingPercent/investorCount (unlike the list route). Derive them
// client-side from targetAmount/currentAmount and tokenHoldings.length.
export type ProjectDetail = Omit<
  ProjectListItem,
  "fundingPercent" | "investorCount"
> & {
  tokenHoldings: TokenHolding[];
  transactions: Transaction[];
};
