import * as xlsx from 'xlsx';
import { Logger } from '@nestjs/common';

export class ExcelParser {
  private static readonly logger = new Logger('ExcelParser');

  static parse(buffer: Buffer): string[][] {
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
        return buffer.toString().split(/\r?\n/).map(line => line.split(','));
      }
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as string[][];
  }
}
