// PR-199: 호출 수 = 페이지 × 모드 × 실행 × 모델. `--yes` 없이는 이 숫자(와 비용 추정)만
// 보여주고 실제 API를 호출하지 않는다(과금/키 노출 사고 방지).
export interface CallCountInput {
  pages: number;
  modes: number;
  runs: number;
  models: number;
}

export function computeCallCount(input: CallCountInput): number {
  return input.pages * input.modes * input.runs * input.models;
}

export interface CostEstimate {
  callCount: number;
  estimatedCostUsd: number | null;
}

// estimatedCostPerCallUsd를 안 주면(모르면) 비용은 null로 — 추측해서 숫자를 지어내지 않는다.
export function estimateCost(input: CallCountInput, estimatedCostPerCallUsd?: number): CostEstimate {
  const callCount = computeCallCount(input);
  const estimatedCostUsd =
    estimatedCostPerCallUsd != null ? Math.round(callCount * estimatedCostPerCallUsd * 100) / 100 : null;
  return { callCount, estimatedCostUsd };
}

// `--yes` 없이는 실제 API를 호출하지 않는다 — 호출 수·예상 비용만 보여주고 종료.
// CLI 전체를 실행하지 않고도 이 게이트 하나만 독립적으로 테스트할 수 있게 분리한다.
export function shouldCallApi(yes: boolean): boolean {
  return yes === true;
}

// PR-199b(PILOT-2에서 확인): 모드 A는 manifest 행(페이지) 단위가 아니라 **PDF 1개당**
// 1번만 호출한다(페이지 수만큼 중복 호출하던 버그 수정). 모드 B/C/E는 그대로 페이지
// 단위다. 모드마다 "호출 단위 수"가 다르므로 모드별로 따로 계산해 더한다.
export interface ModeCallUnit {
  mode: string;
  // A: 그 모드로 처리할 manifest의 "서로 다른 pdf 파일 수". B/C/E: manifest 행(페이지) 수.
  unitCount: number;
}

export function computeCallCountByMode(unitsByMode: ModeCallUnit[], runs: number, models: number): number {
  return unitsByMode.reduce((sum, u) => sum + u.unitCount * runs * models, 0);
}

export function countDistinctPdfs(pdfNames: string[]): number {
  return new Set(pdfNames).size;
}
