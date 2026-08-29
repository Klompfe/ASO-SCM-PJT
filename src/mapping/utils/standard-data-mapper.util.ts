export interface StandardMaterial {
  styleNo: string;
  factory: string;
  buyer: string;
  itemCategory: string; // Color/Material name
  itemName: string;     // Item Name
  size: string;
  quantity: number;
}

export class StandardDataMapper {
  static parse(csvData: string[][]): StandardMaterial[] {
    if (csvData.length < 13) return [];

    // 1. Extract Metadata (Line 2: Index 1, 7, 11, 15)
    const metaRow = csvData[1];
    const metadata = {
      styleNo: metaRow[1] || '',
      factory: metaRow[11] || '',
      buyer: metaRow[15] || '',
    };

    // 2. Extract Data (Line 13 onwards)
    const dataRows = csvData.slice(12);

    const results: StandardMaterial[] = [];

    dataRows.forEach((row) => {
      // Assuming structure based on provided sample analysis:
      // Row[0]: Color, Row[1]: ItemName, Row[2]: Size (55), Row[3]: Size (66), Row[4]: Size (77)
      const color = row[0];
      const itemName = row[1];
      
      if (!color && !itemName) return; // Skip empty rows

      // Process size columns
      for (let i = 2; i <= 4; i++) {
        const qty = parseFloat(row[i]) || 0;
        if (qty > 0) {
          results.push({
            ...metadata,
            itemCategory: color || 'N/A',
            itemName: itemName || 'N/A',
            size: i === 2 ? '55' : i === 3 ? '66.0' : '77.0',
            quantity: qty,
          });
        }
      }
    });

    return results;
  }
}
