import type * as XLSXTypes from 'xlsx';

// PR-110: 백엔드(src/*/utils/*-parser.util.ts)가 업로드 파싱에 이미 쓰고 있는
// xlsx(SheetJS)와 동일한 라이브러리를 내보내기(export)에도 재사용한다 — 팀이 이미
// 다루는 라이브러리라 학습 비용이 없다. 다만 xlsx 자체가 꽤 무거워(gzip 기준 +~100KB)
// 정적으로 import하면 보고서 화면을 전혀 안 쓰는 사용자도 첫 로딩에 그 비용을 문다 —
// 그래서 실제로 내보내기 버튼을 눌렀을 때만 동적 import()로 불러와 Vite가 별도
// 청크로 분리하게 한다.
export interface ExcelColumn<T> {
  header: string;
  accessor: (row: T) => string | number | Date | null | undefined;
}

// 워크북 생성만 담당하는 함수 — DOM 없이도(Node 환경에서도) 그대로 테스트할 수
// 있다(다시 파싱해 원본 데이터와 비교). xlsx는 동적 import이므로 async다.
export async function buildWorkbook<T>(
  columns: ExcelColumn<T>[],
  rows: T[],
  sheetName = 'Sheet1',
): Promise<XLSXTypes.WorkBook> {
  const XLSX: typeof XLSXTypes = await import('xlsx');

  const headerRow = columns.map((c) => c.header);
  const dataRows = rows.map((row) =>
    columns.map((c) => {
      const value = c.accessor(row);
      return value === null || value === undefined ? '' : value;
    }),
  );

  // cellDates:true — Date 값을 엑셀 시리얼 숫자로 뭉개지 않고 날짜 타입 셀로 저장한다.
  const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows], { cellDates: true });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return workbook;
}

// 화면에 표시 중인 표 데이터를 그대로 .xlsx 파일로 다운로드한다. 브라우저 전용
// (XLSX.writeFile이 내부적으로 다운로드를 트리거).
export async function exportTableToExcel<T>(
  columns: ExcelColumn<T>[],
  rows: T[],
  fileName: string,
  sheetName?: string,
): Promise<void> {
  const [XLSX, workbook] = await Promise.all([import('xlsx'), buildWorkbook(columns, rows, sheetName)]);
  const finalName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(workbook, finalName);
}
