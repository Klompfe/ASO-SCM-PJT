import React, { useEffect, useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { getInventories, type Inventory } from '../api/inventories.service';
import { getErrorMessage } from '../utils/errorMessage';
import { PrintableReport } from './PrintableReport';
import type { ExcelColumn } from '../utils/excelExport';

const ITEM_TYPE_LABELS: Record<string, string> = {
  RAW_MATERIAL: '원자재',
  SEMI_FINISHED: '반제품',
  FINISHED_GOOD: '완제품',
};

// PR-110: src/inventories/(백엔드)는 PR-018 즈음부터 있었지만 프론트 화면이 없어
// 처음으로 연결한다. 재주문점/최소재고 필드는 현재 Inventory 엔티티에 없어 표시하지 않는다.
export const InventoryReport: React.FC = () => {
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getInventories();
      setInventories(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '재고 현황을 불러오는 데 실패했습니다.'));
      setInventories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!typeFilter) return inventories;
    return inventories.filter((inv) => inv.item?.type === typeFilter);
  }, [inventories, typeFilter]);

  if (loading) {
    return <div className="p-4 text-gray-500">불러오는 중...</div>;
  }

  const excelColumns: ExcelColumn<Inventory>[] = [
    { header: '품목코드', accessor: (inv) => inv.item?.code ?? '' },
    { header: '품목명', accessor: (inv) => inv.item?.name ?? '' },
    { header: '구분', accessor: (inv) => ITEM_TYPE_LABELS[inv.item?.type ?? ''] ?? inv.item?.type ?? '' },
    { header: '단위', accessor: (inv) => inv.item?.unit ?? '' },
    { header: '현재 수량', accessor: (inv) => inv.quantity },
  ];

  return (
    <PrintableReport
      title={`재고현황 (${filteredRows.length}건)`}
      subtitle={typeFilter ? `구분: ${ITEM_TYPE_LABELS[typeFilter] ?? typeFilter}` : undefined}
      columns={excelColumns}
      rows={filteredRows}
      fileName="재고현황"
    >
      <div className="flex justify-end items-center mb-3 print:hidden">
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-2 py-1 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">전체 구분</option>
            {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button onClick={load} className="text-sm text-blue-600 hover:underline">새로고침</button>
        </div>
      </div>
      {filteredRows.length === 0 ? (
        <p className="text-sm text-gray-500">등록된 재고가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2">품목코드</th>
                <th className="p-2">품목명</th>
                <th className="p-2">구분</th>
                <th className="p-2">단위</th>
                <th className="p-2 text-right">현재 수량</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((inv) => (
                <tr key={inv.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-mono">{inv.item?.code ?? '-'}</td>
                  <td className="p-2">{inv.item?.name ?? '-'}</td>
                  <td className="p-2">{ITEM_TYPE_LABELS[inv.item?.type ?? ''] ?? inv.item?.type ?? '-'}</td>
                  <td className="p-2">{inv.item?.unit ?? '-'}</td>
                  <td className="p-2 text-right font-semibold">{inv.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PrintableReport>
  );
};
