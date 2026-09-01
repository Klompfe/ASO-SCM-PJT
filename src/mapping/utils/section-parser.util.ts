import { StandardMaterial } from '../interfaces/standard-material.interface';
import { Logger } from '@nestjs/common';

export class SectionParser {
  private static readonly logger = new Logger('SectionParser');

  static parse(rawData: string[][]) {
    try {
        console.log('[PARSER RAW] First 10 rows:', rawData.slice(0, 10));

        const headerRow = rawData[1]; 

        const styleOverview = {
        styleNo: headerRow[1],
        totalQty: parseFloat(headerRow[7] || '0'),
        factory: headerRow[11],
        buyer: headerRow[18],
        shipDate: rawData[9][18] 
        };

        const bomRows = rawData.slice(13);
        const bomItems = this.parseBomItems(bomRows, styleOverview.totalQty);

        console.log('[PARSER RESULT]', { overview: styleOverview, count: bomItems.length });
        return { styleOverview, bomItems };
    } catch (e) {
        this.logger.error('[PARSER CRASH DETAILED] Section parsing failed', e);
        throw e;
    }
  }

  private static parseBomItems(rows: string[][], totalQty: number): any[] {
    const headerRowIndex = 0; // BOM Header starts immediately in sliced data
    const headers = rows[headerRowIndex].map(h => h?.trim().toUpperCase());
    
    const toNum = (val: string | undefined | null) => parseFloat(val || '0') || 0;
    
    let lastItemName = '';
    const items = rows.slice(headerRowIndex + 2).map(row => {
        // Forward Fill ITEM
        const rawItemName = row[0]?.trim(); // Column 0 is ITEM
        const itemName = rawItemName || lastItemName;
        lastItemName = itemName;

        return {
            category: row[0], // Column 0
            itemName: itemName.toUpperCase(),
            consumption: toNum(row[headers.indexOf("CON'S")]),
            requiredQty: toNum(row[headers.indexOf("CON'S")]) * totalQty,
            colorOf: row[2], // Color Of
            spec: row[8] // Spec
        };
    }).filter(item => item.itemName && item.itemName !== 'ITEMS');

    return items;
  }
}
