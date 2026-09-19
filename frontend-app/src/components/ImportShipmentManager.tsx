import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getImportShipments,
  createImportShipment,
  updateImportShipmentStatus,
  updateImportShipmentLineHsCode,
  importImportShipmentsFromFile,
  type ImportShipment,
  type CreateImportShipmentLine,
} from '../api/importShipments.service';
import { getMasterStyles, type MasterStyle } from '../api/styles.service';
import { getBrandPrefixRules } from '../api/brandPrefixRules.service';
import { getErrorMessage } from '../utils/errorMessage';
import { GoodsReceiptPanel } from './GoodsReceiptPanel';

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

  // PR-102: 목록 검색 — 스타일번호/자재명(품목)/선적건번호, 모두 조합 가능. 아래
  // styleQuery(등록 폼에서 스타일 고르는 용도)와는 완전히 별개다 — 혼동을 피하려고
  // 접두어를 다르게 두고 목록 상단에 별도 섹션으로 배치한다.
  const [filterStyleNo, setFilterStyleNo] = useState('');
  const [filterMaterialName, setFilterMaterialName] = useState('');
  const [filterSheetNo, setFilterSheetNo] = useState('');
  // PR-111: 브랜드(스타일번호 접두사로 분류) 드롭다운 필터.
  const [filterBrand, setFilterBrand] = useState('');
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [styles, setStyles] = useState<MasterStyle[]>([]);
  const [styleQuery, setStyleQuery] = useState('');

  const [styleNo, setStyleNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [lines, setLines] = useState<CreateImportShipmentLine[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);
  const [hsCodeDrafts, setHsCodeDrafts] = useState<Record<number, string>>({});
  // PR-107: 완제품입고증 패널 — 한 번에 한 shipment만 펼쳐 화면이 복잡해지지 않게 한다.
  const [expandedShipmentId, setExpandedShipmentId] = useState<number | null>(null);

  // PR-083: Vietnam INVOICE/Packing List 엑셀을 그대로 업로드해 스타일별로
  // 수입통관 문서를 자동 생성한다 — ExportShipmentManager의 업로드 버튼+경고 목록
  // 표시 패턴을 그대로 따른다.
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);

  const load = useCallback(async (filter?: { styleNo?: string; materialName?: string; sheetNo?: string; brand?: string }) => {
    setLoading(true);
    try {
      const res = await getImportShipments(filter);
      setShipments(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수입통관 목록을 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load({
      styleNo: filterStyleNo || undefined,
      materialName: filterMaterialName || undefined,
      sheetNo: filterSheetNo || undefined,
      brand: filterBrand || undefined,
    });
  };

  const handleFilterReset = () => {
    setFilterStyleNo('');
    setFilterMaterialName('');
    setFilterSheetNo('');
    setFilterBrand('');
    load();
  };

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getBrandPrefixRules()
      .then((res) => {
        const rules = Array.isArray(res) ? res : [];
        const names = Array.from(new Set(rules.map((r: any) => r.brandName).filter(Boolean)));
        setAvailableBrands(names.sort());
      })
      .catch(() => setAvailableBrands([]));
  }, []);

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

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error('업로드할 엑셀 파일을 선택해 주세요.');
      return;
    }
    setUploading(true);
    setUploadWarnings([]);
    try {
      const res = await importImportShipmentsFromFile(uploadFile);
      const warnings: string[] = res.warnings ?? [];
      setUploadWarnings(warnings);
      toast.success(
        warnings.length > 0
          ? `${res.shipments?.length ?? 0}건 생성 (경고 ${warnings.length}건 — 아래 목록을 확인해 주세요)`
          : `${res.shipments?.length ?? 0}건의 수입통관 문서가 생성되었습니다.`,
      );
      setUploadFile(null);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '엑셀 업로드에 실패했습니다. 지원하지 않는 양식일 수 있습니다.'));
    } finally {
      setUploading(false);
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

      <div className="bg-gray-50 p-4 rounded-lg space-y-3">
        <h3 className="font-semibold text-gray-700">Vietnam INVOICE/Packing List 엑셀 업로드</h3>
        <p className="text-xs text-gray-500">
          태일 VN 공장이 실제로 작성하는 INVOICE/Packing List 엑셀을 그대로 업로드하면
          스타일번호별로 수입통관 문서를 자동 생성합니다(HS코드 자동조회 포함).
        </p>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            className="border p-2 rounded text-sm"
          />
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="bg-purple-600 text-white px-4 py-2 rounded font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {uploading ? '업로드 중...' : '파일 업로드'}
          </button>
        </div>
        {uploadWarnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded p-2 space-y-1">
            <div className="font-medium">업로드 경고 {uploadWarnings.length}건 — 조용히 무시하지 않고 그대로 알려드립니다:</div>
            <ul className="list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
              {uploadWarnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

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

      {/* PR-102: 목록 검색(위 등록 폼의 스타일 선택과는 별개) — 스타일번호/품목(자재명)/
          선적건번호(INVOICE 번호), 모두 조합 가능. */}
      <form onSubmit={handleFilterSubmit} className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <input
          className="border border-gray-300 rounded px-3 py-2"
          placeholder="스타일번호 검색"
          value={filterStyleNo}
          onChange={(e) => setFilterStyleNo(e.target.value)}
        />
        <input
          className="border border-gray-300 rounded px-3 py-2"
          placeholder="품목(자재명) 검색"
          value={filterMaterialName}
          onChange={(e) => setFilterMaterialName(e.target.value)}
        />
        <input
          className="border border-gray-300 rounded px-3 py-2"
          placeholder="선적건번호(INVOICE) 검색"
          value={filterSheetNo}
          onChange={(e) => setFilterSheetNo(e.target.value)}
        />
        <select
          className="border border-gray-300 rounded px-3 py-2"
          value={filterBrand}
          onChange={(e) => setFilterBrand(e.target.value)}
        >
          <option value="">전체 브랜드</option>
          {availableBrands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">검색</button>
        <button type="button" onClick={handleFilterReset} className="bg-gray-200 text-gray-700 px-4 py-2 rounded font-medium hover:bg-gray-300">초기화</button>
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
                  {s.brand && (
                    <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">{s.brand}</span>
                  )}
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
                  <button
                    className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded text-sm hover:bg-indigo-200"
                    onClick={() => setExpandedShipmentId(expandedShipmentId === s.id ? null : s.id)}
                  >
                    {expandedShipmentId === s.id ? '완제품입고증 닫기' : '완제품입고증'}
                  </button>
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

              {expandedShipmentId === s.id && <GoodsReceiptPanel importShipmentId={s.id} />}
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
