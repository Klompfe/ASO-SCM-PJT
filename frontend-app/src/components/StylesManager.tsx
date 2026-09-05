import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getStyles, createStyle, type Style } from '../api/styles.service';
import { getErrorMessage } from '../utils/errorMessage';

export const StylesManager: React.FC = () => {
  const [productionType, setProductionType] = useState<'FOB' | 'CMT'>('FOB');
  const [formData, setFormData] = useState<any>({
    styleNo: '', brand: '', itemType: '', targetRdd: '', totalQty: 0, cmtPrice: 0, fobPrice: 0
  });
  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<any>(null);

  const loadStyles = useCallback(async () => {
    try {
      const res = await getStyles();
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
      await createStyle({ ...formData, productionType });
      toast.success('스타일이 등록되었습니다.');
      loadStyles();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '스타일 등록에 실패했습니다.'));
    }
  };

  const calculateDDay = (rdd: string) => {
    const diff = new Date(rdd).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Styles Management</h2>
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow mb-6">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <input className="border p-2" placeholder="Style No" onChange={e => setFormData({...formData, styleNo: e.target.value})} />
          <input className="border p-2" placeholder="Brand" onChange={e => setFormData({...formData, brand: e.target.value})} />
          <input className="border p-2" placeholder="Item Type" onChange={e => setFormData({...formData, itemType: e.target.value})} />
        </div>
        <div className="mb-4">
          <label className="mr-4"><input type="radio" value="FOB" checked={productionType === 'FOB'} onChange={() => setProductionType('FOB')} /> FOB</label>
          <label><input type="radio" value="CMT" checked={productionType === 'CMT'} onChange={() => setProductionType('CMT')} /> CMT</label>
        </div>
        {productionType === 'CMT' && <input className="border p-2 mb-4 w-full" placeholder="CMT Price" type="number" onChange={e => setFormData({...formData, cmtPrice: Number(e.target.value)})} />}
        {productionType === 'FOB' && <input className="border p-2 mb-4 w-full" placeholder="FOB Price" type="number" onChange={e => setFormData({...formData, fobPrice: Number(e.target.value)})} />}
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">스타일 등록</button>
      </form>

      <table className="w-full border-collapse border">
        <thead><tr className="bg-gray-100"><th>Style</th><th>Type</th><th>RDD</th><th>D-Day</th></tr></thead>
        <tbody>
          {styles.map(s => (
            <tr key={s.styleNo} onClick={() => setSelectedStyle(s)}>
              <td>{s.styleNo}</td>
              <td>{s.productionType}</td>
              <td>{s.targetRdd}</td>
              <td className={calculateDDay(s.targetRdd) <= 7 ? 'text-red-500' : ''}>{calculateDDay(s.targetRdd)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedStyle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded w-1/2">
            <h3 className="text-xl font-bold mb-4">{selectedStyle.styleNo} 상세</h3>
            <button onClick={() => setSelectedStyle(null)} className="mt-4 bg-gray-500 text-white px-4 py-2 rounded">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
};
