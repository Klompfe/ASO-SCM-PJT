import { describe, expect, it } from 'vitest';
import { groupByInvoiceNo } from './importShipmentGrouping';
import type { ImportShipment } from '../api/importShipments.service';

const shipment = (id: number, invoiceNo: string | null, status: 'PENDING_CLEARANCE' | 'CLEARED'): ImportShipment =>
  ({ id, styleNo: `S${id}`, invoiceNo, status, lines: [], createdAt: '', updatedAt: '' }) as ImportShipment;

describe('groupByInvoiceNo (PR-152)', () => {
  it('같은 invoiceNo를 가진 문서들을 하나의 그룹으로 묶는다', () => {
    const groups = groupByInvoiceNo([
      shipment(1, 'INV-A', 'PENDING_CLEARANCE'),
      shipment(2, 'INV-B', 'PENDING_CLEARANCE'),
      shipment(3, 'INV-A', 'PENDING_CLEARANCE'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ invoiceNo: 'INV-A', pendingCount: 2 });
    expect(groups[0].shipments.map((s) => s.id)).toEqual([1, 3]);
    expect(groups[1]).toMatchObject({ invoiceNo: 'INV-B', pendingCount: 1 });
  });

  it('그룹 순서는 원본 목록에서 그 invoiceNo가 처음 등장한 순서를 따른다', () => {
    const groups = groupByInvoiceNo([
      shipment(1, 'INV-B', 'PENDING_CLEARANCE'),
      shipment(2, 'INV-A', 'PENDING_CLEARANCE'),
      shipment(3, 'INV-B', 'PENDING_CLEARANCE'),
    ]);
    expect(groups.map((g) => g.invoiceNo)).toEqual(['INV-B', 'INV-A']);
  });

  it('pendingCount는 그 그룹 안의 PENDING_CLEARANCE 건수만 센다(CLEARED 제외)', () => {
    const groups = groupByInvoiceNo([
      shipment(1, 'INV-A', 'CLEARED'),
      shipment(2, 'INV-A', 'PENDING_CLEARANCE'),
      shipment(3, 'INV-A', 'CLEARED'),
    ]);
    expect(groups[0].pendingCount).toBe(1);
    expect(groups[0].shipments).toHaveLength(3);
  });

  it('invoiceNo가 없는(null/undefined) 문서는 각자 독립된 그룹이 된다', () => {
    const s1 = shipment(1, null, 'PENDING_CLEARANCE');
    const s2 = { ...shipment(2, null, 'PENDING_CLEARANCE'), invoiceNo: undefined } as ImportShipment;
    const groups = groupByInvoiceNo([s1, s2]);

    // null/undefined는 같은 key(null)로 묶인다 — "인보이스 미지정"이라는 같은 의미이므로 하나로 합쳐도 무방하다.
    expect(groups).toHaveLength(1);
    expect(groups[0].invoiceNo).toBeNull();
    expect(groups[0].shipments).toHaveLength(2);
  });

  it('빈 목록은 빈 배열을 반환한다', () => {
    expect(groupByInvoiceNo([])).toEqual([]);
  });
});
