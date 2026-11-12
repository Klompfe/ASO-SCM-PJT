import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getAllItems, getItems, createItem, updateItem, type GetItemsFilter, type CreateItem, type Item } from '../api/items.service';
import { getMasterStyles, getStyleColorSizeQuantities, type MasterStyle } from '../api/styles.service';
import { getBomByStyleNo, updateBomItem, deleteBomItem, swapBomItemMaterial, addBomLabelSet, type BomDetail, type BomItemRow, type ThreadType, type TapeType } from '../api/boms.service';
import { SearchSelectField } from './SearchSelectField';
import { parseMappingFile, checkStyleExists, commitMapping, type ParsedStyleResult } from '../api/mapping.service';
import { MappingPreviewModal } from './MappingPreviewModal';
import { StyleReviewList } from './StyleReviewList';
import { getErrorMessage } from '../utils/errorMessage';
import { getMaterialCategories, type MaterialCategory } from '../api/materialCategories.service';
import { getMaterialPackagingUnitRules, type MaterialPackagingUnitRule } from '../api/materialPackagingUnitRules.service';
import { activeCategories } from '../utils/materialCategories';
import { ItemCatalogReport } from './ItemCatalogReport';
import { Pagination } from './Pagination';
import { selectBulkApproveTargets } from '../utils/mappingApproval';
import { extractNotices, type StyleCommitResult } from '../utils/commitNotices';
import { BulkApproveResult } from './CommitResultPanel';
import { fetchItemPage } from '../utils/listQueries';
import { EMPTY_PAGE_META, pageToRecoverTo, type PageMeta } from '../utils/pagination';
import { buildEditableOrderByItem } from '../utils/purchaseOrderForm';
import { getPurchaseOrders, type PurchaseOrder } from '../api/purchaseOrders.service';
import { PurchaseOrderEditModal } from './PurchaseOrderEditModal';
import { formatBomItemQty, looksLikeThreadOrTape } from '../utils/materialRequirementDisplay';
import { filterBomRows, distinctNonEmptySorted } from '../utils/bomLookupFilter';
import { buildColorQtyMap, resolveAppliedQuantity, APPLIED_BASIS_LABEL, isExtremeConsumptionMismatch, type AppliedQuantityResult } from '../utils/appliedQuantity';
import { UNIT_CHANGE_CONFIRM_TEXT, isUnitChanged, resolveLiveQtyReason, describeLiveQtyReason, describeSnapshotNote, isBlockedUnitForLengthBasedMaterial, BLOCKED_PACKAGING_UNIT_MESSAGE } from '../utils/bomQtyReason';
import {
  defaultManualQtyInputMode,
  resolveManualQtyInput,
  describeManualQtyPreview,
  manualQtyInputUnitLabel,
  type ManualQtyInputMode,
  type PackagingRuleContext,
} from '../utils/manualRequiredQtyInput';

// PR-175: 실/테이프 통합 드롭다운 값을 서버 필드(threadType/tapeType) 중 하나로 나눈다.
const resolveSubTypePayload = (value: string): { threadType?: ThreadType; tapeType?: TapeType } =>
  value === 'DADE' || value === 'AMHOL' ? { tapeType: value as TapeType } : { threadType: value as ThreadType };

interface ItemsManagerProps {
  // PR-230: 이 화면은 항상 특정 스타일의 BOM을 보여주는 중이라, 발주 화면으로
  // 넘어갈 때 그 스타일도 같이 넘긴다(연결 해제는 발주 화면에서 사용자가 선택).
  onOrderItem?: (itemId: number, styleNo?: string) => void;
  // 오더관리(수주 등록/오더 목록)에서 "자재명세 보기"를 누르면 넘어오는 styleNo —
  // App.tsx의 poPrefillItemId/StylesManager의 initialStyleNo와 동일한 cross-tab 패턴.
  // 이 값이 오면 검색 없이 바로 그 스타일의 BOM을 연다.
  initialStyleNo?: string | null;
  onInitialStyleNoConsumed?: () => void;
}

// PR-103: 백엔드 ItemType enum(item-type.enum.ts)과 동일한 값 — 구분 드롭다운 옵션.
const ITEM_TYPE_LABELS: Record<string, string> = {
  RAW_MATERIAL: '원자재',
  SEMI_FINISHED: '반제품',
  FINISHED_GOOD: '완제품',
};

