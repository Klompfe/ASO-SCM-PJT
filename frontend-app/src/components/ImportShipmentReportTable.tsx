import React from 'react';
import type { ImportShipment } from '../api/importShipments.service';
import { STATUS_LABELS, hasAmount, totalAmountOf, totalQtyOf } from '../utils/importShipmentReport';

const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

// PR-114: 인쇄 전용 평면 표(화면에서는 기존 카드 목록을 그대로 쓰고 이 표는 숨긴다).
export const ImportShipmentReportTable: React.FC<{ shipments: ImportShipment[] }> = ({ shipments }) => (
  <table className="w-full text-sm border-collapse">
    <thead>
      <tr className="bg-gray-100 text-left">
        {['스타일번호', '브랜드', 'INVOICE 번호', 'INVOICE 일자', 'POD(도착항)', 'ETD', 'ETA', '상태', '통관일', '수량', '금액'].map((h) => (
          <th key={h} className="border border-gray-300 px-2 py-1">{h}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {shipments.map((s) => (
        <tr key={s.id}>
          <td className="border border-gray-300 px-2 py-1">{s.styleNo}</td>
          <td className="border border-gray-300 px-2 py-1">{s.brand ?? '-'}</td>
          <td className="border border-gray-300 px-2 py-1">{s.invoiceNo ?? '-'}</td>
          <td className="border border-gray-300 px-2 py-1">{s.invoiceDate ? String(s.invoiceDate).slice(0, 10) : '-'}</td>
          <td className="border border-gray-300 px-2 py-1">{s.pod ?? '-'}</td>
          <td className="border border-gray-300 px-2 py-1">{s.etd ? String(s.etd).slice(0, 10) : '-'}</td>
          <td className="border border-gray-300 px-2 py-1">{s.eta ? String(s.eta).slice(0, 10) : '-'}</td>
          <td className="border border-gray-300 px-2 py-1">{STATUS_LABELS[s.status] ?? s.status}</td>
          <td className="border border-gray-300 px-2 py-1">{s.clearedAt ? String(s.clearedAt).slice(0, 10) : '-'}</td>
          <td className="border border-gray-300 px-2 py-1 text-right">{fmt(totalQtyOf(s))}</td>
          <td className="border border-gray-300 px-2 py-1 text-right">{hasAmount(s) ? fmt(totalAmountOf(s)) : '-'}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
