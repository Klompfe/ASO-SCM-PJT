import { describe, it, expect } from 'vitest';
import {
  defaultManualQtyInputMode,
  resolveManualQtyInput,
  describeManualQtyPreview,
  manualQtyInputUnitLabel,
  type PackagingRuleContext,
} from './manualRequiredQtyInput';

// 사용자가 보고한 사고(합성 수치로 재구성): 포장 규칙 2500M/콘, 총수량×요척 계산값
// 115,000(M) → 정답은 46콘인데, "필요수량 직접 지정"에 46을 그냥 넣으면(길이로 해석)
// 46M→1콘이 되어 버린다. 이 재현을 먼저 확인한다.
const CONE_RULE: PackagingRuleContext = { packagingUnitLabel: '콘', unitLengthM: 2500 };

describe('manualRequiredQtyInput (PR-239)', () => {
  it('재현: 46을 길이로 해석하면(기존 버그) 1콘이 되어 의도(46콘)와 달라진다', () => {
    const asLength = resolveManualQtyInput(46, 'length', CONE_RULE);
    expect(asLength.lengthQty).toBe(46);
    const packages = Math.ceil(asLength.lengthQty / CONE_RULE.unitLengthM);
    expect(packages).toBe(1); // 의도(46콘)와 다름 — 이것이 막아야 할 사고.
  });

  it('포장 수 모드로 46을 입력하면 길이 115,000M로 환산되어 저장되고, 사유가 자동 기록된다', () => {
    const r = resolveManualQtyInput(46, 'packages', CONE_RULE);
    expect(r.lengthQty).toBe(115000);
    expect(r.autoNote).toBe('46콘 기준(규칙 2500M/콘)');
  });

  it('포장 수로 저장한 길이값을 다시 ROUNDUP하면 정확히 입력한 수가 나온다(46콘 경계)', () => {
    const r = resolveManualQtyInput(46, 'packages', CONE_RULE);
    expect(Math.ceil(r.lengthQty / CONE_RULE.unitLengthM)).toBe(46);
  });

  it('47콘 경계도 정확히 일치한다', () => {
    const r = resolveManualQtyInput(47, 'packages', CONE_RULE);
    expect(r.lengthQty).toBe(117500);
    expect(Math.ceil(r.lengthQty / CONE_RULE.unitLengthM)).toBe(47);
  });

  it('1콘 경계(2500M 이하) — 정확히 2500M면 1콘, 그 이하로 조금 모자라도 ROUNDUP상 1콘', () => {
    const r = resolveManualQtyInput(1, 'packages', CONE_RULE);
    expect(r.lengthQty).toBe(2500);
    expect(Math.ceil(r.lengthQty / CONE_RULE.unitLengthM)).toBe(1);
  });

  it('길이 모드는 그대로 저장하고(환산 없음) 사유를 자동 기록하지 않는다', () => {
    const r = resolveManualQtyInput(115000, 'length', CONE_RULE);
    expect(r.lengthQty).toBe(115000);
    expect(r.autoNote).toBeNull();
  });

  it('포장 규칙이 없으면 포장 수 모드를 쓸 수 없고(길이 그대로), 기본 모드도 길이다', () => {
    expect(defaultManualQtyInputMode(null)).toBe('length');
    const r = resolveManualQtyInput(100, 'packages', null);
    expect(r.lengthQty).toBe(100);
    expect(r.autoNote).toBeNull();
  });

  it('포장 규칙이 있으면 기본 입력 단위는 포장 수다', () => {
    expect(defaultManualQtyInputMode(CONE_RULE)).toBe('packages');
  });

  it('미리보기: 포장 수 입력이면 "필요량 ...M = N콘"(등호, 환산이 아니라 그대로)', () => {
    expect(describeManualQtyPreview(46, 'packages', CONE_RULE)).toBe('→ 필요량 115,000M = 46콘');
  });

  it('미리보기: 길이 입력이면 "필요량 ...M ≈ N콘"(참고 환산)', () => {
    expect(describeManualQtyPreview(115000, 'length', CONE_RULE)).toBe('→ 필요량 115,000M ≈ 46콘');
  });

  it('미리보기: 포장 규칙이 없으면 길이만 보여준다', () => {
    expect(describeManualQtyPreview(500, 'length', null)).toBe('→ 필요량 500M');
  });

  it('입력칸 단위 라벨은 마스터 단위(EA 등)가 아니라 선택한 입력 단위를 보여준다', () => {
    expect(manualQtyInputUnitLabel('packages', CONE_RULE, 'EA')).toBe('콘');
    expect(manualQtyInputUnitLabel('length', CONE_RULE, 'EA')).toBe('EA');
    expect(manualQtyInputUnitLabel('length', null, 'M')).toBe('M');
    expect(manualQtyInputUnitLabel('length', null, null)).toBe('');
  });
});
