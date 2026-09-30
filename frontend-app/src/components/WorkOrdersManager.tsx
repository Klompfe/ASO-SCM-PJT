import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { createWorkOrder, updateWorkOrderStatus, getWorkOrders, type WorkOrder, type CreateWorkOrder, type WorkOrderStyleGroup } from '../api/workOrders.service';
import type { Item } from '../api/items.service';
import { getStatusCodes, type StatusCode } from '../api/statusCodes.service';
import { SearchSelectField } from './SearchSelectField';
import { FilterSearchInput } from './FilterSearchInput';
import { masterLabel, searchItems } from '../utils/searchFetchers';
import { useNavigate } from 'react-router-dom'; // Assumed react-router usage
import { getErrorMessage } from '../utils/errorMessage';
import { Pagination } from './Pagination';
import { fetchWorkOrderByStylePage, hasAnySearchCondition, type WorkOrderListQuery } from '../utils/listQueries';
import { EMPTY_PAGE_META, pageToRecoverTo, type PageMeta } from '../utils/pagination';
import { buildFieldOnlyQuery, filterExpandedOrders, type TextField } from '../utils/workOrdersByStyleView';

const emptyCreateForm: CreateWorkOrder = { itemId: 0, targetQuantity: 1 };

// PR-159: "스타일 미지정"(item.styleNo가 null) 그룹을 펼침 상태(expandedKey)에서 구분하는
// 용도의 프론트 전용 키 — 서버에는 절대 안 보낸다(대신 noStyleNo:true를 보냄).
const NO_STYLE_KEY = '\0__NO_STYLE__';

