import * as fs from 'fs';
import * as path from 'path';
import type { BomMatchResult } from './bom-match';

// PR-199c(PILOT-3 사용자 확인): 정답 시트에는 작지에 글자로 적혀 있지 않지만 당연히
// 제공되는 자재(사이즈 스티커·케어라벨 등)가 들어 있다 — AI가 애초에 읽을 수 없으므로
// "인식 실패(MISSING)" 집계에서 분리한다. 목록은 코드에 박아 넣지 않고 이 파일에서
// 읽는다(사용자가 직접 추가할 수 있게) — 사용법은 scripts/vision-eval/README.md 참고.
const DEFAULT_PATH = path.join(__dirname, '..', 'implicit-items.json');

export function loadImplicitItemNames(filePath: string = DEFAULT_PATH): string[] {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
}

const normalize = (s: string): string => (s ?? '').replace(/[\s()<>[\]]/g, '');
const stripParenDetail = (s: string): string => (s ?? '').replace(/\([^)]*\)/g, '');
const firstLine = (s: string): string => (s ?? '').split('\n')[0];

// "케어 라벨", "케어라벨(H0N-13)"처럼 공백·괄호 세부사항이 붙어도 매칭되게 정규화 후
// 포함 여부로 비교한다. 일반 단어("라벨")만으로는 매칭되지 않게 — 목록 자체가 구체적인
// 이름("케어라벨")만 담고 있어야 한다(이 함수는 목록을 넓히지 않는다).
export function isImplicitItemName(goldenName: string, implicitNames: string[]): boolean {
  const candidate = normalize(stripParenDetail(firstLine(goldenName)));
  if (!candidate) return false;
  return implicitNames.some((n) => {
    const target = normalize(stripParenDetail(n));
    return target.length > 0 && candidate.includes(target);
  });
}

export interface ImplicitMarkOutcome {
  results: BomMatchResult[];
  implicitCount: number;
  implicitItemNames: string[];
}

// MISSING 중 implicitNames 목록과 매칭되는 golden 행만 MISSING_IMPLICIT으로 바꾼다.
// 다른 분류(OK/VALUE_DIFF/NAME_DIFF 등)는 건드리지 않는다 — AI가 그 자재를 실제로
// 만들어 짝이 맞았으면 정상 짝짓기 결과를 그대로 따른다.
export function markImplicitMissing(results: BomMatchResult[], implicitNames: string[]): ImplicitMarkOutcome {
  if (implicitNames.length === 0) return { results, implicitCount: 0, implicitItemNames: [] };
  const found: string[] = [];
  const updated = results.map((r) => {
    if (r.type !== 'MISSING' || !r.golden) return r;
    if (isImplicitItemName(r.golden.itemName, implicitNames)) {
      found.push(r.golden.itemName);
      return { ...r, type: 'MISSING_IMPLICIT' as const };
    }
    return r;
  });
  return { results: updated, implicitCount: found.length, implicitItemNames: [...new Set(found)] };
}
