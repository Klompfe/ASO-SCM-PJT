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

export interface ParsedWorkbookSheet {
  sheetName: string;
  rows: string[][];
  merges: CellMergeRange[];
}

export interface ParsedWorkbook {
  sheets: ParsedWorkbookSheet[];
}

export class ExcelParser {
  private static readonly logger = new Logger('ExcelParser');

  // 시트 하나가 실제 스타일 자재명세인지(STYLE NO 헤더 및 BOM 헤더 행 존재), 아니면 아직
  // 아무 데이터도 채워지지 않은 빈 템플릿 탭인지 판별한다. PR-026.1/PR-028에서 39개 유효
  // 시트 vs 9개 빈 템플릿 시트를 가려낼 때 쓴 것과 동일한 기준이다.
  private static isValidStyleSheet(rows: string[][]): boolean {
    return !!(rows[1] && rows[1][1] && String(rows[1][1]).trim() !== '' && rows[13]);
  }

  private static readWorkbook(buffer: Buffer) {
    try {
      return xlsx.read(buffer, {
        type: 'buffer',
        cellStyles: false,
        sheetStubs: false,
        bookVBA: false,
      });
    } catch (e) {
      this.logger.error('[PARSER CRASH DETAILED] Excel strict parse failed', e);
      return xlsx.read(buffer, { type: 'buffer' });
    }
  }

  // 하위호환용: 첫 번째 시트 하나만 반환한다. (엑셀을 못 읽으면 CSV 텍스트로 fallback)
  static parse(buffer: Buffer): ParsedExcelSheet {
    let workbook;
    try {
      workbook = this.readWorkbook(buffer);
    } catch (e2) {
      this.logger.error('[PARSER CRASH DETAILED] Excel raw parse failed', e2);
      return {
        rows: buffer.toString().split(/\r?\n/).map(line => line.split(',')),
        merges: [],
      };
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as string[][];
    const merges = (worksheet['!merges'] || []) as CellMergeRange[];
    return { rows, merges };
  }

  // 워크북 전체를 순회하며 유효한 스타일 시트만 골라 배열로 반환한다.
  // 엑셀 자체를 못 읽는 경우(치명적 손상 파일)는 CSV 텍스트로 fallback해
  // 시트 1개짜리 워크북처럼 취급한다.
  static parseWorkbook(buffer: Buffer): ParsedWorkbook {
    let workbook;
    try {
      workbook = this.readWorkbook(buffer);
    } catch (e2) {
      this.logger.error('[PARSER CRASH DETAILED] Excel raw parse failed', e2);
      return {
        sheets: [
          {
            sheetName: 'CSV',
            rows: buffer.toString().split(/\r?\n/).map(line => line.split(',')),
            merges: [],
          },
        ],
      };
    }

    const sheets: ParsedWorkbookSheet[] = [];
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as string[][];
      if (!this.isValidStyleSheet(rows)) continue;

      const merges = (worksheet['!merges'] || []) as CellMergeRange[];
      sheets.push({ sheetName, rows, merges });
    }

    return { sheets };
  }
}
