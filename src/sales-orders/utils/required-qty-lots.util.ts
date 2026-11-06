// PR-226: 작지의 출고량(요구수량) 칸이 LOT1/LOT2처럼 여러 줄로 나뉘어 있을 때, 모델이
// 각 줄의 숫자를 requiredQtyLots(배열)에 담으면 여기서 결정적으로 합산해 requiredQty를
// 덮어쓴다 — 모델이 합계를 못 내도(또는 잘못 내도) 서버가 다시 계산하므로 항상 정확하다.
// 개수 상한(10)을 넘기거나 음수·NaN이 섞여도 업로드가 실패하지 않게 조용히 걸러낸다.
const MAX_LOTS = 10;

// 소수 둘째자리까지 반올림 — 부동소수 오차(0.1+0.2 등) 방지.
const round2 = (n: number): number => Math.round(n * 100) / 100;

// lots가 없거나(undefined/null) 배열이 아니거나 전부 무효하면 null을 돌려준다 —
// 호출자는 null이면 기존 requiredQty를 그대로 둔다(폴백).
export function sumRequiredQtyLots(lots: unknown): number | null {
  if (!Array.isArray(lots)) return null;
  const valid = lots
    .slice(0, MAX_LOTS)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v >= 0);
  if (valid.length === 0) return null;
  return round2(valid.reduce((sum, v) => sum + v, 0));
}
