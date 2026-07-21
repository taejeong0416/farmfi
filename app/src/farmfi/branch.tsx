import { createContext, useContext, useState, type ReactNode } from "react";
import { BRANCHES } from "./data";

// 원본은 localStorage + CustomEvent로 화면 간 지점 선택을 동기화.
// RN에서는 Context로 대체 (네비게이션 간 유지; 앱 재시작 시 초기화).
const BranchContext = createContext<readonly [string, (b: string) => void]>([BRANCHES[0], () => {}]);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branch, setBranchState] = useState(BRANCHES[0]);
  const setBranch = (next: string) => {
    if (BRANCHES.includes(next)) setBranchState(next);
  };
  return <BranchContext.Provider value={[branch, setBranch]}>{children}</BranchContext.Provider>;
}

export function useSelectedBranch() {
  return useContext(BranchContext);
}
