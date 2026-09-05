import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getItems, createItem, type GetItemsFilter, type CreateItem, type Item } from '../api/items.service';
import { getMasterStyles, type MasterStyle } from '../api/styles.service';
import { getBomByStyleNo, type BomDetail } from '../api/boms.service';
import { parseMappingFile, checkStyleExists, type ParsedStyleResult } from '../api/mapping.service';
import { MappingPreviewModal } from './MappingPreviewModal';
import { StyleReviewList } from './StyleReviewList';
import { getErrorMessage } from '../utils/errorMessage';

export const ItemsManager: React.FC = () => {
  // 스타일별 자재명세(BOM) 조회
  const [searchStyleNo, setSearchStyleNo] = useState('');
  const [searchRddFrom, setSearchRddFrom] = useState('');
  const [searchRddTo, setSearchRddTo] = useState('');
  const [searchResults, setSearchResults] = useState<MasterStyle[]>([]);
  const [selectedStyleNo, setSelectedStyleNo] = useState<string | null>(null);
  const [bom, setBom] = useState<BomDetail | null>(null);
  const [bomError, setBomError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // 품목 마스터 (보조 기능)
  const [items, setItems] = useState<Item[]>([]);
  const [filter] = useState<GetItemsFilter>({ page: 1, limit: 10 });
  const [newItem, setNewItem] = useState<CreateItem>({ code: '', name: '', type: 'RAW_MATERIAL' });
  const [loading, setLoading] = useState<boolean>(false);

  // 엑셀 업로드 → 매핑 프리뷰
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<ParsedStyleResult | null>(null);
  const [parsedStyles, setParsedStyles] = useState<ParsedStyleResult[]>([]);
  const [existsMap, setExistsMap] = useState<Record<string, boolean>>({});

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearched(true);
    setSelectedStyleNo(null);
    setBom(null);
    setBomError(null);
    try {
      const res = await getMasterStyles({
        styleNo: searchStyleNo || undefined,
        targetRddFrom: searchRddFrom || undefined,
        targetRddTo: searchRddTo || undefined,
      });
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setSearchResults(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '스타일 검색에 실패했습니다.'));
      setSearchResults([]);
    }
  };

  const handleSelectStyleNo = async (styleNo: string) => {
    setSelectedStyleNo(styleNo);
    setBom(null);
    setBomError(null);
    try {
      const res = await getBomByStyleNo(styleNo);
      setBom(res);
    } catch (err: any) {
      setBomError(getErrorMessage(err, '자재명세를 불러오는 데 실패했습니다.'));
    }
  };

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getItems(filter);
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.items) ? res.items : []);
      setItems(data);
    } catch (error) {
      toast.error(getErrorMessage(error, '품목 목록을 불러오는 데 실패했습니다.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createItem(newItem);
      toast.success('품목이 생성되었습니다.');
      loadItems();
      setNewItem({ code: '', name: '', type: 'RAW_MATERIAL' });
    } catch (error) {
      // toast.error는 Axios 인터셉터에서 처리됨
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setLoading(true);
    setError(null);
    setParsedStyles([]);
    setExistsMap({});
    try {
      const styles = await parseMappingFile(selectedFile);
      setParsedStyles(styles);

      // 시트별로 이미 등록된 styleNo인지 확인해 목록에 "이미 등록됨" 배지를 띄운다.
      const styleNos = styles.map(s => s.styleNo).filter((v): v is string => !!v);
      const results = await Promise.all(
        styleNos.map(async (styleNo) => {
          try {
            const { exists } = await checkStyleExists(styleNo);
            return [styleNo, exists] as const;
          } catch {
            return [styleNo, false] as const;
          }
        }),
      );
      setExistsMap(Object.fromEntries(results));
    } catch (err: any) {
      console.error(err);
      setError(getErrorMessage(err, '파일 분석에 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStyle = (style: ParsedStyleResult) => {
    setSelectedStyle(style);
    setModalOpen(true);
  };

  const handleModalRefresh = async () => {
    if (selectedStyle?.styleNo) {
      try {
        const { exists } = await checkStyleExists(selectedStyle.styleNo);
        setExistsMap(prev => ({ ...prev, [selectedStyle.styleNo as string]: exists }));
      } catch {
        // 확인 실패는 목록 배지 갱신만 못할 뿐이므로 무시한다.
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-800">Items — 자재명세(BOM) 조회</h2>
        <div className="space-x-2">
          <input type="file" onChange={handleFileUpload} accept=".csv,.xlsx,.xls" className="hidden" id="file-upload" />
          <label htmlFor="file-upload" className="bg-purple-600 text-white px-4 py-2 rounded font-medium hover:bg-purple-700 cursor-pointer">엑셀 업로드</label>
        </div>
      </div>

      {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

      <MappingPreviewModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        data={selectedStyle}
        alreadyExists={!!selectedStyle?.styleNo && existsMap[selectedStyle.styleNo]}
        onRefresh={handleModalRefresh}
      />

      {parsedStyles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-800">업로드된 스타일 목록 ({parsedStyles.length}개) — 한 줄을 클릭해 상세를 확인하고 개별 승인하세요</h3>
          <StyleReviewList styles={parsedStyles} existsMap={existsMap} onSelect={handleSelectStyle} />
        </div>
      )}

      {/* 스타일번호 / 목표출고일 기간으로 검색 → 선택한 스타일의 자재명세(BOM) 표시 */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-4 items-end bg-gray-50 p-4 rounded-lg">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">스타일 번호</label>
          <input className="border border-gray-300 rounded px-3 py-2" placeholder="예: MB62SLM103Z" value={searchStyleNo} onChange={(e) => setSearchStyleNo(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">목표출고일(From)</label>
          <input className="border border-gray-300 rounded px-3 py-2" type="date" value={searchRddFrom} onChange={(e) => setSearchRddFrom(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">목표출고일(To)</label>
          <input className="border border-gray-300 rounded px-3 py-2" type="date" value={searchRddTo} onChange={(e) => setSearchRddTo(e.target.value)} />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">검색</button>
      </form>

      {searched && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-2 text-left">스타일 번호</th>
                <th className="px-4 py-2 text-left">브랜드</th>
                <th className="px-4 py-2 text-left">바이어</th>
                <th className="px-4 py-2 text-left">목표출고일</th>
                <th className="px-4 py-2 text-left">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {searchResults.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-3 text-center text-gray-500">검색 결과가 없습니다.</td></tr>
              )}
              {searchResults.map((s) => (
                <tr
                  key={s.styleNo}
                  onClick={() => handleSelectStyleNo(s.styleNo)}
                  className={`cursor-pointer hover:bg-blue-50 ${selectedStyleNo === s.styleNo ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-4 py-2 font-mono">{s.styleNo}</td>
                  <td className="px-4 py-2">{s.overview?.brand ?? '-'}</td>
                  <td className="px-4 py-2">{s.overview?.buyer ?? '-'}</td>
                  <td className="px-4 py-2">{s.overview?.targetRdd ?? '-'}</td>
                  <td className="px-4 py-2">{s.overview?.status ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedStyleNo && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-800">{selectedStyleNo} 자재명세(BOM)</h3>
          {bomError && <div className="p-4 bg-yellow-50 text-yellow-800 rounded-lg">{bomError}</div>}
          {bom && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left">자재코드</th>
                    <th className="px-4 py-2 text-left">자재명</th>
                    <th className="px-4 py-2 text-left">카테고리</th>
                    <th className="px-4 py-2 text-left">색상</th>
                    <th className="px-4 py-2 text-left">규격</th>
                    <th className="px-4 py-2 text-right">단위소요량</th>
                    <th className="px-4 py-2 text-right">소요수량</th>
                    <th className="px-4 py-2 text-left">공급업체</th>
                    <th className="px-4 py-2 text-right">단가</th>
                    <th className="px-4 py-2 text-left">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {bom.items.map((it) => (
                    <tr key={it.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono">{it.material?.code}</td>
                      <td className="px-4 py-2 whitespace-pre-line">{it.material?.name}</td>
                      <td className="px-4 py-2 whitespace-pre-line">{it.category}</td>
                      <td className="px-4 py-2">{it.colorCode}</td>
                      <td className="px-4 py-2">{it.spec}</td>
                      <td className="px-4 py-2 text-right">{it.consumption}</td>
                      <td className="px-4 py-2 text-right">{it.requiredQty}</td>
                      <td className="px-4 py-2">{it.supplier}</td>
                      <td className="px-4 py-2 text-right">{it.unitPrice}</td>
                      <td className="px-4 py-2">{it.remarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <details className="bg-white border border-gray-200 rounded-lg">
        <summary className="px-4 py-3 cursor-pointer font-medium text-gray-700">품목 마스터 관리 (전체 품목 등록/조회)</summary>
        <div className="p-4 space-y-4 border-t border-gray-200">
          <form onSubmit={handleCreate} className="flex gap-4 items-end bg-gray-50 p-4 rounded-lg">
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">Code</label>
              <input className="border border-gray-300 rounded px-3 py-2" placeholder="Code" value={newItem.code} onChange={(e) => setNewItem({...newItem, code: e.target.value})} />
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">Name</label>
              <input className="border border-gray-300 rounded px-3 py-2" placeholder="Name" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50" disabled={loading}>Create</button>
          </form>

          <table className="w-full">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-2 text-left">Code</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono">{item.code}</td>
                  <td className="px-4 py-2">{item.name}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{item.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};
