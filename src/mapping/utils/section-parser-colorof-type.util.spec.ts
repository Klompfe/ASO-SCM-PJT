import { SectionParser } from './section-parser.util';

// PR-236(사용자 보고): 일괄 승인에서 "bomItems.13.colorOf must be a string" 오류 재현.
// xlsx는 수식 셀을 "캐시된 계산 결과의 원래 타입"으로 돌려준다 — 사이즈 라벨 칸(C4)이
// 엑셀에서 숫자로 입력돼 있으면 그 칸을 참조하는 수식(=C4)도 문자열 '55'가 아니라
// 숫자 55로 온다. SectionParser.parseBomItems가 이 값을 그대로(colorOf: row[2]) 담아
// commit DTO의 @IsString 검증을 깨뜨렸다. 합성 행 데이터만 사용(실제 업로드 파일·
// 업무 데이터 없음) — 실제 엑셀 파일 없이도 그대로 재현된다.
function buildSyntheticRows(overrides: { row15ColorOf?: unknown; row15Spec?: unknown } = {}): any[][] {
  const rows: any[][] = [];
  rows[1] = [];
  rows[1][1] = 'SYN-STYLE-001'; // styleNo
  rows[1][8] = 100; // totalQty
  rows[1][14] = '베트남'; // factory
  rows[1][21] = '테스트바이어'; // buyer
  rows[9] = [];
  rows[9][25] = '';
  // bomStartIndex=13 헤더 행 — "CON'S"가 있어야 하고(요척 칸 위치를 동적으로 찾음),
  // colorOf(2번 칸)·spec(8번 칸)은 코드에서 고정 인덱스로 읽는다(라벨 자체는 안 봄).
  rows[13] = ['ITEMS', 'QTY', 'COLOR OF', '', '', "CON'S", '', '', 'SPEC'];
  rows[14] = ['', '', 'COLOR USED', '', '', '', '', '', '']; // 서브헤더(내용 안 읽힘)
  rows[15] = [
    'ITEM_NORMAL',
    '',
    'row15ColorOf' in overrides ? overrides.row15ColorOf : 'BK',
    '',
    '',
    1.5,
    '',
    '',
    'row15Spec' in overrides ? overrides.row15Spec : '36"',
  ];
  return rows;
}

describe('SectionParser.parseBomItems — colorOf/spec 타입 정규화 (PR-236)', () => {
  it('정상(문자열) 색상 칸은 그대로 문자열로 나온다(회귀 없음)', () => {
    const rows = buildSyntheticRows();
    const { bomItems } = SectionParser.parse(rows, []);
    expect(typeof bomItems[0].colorOf).toBe('string');
    expect(bomItems[0].colorOf).toBe('BK');
  });

  it.each([
    ['숫자', 55],
    ['0(숫자)', 0],
    ['불리언', true],
  ])('색상 칸이 %s 타입이어도 colorOf는 항상 문자열로 정규화된다', (_label, rawValue) => {
    const rows = buildSyntheticRows({ row15ColorOf: rawValue });
    const { bomItems } = SectionParser.parse(rows, []);
    expect(typeof bomItems[0].colorOf).toBe('string');
    expect(bomItems[0].colorOf).toBe(String(rawValue));
  });

  it('색상 칸이 null/undefined면 빈 문자열이 된다(값을 지어내지 않음)', () => {
    for (const rawValue of [null, undefined]) {
      const rows = buildSyntheticRows({ row15ColorOf: rawValue as any });
      const { bomItems } = SectionParser.parse(rows, []);
      expect(bomItems[0].colorOf).toBe('');
    }
  });

  it('규격(spec) 칸도 같은 이유로 숫자가 올 수 있고, 마찬가지로 문자열로 정규화된다', () => {
    const rows = buildSyntheticRows({ row15Spec: 36 });
    const { bomItems } = SectionParser.parse(rows, []);
    expect(typeof bomItems[0].spec).toBe('string');
    expect(bomItems[0].spec).toBe('36');
  });

  it('앞뒤 공백이 있는 문자열 색상 칸은 trim된다', () => {
    const rows = buildSyntheticRows({ row15ColorOf: '  BK  ' });
    const { bomItems } = SectionParser.parse(rows, []);
    expect(bomItems[0].colorOf).toBe('BK');
  });
});
