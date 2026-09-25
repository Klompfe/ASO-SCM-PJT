import type { ImportShipment } from '../api/importShipments.service';

// PR-152: 수입통관 목록을 INVOICE 번호(invoiceNo) 단위로 묶는다 — "통관완료 일괄처리"가
// 인보이스 단위로 동작하므로, 화면도 인보이스 헤더 단위로 그룹을 보여주고 그 헤더에
// 일괄처리 버튼을 둔다. invoiceNo가 없는 문서는 묶을 대상이 없어 각자 독립된 그룹(key=null)이
// 된다 — 그런 그룹은 일괄처리 버튼을 보여줄 이유가 없다(화면에서 별도 처리).
export interface InvoiceGroup {
  invoiceNo: string | null;
  shipments: ImportShipment[];
  pendingCount: number;
}

export function groupByInvoiceNo(shipments: ImportShipment[]): InvoiceGroup[] {
  const byKey = new Map<string | null, ImportShipment[]>();
  const order: (string | null)[] = [];

  for (const s of shipments) {
    const key = s.invoiceNo ?? null;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(s);
  }

  return order.map((key) => {
    const list = byKey.get(key)!;
    return {
      invoiceNo: key,
      shipments: list,
      pendingCount: list.filter((s) => s.status === 'PENDING_CLEARANCE').length,
    };
  });
}
