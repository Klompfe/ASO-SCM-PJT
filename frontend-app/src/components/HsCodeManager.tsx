import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  getHsCodeClassifications,
  createHsCodeClassification,
  uploadHsCodeClassifications,
  type HsCodeClassification,
  type HsCodeImportConflict,
  type CreateHsCodeClassification,
} from '../api/hsCodeClassifications.service';
import { getErrorMessage } from '../utils/errorMessage';

const emptyForm: CreateHsCodeClassification = {
  itemType: '',
  fabricType: '',
  composition: '',
  hsCode: '',
  note: '',
};

// PR-081: 완제품 수입통관 HS코드 분류(품종+재직+혼용률 -> HS코드) 관리 화면.
// 시즌별 공식 엑셀을 업로드하면 DB가 갱신되고, 이 DB를 외부(Python 수입통관
// 이메일 에이전트)가 API키로 조회한다(이 화면 밖의 별도 엔드포인트). 업로드 시
// 기존 값과 다르게 갱신된 조합(conflicts)은 무시하고 넘어가면 안 되므로 항상
// 눈에 띄게 표시한다.
export const HsCodeManager: React.FC = () => {
  const [items, setItems] = useState<HsCodeClassification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastConflicts, setLastConflicts] = useState<HsCodeImportConflict[] | null>(null);
  const [lastImportSummary, setLastImportSummary] = useState<string | null>(null);

  const [searchItemType, setSearchItemType] = useState('');
  const [searchFabricType, setSearchFabricType] = useState('');
  const [searchComposition, setSearchComposition] = useState('');
  const [searchHsCode, setSearchHsCode] = useState('');

  const [form, setForm] = useState<CreateHsCodeClassification>(emptyForm);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getHsCodeClassifications({
        itemType: searchItemType || undefined,
        fabricType: searchFabricType || undefined,
        composition: searchComposition || undefined,
        limit: 100,
      });
      let filtered: HsCodeClassification[] = res?.items ?? [];
      // HS코드 검색은 백엔드 필터 파라미터에 없으므로 프론트에서 부분일치로 추가 필터링한다.
      if (searchHsCode) {
        filtered = filtered.filter((i) =>
          i.hsCode.toLowerCase().includes(searchHsCode.toLowerCase()),
        );
      }
      setItems(filtered);
      setTotal(res?.total ?? filtered.length);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'HS코드 분류 목록을 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [searchItemType, searchFabricType, searchComposition, searchHsCode]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setLastConflicts(null);
    setLastImportSummary(null);
    try {
      const res = await uploadHsCodeClassifications(file);
      setLastImportSummary(
        `총 ${res.totalRows}행 처리 — 신규 ${res.created}건, 갱신 ${res.updated}건`,
      );
      if (res.conflicts && res.conflicts.length > 0) {
        setLastConflicts(res.conflicts);
        toast.error(`${res.conflicts.length}건의 HS코드가 기존 값과 다르게 갱신되었습니다. 아래 목록을 확인하세요.`);
      } else {
        toast.success('HS코드 분류 업로드가 완료되었습니다.');
      }
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '업로드에 실패했습니다.'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createHsCodeClassification(form);
      toast.success('HS코드 분류가 저장되었습니다.');
      setForm(emptyForm);
      await load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">HS코드 관리</h2>
          <p className="text-sm text-gray-500 mt-1">
            완제품 수입통관 HS코드는 품종+재직+혼용률 조합으로 결정됩니다. 시즌마다
            갱신되는 공식 엑셀을 업로드하면 아래 목록에 반영됩니다.
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={handleUploadClick}
            disabled={uploading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? '업로드 중...' : 'HS코드 엑셀 업로드'}
          </button>
        </div>
      </div>

      {lastImportSummary && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg px-4 py-3">
          {lastImportSummary}
        </div>
      )}

      {lastConflicts && lastConflicts.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3">
          <p className="text-red-800 font-semibold mb-2">
            다음 조합은 기존 값과 다르게 갱신되었습니다 ({lastConflicts.length}건)
          </p>
          <table className="w-full text-sm text-red-900">
            <thead>
              <tr className="text-left border-b border-red-200">
                <th className="py-1 pr-2">품종</th>
                <th className="py-1 pr-2">재직</th>
                <th className="py-1 pr-2">혼용률</th>
                <th className="py-1 pr-2">기존 HS코드</th>
                <th className="py-1 pr-2">변경된 HS코드</th>
              </tr>
            </thead>
            <tbody>
              {lastConflicts.map((c, idx) => (
                <tr key={idx} className="border-b border-red-100 last:border-0">
                  <td className="py-1 pr-2">{c.itemType}</td>
                  <td className="py-1 pr-2">{c.fabricType}</td>
                  <td className="py-1 pr-2">{c.composition}</td>
                  <td className="py-1 pr-2 line-through">{c.previousHsCode}</td>
                  <td className="py-1 pr-2 font-semibold">{c.newHsCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg space-y-3">
        <p className="text-sm font-medium text-gray-700">직접 등록/수정</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input
            className="border border-gray-300 rounded px-3 py-2"
            placeholder="품종 (예: WOMEN'S JACKET)"
            value={form.itemType}
            onChange={(e) => setForm({ ...form, itemType: e.target.value })}
            required
          />
          <input
            className="border border-gray-300 rounded px-3 py-2"
            placeholder="재직 (예: 직물)"
            value={form.fabricType}
            onChange={(e) => setForm({ ...form, fabricType: e.target.value })}
            required
          />
          <input
            className="border border-gray-300 rounded px-3 py-2"
            placeholder="혼용률 (예: WOOL 98%, POLYURETHANE 2%)"
            value={form.composition}
            onChange={(e) => setForm({ ...form, composition: e.target.value })}
            required
          />
          <input
            className="border border-gray-300 rounded px-3 py-2"
            placeholder="HS코드"
            value={form.hsCode}
            onChange={(e) => setForm({ ...form, hsCode: e.target.value })}
            required
          />
          <input
            className="border border-gray-300 rounded px-3 py-2"
            placeholder="관,부가세 유무(메모)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-gray-700 text-white px-4 py-2 rounded font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '등록/수정'}
        </button>
      </form>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <input
          className="border border-gray-300 rounded px-3 py-2"
          placeholder="품종 검색"
          value={searchItemType}
          onChange={(e) => setSearchItemType(e.target.value)}
        />
        <input
          className="border border-gray-300 rounded px-3 py-2"
          placeholder="재직 검색"
          value={searchFabricType}
          onChange={(e) => setSearchFabricType(e.target.value)}
        />
        <input
          className="border border-gray-300 rounded px-3 py-2"
          placeholder="혼용률 검색"
          value={searchComposition}
          onChange={(e) => setSearchComposition(e.target.value)}
        />
        <input
          className="border border-gray-300 rounded px-3 py-2"
          placeholder="HS코드 검색"
          value={searchHsCode}
          onChange={(e) => setSearchHsCode(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">불러오는 중...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-gray-200 text-gray-600">
                <th className="py-2 pr-3">품종</th>
                <th className="py-2 pr-3">재직</th>
                <th className="py-2 pr-3">혼용률</th>
                <th className="py-2 pr-3">HS코드</th>
                <th className="py-2 pr-3">관,부가세 유무</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{item.itemType}</td>
                  <td className="py-2 pr-3">{item.fabricType}</td>
                  <td className="py-2 pr-3">{item.composition}</td>
                  <td className="py-2 pr-3 font-mono">{item.hsCode}</td>
                  <td className="py-2 pr-3 text-gray-500">{item.note ?? '-'}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-400">
                    등록된 HS코드 분류가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2">총 {total}건</p>
        </div>
      )}
    </div>
  );
};
