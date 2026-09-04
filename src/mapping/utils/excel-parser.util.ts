import * as xlsx from 'xlsx';
import { Logger } from '@nestjs/common';

export interface CellMergeRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

export interface ParsedExcelSheet {
  rows: string[][];
  // 셀 병합 범위(예: ITEM 컬럼이 2행에 걸쳐 병합된 경우). CSV 텍스트 fallback 시에는 항상 빈 배열.
  merges: CellMergeRange[];
}

export class ExcelParser {
  private static readonly logger = new Logger('ExcelParser');

  static parse(buffer: Buffer): ParsedExcelSheet {
    let workbook;
    try {
      workbook = xlsx.read(buffer, {
        type: 'buffer',
        cellStyles: false,
        sheetStubs: false,
        bookVBA: false,
      });
    } catch (e) {
      this.logger.error('[PARSER CRASH DETAILED] Excel strict parse failed', e);
      try {
        workbook = xlsx.read(buffer, { type: 'buffer' });
      } catch (e2) {
        this.logger.error('[PARSER CRASH DETAILED] Excel raw parse failed', e2);
        return {
          rows: buffer.toString().split(/\r?\n/).map(line => line.split(',')),
          merges: [],
        };
      }
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as string[][];
    const merges = (worksheet['!merges'] || []) as CellMergeRange[];
    return { rows, merges };
  }
}
