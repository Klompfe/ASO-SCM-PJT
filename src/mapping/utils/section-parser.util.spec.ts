import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';
import { SectionParser } from './section-parser.util';
import { CellMergeRange } from './excel-parser.util';

// 실제 원본 자재명세 엑셀(csv/26-SS 미센스 Material List Update 12. 08.xlsx)의 모든 시트를
// 순회하며 헤더 컬럼 오프셋 회귀(totalQty/factory/buyer가 조용히 빈 값이 되는 문제)를
// 잡아내는 데이터 기반 테스트다. mock이 아니라 진짜 파일을 읽는다 — 이 버그 자체가
// mock으로는 재현되지 않았고 실제 파일로만 드러났기 때문이다.
describe('SectionParser - 실제 원본 엑셀 전 시트 회귀 테스트', () => {
  const XLSX_PATH = path.resolve(
    __dirname,
    '../../../csv/26-SS 미센스 Material List Update 12. 08.xlsx',
  );

  const buffer = fs.readFileSync(XLSX_PATH);
  const workbook = xlsx.read(buffer, { type: 'buffer' });

  function readSheet(sheetName: string): { rows: string[][]; merges: CellMergeRange[] } {
    const ws = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
    const merges = (ws['!merges'] || []) as CellMergeRange[];
    return { rows, merges };
  }

  // Sheet1~13처럼 실제 스타일 데이터가 없는 빈 작업용 시트는 대상에서 제외한다.
  const validSheetNames = workbook.SheetNames.filter((name) => {
    const { rows } = readSheet(name);
    return !!(rows[1] && rows[1][1] && String(rows[1][1]).trim() !== '' && rows[13]);
  });

  it('원본 파일에 유효 스타일 시트가 최소 30개 이상 있어야 한다 (테스트 전제조건 확인)', () => {
    expect(validSheetNames.length).toBeGreaterThanOrEqual(30);
  });

  it.each(validSheetNames)(
    '%s 시트: styleNo/totalQty/factory/buyer가 전부 빈 값 없이 파싱되어야 한다',
    (sheetName) => {
      const { rows, merges } = readSheet(sheetName);

      const { styleOverview, bomItems } = SectionParser.parse(rows, merges);

      // 시트 탭 이름과 셀에 기록된 styleNo가 항상 같지는 않다(예: "MB6YHMS181A(재원)" 탭의
      // 실제 값은 "MB6YHMS107A", "MBS6YSLM113Z" 탭의 실제 값은 "MB6YSLM113Z" — 원본 데이터
      // 자체의 표기 차이). 그래서 탭 이름과의 일치가 아니라 "비어있지 않은지"만 검증한다.
      expect(styleOverview.styleNo).toBeTruthy();
      expect(typeof styleOverview.totalQty).toBe('number');
      expect(styleOverview.totalQty).not.toBeNaN();
      expect(styleOverview.factory).not.toBe('');
      expect(styleOverview.buyer).not.toBe('');
      expect(bomItems.length).toBeGreaterThan(0);
    },
  );

  it('MB62SLM103Z: 병합된 원단/부자재 항목("배 색 COMBINATION")은 중복 없이 정확히 1번만 나와야 한다', () => {
    const { rows, merges } = readSheet('MB62SLM103Z');
    const { bomItems } = SectionParser.parse(rows, merges);

    const combinationRows = bomItems.filter((item: any) => item.itemName.includes('COMBINATION'));
    expect(combinationRows).toHaveLength(1);
    expect(combinationRows[0].consumption).toBeCloseTo(0.07);
  });

  it('MB62SLM103Z: totalQty=700 정확히 파싱되어야 한다 (콤마 없는 QTY)', () => {
    const { rows, merges } = readSheet('MB62SLM103Z');
    const { styleOverview } = SectionParser.parse(rows, merges);
    expect(styleOverview.totalQty).toBe(700);
    expect(styleOverview.factory).toBe('베트남');
    expect(styleOverview.buyer).toBe('미도컴퍼니');
  });

  it('MB6YSLM115Z: totalQty=1966 정확히 파싱되어야 한다 (엑셀 표시상 콤마가 붙는 QTY)', () => {
    const { rows, merges } = readSheet('MB6YSLM115Z');
    const { styleOverview } = SectionParser.parse(rows, merges);
    expect(styleOverview.totalQty).toBe(1966);
    expect(styleOverview.factory).toBe('베트남');
    expect(styleOverview.buyer).toBe('미도컴퍼니');
  });

  it('MB62SLM103Z: 병합 없이 시트 끝 여백행만 이어지는 POLY BAG은 forward-fill로 부풀려지지 않고 정확히 1번만 나와야 한다', () => {
    // POLY BAG은 시트의 마지막 실제 데이터 행이고 그 뒤로는 병합되지 않은 완전 공백 행만
    // 이어진다(시트 물리적 범위(!ref)의 여백). 과거에는 ITEM 칸이 비면 무조건 forward-fill
    // 했기 때문에 이 공백 행들이 전부 POLY BAG으로 흡수되어 13개까지 부풀려졌었다.
    const { rows, merges } = readSheet('MB62SLM103Z');
    const { bomItems } = SectionParser.parse(rows, merges);

    const polyBagRows = bomItems.filter((item: any) => item.itemName.includes('POLY BAG'));
    expect(polyBagRows).toHaveLength(1);
  });

  it('MB6YHMP102Z-1: 병합 그룹 시작행이 완전 공백이어도 직전 자재 이름으로 흡수되지 않아야 한다', () => {
    // "심 지" 항목(row 24) 바로 다음의 새 병합 그룹 시작행(row 27)이 모든 컬럼이 빈 값인
    // 완전 공백 행인데, 과거에는 forward-fill로 "심 지"의 두 번째 항목으로 잘못 흡수됐었다.
    const { rows, merges } = readSheet('MB6YHMP102Z-1');
    const { bomItems } = SectionParser.parse(rows, merges);

    const interliningRows = bomItems.filter((item: any) => item.itemName.includes('INTERLINING') && item.itemName.includes('M-250'));
    expect(interliningRows).toHaveLength(1);
  });

  it('ITEM 칸이 비어도 요척/사용칼라 등 다른 값이 있으면 진짜 사이즈별 세부 행이므로 forward-fill을 그대로 유지해야 한다', () => {
    // section-parser.util.ts의 blank-row 판정은 ITEM 칸뿐 아니라 요척/사용칼라/규격까지
    // 모두 비어있을 때만 스킵한다. 그중 하나라도 값이 있으면(예: 같은 자재의 다른 색상 소요량)
    // 여전히 forward-fill로 이름을 물려받아 별도 항목으로 유지되어야 한다 — 이번 수정이
    // CARE LABEL/PRICE TAG류의 "진짜 사이즈별 다중행" 처리를 깨뜨리지 않았는지 확인한다.
    const { rows, merges } = readSheet('MB62SLM103Z');
    const { bomItems } = SectionParser.parse(rows, merges);

    const careLabel = bomItems.filter((item: any) => item.itemName.includes('CARE LABEL'));
    const priceTag = bomItems.filter((item: any) => item.itemName.includes('PRICE TAG'));
    expect(careLabel).toHaveLength(1);
    expect(priceTag).toHaveLength(1);
  });

  it('헤더 레이아웃이 어긋나 totalQty를 숫자로 읽지 못하면 조용히 넘어가지 않고 예외를 던져야 한다', () => {
    // 실제 시트 데이터를 그대로 쓰되, QTY 값이 있어야 할 자리(index 8)를 비워
    // "레이블만 있고 값이 없는" 깨진 레이아웃을 재현한다.
    const { rows, merges } = readSheet('MB62SLM103Z');
    const brokenRows = rows.map((row) => [...row]);
    brokenRows[1] = [...brokenRows[1]];
    brokenRows[1][8] = brokenRows[1][7]; // "QTY" 레이블 문자열을 값 자리에 덮어씀 (과거 버그 재현)

    expect(() => SectionParser.parse(brokenRows, merges)).toThrow();
  });
});
