import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { createSupplier, type CreateSupplier, type Supplier } from '../api/suppliers.service';
import { getErrorMessage } from '../utils/errorMessage';
import { CategoryChips } from './CategoryChips';

const emptyForm: CreateSupplier = { name: '', businessNumber: '', contactPhone: '', email: '', address: '', abbrCode: '' };

interface SupplierQuickCreateModalProps {
  onCreated: (supplier: Supplier) => void;
  onClose: () => void;
}

// PR-172: 발주 생성 중 거래할 공급업체가 아직 없을 때, SuppliersManager 탭으로
// 넘어가느라 작성 중이던 발주 폼을 잃지 않도록(이 앱은 탭 전환 시 언마운트되어 폼
// 상태가 사라짐 — react-router 없음) 빠르게 등록할 수 있는 팝업. SuppliersManager.tsx의
// 등록 폼(이름/업체약칭/사업자번호/연락처/이메일/주소)과 createSupplier 호출만
// 재사용하고, 오버레이/레이아웃은 PackingReceiptsModal.tsx와 동일한 스타일을 따른다.
// PR-183: 주요품목(개별 품목 검색) 대신 취급 품목군 칩을 고른다(선택 항목 — 비워도 등록 가능).
export const SupplierQuickCreateModal: React.FC<SupplierQuickCreateModalProps> = ({ onCreated, onClose }) => {
  const [form, setForm] = useState<CreateSupplier>(emptyForm);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await createSupplier({ ...form, categoryIds });
      toast.success(`공급업체가 등록되었습니다. (코드: ${created?.code ?? '-'})`);
      onCreated(created);
      onClose();
    } catch (err: any) {
      // 실패 시 모달을 닫지 않는다 — 입력값을 유지한 채 모달 안에서 바로 에러를 보여준다.
      setError(getErrorMessage(err, '공급업체 등록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded w-3/4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4">새 공급업체 등록</h3>

        {error && <div className="p-3 mb-4 bg-red-100 text-red-700 rounded" data-testid="quick-create-error">{error}</div>}

        <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">이름</label>
            <input className="border border-gray-300 rounded px-3 py-2" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="공급업체명" />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">업체약칭 (선택, 비우면 업체명에서 자동생성)</label>
            <input className="border border-gray-300 rounded px-3 py-2" value={form.abbrCode} onChange={(e) => setForm({ ...form, abbrCode: e.target.value })} />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">사업자번호</label>
            <input className="border border-gray-300 rounded px-3 py-2" value={form.businessNumber} onChange={(e) => setForm({ ...form, businessNumber: e.target.value })} />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">연락처</label>
            <input className="border border-gray-300 rounded px-3 py-2" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">이메일</label>
            <input className="border border-gray-300 rounded px-3 py-2" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">주소</label>
            <input className="border border-gray-300 rounded px-3 py-2" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="flex flex-col col-span-2 md:col-span-3">
            <label className="text-sm text-gray-600 mb-1">취급 품목군 (선택)</label>
            <CategoryChips selectedIds={categoryIds} onChange={setCategoryIds} ariaLabel="취급 품목군" />
          </div>
          <div className="col-span-2 md:col-span-3 flex gap-2">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50" disabled={submitting}>
              {submitting ? '등록 중...' : '등록'}
            </button>
            <button type="button" className="bg-gray-500 text-white px-4 py-2 rounded" onClick={onClose}>취소</button>
          </div>
        </form>
      </div>
    </div>
  );
};
