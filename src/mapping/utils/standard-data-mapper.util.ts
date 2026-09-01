import { StandardMaterial } from '../interfaces/standard-material.interface';

export class StandardDataMapper {
  static parse(csvData: string[][]): StandardMaterial[] {
    console.log('[StandardDataMapper] Parsing with normalization...');

    const headerRowIndex = csvData.findIndex(row => 
        row.some(cell => String(cell).trim().toUpperCase().includes('ITEM'))
    );
    if (headerRowIndex === -1) return [];
    
    const headers = csvData[headerRowIndex].map(h => h.trim().toUpperCase());
    const getColIndex = (keywords: string[]) => headers.findIndex(h => keywords.some(kw => h.includes(kw)));

    const colMap = {
        itemName: getColIndex(['ITEM']),
        orderQty: getColIndex(['QTY']),
        colorOf: getColIndex(['COLOR']),
        colorUsed: getColIndex(['COLOR USED']),
        spec: getColIndex(['SPEC']),
        consumption: getColIndex(['CON']),
        requiredQty: getColIndex(['REQUIRED']),
        poDate: getColIndex(['PO DATE']),
        poQty: getColIndex(['PO QTY']),
        shipment1Date: getColIndex(['SHIPMENT 1']),
        shipment1RcvdQty: getColIndex(['RCVD 1']),
        bln: getColIndex(['BLN']),
        shipment2Date: getColIndex(['SHIPMENT 2']),
        shipment2RcvdQty: getColIndex(['RCVD 2']),
        supplier: getColIndex(['SUPPLIER']),
        unitPrice: getColIndex(['PRICE']),
        remarks: getColIndex(['REMARK']),
    };

    const results: StandardMaterial[] = [];
    let lastItemName = '';

    const RAW_MATERIAL_KEYWORDS = ['OUT-SHELL', 'COMBINATION', 'LINING'];

    for (let i = headerRowIndex + 1; i < csvData.length; i++) {
        const row = csvData[i];
        if (row.every(cell => !cell || cell.trim() === '')) continue;

        // N1: Forward fill
        const rawItemName = (row[colMap.itemName] || '').trim();
        const itemName = rawItemName || lastItemName;
        lastItemName = itemName;

        // N2: Keywords extraction
        let code = '';
        for (const kw of RAW_MATERIAL_KEYWORDS) {
            if (itemName.toUpperCase().includes(kw)) {
                code = kw;
                break;
            }
        }

        // N4: DB Type Normalization
        const dbType = RAW_MATERIAL_KEYWORDS.some(kw => itemName.toUpperCase().includes(kw)) ? 'RAW_MATERIAL' : 'GENERAL';

        // N3: Number conversion
        const toNum = (val: string | undefined) => parseFloat(val || '0') || 0;

        results.push({
            code,
            itemName,
            orderQty: toNum(row[colMap.orderQty]),
            colorOf: (row[colMap.colorOf] || '').trim(),
            colorUsed: (row[colMap.colorUsed] || '').trim(),
            spec: (row[colMap.spec] || '').trim(),
            consumption: toNum(row[colMap.consumption]),
            requiredQty: toNum(row[colMap.requiredQty]),
            poDate: (row[colMap.poDate] || '').trim(),
            poQty: toNum(row[colMap.poQty]),
            shipment1Date: (row[colMap.shipment1Date] || '').trim(),
            shipment1RcvdQty: toNum(row[colMap.shipment1RcvdQty]),
            bln: toNum(row[colMap.bln]),
            shipment2Date: (row[colMap.shipment2Date] || '').trim(),
            shipment2RcvdQty: toNum(row[colMap.shipment2RcvdQty]),
            supplier: (row[colMap.supplier] || '').trim(),
            unitPrice: toNum(row[colMap.unitPrice]),
            remarks: (row[colMap.remarks] || '').trim(),
            status: 'MAPPED',
            dbType
        });
    }

    return results;
  }
}
