export interface StandardMaterial {
  itemName: string;
  orderQty: number;
  colorOf: string;
  colorUsed: string;
  spec: string;
  consumption: number;
  requiredQty: number;
  poDate: string;
  poQty: number;
  shipment1Date: string;
  shipment1RcvdQty: number;
  bln: number;
  shipment2Date: string;
  shipment2RcvdQty: number;
  supplier: string;
  unitPrice: number;
  remarks: string;
  status: string;
}

export class StandardDataMapper {
  static parse(csvData: string[][]): StandardMaterial[] {
    console.log('[StandardDataMapper] Parsing all columns...');

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

    for (let i = headerRowIndex + 1; i < csvData.length; i++) {
        const row = csvData[i];
        if (row.every(cell => !cell || cell.trim() === '')) continue;

        const rawItemName = (row[colMap.itemName] || '').trim();
        const itemName = rawItemName || lastItemName;
        lastItemName = itemName;

        results.push({
            itemName,
            orderQty: parseFloat(row[colMap.orderQty] || '0'),
            colorOf: (row[colMap.colorOf] || '').trim(),
            colorUsed: (row[colMap.colorUsed] || '').trim(),
            spec: (row[colMap.spec] || '').trim(),
            consumption: parseFloat(row[colMap.consumption] || '0'),
            requiredQty: parseFloat(row[colMap.requiredQty] || '0'),
            poDate: (row[colMap.poDate] || '').trim(),
            poQty: parseFloat(row[colMap.poQty] || '0'),
            shipment1Date: (row[colMap.shipment1Date] || '').trim(),
            shipment1RcvdQty: parseFloat(row[colMap.shipment1RcvdQty] || '0'),
            bln: parseFloat(row[colMap.bln] || '0'),
            shipment2Date: (row[colMap.shipment2Date] || '').trim(),
            shipment2RcvdQty: parseFloat(row[colMap.shipment2RcvdQty] || '0'),
            supplier: (row[colMap.supplier] || '').trim(),
            unitPrice: parseFloat(row[colMap.unitPrice] || '0'),
            remarks: (row[colMap.remarks] || '').trim(),
            status: 'MAPPED'
        });
    }

    return results;
  }
}
