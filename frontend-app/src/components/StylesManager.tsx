import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getMasterStyles, createMasterStyle, type MasterStyle, type CreateMasterStyle } from '../api/styles.service';
import { issueContract, getContractsByStyleNo, type Contract } from '../api/contracts.service';
import { getErrorMessage } from '../utils/errorMessage';

const initialFormData: CreateMasterStyle = {
  styleNo: '', factory: '', buyer: '', totalQty: 0, brand: '', itemType: '',
  productionType: 'FOB', targetRdd: '', cmtPrice: 0, fobPrice: 0,
};

export const StylesManager: React.FC = () => {
  const [formData, setFormData] = useState<CreateMasterStyle>(initialFormData);
  const [styles, setStyles] = useState<MasterStyle[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<MasterStyle | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractNotes, setContractNotes] = useState('');

  const loadStyles = useCallback(async () => {
    try {
      const res = await getMasterStyles();
      const data = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      setStyles(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '스타일 목록을 불러오는 데 실패했습니다.'));
      setStyles([]);
    }
  }, []);

  useEffect(() => {
    loadStyles();
  }, [loadStyles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMasterStyle(formData);
      toast.success('스타일이 등록되었습니다.');
      loadStyles();
      setFormData(initialFormData);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '스타일 등록에 실패했습니다.'));
    }
  };

  const calculateDDay = (rdd: string | null | undefined): number | null => {
    if (!rdd) return null;
    const diff = new Date(rdd).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  const loadContracts = async (styleNo: string) => {
    try {
      const res = await getContractsByStyleNo(styleNo);
      setContracts(Array.isArray(res) ? res : []);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '계약 이력을 불러오는 데 실패했습니다.'));
      setContracts([]);
    }
  };

  const handleSelectStyle = (s: MasterStyle) => {
    setSelectedStyle(s);
    setContractNotes('');
    loadContracts(s.styleNo);
  };

  const handleIssueContract = async () => {
    if (!selectedStyle) return;
    try {
      await issueContract(selectedStyle.styleNo, contractNotes || undefined);
      toast.success('계약서가 발행되었습니다.');
      setContractNotes('');
      loadContracts(selectedStyle.styleNo);
    } catch (err: any) {
      toast.error(getErrorMessage(err, '계약서 발행에 실패했습니다.'));
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">오더관리 (Order Management)</h2>
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow mb-6">
        <div className="grid grid-cols-4 gap-4 mb-4">
          <input className="border p-2" placeholder="Style No" value={formData.styleNo} onChange={e => setFormData({...formData, styleNo: e.target.value})} required />
          <input className="border p-2" placeholder="Brand" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} required />
          <input className="border p-2" placeholder="Item Type" value={formData.itemType} onChange={e => setFormData({...formData, itemType: e.target.value})} required />
          <input className="border p-2" type="date" aria-label="Target RDD" value={formData.targetRdd} onChange={e => setFormData({...formData, targetRdd: e.target.value})} required />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <input className="border p-2" placeholder="Factory (공장)" value={formData.factory} onChange={e => setFormData({...formData, factory: e.target.value})} required />
          <input className="border p-2" placeholder="Buyer (바이어)" value={formData.buyer} onChange={e => setFormData({...formData, buyer: e.target.value})} required />
          <input className="border p-2" placeholder="Total Qty" type="number" value={formData.totalQty} onChange={e => setFormData({...formData, totalQty: Number(e.target.value)})} required />
        </div>
        <div className="mb-4">
          <label className="mr-4"><input type="radio" value="FOB" checked={formData.productionType === 'FOB'} onChange={() => setFormData({...formData, productionType: 'FOB'})} /> FOB</label>
          <label><input type="radio" value="CMT" checked={formData.productionType === 'CMT'} onChange={() => setFormData({...formData, productionType: 'CMT'})} /> CMT</label>
        </div>
        {formData.productionType === 'CMT' && <input className="border p-2 mb-4 w-full" placeholder="CMT Price" type="number" step="0.01" value={formData.cmtPrice} onChange={e => setFormData({...formData, cmtPrice: Number(e.target.value)})} />}
        {formData.productionType === 'FOB' && <input className="border p-2 mb-4 w-full" placeholder="FOB Price" type="number" step="0.01" value={formData.fobPrice} onChange={e => setFormData({...formData, fobPrice: Number(e.target.value)})} />}
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">스타일 등록</button>
      </form>

      <table className="w-full border-collapse border">
        <thead>
          <tr className="bg-gray-100">
            <th>Style</th><th>Brand</th><th>Type</th><th>Factory</th><th>Buyer</th><th>RDD</th><th>D-Day</th><th>상태</th>
          </tr>
        </thead>
        <tbody>
          {styles.map(s => {
            const dday = calculateDDay(s.overview?.targetRdd);
            return (
              <tr key={s.styleNo} onClick={() => handleSelectStyle(s)} className="cursor-pointer hover:bg-gray-50">
                <td>{s.styleNo}</td>
                <td>{s.overview?.brand ?? '-'}</td>
                <td>{s.overview?.productionType ?? '-'}</td>
                <td>{s.overview?.factory ?? '-'}</td>
                <td>{s.overview?.buyer ?? '-'}</td>
                <td>{s.overview?.targetRdd ?? '-'}</td>
                <td className={dday !== null && dday <= 7 ? 'text-red-500' : ''}>{dday ?? '-'}</td>
                <td>{s.overview?.status ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selectedStyle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded w-1/2 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">{selectedStyle.styleNo} 상세</h3>

            <div className="grid grid-cols-2 gap-2 text-sm mb-6">
              <div><span className="text-gray-500">브랜드:</span> {selectedStyle.overview?.brand ?? '-'}</div>
              <div><span className="text-gray-500">생산유형:</span> {selectedStyle.overview?.productionType ?? '-'}</div>
              <div><span className="text-gray-500">공장:</span> {selectedStyle.overview?.factory ?? '-'}</div>
              <div><span className="text-gray-500">바이어:</span> {selectedStyle.overview?.buyer ?? '-'}</div>
              <div><span className="text-gray-500">총수량:</span> {selectedStyle.overview?.totalQty ?? '-'}</div>
              <div><span className="text-gray-500">목표출고일:</span> {selectedStyle.overview?.targetRdd ?? '-'}</div>
              <div><span className="text-gray-500">FOB 단가:</span> {selectedStyle.overview?.fobPrice ?? '-'}</div>
              <div><span className="text-gray-500">CMT 단가:</span> {selectedStyle.overview?.cmtPrice ?? '-'}</div>
              <div><span className="text-gray-500">상태:</span> {selectedStyle.overview?.status ?? '-'}</div>
            </div>

            <h4 className="font-semibold mb-2">계약서 발행 이력</h4>
            {contracts.length === 0 ? (
              <p className="text-sm text-gray-500 mb-4">발행된 계약서가 없습니다.</p>
            ) : (
              <ul className="mb-4 space-y-1 text-sm">
                {contracts.map((c) => (
                  <li key={c.id} className="border-b border-gray-100 pb-1">
                    {new Date(c.issuedAt).toLocaleString()} {c.notes ? `— ${c.notes}` : ''}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2 mb-4">
              <input
                className="border p-2 flex-1"
                placeholder="비고 (선택)"
                value={contractNotes}
                onChange={(e) => setContractNotes(e.target.value)}
              />
              <button onClick={handleIssueContract} className="bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700">계약서 발행</button>
            </div>

            <button onClick={() => setSelectedStyle(null)} className="bg-gray-500 text-white px-4 py-2 rounded">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
};
