import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getAllItems, createItem, updateItem, type GetItemsFilter, type CreateItem, type Item } from '../api/items.service';
import { getMasterStyles, type MasterStyle } from '../api/styles.service';
import { getBomByStyleNo, updateBomItem, addBomLabelSet, type BomDetail, type BomItemRow } from '../api/boms.service';
import { parseMappingFile, checkStyleExists, commitMapping, type ParsedStyleResult } from '../api/mapping.service';
import { MappingPreviewModal } from './MappingPreviewModal';
import { StyleReviewList } from './StyleReviewList';
import { getErrorMessage } from '../utils/errorMessage';
import { ItemCatalogReport } from './ItemCatalogReport';
import { Pagination } from './Pagination';
import { selectBulkApproveTargets } from '../utils/mappingApproval';
import { extractNotices, type StyleCommitResult } from '../utils/commitNotices';
import { BulkApproveResult } from './CommitResultPanel';
import { fetchItemPage, hasAnySearchCondition } from '../utils/listQueries';
import { EMPTY_PAGE_META, pageToRecoverTo, type PageMeta } from '../utils/pagination';

interface ItemsManagerProps {
  onOrderItem?: (itemId: number) => void;
}

// PR-103: 백엔드 ItemType enum(item-type.enum.ts)과 동일한 값 — 구분 드롭다운 옵션.
const ITEM_TYPE_LABELS: Record<string, string> = {
  RAW_MATERIAL: '원자재',
  SEMI_FINISHED: '반제품',
  FINISHED_GOOD: '완제품',
};