export const ItemsManager: React.FC<ItemsManagerProps> = ({ onOrderItem, initialStyleNo, onInitialStyleNoConsumed }) => {
  // 스타일별 자재명세(BOM) 조회
  const [searchStyleNo, setSearchStyleNo] = useState('');
  const [searchRddFrom, setSearchRddFrom] = useState('');
  const [searchRddTo, setSearchRddTo] = useState('');
  const [searchResults, setSearchResults] = useState<MasterStyle[]>([]);
  const [selectedStyleNo, setSelectedStyleNo] = useState<string | null>(null);
  const [bom, setBom] = useState<BomDetail | null>(null);
  // PR-227: "소요수량"(BomItem.requiredQty)은 저장 시점 스냅샷이라, 실시간 계산
  // (PR-226, resolveAppliedQuantity와 같은 규칙)을 참고로 보여주려면 이 스타일의
  // 총수량·색상×사이즈 수량표가 필요하다 — 계산/저장에는 쓰지 않는다(표시 전용).
  const [selectedStyleTotalQty, setSelectedStyleTotalQty] = useState<number | null>(null);
  const [selectedStyleColorQtyMap, setSelectedStyleColorQtyMap] = useState<Map<string, number>>(new Map());
  // PR-177: 미입고 발주가 있는 자재는 "발주하기" 대신 "수정하기"로 바꾼다.
  const [pendingOrders, setPendingOrders] = useState<PurchaseOrder[]>([]);
  const [editing, setEditing] = useState<{ order: PurchaseOrder; pendingCount: number } | null>(null);
  const loadPendingOrders = useCallback(async () => {
    try {
      const res = await getPurchaseOrders({ status: 'PENDING' });
      setPendingOrders(Array.isArray(res) ? res : (res?.data ?? []));
    } catch {
      setPendingOrders([]); // 조회 실패 시 기존처럼 "발주하기"를 보여준다
    }
  }, []);
  useEffect(() => {
    if (bom) loadPendingOrders();
  }, [bom, loadPendingOrders]);
  const [bomError, setBomError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  // PR-224: 발주 화면(PurchaseOrdersManager.tsx)의 "스타일 연결" 콤보와 같은
  // SearchSelectField<MasterStyle> + getMasterStyles 조합 — 입력칸에 직접 타이핑 후
  // 검색 버튼/Enter를 누르는 기존 동작(searchStyleNo)은 그대로 두고, 목록에서 바로
  // 고르는 방법을 추가한다(둘 중 아무 방법으로도 조회 가능).
  const [styleSearchPick, setStyleSearchPick] = useState<MasterStyle | null>(null);
  // PR-224: 선택한 스타일의 자재 목록(위 bom.items)을 화면에서만 거르는 필터 —
  // 서버 요청 없음, 소요량/포장단위 계산과 무관(filterBomRows).
  const [bomNameFilter, setBomNameFilter] = useState('');
  const [bomCategoryFilter, setBomCategoryFilter] = useState('');
  const [bomColorFilter, setBomColorFilter] = useState('');

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
  const [newItem, setNewItem] = useState<CreateItem>({ code: '', name: '', englishName: '', unit: '', type: 'RAW_MATERIAL', spec: '', description: '', styleNo: '', categoryId: null, materialSubType: null });
  // PR-183: 품목군(선택). 전체 목록(비활성 포함)을 한 번 받아 이름 표시에 쓰고, 선택지는 활성만 보여준다.
  const [materialCategories, setMaterialCategories] = useState<MaterialCategory[]>([]);
  const [editCategoryId, setEditCategoryId] = useState<string>('');
  // PR-186: 실/테이프 종류(선택) — 규칙 테이블(material_packaging_unit_rules)에 없는 값은
  // 저장할 수 없으므로(백엔드 400) 드롭다운 선택지도 같은 테이블에서 가져온다.
  const [packagingRules, setPackagingRules] = useState<MaterialPackagingUnitRule[]>([]);
  const [editMaterialSubType, setEditMaterialSubType] = useState<string>('');
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
  // PR-197: 요척/규격/색상/구분도 여기서 함께 고친다(실제 사례 — 엑셀 요척 2.9가 BOM에는
  // 2.7로 저장돼 필요량이 틀렸던 건을 고칠 화면이 없었다).
  const [editingBomItemId, setEditingBomItemId] = useState<number | null>(null);
  // PR-227: unit은 BomItem이 아니라 자재(Item) 마스터 값이다 — 저장 시 PATCH /boms/items/:id
  // 가 아니라 기존 PATCH /items/:id로 따로 보낸다(아래 handleUpdateBomItem 참고).
  // PR-231: manualRequiredQty는 문자열 입력칸 그대로(비우면 "해제" 요청) — unit은 기존.
  // PR-239: manualRequiredQtyMode — 포장 규칙이 있는 행은 이 입력을 "길이(M 등)"로 볼지
  // "포장 수(콘/롤)"로 볼지 사람이 고른다(기본은 포장 규칙이 있으면 포장 수). 사용자가
  // 46(콘 의도)을 그냥 길이로 저장해 1콘이 되어 버리던 사고(배경 참고)를 막는다.
  const [editBomItemForm, setEditBomItemForm] = useState<{ composition: string; hsCode: string; threadType: string; consumption: string; spec: string; colorCode: string; category: string; unit: string; manualRequiredQty: string; manualRequiredQtyNote: string; manualRequiredQtyMode: ManualQtyInputMode }>({ composition: '', hsCode: '', threadType: '', consumption: '', spec: '', colorCode: '', category: '', unit: '', manualRequiredQty: '', manualRequiredQtyNote: '', manualRequiredQtyMode: 'length' });
  // PR-099: "라벨류 기본 세트 추가" 버튼 처리 중 표시.
  const [addingLabelSet, setAddingLabelSet] = useState(false);
  // PR-197: BOM 행 삭제/자재 교체 — 사람이 버튼을 눌러야만 동작(자동 정리 없음).
  const [deletingBomItemId, setDeletingBomItemId] = useState<number | null>(null);
  const [swappingBomItemId, setSwappingBomItemId] = useState<number | null>(null);
  const [materialSwapPick, setMaterialSwapPick] = useState<{ id: number; name: string; code: string } | null>(null);

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
      // PR-224: 검색 결과가 정확히 1건이면 그 행을 클릭하지 않아도 바로 자재 목록을 보여준다.
      if (data.length === 1) {
        await handleSelectStyleNo(data[0].styleNo);
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, '스타일 검색에 실패했습니다.'));
      setSearchResults([]);
    }
  };

  // PR-224: 발주 화면과 같은 SearchSelectField<MasterStyle>이 쓰는 검색 함수 — 같은
  // getMasterStyles(styleNo 부분일치)를 그대로 쓰고, 후보가 많아도 과도하게 늘지
  // 않도록 PurchaseOrdersManager.searchStyles와 같이 30건으로 자른다.
  const searchStylesForLookup = useCallback(async (keyword: string): Promise<MasterStyle[]> => {
    const res = await getMasterStyles(keyword ? { styleNo: keyword } : undefined);
    const list = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
    return list.slice(0, 30);
  }, []);

  const handleSelectStyleNo = async (styleNo: string) => {
    setSelectedStyleNo(styleNo);
    setBom(null);
    setBomError(null);
    // PR-224: 다른 스타일로 바꾸면 이전 스타일에 걸어 둔 필터가 그대로 남아 "자재가
    // 하나도 안 보이는" 혼란을 막기 위해 초기화한다.
    setBomNameFilter('');
    setBomCategoryFilter('');
    setBomColorFilter('');
    // PR-227: "소요수량"(BomItem.requiredQty)은 저장 시점 스냅샷일 뿐 실시간 계산이
    // 아니다(원인 규명 — 보고서 1절) — 참고용 실시간 계산값(계산 근거·0 이유 표시용)을
    // 보여주려고 총수량과 색상×사이즈 수량표를 같은 규칙(resolveAppliedQuantity, PR-226)
    // 으로 가져온다. 기존 API만 쓴다(새 API 없음), 계산/저장 로직은 바꾸지 않는다.
    setSelectedStyleTotalQty(null);
    setSelectedStyleColorQtyMap(new Map());
    try {
      const res = await getBomByStyleNo(styleNo);
      setBom(res);
    } catch (err: any) {
      setBomError(getErrorMessage(err, '자재명세를 불러오는 데 실패했습니다.'));
    }
    getMasterStyles({ styleNo })
      .then((res) => {
        const list = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
        const match = list.find((s: MasterStyle) => s.styleNo === styleNo);
        setSelectedStyleTotalQty(match?.overview?.totalQty ?? null);
      })
      .catch(() => setSelectedStyleTotalQty(null));
    getStyleColorSizeQuantities(styleNo)
      .then((data) => setSelectedStyleColorQtyMap(buildColorQtyMap(data.totalByColor ?? [])))
      .catch(() => setSelectedStyleColorQtyMap(new Map()));
  };

  // PR-224: 목록(콤보)에서 스타일을 고르면 검색 버튼 없이 바로 조회한다 — 기존
  // 검색창(searchStyleNo)·결과 표(searchResults)에도 선택한 스타일 1건을 반영해
  // 같은 화면 구조(검색 결과 표 → 자재 목록)를 그대로 쓴다.
  const handlePickStyleFromSearch = async (picked: MasterStyle | null) => {
    setStyleSearchPick(picked);
    if (!picked) return;
    setSearchStyleNo(picked.styleNo);
    setSearched(true);
    setSearchResults([picked]);
    await handleSelectStyleNo(picked.styleNo);
  };

  // 오더관리에서 "자재명세 보기"로 넘어온 styleNo가 있으면 검색창 입력 없이 바로 그
  // 스타일의 BOM을 연다. 한 번 처리하면 부모에게 소비했다고 알려 반복 오픈을 막는다
  // (StylesManager의 initialStyleNo 처리와 동일한 패턴).
  useEffect(() => {
    if (!initialStyleNo) return;
    setSearchStyleNo(initialStyleNo);
    setSearched(true);
    handleSelectStyleNo(initialStyleNo);
    onInitialStyleNoConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStyleNo]);

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
    getMaterialCategories().then((res) => setMaterialCategories(Array.isArray(res) ? res : (res?.data ?? []))).catch(() => setMaterialCategories([]));
    getMaterialPackagingUnitRules().then((res) => setPackagingRules(Array.isArray(res) ? res : (res?.data ?? []))).catch(() => setPackagingRules([]));
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
  // PR-232: 예전엔(PR-139) 구분도 안 고르고 키워드도 비어있으면 경고 토스트만 띄우고
  // 조회 자체를 막았다 — 그런데 이 화면은 "검색 조건을 몰라도 전체 목록을 보고 싶을
  // 수 있는" 품목 마스터 관리 화면이라, 조건 없이 눌러도 그냥 전체 목록(첫 페이지)을
  // 보여주는 쪽으로 바꾼다(다른 화면(작업지시 목록 등)의 같은 패턴은 건드리지 않음 —
  // hasAnySearchCondition/toast 가드는 이 화면에서만 뗐다).
  const handleItemSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      setNewItem({ code: '', name: '', englishName: '', unit: '', type: 'RAW_MATERIAL', spec: '', description: '', styleNo: '', categoryId: null, materialSubType: null });
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
    setEditCategoryId(item.categoryId != null ? String(item.categoryId) : '');
    setEditMaterialSubType(item.materialSubType ?? '');
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditItemForm({ name: '', englishName: '', unit: '', spec: '', description: '', styleNo: '' });
    setEditMaterialSubType('');
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
        // PR-183: 빈 값은 null로 보내 품목군을 해제한다(undefined면 그대로 둠).
        categoryId: editCategoryId ? Number(editCategoryId) : null,
        // PR-186: 빈 값은 null로 보내 종류 지정을 해제한다(미지정으로 되돌림).
        materialSubType: editMaterialSubType || null,
      });
      toast.success('품목 정보가 수정되었습니다.');
      cancelEditItem();
      loadItems();
    } catch (error) {
      // toast.error는 Axios 인터셉터에서 처리됨
    }
  };

  // PR-239: 이 행의 (지금 선택 중인) 실/테이프 종류에 포장 규칙이 있으면 그 규칙을
  // 돌려준다 — "필요수량 직접 지정"을 포장 수(콘/롤)로 입력할 수 있는지와, 입력칸 옆
  // 단위 라벨을 정하는 데 쓴다. formatBomItemQty의 "subtype && rule" 조건과 같다.
  const manualQtyPackagingContext = (subtype: string): PackagingRuleContext | null => {
    const rule = subtype ? packagingRules.find((r) => r.materialSubType === subtype) : undefined;
    return rule ? { packagingUnitLabel: rule.packagingUnitLabel, unitLengthM: Number(rule.unitLengthM) } : null;
  };

  const startEditBomItem = (row: BomItemRow) => {
    setEditingBomItemId(row.id);
    const subtype = row.threadType || row.tapeType || '';
    const context = manualQtyPackagingContext(subtype);
    const mode = defaultManualQtyInputMode(context);
    // PR-239: 기존 저장값(항상 길이 단위)을 기본 모드 기준으로 되돌려 보여준다 —
    // 포장 규칙이 있으면 포장 수로(사람이 실제로 세는 단위), 없으면 길이 그대로.
    const manualRaw = row.manualRequiredQty;
    const manualDisplay =
      manualRaw == null ? '' : mode === 'packages' && context ? String(manualRaw / context.unitLengthM) : String(manualRaw);
    setEditBomItemForm({
      composition: row.composition || '', hsCode: row.hsCode || '', threadType: subtype,
      consumption: String(row.consumption ?? ''), spec: row.spec || '', colorCode: row.colorCode || '', category: row.category || '',
      unit: row.material?.unit || '',
      manualRequiredQty: manualDisplay,
      manualRequiredQtyNote: row.manualRequiredQtyNote || '',
      manualRequiredQtyMode: mode,
    });
  };

  // PR-218: "필요량" 칸의 소수 표시를 BomRequirementReport/StyleShortagePanel과 같은 규칙으로
  // 맞춘다 — threadType/tapeType이 이미 BOM 행에 지정돼 있으므로(computeRawRowPackaging처럼
  // 자재명 추론이 필요 없다) formatBomItemQty에 그대로 넘긴다.
  const bomItemFormatOpts = (it: BomItemRow) => ({
    subtype: it.threadType ?? it.tapeType,
    itemName: it.material?.name,
    itemUnit: it.material?.unit,
  });

  // PR-229: "소요수량"의 주 값을 저장 스냅샷(BomItem.requiredQty, 커밋 시점에 한 번
  // 저장되고 그 뒤로는 갱신되지 않음 — 원인 규명은 PR-227/보고서 1절)이 아니라, PR-226과
  // 같은 규칙(resolveAppliedQuantity)으로 지금 다시 계산한 값으로 보여준다. 계산 자체를
  // 바꾸지 않고(새 공식 없음) 기존 순수 함수(resolveAppliedQuantity, formatBomItemQty)만
  // 재사용한다.
  const bomItemApplied = (it: BomItemRow): AppliedQuantityResult =>
    resolveAppliedQuantity({
      consumption: it.consumption,
      totalQty: selectedStyleTotalQty,
      sheetQty: it.sheetQty ?? null,
      sheetQtyUnit: it.sheetQtyUnit ?? null,
      itemUnit: it.material?.unit ?? null,
      colorCode: it.colorCode,
      colorQtyMap: selectedStyleColorQtyMap,
      // PR-231: 수동 지정 값이 있으면 항상 1순위로 적용된다(resolveAppliedQuantity 내부 규칙).
      manualRequiredQty: it.manualRequiredQty ?? null,
      manualRequiredQtyNote: it.manualRequiredQtyNote ?? null,
    });

  // 계산 자체가 안 되는 두 경우(색상별 수량표/작지 값 둘 다 근거 없음, 또는 스타일
  // 총수량 미입력)에만 숫자 대신 이유를 보여준다 — 그 외에는 항상 지금 계산한 값.
  const bomItemLiveReason = (applied: AppliedQuantityResult) =>
    describeLiveQtyReason(resolveLiveQtyReason({ basis: applied.basis, styleTotalQty: selectedStyleTotalQty }));

  // 저장된 스냅샷은 더 이상 주 값이 아니지만, 지금 계산한 값과 다르면("스냅샷이
  // 오래됐다"는 뜻) 작은 보조 표시로만 남긴다 — 같으면 표시하지 않는다.
  const bomItemSnapshotNote = (it: BomItemRow, liveText: string) =>
    describeSnapshotNote(liveText, formatBomItemQty(it.requiredQty, bomItemFormatOpts(it), packagingRules).text);

  const fmtBomQty = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });

  // 자재·BOM 조회 표 "소요수량" 칸 — 수정/보기 모드가 똑같은 내용을 보여주므로 한
  // 곳에서만 만든다. 계산 불가 이유(reason)가 있으면 그것만 보여주고, 그 외에는 항상
  // 근거 배지(작지/색상수량표/계산)·불일치·비정상 요척 경고(PR-226/228과 같은 문구)를
  // 함께 보여준다 — 경고 조건·문구는 StyleShortagePanel.tsx의 같은 경고와 동일하게
  // 맞춘다(사용자가 화면마다 다른 문구를 보지 않게).
  const renderBomItemQtyCell = (it: BomItemRow) => {
    const applied = bomItemApplied(it);
    const reason = bomItemLiveReason(applied);
    const display = formatBomItemQty(applied.qty, bomItemFormatOpts(it), packagingRules);
    const snapshotNote = reason ? null : bomItemSnapshotNote(it, display.text);
    const basisLabel = APPLIED_BASIS_LABEL[applied.basis];
    // PR-231: 수동 지정 행은 주 값 옆에 "수동" 배지를 보여준다 — title에 계산값(참고)·
    // 지정 시각·사유를 모아 둔다.
    const manualTitleParts: string[] = [];
    if (applied.basis === 'manual') {
      manualTitleParts.push(`계산값(참고): ${fmtBomQty(applied.computedQty)}`);
      if (it.manualRequiredQtyAt) manualTitleParts.push(`지정 시각: ${new Date(it.manualRequiredQtyAt).toLocaleString('ko-KR')}`);
      if (applied.manualNote) manualTitleParts.push(`사유: ${applied.manualNote}`);
    }
    return (
      <>
        {reason ? <span title={reason.title}>{reason.text}</span> : display.text}
        {applied.basis === 'manual' && (
          <span className="ml-1 inline-block px-1 rounded bg-purple-100 text-purple-700 text-xs align-middle" title={manualTitleParts.join(' · ')}>수동</span>
        )}
        {!reason && basisLabel && (
          <span className="block text-xs text-emerald-700" title={applied.formula}>{basisLabel} 기준</span>
        )}
        {!reason && (display.kind === 'SUBTYPE_NEEDED' || display.kind === 'UNIT_MISMATCH') && (
          <span className="block text-xs text-amber-700">⚠ {display.warning}</span>
        )}
        {!reason && display.kind === 'PACKAGED' && <span className="block text-xs text-gray-400">{display.formula}</span>}
        {!reason && applied.mismatch && (
          <span className="block text-xs text-amber-700">
            ⚠ 작지 수량({fmtBomQty(applied.sheetQty ?? 0)})과 계산값(요척×기획수량, {fmtBomQty(applied.computedQty)})이 달라 확인이 필요합니다
            {applied.sheetQtyLooksLikeTotalQtyMisread && (
              <span className="block">
                작지 값이 총수량과 같습니다 — 출고량 칸이 아닌 수량을 읽었을 수 있습니다
                {applied.quantityUnitKind === 'unknown' && ' — 단위를 확인해 주세요'}
              </span>
            )}
          </span>
        )}
        {!reason && applied.extremeConsumptionMismatch && (
          <span className="block text-xs text-red-700 font-medium" title="요척(단위소요량)을 확인해 주세요.">
            ⚠ 요척이 비정상적으로 보입니다(계산값 {fmtBomQty(applied.computedQty)} / 작지 값 {fmtBomQty(applied.sheetQty ?? 0)}) — 요척을 확인해 주세요
          </span>
        )}
        {snapshotNote && (
          <span className="block text-xs text-gray-400" title="저장 시점 스냅샷(BomItem.requiredQty) — 참고용, 계산에는 쓰이지 않습니다.">{snapshotNote}</span>
        )}
      </>
    );
  };

  const cancelEditBomItem = () => {
    setEditingBomItemId(null);
    setEditBomItemForm({ composition: '', hsCode: '', threadType: '', consumption: '', spec: '', colorCode: '', category: '', unit: '', manualRequiredQty: '', manualRequiredQtyNote: '', manualRequiredQtyMode: 'length' });
  };

  const handleUpdateBomItem = async (id: number) => {
    const original = bom?.items.find((i) => i.id === id);
    const newConsumption = editBomItemForm.consumption === '' ? undefined : Number(editBomItemForm.consumption);
    if (newConsumption !== undefined && (!Number.isFinite(newConsumption) || newConsumption < 0)) {
      toast.error('요척은 0 이상의 숫자여야 합니다.');
      return;
    }
    // PR-197: 요척이 실제로 바뀌면 "요척 2.7 → 2.9 (필요량이 바뀝니다)"처럼 변경 전/후를
    // 확인받는다 — 저장 전 사람이 한 번 더 볼 수 있게.
    if (original && newConsumption !== undefined && Number(original.consumption) !== newConsumption) {
      const ok = window.confirm(`요척 ${original.consumption} → ${newConsumption} (필요량이 바뀝니다). 저장하시겠습니까?`);
      if (!ok) return;
    }
    // PR-227: 단위는 BomItem이 아니라 자재(Item) 마스터 값이다 — 이 자재를 쓰는 모든
    // 스타일에 적용되므로(이 자재를 쓰는 스타일 수를 알려주는 기존 API가 없어 문구에는
    // 넣지 않는다) 바뀌었을 때만 별도 확인을 받고 PATCH /items/:id로 저장한다.
    const originalUnit = original?.material?.unit || '';
    const newUnit = editBomItemForm.unit.trim();
    const unitChanged = original?.material != null && isUnitChanged(originalUnit, newUnit);
    // PR-239: 길이 기반 요척(실/테이프) 또는 포장 규칙이 지정된 행은 단위를 콘/롤/EA 등
    // 길이가 아닌 값으로 바꾸는 것을 시스템이 막는다(배경 참고 — "사용자가 조심해서
    // 쓰게 하는 것이 아니라 시스템에서 발생할 수 있는 문제를 해결"한다는 요구사항).
    if (unitChanged) {
      const guardContext = {
        hasPackagingRule: !!manualQtyPackagingContext(editBomItemForm.threadType),
        looksLikeThreadOrTapeByName: !editBomItemForm.threadType && looksLikeThreadOrTape(original?.material?.name, packagingRules),
      };
      if (isBlockedUnitForLengthBasedMaterial(newUnit, guardContext)) {
        toast.error(BLOCKED_PACKAGING_UNIT_MESSAGE);
        return;
      }
      const ok = window.confirm(UNIT_CHANGE_CONFIRM_TEXT);
      if (!ok) return;
    }
    // PR-231/239: 필요수량 직접 지정 — 비우면 해제(null). 포장 규칙이 있는 행은 입력
    // 단위(길이/포장 수)를 선택할 수 있고, 포장 수를 선택했으면 "수 × 규칙길이"로 길이
    // 값으로 환산해 저장한다(manualRequiredQty는 항상 길이 단위) — 사유도 자동 기록한다.
    const manualInput = editBomItemForm.manualRequiredQty.trim();
    let manualQty: number | null = null;
    let manualNote = editBomItemForm.manualRequiredQtyNote.trim();
    if (manualInput !== '') {
      const rawValue = Number(manualInput);
      if (!Number.isFinite(rawValue) || rawValue < 0) {
        toast.error('필요수량 직접 지정 값은 0 이상의 숫자여야 합니다.');
        return;
      }
      const context = manualQtyPackagingContext(editBomItemForm.threadType);
      const resolved = resolveManualQtyInput(rawValue, editBomItemForm.manualRequiredQtyMode, context);
      manualQty = resolved.lengthQty;
      if (resolved.autoNote) manualNote = manualNote ? `${resolved.autoNote} · ${manualNote}` : resolved.autoNote;
      if (original) {
        const computedQty = bomItemApplied(original).computedQty;
        if (isExtremeConsumptionMismatch(computedQty, manualQty)) {
          const modeNote =
            editBomItemForm.manualRequiredQtyMode === 'length' && context
              ? '\n입력하신 값은 길이 기준 필요량으로 해석됩니다(포장 수 아님).'
              : '';
          const ok = window.confirm(`계산값 ${fmtBomQty(computedQty)}과 크게 다릅니다. 직접 지정 값 ${fmtBomQty(manualQty)}으로 저장할까요?${modeNote}`);
          if (!ok) return;
        }
      }
    }
    try {
      await updateBomItem(id, {
        composition: editBomItemForm.composition,
        hsCode: editBomItemForm.hsCode,
        ...(editBomItemForm.threadType ? resolveSubTypePayload(editBomItemForm.threadType) : {}),
        ...(newConsumption !== undefined ? { consumption: newConsumption } : {}),
        spec: editBomItemForm.spec,
        colorCode: editBomItemForm.colorCode,
        category: editBomItemForm.category,
        manualRequiredQty: manualQty,
        manualRequiredQtyNote: manualNote,
      });
      if (unitChanged && original?.material) {
        await updateItem(original.material.id, { unit: newUnit });
      }
      toast.success('자재명세 항목이 수정되었습니다.');
      cancelEditBomItem();
      if (selectedStyleNo) {
        // PR-227: 단위가 바뀌면 포장단위 환산 경고("단위 확인 필요")·N롤/N콘 표시가
        // material.unit을 다시 읽어야 갱신된다 — BOM을 다시 불러오면 자동으로 반영된다
        // (PurchaseOrdersManager의 styleMaterialRows 캐시 갱신과 같은 패턴).
        const res = await getBomByStyleNo(selectedStyleNo);
        setBom(res);
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, '자재명세 항목 수정에 실패했습니다.'));
    }
  };

  // PR-231: "수동 지정 해제(계산값 사용)" — 확인창 없이 즉시 저장 요청 + 목록 갱신
  // (요구사항: 해제는 되돌리기 쉬운 동작이라 확인을 받지 않는다).
  const handleClearManualRequiredQty = async (id: number) => {
    try {
      await updateBomItem(id, { manualRequiredQty: null });
      toast.success('수동 지정을 해제했습니다 — 계산값을 사용합니다.');
      if (editingBomItemId === id) cancelEditBomItem();
      if (selectedStyleNo) {
        const res = await getBomByStyleNo(selectedStyleNo);
        setBom(res);
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수동 지정 해제에 실패했습니다.'));
    }
  };

  // PR-197: 저장된 BOM 행 삭제 — 이 스타일 BOM에서만 빠진다(자재 마스터/발주는 그대로).
  // 사람이 버튼을 눌러야만 동작(자동 정리 없음).
  const handleDeleteBomItem = async (row: BomItemRow) => {
    const ok = window.confirm(
      `"${row.material?.name ?? ''}" 행을 이 스타일 자재명세에서 삭제합니다.\n` +
      '이 스타일 BOM에서만 빠집니다. 자재 마스터와 기존 발주는 그대로입니다.\n계속하시겠습니까?',
    );
    if (!ok) return;
    setDeletingBomItemId(row.id);
    try {
      const result = await deleteBomItem(row.id);
      if (result.linkedPurchaseOrderCount > 0) {
        toast.success(`삭제되었습니다 — 이 자재로 연결된 발주(취소 제외) ${result.linkedPurchaseOrderCount}건은 그대로 남아 있습니다.`);
      } else {
        toast.success('삭제되었습니다.');
      }
      if (selectedStyleNo) {
        const res = await getBomByStyleNo(selectedStyleNo);
        setBom(res);
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, '삭제에 실패했습니다.'));
    } finally {
      setDeletingBomItemId(null);
    }
  };

  // PR-197: 이 BOM 행이 가리키는 자재를 이미 있는 다른 자재로 교체(이름 오인식 교정용).
  const startSwapMaterial = (row: BomItemRow) => {
    setSwappingBomItemId(row.id);
    setMaterialSwapPick(null);
  };

  const cancelSwapMaterial = () => {
    setSwappingBomItemId(null);
    setMaterialSwapPick(null);
  };

  const handleConfirmSwapMaterial = async (row: BomItemRow) => {
    if (!materialSwapPick) {
      toast.error('교체할 자재를 먼저 골라 주세요.');
      return;
    }
    const ok = window.confirm(`"${row.material?.name ?? ''}" → "${materialSwapPick.name}"(으)로 자재를 교체하시겠습니까?`);
    if (!ok) return;
    try {
      await swapBomItemMaterial(row.id, materialSwapPick.id);
      toast.success('자재가 교체되었습니다.');
      cancelSwapMaterial();
      if (selectedStyleNo) {
        const res = await getBomByStyleNo(selectedStyleNo);
        setBom(res);
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, '자재 교체에 실패했습니다.'));
    }
  };

  const searchMaterialsForSwap = useCallback(async (keyword: string): Promise<{ id: number; name: string; code: string }[]> => {
    const res = await getItems({ keyword: keyword || undefined, limit: 20 } as GetItemsFilter);
    const list = Array.isArray(res) ? res : (res?.items ?? []);
    return list.map((i: any) => ({ id: i.id, name: i.name, code: i.code }));
  }, []);

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
          <label className="text-sm text-gray-600 mb-1">스타일 번호(직접 입력)</label>
          <input className="border border-gray-300 rounded px-3 py-2" placeholder="예: MB62SLM103Z" value={searchStyleNo} onChange={(e) => setSearchStyleNo(e.target.value)} />
        </div>
        <div className="flex flex-col">
          {/* PR-224: 발주 화면(PurchaseOrdersManager.tsx "스타일 연결")과 같은
              SearchSelectField<MasterStyle> + getMasterStyles 조합 — 목록에서 고르면
              검색 버튼 없이 바로 그 스타일의 자재 목록이 아래에 뜬다. 이 컴포넌트는
              클릭하면 열리는 검색 팝업(돋보기 버튼)이라 "타이핑하면 바로 아래에 후보가
              뜨는" 인라인 콤보와는 모양이 다르다(발주 화면의 실제 동작과 동일 — 보고서
              1절 참고). renderRow만 브랜드/바이어를 보여주도록 추가했다(발주 화면
              원본은 스타일번호만 보여줌).
          */}
          <label className="text-sm text-gray-600 mb-1">또는 목록에서 선택</label>
          <SearchSelectField<MasterStyle>
            value={styleSearchPick}
            onChange={(picked) => { void handlePickStyleFromSearch(picked); }}
            search={searchStylesForLookup}
            getKey={(s) => s.styleNo}
            getLabel={(s) => s.styleNo}
            renderRow={(s) => (
              <span>
                <span className="font-mono">{s.styleNo}</span>
                <span className="text-gray-400 text-xs ml-1">{[s.overview?.brand, s.overview?.buyer].filter(Boolean).join(' · ') || '-'}</span>
              </span>
            )}
            ariaLabel="스타일 목록 검색"
            placeholder="스타일 선택"
            title="스타일 검색 — 고르면 바로 자재 목록을 보여줍니다"
            allowClear
            className="w-56"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">납기일(From)</label>
          <input className="border border-gray-300 rounded px-3 py-2" type="date" value={searchRddFrom} onChange={(e) => setSearchRddFrom(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">납기일(To)</label>
          <input className="border border-gray-300 rounded px-3 py-2" type="date" value={searchRddTo} onChange={(e) => setSearchRddTo(e.target.value)} />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">검색</button>
      </form>

      {searched && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table>
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-2 text-left">스타일 번호</th>
                <th className="px-4 py-2 text-left">브랜드</th>
                <th className="px-4 py-2 text-left">바이어</th>
                <th className="px-4 py-2 text-left">납기일</th>
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
          {editing && (
            <PurchaseOrderEditModal
              order={editing.order}
              pendingCount={editing.pendingCount}
              onClose={() => setEditing(null)}
              onSaved={() => { setEditing(null); loadPendingOrders(); }}
            />
          )}
          {bom && (() => {
            // PR-224: 자재명/구분/색상 필터 — 서버 요청 없이 bom.items(이미 불러온
            // 행)에만 적용한다(소요량/포장단위 계산 로직은 그대로). 선택지는 현재
            // 스타일에 실제로 있는 값만(distinctNonEmptySorted) — 새 분류를 만들지 않음.
            const categoryOptions = distinctNonEmptySorted(bom.items.map((it) => it.category));
            const colorOptions = distinctNonEmptySorted(bom.items.map((it) => it.colorCode));
            const filteredBomItems = filterBomRows(bom.items, {
              nameKeyword: bomNameFilter,
              category: bomCategoryFilter,
              colorCode: bomColorFilter,
            });
            const hasAnyFilter = !!(bomNameFilter || bomCategoryFilter || bomColorFilter);
            return (
              <>
                <div className="flex flex-wrap gap-3 items-end bg-gray-50 p-3 rounded-lg" data-testid="bom-filter-bar">
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-600 mb-1">자재명</label>
                    <input
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                      placeholder="자재명 검색"
                      aria-label="자재명 필터"
                      value={bomNameFilter}
                      onChange={(e) => setBomNameFilter(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-600 mb-1">구분</label>
                    <select
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                      aria-label="구분 필터"
                      value={bomCategoryFilter}
                      onChange={(e) => setBomCategoryFilter(e.target.value)}
                    >
                      <option value="">전체</option>
                      {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-600 mb-1">색상</label>
                    <select
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                      aria-label="색상 필터"
                      value={bomColorFilter}
                      onChange={(e) => setBomColorFilter(e.target.value)}
                    >
                      <option value="">전체</option>
                      {colorOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {hasAnyFilter && (
                    <button
                      type="button"
                      className="text-sm text-gray-500 hover:underline"
                      onClick={() => { setBomNameFilter(''); setBomCategoryFilter(''); setBomColorFilter(''); }}
                    >초기화</button>
                  )}
                  <span className="text-xs text-gray-500" data-testid="bom-filter-count">
                    자재 {bom.items.length}건 중 {filteredBomItems.length}건
                  </span>
                </div>
                {filteredBomItems.length === 0 ? (
                  <p className="p-4 text-center text-gray-500 bg-white border border-gray-200 rounded-lg">
                    조건에 맞는 자재가 없습니다 — 필터를 초기화해 보세요.
                  </p>
                ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table>
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left">자재코드</th>
                    <th className="px-4 py-2 text-left">자재명</th>
                    <th className="px-4 py-2 text-left">카테고리</th>
                    <th className="px-4 py-2 text-left">색상</th>
                    <th className="px-4 py-2 text-left">규격</th>
                    {/* PR-227: 품목 마스터 단위(Item.unit) — 사용자 보고: "표에는 아예
                        단위 열이 없다" */}
                    <th className="px-4 py-2 text-left">단위</th>
                    <th className="px-4 py-2 text-right">단위소요량</th>
                    <th className="px-4 py-2 text-right">소요수량</th>
                    <th className="px-4 py-2 text-left">공급업체</th>
                    <th className="px-4 py-2 text-right">단가</th>
                    <th className="px-4 py-2 text-left">비고</th>
                    <th className="px-4 py-2 text-left">혼용율</th>
                    <th className="px-4 py-2 text-left">HS코드</th>
                    <th className="px-4 py-2 text-left">실 종류</th>
                    <th className="px-4 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredBomItems.map((it) =>
                    swappingBomItemId === it.id ? (
                      <tr key={it.id} className="bg-indigo-50">
                        <td className="px-4 py-2 font-mono">{it.material?.code}</td>
                        <td className="px-4 py-2 whitespace-pre-line">{it.material?.name}</td>
                        <td colSpan={13} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">교체할 자재:</span>
                            <SearchSelectField<{ id: number; name: string; code: string }>
                              value={materialSwapPick}
                              onChange={setMaterialSwapPick}
                              search={searchMaterialsForSwap}
                              getKey={(i) => i.id}
                              getLabel={(i) => `${i.name} (${i.code})`}
                              renderRow={(i) => (<span>{i.name} <span className="text-gray-400 text-xs">{i.code}</span></span>)}
                              ariaLabel="교체할 자재 검색"
                              placeholder="자재 검색"
                              title="자재 검색 — 이미 등록된 자재만 선택할 수 있습니다"
                              allowClear
                              className="w-64"
                            />
                            <button className="text-indigo-700 font-medium" onClick={() => handleConfirmSwapMaterial(it)}>확정</button>
                            <button className="text-gray-500" onClick={cancelSwapMaterial}>취소</button>
                          </div>
                        </td>
                      </tr>
                    ) : editingBomItemId === it.id ? (
                      <tr key={it.id} className="bg-yellow-50">
                        <td className="px-4 py-2 font-mono">{it.material?.code}</td>
                        <td className="px-4 py-2 whitespace-pre-line">{it.material?.name}</td>
                        <td className="px-4 py-2">
                          <input
                            className="border rounded px-2 py-1 w-24"
                            value={editBomItemForm.category}
                            onChange={(e) => setEditBomItemForm({ ...editBomItemForm, category: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className="border rounded px-2 py-1 w-16"
                            value={editBomItemForm.colorCode}
                            onChange={(e) => setEditBomItemForm({ ...editBomItemForm, colorCode: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className="border rounded px-2 py-1 w-20"
                            value={editBomItemForm.spec}
                            onChange={(e) => setEditBomItemForm({ ...editBomItemForm, spec: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          {/* PR-227: 단위는 자재(품목) 마스터 값 — 기존에 쓰이는 값 중에서
                              고르거나 직접 입력할 수 있다(datalist, 새 검증 규칙은 추가하지 않음). */}
                          <input
                            list="bom-unit-options"
                            className="border rounded px-2 py-1 w-20"
                            aria-label="단위"
                            value={editBomItemForm.unit}
                            onChange={(e) => setEditBomItemForm({ ...editBomItemForm, unit: e.target.value })}
                          />
                          <datalist id="bom-unit-options">
                            <option value="EA" />
                            <option value="M" />
                            <option value="Y" />
                            <option value="YD" />
                            <option value="KG" />
                            <option value="ROLL" />
                            <option value="CONE" />
                          </datalist>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            step="any"
                            min={0}
                            className="border rounded px-2 py-1 w-20 text-right"
                            aria-label="요척"
                            value={editBomItemForm.consumption}
                            onChange={(e) => setEditBomItemForm({ ...editBomItemForm, consumption: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          {renderBomItemQtyCell(it)}
                          {/* PR-231/239: 필요수량 직접 지정 — 비우면 계산값 사용(placeholder에 지금 계산값
                              표시). 포장 규칙이 있는 행은 입력 단위(길이/포장 수)를 고를 수 있고, 입력칸
                              옆 라벨은 마스터 단위(EA 등)가 아니라 "지금 고른 입력 단위"를 보여준다 —
                              기존 버그(옆 라벨이 항상 마스터 단위라 포장 수를 길이로 착각하게 했다)를 고친다. */}
                          {(() => {
                            const context = manualQtyPackagingContext(editBomItemForm.threadType);
                            const mode = editBomItemForm.manualRequiredQtyMode;
                            const unitLabel = manualQtyInputUnitLabel(mode, context, it.material?.unit);
                            const rawValue = Number(editBomItemForm.manualRequiredQty);
                            const hasRawValue = editBomItemForm.manualRequiredQty.trim() !== '' && Number.isFinite(rawValue);
                            const preview = hasRawValue
                              ? describeManualQtyPreview(rawValue, mode, context)
                              : context
                              ? describeManualQtyPreview(bomItemApplied(it).computedQty, 'length', context)
                              : null;
                            return (
                              <div className="mt-2 text-left">
                                <label className="block text-xs text-gray-500">필요수량 직접 지정</label>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    step="any"
                                    min={0}
                                    className="border rounded px-2 py-1 w-24 text-right"
                                    aria-label="필요수량 직접 지정"
                                    placeholder={`비우면 계산값 ${fmtBomQty(bomItemApplied(it).computedQty)} 사용`}
                                    value={editBomItemForm.manualRequiredQty}
                                    onChange={(e) => setEditBomItemForm({ ...editBomItemForm, manualRequiredQty: e.target.value })}
                                  />
                                  {context ? (
                                    <select
                                      className="border rounded px-1 py-1 text-xs"
                                      aria-label="필요수량 직접 지정 입력 단위"
                                      value={mode}
                                      onChange={(e) => setEditBomItemForm({ ...editBomItemForm, manualRequiredQtyMode: e.target.value as ManualQtyInputMode })}
                                    >
                                      <option value="packages">포장 수({context.packagingUnitLabel})</option>
                                      <option value="length">길이(M 등)</option>
                                    </select>
                                  ) : (
                                    <span className="text-xs text-gray-400">{unitLabel}</span>
                                  )}
                                </div>
                                {preview && <p className="text-xs text-gray-400 mt-0.5">{preview}</p>}
                                <input
                                  className="border rounded px-2 py-1 w-full mt-1 text-xs"
                                  aria-label="필요수량 직접 지정 사유"
                                  placeholder="사유(선택, 200자 이내)"
                                  maxLength={200}
                                  value={editBomItemForm.manualRequiredQtyNote}
                                  onChange={(e) => setEditBomItemForm({ ...editBomItemForm, manualRequiredQtyNote: e.target.value })}
                                />
                                {it.manualRequiredQty != null && (
                                  <button
                                    type="button"
                                    className="text-xs text-gray-500 underline mt-1"
                                    onClick={() => handleClearManualRequiredQty(it.id)}
                                  >
                                    수동 지정 해제(계산값 사용)
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </td>
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
                        <td className="px-4 py-2">
                          <select
                            className="border rounded px-2 py-1"
                            aria-label="실/테이프 종류"
                            value={editBomItemForm.threadType}
                            onChange={(e) => setEditBomItemForm({ ...editBomItemForm, threadType: e.target.value })}
                          >
                            <option value="">해당없음/미지정</option>
                            <option value="COA_SA">코아사 (2500M/콘)</option>
                            <option value="OBA_SA_SKU_I_SA">오바사·스쿠이사 (4000M/콘)</option>
                            <option value="POLY_JINUIDO">폴리지누이도 (500M/콘)</option>
                            <option value="DADE">다데 (50M/롤)</option>
                            <option value="AMHOL">암홀 (100M/롤)</option>
                          </select>
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
                        {/* PR-227: 품목 마스터 단위 — 비어 있으면 "-". */}
                        <td className="px-4 py-2">{it.material?.unit || '-'}</td>
                        <td className="px-4 py-2 text-right">{it.consumption}</td>
                        <td className="px-4 py-2 text-right">{renderBomItemQtyCell(it)}</td>
                        <td className="px-4 py-2">{it.supplier}</td>
                        <td className="px-4 py-2 text-right">{it.unitPrice}</td>
                        <td className="px-4 py-2">{it.remarks}</td>
                        <td className="px-4 py-2">{it.composition ?? '-'}</td>
                        <td className="px-4 py-2">{it.hsCode ?? '-'}</td>
                        <td className="px-4 py-2">
                          {it.threadType === 'COA_SA' ? '코아사' : it.threadType === 'OBA_SA_SKU_I_SA' ? '오바사·스쿠이사' : it.threadType === 'POLY_JINUIDO' ? '폴리지누이도' : it.tapeType === 'DADE' ? '다데' : it.tapeType === 'AMHOL' ? '암홀' : '-'}
                        </td>
                        <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                          <button className="text-blue-600" onClick={() => startEditBomItem(it)}>수정</button>
                          <button className="text-indigo-600" onClick={() => startSwapMaterial(it)}>자재 교체</button>
                          <button
                            className="text-red-600 disabled:opacity-50"
                            disabled={deletingBomItemId === it.id}
                            onClick={() => handleDeleteBomItem(it)}
                          >{deletingBomItemId === it.id ? '삭제 중...' : '삭제'}</button>
                          {it.material?.id && buildEditableOrderByItem(pendingOrders).get(it.material.id) && (
                            <button
                              onClick={() => { const e = buildEditableOrderByItem(pendingOrders).get(it.material.id)!; setEditing({ order: e.order, pendingCount: e.pendingCount }); }}
                              className="bg-amber-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-amber-700 whitespace-nowrap"
                            >
                              수정하기
                            </button>
                          )}
                          {onOrderItem && it.material?.id && !buildEditableOrderByItem(pendingOrders).get(it.material.id) && (
                            <button
                              onClick={() => onOrderItem(it.material.id, selectedStyleNo ?? undefined)}
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
              </>
            );
          })()}
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
            {/* PR-183: 품목군은 선택 사항 — 자동으로 채우지 않는다. */}
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">품목군 (선택)</label>
              <select
                className="border border-gray-300 rounded px-3 py-2"
                aria-label="품목군"
                value={newItem.categoryId ?? ''}
                onChange={(e) => setNewItem({ ...newItem, categoryId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">- 없음 -</option>
                {activeCategories(materialCategories).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {/* PR-186: 실/테이프 종류(선택) — 소요량 계산이 BOM 행 대신 이 값을 쓸 수 있게 한다. */}
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">실/테이프 종류 (선택)</label>
              <select
                className="border border-gray-300 rounded px-3 py-2"
                aria-label="실/테이프 종류"
                value={newItem.materialSubType ?? ''}
                onChange={(e) => setNewItem({ ...newItem, materialSubType: e.target.value || null })}
              >
                <option value="">- 없음 -</option>
                {packagingRules.map((r) => (
                  <option key={r.materialSubType} value={r.materialSubType}>{r.displayName}</option>
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

          {/* PR-103: 구분(type)/키워드(이름·코드) 검색 — 기존 백엔드 필터를 화면에 연결.
              PR-232: 위쪽 등록 폼과 헷갈리지 않게 작은 제목을 붙이고, placeholder에
              예시를 넣어 이름/코드 둘 다 검색된다는 걸 알린다(레이아웃은 그대로). */}
          <p className="text-sm font-medium text-gray-600 mt-2">품목 검색</p>
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
              placeholder="품목명 또는 코드(예: 다데, MAT-12345)"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">검색</button>
            <button type="button" onClick={handleItemSearchReset} className="bg-gray-200 text-gray-700 px-4 py-2 rounded font-medium hover:bg-gray-300">초기화</button>
          </form>

          <div className="overflow-x-auto">
          <table>
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
                <th className="px-4 py-2 text-left">품목군</th>
                <th className="px-4 py-2 text-left">실/테이프 종류</th>
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
                    <td className="px-4 py-2">
                      <select className="border rounded px-2 py-1" aria-label="품목군 변경" value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)}>
                        <option value="">- 없음 -</option>
                        {activeCategories(materialCategories).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select className="border rounded px-2 py-1" aria-label="실/테이프 종류 변경" value={editMaterialSubType} onChange={(e) => setEditMaterialSubType(e.target.value)}>
                        <option value="">- 없음 -</option>
                        {packagingRules.map((r) => (
                          <option key={r.materialSubType} value={r.materialSubType}>{r.displayName}</option>
                        ))}
                      </select>
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
                    <td className="px-4 py-2">{materialCategories.find((c) => c.id === item.categoryId)?.name ?? '-'}</td>
                    <td className="px-4 py-2">{packagingRules.find((r) => r.materialSubType === item.materialSubType)?.displayName ?? '-'}</td>
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
