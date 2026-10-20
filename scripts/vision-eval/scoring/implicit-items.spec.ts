import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadImplicitItemNames, isImplicitItemName, markImplicitMissing } from './implicit-items';
import type { BomMatchResult } from './bom-match';
import type { GoldenBomItem, AiBomItemLike } from '../types';

const golden = (overrides: Partial<GoldenBomItem>): GoldenBomItem => ({
  itemName: '가짜자재',
  consumption: 1,
  unit: null,
  isLabelZone: false,
  ...overrides,
});
const ai = (overrides: Partial<AiBomItemLike>): AiBomItemLike => ({ itemName: '가짜AI자재', consumption: 1, ...overrides });

describe('loadImplicitItemNames (PR-199c)', () => {
  it('없는 파일이면 빈 배열', () => {
    expect(loadImplicitItemNames(path.join(os.tmpdir(), '존재안함.json'))).toEqual([]);
  });

  it('JSON 배열 파일을 읽어 문자열만 돌려준다', () => {
    const tmp = path.join(os.tmpdir(), `implicit-items-test-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(['가짜케어라벨', '가짜폴리백', 123]), 'utf8');
    expect(loadImplicitItemNames(tmp)).toEqual(['가짜케어라벨', '가짜폴리백']);
    fs.unlinkSync(tmp);
  });
});

describe('isImplicitItemName (PR-199c)', () => {
  const list = ['가짜케어라벨', '가짜폴리백'];

  it('공백·괄호 세부사항이 붙어도 매칭된다', () => {
    expect(isImplicitItemName('가짜 케어라벨(H0N-13)', list)).toBe(true);
  });

  it('목록에 없는 라벨류는(일반 단어만으론) 매칭되지 않는다(가짜핸드라벨 사례)', () => {
    expect(isImplicitItemName('가짜핸드라벨', list)).toBe(false);
  });

  it('첫 줄만 보고(영문 설명 줄 무시) 비교한다', () => {
    expect(isImplicitItemName('가짜케어라벨\nCARE LABEL', list)).toBe(true);
  });
});

describe('markImplicitMissing (PR-199c)', () => {
  const list = ['가짜케어라벨'];

  it('목록과 매칭되는 MISSING만 MISSING_IMPLICIT으로 바꾼다', () => {
    const results: BomMatchResult[] = [
      { type: 'MISSING', golden: golden({ itemName: '가짜케어라벨' }) },
      { type: 'MISSING', golden: golden({ itemName: '가짜핸드라벨' }) },
      { type: 'OK', golden: golden({}), ai: ai({}) },
    ];
    const outcome = markImplicitMissing(results, list);
    expect(outcome.implicitCount).toBe(1);
    expect(outcome.implicitItemNames).toEqual(['가짜케어라벨']);
    expect(outcome.results[0].type).toBe('MISSING_IMPLICIT');
    expect(outcome.results[1].type).toBe('MISSING'); // 목록에 없는 라벨류는 그대로 MISSING
    expect(outcome.results[2].type).toBe('OK');
  });

  it('목록이 비어 있으면 아무것도 바꾸지 않는다', () => {
    const results: BomMatchResult[] = [{ type: 'MISSING', golden: golden({ itemName: '가짜케어라벨' }) }];
    expect(markImplicitMissing(results, [])).toEqual({ results, implicitCount: 0, implicitItemNames: [] });
  });

  it('MISSING이 아닌 분류(OK/NAME_DIFF 등)는 이름이 목록과 맞아도 건드리지 않는다', () => {
    const results: BomMatchResult[] = [{ type: 'OK', golden: golden({ itemName: '가짜케어라벨' }), ai: ai({}) }];
    const outcome = markImplicitMissing(results, list);
    expect(outcome.results[0].type).toBe('OK');
    expect(outcome.implicitCount).toBe(0);
  });
});
