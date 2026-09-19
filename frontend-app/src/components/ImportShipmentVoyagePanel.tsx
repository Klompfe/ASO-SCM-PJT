import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { updateImportShipmentHeader, type ImportShipment } from '../api/importShipments.service';
import { getErrorMessage } from '../utils/errorMessage';
import { dayOnly, validateVoyageDates } from '../utils/importShipmentForm';

interface Props {
  shipment: ImportShipment;
  onSaved: () => void;
}

// PR-124: 수입통관 문서 카드의 선적 정보(POL/POD/ETD/ETA/선명) 표시 + 수정. POL/POD/ETD/선명은 INVOICE 엑셀에서 자동으로
// 채워지고, ETA(도착예정일)는 그 문서에 없어 여기서만 입력한다(없어도 정상).
export const ImportShipmentVoyagePanel: React.FC<Props> = ({ shipment, onSaved }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ pol: '', pod: '', etd: '', eta: '', vessel: '' });

  const startEdit = () => {
    setDraft({
      pol: shipment.pol ?? '',
      pod: shipment.pod ?? '',
      etd: dayOnly(shipment.etd),
      eta: dayOnly(shipment.eta),
      vessel: shipment.vessel ?? '',
    });
    setEditing(true);
  };

  const save = async () => {
    const err = validateVoyageDates(draft.etd, draft.eta);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      await updateImportShipmentHeader(shipment.id, {
        pol: draft.pol.trim() || null,
        pod: draft.pod.trim() || null,
        etd: draft.etd || null,
        eta: draft.eta || null,
        vessel: draft.vessel.trim() || null,
      });
      toast.success('선적 정보가 저장되었습니다.');
      setEditing(false);
      onSaved();
    } catch (e: any) {
      toast.error(getErrorMessage(e, '선적 정보 저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const input = 'border border-gray-300 rounded px-2 py-1 text-sm';

  if (editing) {
    return (
      <div className="bg-blue-50 border border-blue-100 rounded p-3 space-y-2" data-testid={`voyage-edit-${shipment.id}`}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <label className="text-xs text-gray-600 flex flex-col gap-1">선적항(POL)
            <input className={input} value={draft.pol} onChange={(e) => setDraft({ ...draft, pol: e.target.value })} aria-label="선적항 POL" />
          </label>
          <label className="text-xs text-gray-600 flex flex-col gap-1">도착항(POD)
            <input className={input} value={draft.pod} onChange={(e) => setDraft({ ...draft, pod: e.target.value })} aria-label="도착항 POD" />
          </label>
          <label className="text-xs text-gray-600 flex flex-col gap-1">출항일(ETD)
            <input type="date" className={input} value={draft.etd} onChange={(e) => setDraft({ ...draft, etd: e.target.value })} aria-label="출항일 ETD" />
          </label>
          <label className="text-xs text-gray-600 flex flex-col gap-1">도착예정일(ETA)
            <input type="date" className={input} value={draft.eta} onChange={(e) => setDraft({ ...draft, eta: e.target.value })} aria-label="도착예정일 ETA" />
          </label>
          <label className="text-xs text-gray-600 flex flex-col gap-1">선명
            <input className={input} value={draft.vessel} onChange={(e) => setDraft({ ...draft, vessel: e.target.value })} aria-label="선명" />
          </label>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>
          <button onClick={() => setEditing(false)} className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-300">취소</button>
        </div>
      </div>
    );
  }

  const cell = (label: string, value: string | null | undefined, testId: string) => (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={value ? 'text-gray-800' : 'text-gray-300'} data-testid={testId}>{value || '-'}</span>
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm bg-gray-50 rounded px-3 py-2" data-testid={`voyage-${shipment.id}`}>
      {cell('POL', shipment.pol, 'voyage-pol')}
      {cell('POD', shipment.pod, 'voyage-pod')}
      {cell('ETD', dayOnly(shipment.etd), 'voyage-etd')}
      {cell('ETA', dayOnly(shipment.eta), 'voyage-eta')}
      {cell('선명', shipment.vessel, 'voyage-vessel')}
      <button onClick={startEdit} className="ml-auto text-xs text-blue-600 hover:underline print:hidden">선적 정보 수정</button>
    </div>
  );
};
