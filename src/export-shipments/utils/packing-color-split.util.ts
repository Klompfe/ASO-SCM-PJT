// PR-157: 같은 스타일+자재(=하나의 PackingReceipt)라도 색상이 다르면 INVOICE/Packing
// List에서 별도 라인으로 분리한다(샘플 파일의 "안감(BE:293Y, BK:183Y)" 표기 방식).
// 색상이 전혀 없는(구버전 데이터 등) 롤/카톤은 하나의 라인으로 합쳐진다(color: null).

interface RollLike {
  color?: string | null;
  lengthYd?: number | null;
  netWeight?: number | null;
  grossWeight?: number | null;
}

interface CartonLike {
  color?: string | null;
  qty: number;
  weightKg?: number | null;
  cartonNo: string;
}

export interface FabricColorLine {
  color: string | null;
  qty: number; // 야드 합계
  netWeight: number | null;
  grossWeight: number | null;
  packageCount: number; // 이 색상의 롤 개수
  hasMissingLength: boolean; // 이 색상 그룹 안에 길이 미입력 롤이 하나라도 있으면 true
}

export interface TrimColorLine {
  color: string | null;
  qty: number;
  grossWeight: number | null;
  packageCount: number; // 이 색상에 걸친 고유 카톤 번호 수
}

const groupByColor = <T extends { color?: string | null }>(items: T[]): Map<string | null, T[]> => {
  const groups = new Map<string | null, T[]>();
  for (const item of items) {
    const key = item.color ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return groups;
};

const sumOrNull = (values: (number | null | undefined)[]): number | null => {
  const total = values.reduce((acc, v) => acc + (Number(v) || 0), 0);
  return total || null;
};

export function splitFabricByColor(rolls: RollLike[]): FabricColorLine[] {
  const groups = groupByColor(rolls);
  return [...groups.entries()].map(([color, group]) => ({
    color,
    qty: group.reduce((acc, r) => acc + (Number(r.lengthYd) || 0), 0),
    netWeight: sumOrNull(group.map((r) => r.netWeight)),
    grossWeight: sumOrNull(group.map((r) => r.grossWeight)),
    packageCount: group.length,
    hasMissingLength: group.some((r) => r.lengthYd == null),
  }));
}

export function splitTrimByColor(cartons: CartonLike[]): TrimColorLine[] {
  const groups = groupByColor(cartons);
  return [...groups.entries()].map(([color, group]) => ({
    color,
    qty: group.reduce((acc, c) => acc + (Number(c.qty) || 0), 0),
    grossWeight: sumOrNull(group.map((c) => c.weightKg)),
    packageCount: new Set(group.map((c) => c.cartonNo)).size,
  }));
}
