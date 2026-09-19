import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getStyleRequirements, type StyleRequirements } from '../api/workOrders.service';
import { getMasterStyles } from '../api/styles.service';
import { getErrorMessage } from '../utils/errorMessage';
import { requirementEmptyMessage, type MaterialRequirementRow } from '../utils/bomRequirementReport';
import { sortForShortage } from '../utils/purchaseOrderForm';
import { SearchSelectField } from './SearchSelectField';

interface StyleOption { styleNo: string; overview?: { styleName?: string | null; totalQty?: number | string | null } | null }

const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });

interface ShortageTableProps {
  rows: MaterialRequirementRow[];
  onPick: (row: MaterialRequirementRow) => void;
}

// 부족 자재 표(표시 전용). 부족 수량이 있는 행이 위에 오고 강조된다(정렬은 호출하는 쪽의 sortForShortage).
export const ShortageTable: React.FC<ShortageTableProps> = ({ rows, onPick }) => {
  const th = 'px-2 py-1 text-left text-xs bg-gray-100 border border-gray-200';
  const td = 'px-2 py-1 text-sm border border-gray-200';
  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full border-collapse" data-testid="shortage-table">
        <thead className="sticky top-0">
          <tr>
            <th className={th}>자재</th>
            <th className={th}>카테고리</th>
            <th className={`${th} text-right`}>필요 총수량</th>
            <th className={`${th} text-right`}>이미 발주</th>
            <th className={`${th} text-right`}>부족 수량</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemId} className={r.shortageQty > 0 ? 'bg-red-50' : ''} data-testid={`shortage-row-${r.itemId}`}>
              <td className={td}>{r.itemName}{r.itemCode && <span className="block text-xs text-gray-400">{r.itemCode}</span>}</td>
              <td className={td}>{r.categories.join(', ') || '-'}</td>
              <td className={`${td} text-right`}>{fmt(r.requiredQty)}</td>
              <td className={`${td} text-right`}>{fmt(r.orderedQty)}</td>
              <td className={`${td} text-right font-semibold ${r.shortageQty > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(r.shortageQty)}</td>
              <td className={td}>
                <button type="button" className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 whitespace-nowrap" onClick={() => onPick(r)}>이 자재로 발주하기</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// 발주 화면은 자재(Item) 단위라 PurchaseOrder에는 스타일번호가 없다(여러 스타일이 같은 자재를 함께 쓸 수 있음). 이 패널은 발주 데이터를
// 바꾸지 않는 "보조 검색"이다: 스타일을 고르면 그 스타일의 활성 BOM으로 필요 자재/이미 발주/부족을 보여주고(PR-120 소요명세서와
// 같은 서버 계산), 부족한 자재를 골라 발주 폼으로 넘긴다.
export const StyleShortagePanel: React.FC<{ onPickMaterial: (row: MaterialRequirementRow) => void; refreshKey?: number }> = ({ onPickMaterial, refreshKey = 0 }) => {
  const [style, setStyle] = useState<StyleOption | null>(null);
  const [quantityInput, setQuantityInput] = useState('');
  const [data, setData] = useState<StyleRequirements | null>(null);
  const [loading, setLoading] = useState(false);

  const searchStyles = async (keyword: string): Promise<StyleOption[]> => {
    const res = await getMasterStyles(keyword ? { styleNo: keyword } : undefined);
    const list: StyleOption[] = Array.isArray(res) ? res : (res?.items ?? []);
    return list.slice(0, 30);
  };

  // 스타일을 고르면 수량은 서버가 정한 기본값(오더개요 총 수량)으로 다시 채운다.
  useEffect(() => {
    if (!style) { setData(null); setQuantityInput(''); return; }
    let cancelled = false;
    setLoading(true);
    getStyleRequirements(style.styleNo)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setQuantityInput(res.quantity > 0 ? String(res.quantity) : '');
      })
      .catch((err) => { if (!cancelled) { toast.error(getErrorMessage(err, '필요 자재를 불러오는 데 실패했습니다.')); setData(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [style]);

  // 발주를 만든 뒤에는 "이미 발주" 수량이 바뀌므로, 지금 입력된 수량 그대로 다시 계산한다.
  useEffect(() => {
    if (refreshKey === 0 || !style) return;
    const q = Number(quantityInput);
    if (!(q > 0)) return;
    getStyleRequirements(style.styleNo, q).then(setData).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const recalc = async () => {
    if (!style) return;
    const q = Number(quantityInput);
    if (!(q > 0)) { toast.error('수량은 0보다 커야 합니다.'); return; }
    setLoading(true);
    try {
      setData(await getStyleRequirements(style.styleNo, q));
    } catch (err: any) {
      toast.error(getErrorMessage(err, '필요 자재를 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  };

  const rows = data ? sortForShortage(data.rows) : [];
  const emptyMessage = data ? requirementEmptyMessage(data.reason) : null;

  return (
    <details className="bg-white border border-gray-200 rounded-lg" open>
      <summary className="px-4 py-3 cursor-pointer font-medium text-gray-700">스타일번호로 필요 자재 찾기 <span className="text-xs font-normal text-gray-400">(발주할 자재를 고르는 보조 도구)</span></summary>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">스타일번호</label>
            <SearchSelectField<StyleOption>
              value={style}
              onChange={setStyle}
              search={searchStyles}
              getKey={(s) => s.styleNo}
              getLabel={(s) => s.styleNo}
              renderRow={(s) => (
                <span><span className="font-mono">{s.styleNo}</span>{s.overview?.styleName ? <span className="text-gray-500 text-sm ml-2">{s.overview.styleName}</span> : null}</span>
              )}
              ariaLabel="스타일번호"
              placeholder="스타일번호 검색"
              title="스타일번호 검색"
              allowClear
              className="w-64"
            />
          </div>
          {style && (
            <div className="flex items-end gap-2">
              <div className="flex flex-col">
                <label className="text-sm text-gray-600 mb-1">생산 수량 {data?.quantitySource === 'STYLE_TOTAL_QTY' && <span className="text-xs text-gray-400">(오더 총수량)</span>}</label>
                <input type="number" min={1} className="border border-gray-300 rounded px-3 py-2 w-32" value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} aria-label="생산 수량" />
              </div>
              <button type="button" onClick={recalc} className="bg-gray-700 text-white px-3 py-2 rounded text-sm hover:bg-gray-800">다시 계산</button>
            </div>
          )}
        </div>

        {!style && <p className="text-sm text-gray-500">스타일번호를 검색해 고르면 그 스타일의 BOM 기준으로 필요/이미 발주/부족 수량이 계산됩니다.</p>}
        {style && loading && <p className="text-sm text-gray-500">계산 중...</p>}
        {style && !loading && data && emptyMessage && (
          <div className="border border-yellow-300 bg-yellow-50 text-yellow-800 rounded p-3 text-sm" data-testid="shortage-empty">{emptyMessage}</div>
        )}
        {style && !loading && data && !emptyMessage && (
          <>
            {!(data.quantity > 0) ? (
              <p className="text-sm text-yellow-700" data-testid="shortage-need-qty">이 스타일에는 오더 총수량이 없습니다. 생산 수량을 입력하고 &quot;다시 계산&quot;을 눌러 주세요.</p>
            ) : (
              <p className="text-xs text-gray-500" data-testid="shortage-summary">
                BOM {data.bom?.bomNo} · 생산 수량 {fmt(data.quantity)} 기준 · 자재 {data.totals.materialCount}종 중 <b className="text-red-600">부족 {data.totals.shortageMaterialCount}종</b>
              </p>
            )}
            <ShortageTable rows={rows} onPick={onPickMaterial} />
          </>
        )}
      </div>
    </details>
  );
};
