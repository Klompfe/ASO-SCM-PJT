import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { getItems, createItem, uploadPreview, bulkInsert, type GetItemsFilter, type CreateItem, type Item } from '../api/items.service';

export const ItemsManager: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [filter] = useState<GetItemsFilter>({ page: 1, limit: 10 });
  const [newItem, setNewItem] = useState<CreateItem>({ code: '', name: '', type: 'RAW_MATERIAL' });
  const [loading, setLoading] = useState<boolean>(false);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [policy, setPolicy] = useState<'OVERWRITE' | 'SKIP'>('SKIP');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getItems(filter);
      const data = Array.isArray(res.data) ? res.data : (res && Array.isArray(res) ? res : []);
      setItems(data);
    } catch (error) {
      toast.error('아이템 목록을 불러오는 데 실패했습니다.');
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
      toast.success('아이템이 생성되었습니다.');
      loadItems();
      setNewItem({ code: '', name: '', type: 'RAW_MATERIAL' });
    } catch (error) {
      // toast.error는 Axios 인터셉터에서 처리됨
    } finally {
      setLoading(false);
    }
  };

  const downloadSampleTemplate = () => {
    const csvContent = '품목코드,품목명,품목구분,규격,수량,단위,설명\nITEM001,테스트품목,원자재,A1,10,EA,테스트설명';
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'item_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setLoading(true);
    try {
      const res = await uploadPreview(selectedFile);
      setPreviewData(res.data);
      setStep(2);
    } catch (error) {
      toast.error('파일 업로드 및 검증에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkInsert = async () => {
    setLoading(true);
    try {
      await bulkInsert(previewData.rows.filter((r: any) => r.isValid), policy);
      toast.success('대량 등록이 완료되었습니다.');
      setModalOpen(false);
      setStep(1);
      loadItems();
    } catch (error) {
      toast.error('대량 등록에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-800">Items</h2>
        <div className="space-x-2">
          <button onClick={downloadSampleTemplate} className="bg-gray-600 text-white px-4 py-2 rounded font-medium hover:bg-gray-700">샘플 양식 다운로드</button>
          <button onClick={() => setModalOpen(true)} className="bg-purple-600 text-white px-4 py-2 rounded font-medium hover:bg-purple-700">엑셀 업로드</button>
        </div>
      </div>
      
      {/* ...기존 폼 유지... */}
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

      {/* Excel Upload Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">엑셀 업로드 (Step {step}/3)</h3>
            
            {step === 1 && (
              <div className="space-y-4">
                <p>파일을 선택하세요.</p>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls,.csv" />
              </div>
            )}

            {step === 2 && previewData && (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="bg-green-100 p-4 rounded text-green-800">정상: {previewData.summary.validRowsCount}</div>
                  <div className="bg-red-100 p-4 rounded text-red-800">오류: {previewData.summary.invalidRowsCount}</div>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th>Row</th><th>Code</th><th>Name</th><th>Type</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row: any, i: number) => (
                      <tr key={i} className={row.isValid ? '' : 'bg-red-50'}>
                        <td className="p-2 border">{row.rowIndex}</td>
                        <td className="p-2 border font-mono">{row.code}</td>
                        <td className="p-2 border">{row.name}</td>
                        <td className="p-2 border">{row.rawType}</td>
                        <td className="p-2 border text-sm text-red-600">{row.errors?.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex gap-4">
                  <select value={policy} onChange={(e) => setPolicy(e.target.value as any)} className="border p-2">
                    <option value="SKIP">기존 건너뛰기</option>
                    <option value="OVERWRITE">기존 덮어쓰기</option>
                  </select>
                  <button onClick={() => setStep(3)} disabled={previewData.summary.validRowsCount === 0} className="bg-blue-600 text-white px-4 py-2 rounded">다음 단계</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p>최종 저장하시겠습니까?</p>
                <button onClick={handleBulkInsert} className="bg-green-600 text-white px-4 py-2 rounded">최종 저장</button>
              </div>
            )}
            <button onClick={() => { setModalOpen(false); setStep(1); }} className="mt-4 text-gray-500">닫기</button>
          </div>
        </div>
      )}
      
      {/* ...기존 테이블 유지... */}
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
  );
};
