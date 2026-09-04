import { StandardMaterial } from '../interfaces/standard-material.interface';
import { Logger, BadRequestException } from '@nestjs/common';
import { CellMergeRange } from './excel-parser.util';

export class SectionParser {
  private static readonly logger = new Logger('SectionParser');

  static parse(rawData: string[][], merges: CellMergeRange[] = []) {
    try {
        console.log('[PARSER RAW] First 10 rows:', rawData.slice(0, 10));

        const headerRow = rawData[1];

        // 헤더 행은 "레이블, 값"이 번갈아 나오는 레이아웃이다.
        // 예: [...,"QTY",700,...,"FACTORY","",베트남,...,"BUYER","",미도컴퍼니,...]
        // 47개 시트 전수조사로 확인된 실제 값 위치(레이블 칸이 아니라 값 칸):
        //   QTY 값     -> index 8  (레이블 "QTY"는 index 7)
        //   FACTORY 값 -> index 14 (레이블 "FACTORY"는 index 12, index 13은 빈칸)
        //   BUYER 값   -> index 21 (레이블 "BUYER"는 index 19, index 20은 빈칸)
        const totalQtyRaw = headerRow ? headerRow[8] : undefined;
        const totalQty = parseFloat((totalQtyRaw as unknown as string) || '0');
        if (isNaN(totalQty)) {
          const warnMsg = `[PARSER WARN] totalQty 파싱 실패 — headerRow[8]=${JSON.stringify(totalQtyRaw)} (styleNo=${headerRow ? headerRow[1] : 'N/A'}). 헤더 레이아웃이 예상(레이블+1칸=값)과 다릅니다.`;
          this.logger.warn(warnMsg);
          throw new BadRequestException(warnMsg);
        }

        const styleOverview = {
        styleNo: headerRow[1],
        totalQty,
        factory: headerRow[14],
        buyer: headerRow[21],
        // "1st SHIP DATE :" 레이블은 rawData[9][23], 값은 rawData[9][25].
        // 원본 47개 시트 전수조사 결과 이 필드는 전부 미입력(빈칸) 상태였으나,
        // 향후 값이 채워질 경우를 대비해 정답 위치로 고정해둔다.
        shipDate: rawData[9] ? rawData[9][25] : ''
        };

        const bomItems = this.parseBomItems(rawData, 13, styleOverview.totalQty, merges);

        console.log('[PARSER RESULT]', { overview: styleOverview, count: bomItems.length });
        return { styleOverview, bomItems };
    } catch (e) {
        this.logger.error('[PARSER CRASH DETAILED] Section parsing failed', e);
        throw e;
    }
  }

  // bomStartIndex: BOM 섹션의 상위 헤더 행(예: "ITEMS","QTY","COLOR OF",...)의 절대 행 인덱스.
  // 그 다음 행(bomStartIndex+1)은 서브헤더("OUT SHELL","COLOR USED","SPEC","CON'S",...),
  // 실제 데이터는 bomStartIndex+2부터 시작한다.
  private static parseBomItems(
    rawData: string[][],
    bomStartIndex: number,
    totalQty: number,
    merges: CellMergeRange[],
  ): any[] {
    const headers = rawData[bomStartIndex].map(h => h?.trim().toUpperCase());
    const toNum = (val: string | undefined | null) => parseFloat(val || '0') || 0;
    const consIndex = headers.indexOf("CON'S");

    // ITEM 컬럼(0열)이 여러 행에 걸쳐 병합된 경우, 그건 하나의 자재 항목이 소요량 보조정보를
    // 담기 위해 2행을 쓰는 원본 서식일 뿐이다(47개 시트 전수조사 결과 병합은 항상 정확히
    // 2행짜리였고, 두 번째 행은 실질적으로 빈 값). 병합의 첫 행만 항목으로 채택하고 나머지
    // 연속 행은 건너뛴다. 병합이 아닌데 ITEM 칸이 비어있는 행(예: CARE LABEL/PRICE TAG처럼
    // 사이즈별·차수별 세부 수량이 여러 줄로 나뉜 경우)은 서로 다른 실제 수량 정보이므로
    // 절대 병합하지 않는다 — forward-fill로 이름만 물려받아 별도 항목으로 유지한다.
    const mergedContinuationRows = new Set<number>();
    for (const m of merges) {
      if (m.s.c !== 0 || m.e.c !== 0) continue; // ITEM 컬럼(0열) 병합만 대상
      for (let r = m.s.r + 1; r <= m.e.r; r++) {
        mergedContinuationRows.add(r);
      }
    }

    const dataStartIndex = bomStartIndex + 2;
    let lastItemName = '';
    const items: any[] = [];

    for (let absIndex = dataStartIndex; absIndex < rawData.length; absIndex++) {
      if (mergedContinuationRows.has(absIndex)) continue;

      const row = rawData[absIndex];
      if (!row) continue;

      const rawItemName = row[0]?.trim();
      const itemName = rawItemName || lastItemName;
      lastItemName = itemName;

      if (!itemName || itemName === 'ITEMS') continue;

      items.push({
        category: row[0],
        itemName: itemName.toUpperCase(),
        consumption: toNum(row[consIndex]),
        requiredQty: toNum(row[consIndex]) * totalQty,
        colorOf: row[2],
        spec: row[8],
      });
    }

    return items;
  }
}
