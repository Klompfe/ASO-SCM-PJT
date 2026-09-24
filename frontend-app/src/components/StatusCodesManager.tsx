import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getStatusCodes,
  createStatusCode,
  updateStatusCode,
  deleteStatusCode,
  type StatusCode,
  type CreateStatusCode,
} from '../api/statusCodes.service';
import { getErrorMessage } from '../utils/errorMessage';

// PR-140: 지금은 WorkOrder(작업지시) 하나만 이 마스터 테이블을 실제로 쓴다. 다른 모듈
// (Contract/PurchaseOrder/Shipment 등)이 이후 PR에서 전환되면 여기에 옵션만 추가하면 된다 —
// 백엔드 테이블/엔티티는 이미 domain 컬럼으로 여러 모듈을 구분하도록 설계돼 있다.
const DOMAINS: { value: string; label: string }[] = [{ value: 'WORK_ORDER', label: '작업지시' }];

const emptyForm: CreateStatusCode = { domain: DOMAINS[0].value, code: '', label: '', sortOrder: 0 };

export const StatusCodesManager: React.FC = () => {
  const [domain, setDomain] = useState(DOMAINS[0].value);
  const [codes, setCodes] = useState<StatusCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CreateStatusCode>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ label: string; sortOrder: number; isActive: boolean }>({ label: '', sortOrder: 0, isActive: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getStatusCodes(domain, true); // 관리 화면은 비활성도 함께 보여준다(재활성화 가능하게)
      setCodes(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '상태코드 목록을 불러오는 데 실패했습니다.'));
      setCodes([]);
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) {
      toast.error('코드를 입력해 주세요(영문 대문자/숫자/언더스코어).');
      return;
    }
    if (!form.label.trim()) {
      toast.error('화면에 표시할 라벨을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await createStatusCode({ domain, code: form.code.trim().toUpperCase(), label: form.label.trim(), sortOrder: form.sortOrder ?? 0 });
      toast.success('상태코드가 등록되었습니다.');
      setForm({ ...emptyForm, domain });
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '등록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (code: StatusCode) => {
    setEditingId(code.id);
    setEditDraft({ label: code.label, sortOrder: code.sortOrder, isActive: code.isActive });
  };
  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: number) => {
    try {
      await updateStatusCode(id, editDraft);
      toast.success('수정되었습니다.');
      setEditingId(null);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '수정에 실패했습니다.'));
    }
  };

  const handleDelete = async (code: StatusCode) => {
    if (!window.confirm(`"${code.label}"(${code.code})을(를) 삭제하시겠습니까? 이미 쓰이고 있는 상태값이면 삭제 대신 비활성화를 권장합니다.`)) return;
    try {
      await deleteStatusCode(code.id);
      toast.success('삭제되었습니다.');
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '삭제에 실패했습니다. 이미 사용 중인 상태값이면 대신 비활성화해 주세요.'));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">상태코드 관리</h2>
      <p className="text-sm text-gray-500">
        목록 화면의 상태 필터(예: 작업지시의 "Filter by Status")에 나오는 값들을 여기서 추가/수정합니다.
        삭제는 이미 사용 중인 상태값이면 막히며, 그런 경우 대신 "비활성화"를 쓰세요 — 비활성화하면 신규
        선택에는 더 이상 나오지 않지만 기존 데이터는 그대로 유지됩니다.
      </p>

      <div className="flex flex-col w-56">
        <label className="text-sm text-gray-600 mb-1">도메인(어느 화면의 상태값인지)</label>
        <select
          aria-label="도메인 선택"
          className="border border-gray-300 rounded px-3 py-2"
          value={domain}
          onChange={(e) => { setDomain(e.target.value); setForm({ ...emptyForm, domain: e.target.value }); }}
        >
          {DOMAINS.map((d) => (
            <option key={d.value} value={d.value}>{d.label} ({d.value})</option>
          ))}
        </select>
      </div>

      <form onSubmit={handleCreate} className="bg-gray-50 p-4 rounded-lg flex flex-wrap gap-4 items-end">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">코드</label>
          <input
            aria-label="상태코드 값"
            className="border border-gray-300 rounded px-3 py-2 w-40"
            placeholder="예: ON_HOLD"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">라벨(화면 표시)</label>
          <input
            aria-label="상태코드 라벨"
            className="border border-gray-300 rounded px-3 py-2 w-40"
            placeholder="예: 보류"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">정렬순서</label>
          <input
            aria-label="상태코드 정렬순서"
            type="number"
            className="border border-gray-300 rounded px-3 py-2 w-24"
            value={form.sortOrder ?? 0}
            onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
          />
        </div>
        <button type="submit" disabled={submitting} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
          {submitting ? '등록 중...' : '상태코드 등록'}
        </button>
      </form>

      {loading ? (
        <div className="text-sm text-gray-500">불러오는 중...</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-2 text-left">코드</th>
                <th className="px-4 py-2 text-left">라벨</th>
                <th className="px-4 py-2 text-left">정렬순서</th>
                <th className="px-4 py-2 text-left">활성</th>
                <th className="px-4 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {codes.map((code) => (
                <tr key={code.id} className={`hover:bg-gray-50 ${!code.isActive ? 'text-gray-400' : ''}`}>
                  {editingId === code.id ? (
                    <>
                      <td className="px-4 py-2 font-mono">{code.code}</td>
                      <td className="px-4 py-2">
                        <input
                          className="border rounded px-2 py-1 w-32"
                          value={editDraft.label}
                          onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          className="border rounded px-2 py-1 w-20"
                          value={editDraft.sortOrder}
                          onChange={(e) => setEditDraft({ ...editDraft, sortOrder: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          aria-label={`${code.code} 활성 여부`}
                          checked={editDraft.isActive}
                          onChange={(e) => setEditDraft({ ...editDraft, isActive: e.target.checked })}
                        />
                      </td>
                      <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                        <button className="text-blue-600" onClick={() => saveEdit(code.id)}>저장</button>
                        <button className="text-gray-500" onClick={cancelEdit}>취소</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-mono">{code.code}</td>
                      <td className="px-4 py-2 font-medium">{code.label}</td>
                      <td className="px-4 py-2">{code.sortOrder}</td>
                      <td className="px-4 py-2">{code.isActive ? '예' : '아니오(비활성)'}</td>
                      <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                        <button className="text-blue-600" onClick={() => startEdit(code)}>수정</button>
                        <button className="text-red-600" onClick={() => handleDelete(code)}>삭제</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {codes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">등록된 상태코드가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