// PR-159: 목록 화면을 "스타일번호 목록(1단계) → 클릭 시 세부 작업지시(2단계)" 구조로
// 개편했다. 예전엔 작업지시 1건=1행으로 낱개 나열이라, 같은 스타일에 여러 건이 있으면
// 흐름을 파악하기 어려웠다(사용자 피드백).
export const WorkOrdersManager: React.FC = () => {
  // 1단계 — 스타일번호 집계 목록
  const [styleGroups, setStyleGroups] = useState<WorkOrderStyleGroup[]>([]);
  const [query, setQuery] = useState<WorkOrderListQuery>({ page: 1 });
  const [itemNameDraft, setItemNameDraft] = useState('');
  const [itemCodeDraft, setItemCodeDraft] = useState('');
  const [styleNoDraft, setStyleNoDraft] = useState('');
  const [statusOptions, setStatusOptions] = useState<StatusCode[]>([]);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [listLoading, setListLoading] = useState(false);

  // 2단계 — 펼쳐진 스타일의 세부 작업지시
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<WorkOrder[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [showAllInExpanded, setShowAllInExpanded] = useState(false);

  // 직접 입력으로 등록(변경 없음, 이번 PR 범위 밖)
  const [item, setItem] = useState<Item | null>(null);
  const [newWorkOrder, setNewWorkOrder] = useState<CreateWorkOrder>(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const handleAuthError = (error: any) => {
    if (error.response?.status === 401 || error.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('token');
      toast.error('세션이 만료되었습니다. 다시 로그인해주세요.', { id: 'auth-error' });
      navigate('/login');
    } else {
      toast.error(getErrorMessage(error, '오류가 발생했습니다.'));
    }
  };

  const getAuthHeader = () => {
    const token = localStorage.getItem('access_token') || localStorage.getItem('token');
    if (!token) {
      throw { status: 401, message: '토큰이 없습니다.' };
    }
    return { Authorization: `Bearer ${token}` };
  };

  const loadStyleGroups = useCallback(async () => {
    try {
      getAuthHeader();
      setListLoading(true);
      const res = await fetchWorkOrderByStylePage(query);
      const recover = pageToRecoverTo(res.meta, query.page);
      if (recover !== null) {
        setQuery((q) => ({ ...q, page: recover }));
        return;
      }
      setStyleGroups(res.items);
      setMeta(res.meta);
    } catch (error) {
      handleAuthError(error);
      setStyleGroups([]);
      setMeta(EMPTY_PAGE_META);
    } finally {
      setListLoading(false);
    }
  }, [query, navigate]);

  useEffect(() => {
    loadStyleGroups();
  }, [loadStyleGroups]);

  useEffect(() => {
    getStatusCodes('WORK_ORDER')
      .then((res) => setStatusOptions(Array.isArray(res) ? res : []))
      .catch(() => setStatusOptions([]));
  }, []);

  const groupKey = (g: WorkOrderStyleGroup) => g.styleNo ?? NO_STYLE_KEY;

  // 2단계 세부 목록 — 전체보기와 무관하게 항상 전부 불러온 뒤(운영 규모상 한 스타일의
  // 건수가 많지 않다고 판단, limit을 서버 최대치로 둠 — PaginationQueryDto가 100을
  // 넘으면 400을 던진다) 기본 노출은 화면에서 진행중만 걸러 보여준다. 그래야 "완료
  // 처리" 직후 다시 서버를 안 불러도 즉시 화면에 반영하기 쉽다.
  const loadExpandedOrders = useCallback(async (group: WorkOrderStyleGroup) => {
    setExpandedLoading(true);
    try {
      getAuthHeader();
      const filter = group.styleNo === null
        ? { noStyleNo: true, page: 1, limit: 100 }
        : { styleNoExact: group.styleNo, page: 1, limit: 100 };
      const res = await getWorkOrders(filter);
      const items: WorkOrder[] = Array.isArray(res) ? res : (res?.items ?? []);
      setExpandedOrders(items);
    } catch (error) {
      handleAuthError(error);
      setExpandedOrders([]);
    } finally {
      setExpandedLoading(false);
    }
  }, [navigate]);

  const toggleExpand = (group: WorkOrderStyleGroup) => {
    const key = groupKey(group);
    if (expandedKey === key) {
      setExpandedKey(null);
      setExpandedOrders([]);
      return;
    }
    setExpandedKey(key);
    setShowAllInExpanded(false);
    void loadExpandedOrders(group);
  };

  const refreshAfterStatusChange = async () => {
    const group = styleGroups.find((g) => groupKey(g) === expandedKey);
    if (group) await loadExpandedOrders(group);
    await loadStyleGroups(); // 1단계 건수 집계도 갱신
  };

  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkOrder.itemId || newWorkOrder.itemId <= 0) {
      toast.error('품목을 선택해 주세요.');
      return;
    }
    if (!newWorkOrder.targetQuantity || newWorkOrder.targetQuantity < 1) {
      toast.error('목표 수량은 1 이상이어야 합니다.');
      return;
    }
    setCreating(true);
    try {
      getAuthHeader();
      await createWorkOrder(newWorkOrder);
      toast.success('작업 지시가 등록되었습니다.');
      setNewWorkOrder(emptyCreateForm);
      setItem(null);
      // 새 작업지시는 해당 스타일이 최신순 맨 위로 올라오므로 1페이지로 돌아가 다시 조회한다.
      setQuery((q) => ({ ...q, page: 1 }));
    } catch (error) {
      handleAuthError(error);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (id: number, status: 'IN_PROGRESS' | 'COMPLETED') => {
    try {
      getAuthHeader();
      await updateWorkOrderStatus(id, { status });
      toast.success(status === 'COMPLETED' ? '작업 지시가 완료 처리되었습니다.' : '작업 지시가 진행중으로 전환되었습니다.');
      await refreshAfterStatusChange();
    } catch (error) {
      handleAuthError(error);
    }
  };

  // PR-159: 필드별 돋보기 — 그 필드 값만으로 즉시 조회(다른 두 텍스트 칸은 화면엔 남겨두되
  // 이번 조회 조건에서는 뺀다). 상태 필터는 이미 선택되어 있다면 그대로 함께 적용한다
  // (돋보기가 명시적으로 초기화하라고 지시한 대상은 "다른 두 칸"뿐이라 상태까지 지우지 않음).
  const searchByField = (field: TextField) => {
    setQuery((q) => buildFieldOnlyQuery(field, { itemName: itemNameDraft, itemCode: itemCodeDraft, styleNo: styleNoDraft }, q.status));
  };

  // PR-159: "검색" 버튼(및 Enter) — 채워진 조건 전부를 AND로 묶어 조회한다(예전 폼
  // onSubmit과 동일한 동작, 이번엔 버튼 하나로 명확히 분리됨). 조건이 하나도 없으면
  // 여전히 경고하고 막는다(PR-139 정책 유지 — 근거는 완료 보고 참고).
  const handleSearchAll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAnySearchCondition(query.status, itemNameDraft, itemCodeDraft, styleNoDraft)) {
      toast.error('검색 조건을 하나 이상 선택하거나 입력해 주세요.');
      return;
    }
    setQuery((q) => ({ ...q, page: 1, itemName: itemNameDraft, itemCode: itemCodeDraft, styleNo: styleNoDraft }));
  };

  const statusBadge = (status: string) => (
    <span className={`px-2 py-1 rounded text-xs font-medium ${status === 'COMPLETED' ? 'bg-green-100 text-green-800' : status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' : status === 'CANCELLED' ? 'bg-gray-200 text-gray-600' : 'bg-yellow-100 text-yellow-800'}`}>
      {status}
    </span>
  );

  const visibleExpandedOrders = filterExpandedOrders(expandedOrders, showAllInExpanded);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-800">Work Orders</h2>
      </div>

      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">직접 입력으로 등록</h3>
        <form onSubmit={handleCreateWorkOrder} className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">품목</label>
            <SearchSelectField<Item>
              value={item}
              onChange={(picked) => {
                setItem(picked);
                setNewWorkOrder({ ...newWorkOrder, itemId: picked?.id ?? 0 });
              }}
              search={searchItems}
              getKey={(i) => i.id}
              getLabel={masterLabel}
              renderRow={(i) => (<span>{i.name} <span className="text-gray-400 text-xs">{i.code}</span></span>)}
              ariaLabel="품목"
              placeholder="품목 검색"
              title="품목 검색"
              className="w-64"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">목표 수량</label>
            <input
              type="number"
              min={1}
              className="border border-gray-300 rounded px-3 py-2 w-32"
              value={newWorkOrder.targetQuantity}
              onChange={(e) => setNewWorkOrder({ ...newWorkOrder, targetQuantity: Number(e.target.value) })}
            />
          </div>
          <button type="submit" disabled={creating} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
            {creating ? '등록 중...' : '작업 지시 등록'}
          </button>
        </form>
      </div>

      <form className="bg-gray-50 p-4 rounded-lg flex flex-wrap gap-4 items-end" onSubmit={handleSearchAll}>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Filter by Status</label>
          <select
            aria-label="상태 필터"
            className="border border-gray-300 rounded px-3 py-2 w-full md:w-64"
            value={query.status ?? ''}
            onChange={(e) => setQuery((q) => ({ ...q, page: 1, status: e.target.value || undefined }))}
          >
            <option value="">All</option>
            {statusOptions.map((s) => (
              <option key={s.code} value={s.code}>{s.label}</option>
            ))}
          </select>
        </div>
        {/* PR-159: 돋보기는 이 필드만으로 즉시 조회(onSearchThisField) — 다른 폼 submit과 분리됨. */}
        <FilterSearchInput label="품목명" ariaLabel="품목명 검색어" placeholder="예: 셔츠" value={itemNameDraft} onChange={setItemNameDraft} onSearchThisField={() => searchByField('itemName')} />
        <FilterSearchInput label="품목코드" ariaLabel="품목코드 검색어" placeholder="예: MB62SLM103Z-01" value={itemCodeDraft} onChange={setItemCodeDraft} onSearchThisField={() => searchByField('itemCode')} />
        <FilterSearchInput label="스타일번호" ariaLabel="스타일번호 검색어" placeholder="예: MB62SLM103Z" value={styleNoDraft} onChange={setStyleNoDraft} onSearchThisField={() => searchByField('styleNo')} />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">검색</button>
        <button
          type="button"
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded"
          onClick={() => { setItemNameDraft(''); setItemCodeDraft(''); setStyleNoDraft(''); setExpandedKey(null); setQuery({ page: 1 }); }}
        >초기화</button>
      </form>

      {/* 1단계 — 스타일번호 목록 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-200">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium">
          <div className="col-span-3">스타일번호</div>
          <div className="col-span-3">대표 품목</div>
          <div className="col-span-1 text-right">건수</div>
          <div className="col-span-5">상태별 건수</div>
        </div>
        {styleGroups.map((g) => {
          const key = groupKey(g);
          const isExpanded = expandedKey === key;
          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => toggleExpand(g)}
                data-testid={`style-group-${key}`}
                className={`w-full text-left grid grid-cols-12 gap-2 px-4 py-3 hover:bg-gray-50 ${isExpanded ? 'bg-blue-50' : ''}`}
              >
                <div className="col-span-3 font-mono font-medium">
                  {g.styleNo ?? <span className="text-gray-400 italic">스타일 미지정</span>}
                </div>
                <div className="col-span-3 text-sm text-gray-600">{g.itemName ?? '-'} {g.itemCode ? <span className="text-gray-400 text-xs">({g.itemCode})</span> : null}</div>
                <div className="col-span-1 text-right text-sm">{g.count}건</div>
                <div className="col-span-5 text-xs text-gray-500 space-x-2">
                  {Object.entries(g.statusCounts).map(([status, n]) => (
                    <span key={status}>{status} {n}건</span>
                  ))}
                </div>
              </button>

              {isExpanded && (
                <div className="bg-gray-50 border-t border-gray-200 px-4 py-3" data-testid={`style-detail-${key}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500">
                      {showAllInExpanded ? '전체' : '진행중(대기/진행중)만'} 표시 중 — {visibleExpandedOrders.length}건
                    </p>
                    <button
                      type="button"
                      className="text-xs text-blue-600 underline"
                      onClick={() => setShowAllInExpanded((v) => !v)}
                    >
                      {showAllInExpanded ? '진행중만 보기' : '전체 보기'}
                    </button>
                  </div>
                  {expandedLoading ? (
                    <p className="text-sm text-gray-400 py-2">불러오는 중...</p>
                  ) : visibleExpandedOrders.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2" data-testid="style-detail-empty">표시할 작업지시가 없습니다.</p>
                  ) : (
                    <table className="w-full text-sm bg-white">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-1 text-left">ID</th>
                          <th className="px-3 py-1 text-left">품목</th>
                          <th className="px-3 py-1 text-left">목표 수량</th>
                          <th className="px-3 py-1 text-left">Status</th>
                          <th className="px-3 py-1 text-left">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {visibleExpandedOrders.map((wo) => (
                          <tr key={wo.id}>
                            <td className="px-3 py-1 font-mono">{wo.id}</td>
                            <td className="px-3 py-1">{wo.item ? `${wo.item.name} (${wo.item.code})` : wo.itemId}</td>
                            <td className="px-3 py-1">{wo.targetQuantity}</td>
                            <td className="px-3 py-1">{statusBadge(wo.status)}</td>
                            <td className="px-3 py-1 space-x-2">
                              {/* PR-159: 대기 상태에서만 노출 — 담당자가 실제로 작업을 시작했을 때 수동으로 누르는 용도. */}
                              {wo.status === 'PENDING' && (
                                <button className="bg-indigo-600 text-white px-3 py-1 rounded text-xs hover:bg-indigo-700" onClick={() => handleUpdateStatus(wo.id, 'IN_PROGRESS')}>
                                  진행중으로 전환
                                </button>
                              )}
                              {wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED' && (
                                <button className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700" onClick={() => handleUpdateStatus(wo.id, 'COMPLETED')}>
                                  Complete
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {styleGroups.length === 0 && !listLoading && (
          <p className="px-4 py-6 text-center text-sm text-gray-500" data-testid="work-orders-empty">조회된 작업지시가 없습니다.</p>
        )}
      </div>
      <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} disabled={listLoading} onPageChange={(page) => setQuery((q) => ({ ...q, page }))} />
    </div>
  );
};
