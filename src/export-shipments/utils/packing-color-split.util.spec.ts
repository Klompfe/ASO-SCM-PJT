import { splitFabricByColor, splitTrimByColor } from './packing-color-split.util';

describe('splitFabricByColor (PR-157)', () => {
  it('색상이 다르면 별도 라인으로 분리하고 야드/중량을 색상별로 합산한다(샘플의 BE:293Y, BK:183Y 방식)', () => {
    const rolls = [
      { color: 'BE', lengthYd: 150, netWeight: 10, grossWeight: 11 },
      { color: 'BE', lengthYd: 143, netWeight: 9, grossWeight: 10 },
      { color: 'BK', lengthYd: 183, netWeight: 12, grossWeight: 13 },
    ];
    const result = splitFabricByColor(rolls);
    expect(result).toEqual([
      { color: 'BE', qty: 293, netWeight: 19, grossWeight: 21, packageCount: 2, hasMissingLength: false },
      { color: 'BK', qty: 183, netWeight: 12, grossWeight: 13, packageCount: 1, hasMissingLength: false },
    ]);
  });

  it('색상이 전혀 없으면(구버전 데이터) 하나의 라인으로 합쳐진다', () => {
    const rolls = [{ color: null, lengthYd: 100 }, { color: undefined, lengthYd: 50 }];
    const result = splitFabricByColor(rolls);
    expect(result).toHaveLength(1);
    expect(result[0].color).toBeNull();
    expect(result[0].qty).toBe(150);
  });

  it('길이가 없는 롤이 섞여 있으면(그 색상 그룹만) hasMissingLength가 true다', () => {
    const rolls = [
      { color: 'BE', lengthYd: 150 },
      { color: 'BE', lengthYd: null },
      { color: 'BK', lengthYd: 100 },
    ];
    const result = splitFabricByColor(rolls);
    expect(result.find((r) => r.color === 'BE')!.hasMissingLength).toBe(true);
    expect(result.find((r) => r.color === 'BK')!.hasMissingLength).toBe(false);
  });

  it('중량이 전부 없으면(0이 아니라) null을 유지한다', () => {
    const rolls = [{ color: 'BE', lengthYd: 100, netWeight: null, grossWeight: null }];
    const result = splitFabricByColor(rolls);
    expect(result[0].netWeight).toBeNull();
    expect(result[0].grossWeight).toBeNull();
  });
});

describe('splitTrimByColor (PR-157)', () => {
  it('색상별로 카톤 수량/중량을 합산하고 고유 카톤 번호 수를 센다', () => {
    const cartons = [
      { color: 'BLACK', qty: 10, weightKg: 5, cartonNo: 'CT-1' },
      { color: 'BLACK', qty: 5, weightKg: 2, cartonNo: 'CT-1' },
      { color: 'WHITE', qty: 8, weightKg: 4, cartonNo: 'CT-2' },
    ];
    const result = splitTrimByColor(cartons);
    expect(result).toEqual([
      { color: 'BLACK', qty: 15, grossWeight: 7, packageCount: 1 },
      { color: 'WHITE', qty: 8, grossWeight: 4, packageCount: 1 },
    ]);
  });

  it('색상이 없으면 하나의 라인으로 합쳐진다', () => {
    const cartons = [{ color: null, qty: 3, cartonNo: 'CT-9' }];
    expect(splitTrimByColor(cartons)).toEqual([{ color: null, qty: 3, grossWeight: null, packageCount: 1 }]);
  });
});
