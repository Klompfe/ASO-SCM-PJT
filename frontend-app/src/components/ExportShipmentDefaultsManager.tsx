import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  getExportShipmentDefaults,
  updateExportShipmentDefaults,
  type UpdateExportShipmentDefaults,
} from '../api/exportShipmentDefaults.service';
import { getErrorMessage } from '../utils/errorMessage';

const emptyForm: UpdateExportShipmentDefaults = {
  shipperInfo: '', consigneeInfo: '', portOfLoading: '', finalDestination: '', carrier: '',
};

// PR-079: 매번 바뀌지 않는 회사 고정정보(선적자/수하인/출항지/도착지/운송사) 기본값
// 화면 — MANAGER/ADMIN만 이 탭에 접근할 수 있다(App.tsx에서 탭 자체를 숨김).
export const ExportShipmentDefaultsManager: React.FC = () => {
  const [form, setForm] = useState<UpdateExportShipmentDefaults>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getExportShipmentDefaults();
      if (res) {
        setForm({
          shipperInfo: res.shipperInfo ?? '',
          consigneeInfo: res.consigneeInfo ?? '',
          portOfLoading: res.portOfLoading ?? '',
          finalDestination: res.finalDestination ?? '',
          carrier: res.carrier ?? '',
        });
        setUpdatedAt(res.updatedAt ?? null);
      } else {
        setForm(emptyForm);
        setUpdatedAt(null);
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, '기본값을 불러오는 데 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateExportShipmentDefaults(form);
      toast.success('선적서류 기본정보가 저장되었습니다.');
      load();
    } catch (err: any) {
      toast.error(getErrorMessage(err, '저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-semibold text-gray-800">선적서류 기본정보</h2>
      <p className="text-sm text-gray-500">
        수출선적서류(INVOICE/Packing List) 생성 시 매번 반복되는 회사 고정정보입니다.
        여기 설정해두면 생성 폼에 자동으로 채워지고, 건별로 필요하면 그때그때 수정할 수 있습니다.
        (선적일/문서번호/인보이스 일자는 매번 달라지는 값이라 여기서 관리하지 않습니다.)
      </p>

      {loading ? (
        <div className="text-sm text-gray-500">불러오는 중...</div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg space-y-3">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">Shipper / Exporter</label>
            <textarea
              className="border border-gray-300 rounded px-3 py-2"
              rows={3}
              value={form.shipperInfo}
              onChange={(e) => setForm({ ...form, shipperInfo: e.target.value })}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">Consignee</label>
            <textarea
              className="border border-gray-300 rounded px-3 py-2"
              rows={3}
              value={form.consigneeInfo}
              onChange={(e) => setForm({ ...form, consigneeInfo: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">Port of Loading</label>
              <input
                className="border border-gray-300 rounded px-3 py-2"
                placeholder="예: INCHEON, KOREA"
                value={form.portOfLoading}
                onChange={(e) => setForm({ ...form, portOfLoading: e.target.value })}
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">Final Destination</label>
              <input
                className="border border-gray-300 rounded px-3 py-2"
                placeholder="예: HAIPHONG, VIETNAM"
                value={form.finalDestination}
                onChange={(e) => setForm({ ...form, finalDestination: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">Carrier</label>
            <input
              className="border border-gray-300 rounded px-3 py-2"
              placeholder="예: DONGJIN CONTINENTAL / 0217W"
              value={form.carrier}
              onChange={(e) => setForm({ ...form, carrier: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            {updatedAt && (
              <span className="text-xs text-gray-400">마지막 수정: {new Date(updatedAt).toLocaleString()}</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
};