export const ItemsManager: React.FC<ItemsManagerProps> = ({ onOrderItem }) => {
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
  // PR-128: 페이지 이동 UI(Pagination)가 이 filter.page를 바꾼다(예전엔 page:1 고정이라 11번째 이후 품목은 검색 없이는 볼 수 없었다).
  const [filter, setFilter] = useState<GetItemsFilter>({ page: 1, limit: 10 });
  const [itemsMeta, setItemsMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  // PR-103: 검색 바 입력값(초안) — "검색" 버튼을 눌러야 filter에 반영된다(입력 중에는
  // API를 다시 부르지 않음). 백엔드 keyword는 이름/코드 LIKE 검색이다(items.service.ts).
  const [searchType, setSearchType] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  // PR-104: type은 기존과 동일하게 기본값 RAW_MATERIAL로 두되 select로 바꿀 수 있게
  // 하고, spec/description/styleNo도 생성 시점에 입력할 수 있게 한다(백엔드
  // CreateItemDto에는 이미 있었지만 화면에 입력란이 없어 죽어있던 필드들).
  const [newItem, setNewItem] = useState<CreateItem>({ code: '', name: '', englishName: '', unit: '', type: 'RAW_MATERIAL', spec: '', description: '', styleNo: '' });
  const [loading, setLoading] = useState<boolean>(false);
  // PR-117: 카탈로그 보고서 — 열려 있는 동안 현재 검색조건(filter.type/keyword)에 맞는 전체 품목을 불러온다.
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogItems, setCatalogItems] = useState<Item[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  // PR-073: 품목 마스터 테이블의 영문명 인라인 수정 (Suppliers/Buyers와 동일한 패턴).
  // PR-104: spec/description/styleNo도 함께 수정 가능하게 확장.
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemForm, setEditItemForm] = useState<{ name: string; englishName: string; unit: string; spec: string; description: string; styleNo: string }>({ name: '', englishName: '', unit: '', spec: '', description: '', styleNo: '' });

  // PR-073: 자재명세(BOM) 상세 테이블의 혼용율/HS코드 인라인 수정.
  const [editingBomItemId, setEditingBomItemId] = useState<number | null>(null);
  const [editBomItemForm, setEditBomItemForm] = useState<{ composition: string; hsCode: string }>({ composition: '', hsCode: '' });
  // PR-099: "라벨류 기본 세트 추가" 버튼 처리 중 표시.
  const [addingLabelSet, setAddingLabelSet] = useState(false);

  // 엑셀 업로드 → 매핑 프리뷰
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<ParsedStyleResult | null>(null);
  const [parsedStyles, setParsedStyles] = useState<ParsedStyleResult[]>([]);
  const [existsMap, setExistsMap] = useState<Record<string, boolean>>({});
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  // PR-132: 일괄승인 결과(스타일별 알림) 요약 — 확인이 필요한 차이가 있는 스타일을 놓치지 않게 화면에 남긴다.
  const [bulkResults, setBulkResults] = useState<{ results: StyleCommitResult[]; skipped: number } | null>(null);

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
      const res = await fetchItemPage({ page: filter.page ?? 1, type: filter.type, keyword: filter.keyword });
      // 마지막 페이지의 품목이 사라지는 등으로 요청 페이지가 전체 페이지를 넘으면 마지막 페이지로 되돌아가 다시 조회한다.
      const recover = pageToRecoverTo(res.meta, filter.page ?? 1);
      if (recover !== null) {
        setFilter((f) => ({ ...f, page: recover }));
        return;
      }
      setItems(res.items);
      setItemsMeta(res.meta);
    } catch (error) {
      toast.error(getErrorMessage(error, '품목 목록을 불러오는 데 실패했습니다.'));
      setItems([]);
      setItemsMeta(EMPTY_PAGE_META);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!catalogOpen) return;
    let cancelled = false;
    setCatalogLoading(true);
    getAllItems({ type: filter.type, keyword: filter.keyword })
      .then((all) => { if (!cancelled) setCatalogItems(all); })
      .catch((error) => { if (!cancelled) { toast.error(getErrorMessage(error, '카탈로그 품목을 불러오는 데 실패했습니다.')); setCatalogItems([]); } })
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [catalogOpen, filter.type, filter.keyword]);

  // PR-103: 구분(type)/키워드(이름·코드) 검색 — 검색 시 page를 1로 리셋한다.
  // PR-139: 구분도 안 고르고 키워드도 비어있으면(그냥 전체 목록이 나오는 대신) 경고하고 조회를 막는다.
  const handleItemSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAnySearchCondition(searchType, searchKeyword)) {
      toast.error('검색 조건을 하나 이상 선택하거나 입력해 주세요.');
      return;
    }
    setFilter({ page: 1, limit: 10, type: searchType || undefined, keyword: searchKeyword || undefined });
  };

  const handleItemSearchReset = () => {
    setSearchType('');
    setSearchKeyword('');
    setFilter({ page: 1, limit: 10 });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createItem({
        ...newItem,
        spec: newItem.spec || undefined,
        description: newItem.description || undefined,
        // styleNo는 FINISHED_GOOD에만 지정 가능(items.service.ts 검증) — 다른
        // 타입에서 빈 문자열이 그대로 넘어가지 않게 정리한다.
        styleNo: newItem.type === 'FINISHED_GOOD' ? (newItem.styleNo || undefined) : undefined,
      });
      toast.success('품목이 생성되었습니다.');
      loadItems();
      setNewItem({ code: '', name: '', englishName: '', unit: '', type: 'RAW_MATERIAL', spec: '', description: '', styleNo: '' });
    } catch (error) {
      // toast.error는 Axios 인터셉터에서 처리됨
    } finally {
      setLoading(false);
    }
  };

  const startEditItem = (item: Item) => {
    setEditingItemId(item.id);
    setEditItemForm({
      name: item.name,
      englishName: item.englishName || '',
      unit: item.unit || '',
      spec: item.spec || '',
      description: item.description || '',
      styleNo: item.styleNo || '',
    });
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditItemForm({ name: '', englishName: '', unit: '', spec: '', description: '', styleNo: '' });
  };

  const handleUpdateItem = async (id: number) => {
    try {
      await updateItem(id, {
        name: editItemForm.name,
        englishName: editItemForm.englishName,
        unit: editItemForm.unit,
        spec: editItemForm.spec,
        description: editItemForm.description,
        styleNo: editItemForm.styleNo || undefined,
      });
      toast.success('품목 정보가 수정되었습니다.');
      cancelEditItem();
      loadItems();
    } catch (error) {
      // toast.error는 Axios 인터셉터에서 처리됨
    }
  };

  const startEditBomItem = (row: BomItemRow) => {
    setEditingBomItemId(row.id);
    setEditBomItemForm({ composition: row.composition || '', hsCode: row.hsCode || '' });
  };

  const cancelEditBomItem = () => {
    setEditingBomItemId(null);
    setEditBomItemForm({ composition: '', hsCode: '' });
  };

  const handleUpdateBomItem = async (id: number) => {
    try {
      await updateBomItem(id, { composition: editBomItemForm.composition, hsCode: editBomItemForm.hsCode });
      toast.success('혼용율/HS코드가 수정되었습니다.');
      cancelEditBomItem();
      if (selectedStyleNo) {
        const res = await getBomByStyleNo(selectedStyleNo);
        setBom(res);
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, '혼용율/HS코드 수정에 실패했습니다.'));
    }
  };

  // PR-099: 라벨류 기본 세트(MAIN+SIZE LABEL/CARE LABEL/PRICE TAG/SIZE STICKER/
  // TAG PIN/이미지택/POLY BAG, 수량 1)를 한 번에 추가한다 — 이미 있는 항목은 서버가
  // 건너뛰므로 여러 번 눌러도 안전하다.
  const handleAddLabelSet = async () => {
    if (!selectedStyleNo) return;
    setAddingLabelSet(true);
    try {
      const res = await addBomLabelSet(selectedStyleNo);
      if (res.added.length > 0) {
        toast.success(`라벨류 기본 세트 ${res.added.length}건 추가됨${res.skipped.length > 0 ? ` (이미 있던 ${res.skipped.length}건은 건너뜀)` : ''}.`);
      } else {
        toast.error('추가할 항목이 없습니다 — 라벨류 7종이 이미 모두 등록되어 있습니다.');
      }
      const bomRes = await getBomByStyleNo(selectedStyleNo);
      setBom(bomRes);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '라벨류 기본 세트 추가에 실패했습니다.'));
    } finally {
      setAddingLabelSet(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setLoading(true);
    setError(null);
    setParsedStyles([]);
    setExistsMap({});
    setBulkResults(null);
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

  // 파싱 실패했거나 이미 등록된(existsMap[styleNo]===true) 스타일은 제외한다. 재승인은 자재를 중복으로 쌓지 않는 "병합"이지만
  // (mapping-commit.service.ts, PR-098), 여러 스타일을 개별 확인 없이 한 번에 승인하면 이미 등록된 스타일의 스타일 정보가 잘못된
  // 파일의 값으로 갱신될 수 있다. 그래서 이미 등록된 스타일은 일괄승인 대상이 아니고, 한 줄씩 열어 확인한 뒤 개별로 재승인한다.
  const handleBulkApprove = async () => {
    const targets = selectBulkApproveTargets(parsedStyles, existsMap);
    if (targets.length === 0) {
      toast.error('일괄 승인할 대상이 없습니다(파싱 실패했거나 이미 등록된 스타일은 제외됩니다).');
      return;
    }
    const skippedCount = parsedStyles.length - targets.length;
    if (!window.confirm(`${targets.length}개 스타일을 일괄 승인합니다${skippedCount > 0 ? ` (${skippedCount}개는 파싱 실패/이미 등록되어 제외)` : ''}. 계속할까요?`)) {
      return;
    }

    setBulkApproving(true);
    setBulkProgress(0);
    let successCount = 0;
    const successResults: StyleCommitResult[] = [];
    const failures: { styleNo: string; reason: string }[] = [];

    // 병렬로 돌리면 mapping-commit.service.ts의 "동일 이름 자재 없으면 새로 생성" 로직이
    // 서로 다른 시트에서 같은 자재명을 참조할 때 경합해 중복 생성될 수 있어 순차 실행한다.
    for (const style of targets) {
      try {
        const res = await commitMapping({
          styleNo: style.styleNo,
          overviewData: style.overview,
          bomItems: style.bomItems || [],
        });
        successResults.push({ styleNo: style.styleNo, notices: extractNotices(res) });
        successCount++;
      } catch (err) {
        const reason = getErrorMessage(err, '알 수 없는 오류');
        // 원본 에러(응답 본문 전체)는 콘솔에 남겨 서버 로그와 대조 진단할 수 있게 한다 —
        // 토스트는 길이 제한상 요약만 보여준다.
        console.error(`[일괄 승인 실패] ${style.styleNo}:`, err);
        failures.push({ styleNo: style.styleNo, reason });
      }
      setBulkProgress((p) => p + 1);
    }

    setBulkApproving(false);
    // 성공한 스타일은 (실패가 함께 있어도) 스타일별 차이 요약을 화면에 남긴다. 성공만 있을 때는 이 요약이 완료 안내를 대신한다.
    if (successResults.length > 0) setBulkResults({ results: successResults, skipped: skippedCount });
    if (failures.length > 0) {
      // 실패 사유별로 묶어서 "사유: 해당 styleNo 개수"로 간추린다 — 실패가 많을 때
      // (예: 동일 원인으로 수십 건) 토스트가 읽을 수 없는 텍스트 벽이 되는 것을 막는다.
      // 스타일별 전체 사유는 console.error로 남겨 정확한 대상을 추적할 수 있게 한다.
      const reasonGroups = new Map<string, string[]>();
      for (const f of failures) {
        const list = reasonGroups.get(f.reason) ?? [];
        list.push(f.styleNo);
        reasonGroups.set(f.reason, list);
      }
      const summary = Array.from(reasonGroups.entries())
        .map(([reason, styleNos]) => `- ${reason} (${styleNos.length}건: ${styleNos.slice(0, 3).join(', ')}${styleNos.length > 3 ? ' 외' : ''})`)
        .join('\n');
      toast.error(
        `일괄 승인 완료: ${successCount}개 성공, ${failures.length}개 실패\n${summary}\n(전체 목록은 브라우저 콘솔 참고)`,
        { duration: 20000 },
      );
      console.error('[일괄 승인 실패 목록]', failures);
    }

    const results = await Promise.all(
      targets.map(async (s) => {
        try {
          const { exists } = await checkStyleExists(s.styleNo);
          return [s.styleNo, exists] as const;
        } catch {
          return [s.styleNo, false] as const;
        }
      }),
    );
    setExistsMap((prev) => ({ ...prev, ...Object.fromEntries(results) }));
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
          <div className="flex justify-between items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-800">업로드된 스타일 목록 ({parsedStyles.length}개) — 한 줄을 클릭해 상세를 확인하고 개별 승인하거나, 아래 버튼으로 일괄 승인하세요</h3>
            <button
              onClick={handleBulkApprove}
              disabled={bulkApproving}
              className="bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
            >
              {bulkApproving ? `일괄 승인 중... (${bulkProgress}/${parsedStyles.length})` : '일괄 승인'}
            </button>
          </div>
          {bulkResults && <BulkApproveResult results={bulkResults.results} skipped={bulkResults.skipped} onDismiss={() => setBulkResults(null)} />}
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
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-800">{selectedStyleNo} 자재명세(BOM)</h3>
            {bom && (
              <button
                onClick={handleAddLabelSet}
                disabled={addingLabelSet}
                className="text-sm px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {addingLabelSet ? '추가 중...' : '라벨류 기본 세트 추가'}
              </button>
            )}
          </div>
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
                    <th className="px-4 py-2 text-left">혼용율</th>
                    <th className="px-4 py-2 text-left">HS코드</th>
                    <th className="px-4 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {bom.items.map((it) =>
                    editingBomItemId === it.id ? (
                      <tr key={it.id} className="bg-yellow-50">
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
                        <td className="px-4 py-2">
                          <input
                            className="border rounded px-2 py-1 w-40"
                            placeholder="예: WOOL 98%, PU 2%"
                            value={editBomItemForm.composition}
                            onChange={(e) => setEditBomItemForm({ ...editBomItemForm, composition: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className="border rounded px-2 py-1 w-24"
                            placeholder="예: 6110.30"
                            value={editBomItemForm.hsCode}
                            onChange={(e) => setEditBomItemForm({ ...editBomItemForm, hsCode: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                          <button className="text-blue-600" onClick={() => handleUpdateBomItem(it.id)}>저장</button>
                          <button className="text-gray-500" onClick={cancelEditBomItem}>취소</button>
                        </td>
                      </tr>
                    ) : (
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
                        <td className="px-4 py-2">{it.composition ?? '-'}</td>
                        <td className="px-4 py-2">{it.hsCode ?? '-'}</td>
                        <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                          <button className="text-blue-600" onClick={() => startEditBomItem(it)}>수정</button>
                          {onOrderItem && it.material?.id && (
                            <button
                              onClick={() => onOrderItem(it.material.id)}
                              className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-blue-700 whitespace-nowrap"
                            >
                              발주하기
                            </button>
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <details className="bg-white border border-gray-200 rounded-lg">
        <summary className="px-4 py-3 cursor-pointer font-medium text-gray-700">품목 마스터 관리 (전체 품목 등록/조회)</summary>
        <div className="p-4 space-y-4 border-t border-gray-200">
          <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg">
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">Code</label>
              <input className="border border-gray-300 rounded px-3 py-2" placeholder="Code" value={newItem.code} onChange={(e) => setNewItem({...newItem, code: e.target.value})} />
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">Name</label>
              <input className="border border-gray-300 rounded px-3 py-2" placeholder="Name" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} />
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">영문명</label>
              <input className="border border-gray-300 rounded px-3 py-2" placeholder="English Name" value={newItem.englishName} onChange={(e) => setNewItem({...newItem, englishName: e.target.value})} />
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">단위</label>
              <input className="border border-gray-300 rounded px-3 py-2" placeholder="예: MTS" value={newItem.unit} onChange={(e) => setNewItem({...newItem, unit: e.target.value})} />
            </div>
            {/* PR-104: 품목유형 — 기본값은 기존과 동일하게 원자재(RAW_MATERIAL), 사용자가 바꿀 수 있음. */}
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">품목유형</label>
              <select
                className="border border-gray-300 rounded px-3 py-2"
                value={newItem.type}
                onChange={(e) => setNewItem({ ...newItem, type: e.target.value, styleNo: e.target.value === 'FINISHED_GOOD' ? newItem.styleNo : '' })}
              >
                {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">규격</label>
              <input className="border border-gray-300 rounded px-3 py-2" placeholder="규격" value={newItem.spec} onChange={(e) => setNewItem({...newItem, spec: e.target.value})} />
            </div>
            <div className="flex flex-col col-span-2">
              <label className="text-sm text-gray-600 mb-1">설명</label>
              <input className="border border-gray-300 rounded px-3 py-2" placeholder="설명" value={newItem.description} onChange={(e) => setNewItem({...newItem, description: e.target.value})} />
            </div>
            {/* PR-104: styleNo는 FINISHED_GOOD 품목이 소속 MasterStyle을 참조하는 값이라
                다른 경로에서 자동으로 채워지지 않는다(items.service.ts create()가 사람이
                입력한 값만 그대로 저장) — 재고 차감(work-orders.service.ts)이 이 값으로
                스타일을 찾으므로 완제품 등록 시 반드시 채워야 한다. 오탐 방지를 위해
                FINISHED_GOOD을 선택했을 때만 노출한다. */}
            {newItem.type === 'FINISHED_GOOD' && (
              <div className="flex flex-col col-span-2">
                <label className="text-sm text-gray-600 mb-1">스타일번호 (완제품 전용)</label>
                <input className="border border-gray-300 rounded px-3 py-2" placeholder="예: MB62SLM103Z" value={newItem.styleNo} onChange={(e) => setNewItem({...newItem, styleNo: e.target.value})} />
              </div>
            )}
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 self-end" disabled={loading}>Create</button>
          </form>

          {/* PR-103: 구분(type)/키워드(이름·코드) 검색 — 기존 백엔드 필터를 화면에 연결. */}
          <form onSubmit={handleItemSearchSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select
              className="border border-gray-300 rounded px-3 py-2"
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
            >
              <option value="">전체 구분</option>
              {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input
              className="border border-gray-300 rounded px-3 py-2"
              placeholder="품목명/코드 검색"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">검색</button>
            <button type="button" onClick={handleItemSearchReset} className="bg-gray-200 text-gray-700 px-4 py-2 rounded font-medium hover:bg-gray-300">초기화</button>
          </form>

          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-2 text-left">Code</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">영문명</th>
                <th className="px-4 py-2 text-left">단위</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">규격</th>
                <th className="px-4 py-2 text-left">설명</th>
                <th className="px-4 py-2 text-left">스타일번호</th>
                <th className="px-4 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item) =>
                editingItemId === item.id ? (
                  <tr key={item.id} className="bg-yellow-50">
                    <td className="px-4 py-2 font-mono">{item.code}</td>
                    <td className="px-4 py-2">
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={editItemForm.name}
                        onChange={(e) => setEditItemForm({ ...editItemForm, name: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={editItemForm.englishName}
                        onChange={(e) => setEditItemForm({ ...editItemForm, englishName: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="border rounded px-2 py-1 w-20"
                        value={editItemForm.unit}
                        onChange={(e) => setEditItemForm({ ...editItemForm, unit: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">{item.type}</td>
                    <td className="px-4 py-2">
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={editItemForm.spec}
                        onChange={(e) => setEditItemForm({ ...editItemForm, spec: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={editItemForm.description}
                        onChange={(e) => setEditItemForm({ ...editItemForm, description: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      {/* PR-104: FINISHED_GOOD이 아닌 품목은 items.service.ts가 styleNo
                          지정을 400으로 거부하므로 그 타입일 때만 편집 가능하게 한다. */}
                      {item.type === 'FINISHED_GOOD' ? (
                        <input
                          className="border rounded px-2 py-1 w-full"
                          placeholder="예: MB62SLM103Z"
                          value={editItemForm.styleNo}
                          onChange={(e) => setEditItemForm({ ...editItemForm, styleNo: e.target.value })}
                        />
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                      <button className="text-blue-600" onClick={() => handleUpdateItem(item.id)}>저장</button>
                      <button className="text-gray-500" onClick={cancelEditItem}>취소</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono">{item.code}</td>
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2">{item.englishName ?? '-'}</td>
                    <td className="px-4 py-2">{item.unit ?? '-'}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{item.type}</td>
                    <td className="px-4 py-2">{item.spec ?? '-'}</td>
                    <td className="px-4 py-2">{item.description ?? '-'}</td>
                    <td className="px-4 py-2">{item.styleNo ?? '-'}</td>
                    <td className="px-4 py-2">
                      <button className="text-blue-600" onClick={() => startEditItem(item)}>수정</button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          </div>
          {items.length === 0 && !loading && (
            <p className="text-center text-sm text-gray-500 py-4" data-testid="items-empty">조회된 품목이 없습니다.</p>
          )}
          <Pagination
            page={itemsMeta.page}
            totalPages={itemsMeta.totalPages}
            total={itemsMeta.total}
            disabled={loading}
            onPageChange={(page) => setFilter((f) => ({ ...f, page }))}
          />

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setCatalogOpen((v) => !v)}
              className="bg-indigo-600 text-white px-4 py-2 rounded font-medium hover:bg-indigo-700"
            >
              {catalogOpen ? '카탈로그 보고서 닫기' : '카탈로그 보고서 (인쇄/엑셀)'}
            </button>
          </div>
          {catalogOpen && (
            catalogLoading ? (
              <div className="text-sm text-gray-500">카탈로그 불러오는 중...</div>
            ) : (
              <ItemCatalogReport items={catalogItems} filter={{ type: filter.type, keyword: filter.keyword }} />
            )
          )}
        </div>
      </details>
    </div>
  );
};
