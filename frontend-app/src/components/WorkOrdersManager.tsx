import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { createWorkOrder, updateWorkOrderStatus, type WorkOrder, type CreateWorkOrder } from '../api/workOrders.service';
import type { Item } from '../api/items.service';
import { SearchSelectField } from './SearchSelectField';
import { masterLabel, searchItems } from '../utils/searchFetchers';
import { useNavigate } from 'react-router-dom'; // Assumed react-router usage
import { getErrorMessage } from '../utils/errorMessage';
import { Pagination } from './Pagination';
import { fetchWorkOrderPage, type WorkOrderListQuery } from '../utils/listQueries';
import { EMPTY_PAGE_META, pageToRecoverTo, type PageMeta } from '../utils/pagination';

const emptyCreateForm: CreateWorkOrder = { itemId: 0, targetQuantity: 1 };

export const WorkOrdersManager: React.FC = () => {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  // PR-128: 메인 목록은 서버 페이지네이션({items, meta})을 그대로 따른다 — 예전엔 filter가 {}라 첫 10건만 보이고 이동 수단이 없었다.
  const [query, setQuery] = useState<WorkOrderListQuery>({ page: 1 });
  const [keywordDraft, setKeywordDraft] = useState('');
  const [meta, setMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [listLoading, setListLoading] = useState(false);
  // PR-127: 품목은 <select>(getItems limit 100 — 100개 넘는 품목은 선택 불가)가 아니라 서버 검색 선택이다.
  const [item, setItem] = useState<Item | null>(null);
  const [newWorkOrder, setNewWorkOrder] = useState<CreateWorkOrder>(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate(); // For redirecting on auth error

  const handleAuthError = (error: any) => {
    // 401 Unauthorized handling
    if (error.response?.status === 401 || error.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('token'); // Also check alternative key
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

  const loadWorkOrders = useCallback(async () => {
    try {
      // Explicit token check (though interceptor handles it, user asked for explicit handling)
      getAuthHeader();
      
      setListLoading(true);
      const res = await fetchWorkOrderPage(query);
      // 마지막 페이지의 항목이 사라지는 등으로 요청 페이지가 전체 페이지를 넘으면 마지막 페이지로 되돌아가 다시 조회한다.
      const recover = pageToRecoverTo(res.meta, query.page);
      if (recover !== null) {
        setQuery((q) => ({ ...q, page: recover }));
        return;
      }
      setWorkOrders(res.items);
      setMeta(res.meta);
    } catch (error) {
      handleAuthError(error);
      setWorkOrders([]);
      setMeta(EMPTY_PAGE_META);
    } finally {
      setListLoading(false);
    }
  }, [query, navigate]);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

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
      // 새 작업지시는 최신순 첫 페이지에 나타나므로 1페이지로 돌아가 다시 조회한다.
      setQuery((q) => ({ ...q, page: 1 }));
    } catch (error) {
      handleAuthError(error);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (id: number) => {
    try {
      getAuthHeader();
      await updateWorkOrderStatus(id, { status: 'COMPLETED' });
      toast.success('작업 지시 상태가 변경되었습니다.');
      loadWorkOrders();
    } catch (error) {
      handleAuthError(error);
    }
  };

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

      <form
        className="bg-gray-50 p-4 rounded-lg flex flex-wrap gap-4 items-end"
        onSubmit={(e) => { e.preventDefault(); setQuery((q) => ({ ...q, page: 1, keyword: keywordDraft })); }}
      >
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Filter by Status</label>
          {/* 상태 값은 서버 WorkOrderStatus enum과 같다(예전 PLANNED는 없는 값이라 서버가 400으로 거부했다). 상태를 바꾸면 1페이지부터 다시 본다. */}
          <select
            aria-label="상태 필터"
            className="border border-gray-300 rounded px-3 py-2 w-full md:w-64"
            value={query.status ?? ''}
            onChange={(e) => setQuery((q) => ({ ...q, page: 1, status: e.target.value || undefined }))}
          >
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">검색 (품목명/코드/스타일번호)</label>
          <input
            aria-label="작업지시 검색어"
            className="border border-gray-300 rounded px-3 py-2 w-64"
            placeholder="예: 셔츠, MB62SLM103Z"
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
          />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">검색</button>
        <button
          type="button"
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded"
          onClick={() => { setKeywordDraft(''); setQuery({ page: 1 }); }}
        >초기화</button>
      </form>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">ID</th>
              <th className="px-4 py-2 text-left">품목</th>
              <th className="px-4 py-2 text-left">목표 수량</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {workOrders.map((wo) => (
              <tr key={wo.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-mono">{wo.id}</td>
                <td className="px-4 py-2">{wo.item ? `${wo.item.name} (${wo.item.code})` : wo.itemId}</td>
                <td className="px-4 py-2">{wo.targetQuantity}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${wo.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {wo.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {wo.status !== 'COMPLETED' && (
                    <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700" onClick={() => handleUpdateStatus(wo.id)}>Complete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {workOrders.length === 0 && !listLoading && (
          <p className="px-4 py-6 text-center text-sm text-gray-500" data-testid="work-orders-empty">조회된 작업지시가 없습니다.</p>
        )}
      </div>
      <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} disabled={listLoading} onPageChange={(page) => setQuery((q) => ({ ...q, page }))} />
    </div>
  );
};
