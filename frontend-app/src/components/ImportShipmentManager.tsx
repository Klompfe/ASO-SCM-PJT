import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getImportShipments,
  createImportShipment,
  updateImportShipmentStatus,
  updateImportShipmentLineHsCode,
  type ImportShipment,
  type CreateImportShipmentLine,
} from '../api/importShipments.service';
import { getMasterStyles, type MasterStyle } from '../api/styles.service';
import { getErrorMessage } from '../utils/errorMessage';

const emptyLine: CreateImportShipmentLine = {
  itemType: '',
  composition: '',
  fabricType: '직물',
  qty: 1,
  unit: 'EA',
};

// PR-082: 완제품 수입통관 추적 화면. 옛 "선적관리 > 수입" 탭에 임시로 얹혀 있던
// ShipmentsManager(원자재 입고)는 Purchase Orders 쪽으로 옮겼고, 이 화면이 그
// 자리를 대체한다. 범위는 HS코드 자동조회/기록까지만 — 원부자재단가/선적일
// 계산은 저장소 밖의 수입통관 이메일 에이전트가 담당한다.
export const ImportShipmentManager: React.FC = () => {
  const [shipments, setShipments] = useState<ImportShipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [styles, setStyles] = useState<MasterStyle[]>([]);
  const [styleQuery, setStyleQuery] = useState('');

  const [styleNo, setStyleNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [lines, setLines] = useState<CreateImportShipmentLine[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);
  const [hsCodeDrafts, setHsCodeDrafts] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getImportShipments();
      setShipments(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수입통관 목록을 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await getMasterStyles(styleQuery ? { styleNo: styleQuery } : undefined);
        const data = Array.isArray(res) ? res : (res?.items ?? []);
        setStyles(data);
      } catch {
        setStyles([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [styleQuery]);

  const updateLine = (idx: number, patch: Partial<CreateImportShipmentLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const resetForm = () => {
    setStyleNo('');
    setInvoiceNo('');
    setInvoiceDate('');
    setLines([{ ...emptyLine }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!styleNo) {
      toast.error('스타일번호를 선택해 주세요.');
      return;
    }
    setSaving(true);
    try {
      await createImportShipment({
        styleNo,
        invoiceNo: invoiceNo || undefined,
        invoiceDate: invoiceDate || undefined,
        lines,
      });
      toast.success('수입통관 문서가 등록되었습니다.');
      resetForm();
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '등록에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (id: number) => {
    try {
      await updateImportShipmentStatus(id, 'CLEARED');
      toast.success('통관완료 처리되었습니다.');
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '처리에 실패했습니다.'));
    }
  };

  const handleHsCodeSave = async (importShipmentId: number, lineId: number) => {
    const value = hsCodeDrafts[lineId];
    if (!value) {
      toast.error('HS코드를 입력해 주세요.');
      return;
    }
    try {
      await updateImportShipmentLineHsCode(importShipmentId, lineId, value);
      toast.success('HS코드가 저장되었습니다.');
      setHsCodeDrafts((prev) => {
        const next = { ...prev };
        delete next[lineId];
        return next;
      });
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'HS코드 저장에 실패했습니다.'));
    }
  };

  const statusBadge = (status: string) => {
    const style = status === 'CLEARED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
    return <span className={`px-2 py-1 rounded text-xs font-medium ${style}`}>{status}</span>;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">완제품 수입통관</h2>
      <p className="text-sm text-gray-500">
        태일 VN 공장에서 생산된 완제품의 한국 수입통관을 추적합니다. HS코드는
        품종/재직/혼용률 조합으로 자동조회되며, 일치하는 값이 없으면 "HS코드 미확인"으로
        표시됩니다. 원부자재단가/선적일 계산은 수입통관 이메일 에이전트가 별도로 처리합니다.
      </p>

      <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">스타일번호</label>
            <input
              className="border border-gray-300 rounded px-3 py-2"
              placeholder="스타일번호 검색/입력"
              value={styleNo || styleQuery}
              onChange={(e) => {
                setStyleQuery(e.target.value);
                setStyleNo('');
              }}
              list="import-shipment-style-options"
              onBlur={(e) => {
                if (styles.some((s) => s.styleNo === e.target.value)) setStyleNo(e.target.value);
              }}
            />
            <datalist id="import-shipment-style-options">
              {styles.map((s) => (
                <option key={s.styleNo} value={s.styleNo}>
                  {s.overview?.styleName ?? ''}
                </option>
              ))}
            </datalist>
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">INVOICE 번호</label>
            <input
              className="border border-gray-300 rounded px-3 py-2"
              placeholder="예: TYVN2026-26"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">INVOICE 일자</label>
            <input
              type="date"
              className="border border-gray-300 rounded px-3 py-2"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">라인</p>
          {lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end bg-white p-2 rounded border border-gray-200">
              <input
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                placeholder="품종 (예: WOMEN'S JACKET)"
                value={line.itemType}
                onChange={(e) => updateLine(idx, { itemType: e.target.value })}
                required
              />
              <input
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                placeholder="재직"
                value={line.fabricType}
                onChange={(e) => updateLine(idx, { fabricType: e.target.value })}
              />
              <input
                className="border border-gray-300 rounded px-2 py-1 text-sm col-span-2"
                placeholder="혼용률"
                value={line.composition}
                onChange={(e) => updateLine(idx, { composition: e.target.value })}
                required
              />
              <input
                type="number"
                min={0}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                placeholder="수량"
                value={line.qty}
                onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
              />
              <input
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                placeholder="단위"
                value={line.unit}
                onChange={(e) => updateLine(idx, { unit: e.target.value })}
              />
              <button
                type="button"
                className="text-red-600 text-sm"
                onClick={() => removeLine(idx)}
                disabled={lines.length === 1}
              >삭제</button>
            </div>
          ))}
          <button type="button" onClick={addLine} className="text-blue-600 text-sm font-medium">+ 라인 추가</button>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '등록 중...' : '수입통관 문서 등록'}
        </button>
      </form>

      {loading ? (
        <div className="text-sm text-gray-500">불러오는 중...</div>
      ) : (
        <div className="space-y-4">
          {shipments.map((s) => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-gray-800">{s.styleNo}</span>
                  {s.style?.overview?.styleName && (
                    <span className="text-gray-500 text-sm ml-2">{s.style.overview.styleName}</span>
                  )}
                  {s.invoiceNo && <span className="text-gray-400 text-xs ml-2">INV: {s.invoiceNo}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(s.status)}
                  {s.status === 'PENDING_CLEARANCE' && (
                    <button
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                      onClick={() => handleClear(s.id)}
                    >통관완료 처리</button>
                  )}
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="py-1 pr-2">품종</th>
                    <th className="py-1 pr-2">재직</th>
                    <th className="py-1 pr-2">혼용률</th>
                    <th className="py-1 pr-2">HS코드</th>
                    <th className="py-1 pr-2">수량</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((line) => (
                    <tr key={line.id} className="border-b border-gray-50">
                      <td className="py-1 pr-2">{line.itemType}</td>
                      <td className="py-1 pr-2">{line.fabricType}</td>
                      <td className="py-1 pr-2">{line.composition}</td>
                      <td className="py-1 pr-2">
                        {line.unmatched ? (
                          <div className="flex items-center gap-1">
                            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">HS코드 미확인</span>
                            <input
                              className="border border-gray-300 rounded px-1 py-0.5 text-xs w-28"
                              placeholder="HS코드 입력"
                              value={hsCodeDrafts[line.id] ?? ''}
                              onChange={(e) =>
                                setHsCodeDrafts((prev) => ({ ...prev, [line.id]: e.target.value }))
                              }
                            />
                            <button
                              className="text-blue-600 text-xs"
                              onClick={() => handleHsCodeSave(s.id, line.id)}
                            >저장</button>
                          </div>
                        ) : (
                          <span className="font-mono">{line.hsCode}</span>
                        )}
                      </td>
                      <td className="py-1 pr-2">{line.qty} {line.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {shipments.length === 0 && (
            <div className="text-center text-gray-400 py-8">등록된 수입통관 문서가 없습니다.</div>
          )}
        </div>
      )}
    </div>
  );
};
