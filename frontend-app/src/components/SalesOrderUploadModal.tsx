import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { uploadSalesOrderImage, commitSalesOrderAnalysis, getAiUsageSummary, type AiSalesOrderResult, type AiUsageSummary } from '../api/salesOrders.service';
import { getErrorMessage } from '../utils/errorMessage';
import {
  updateOverviewField as updateOverviewFieldPure,
  setBomItemSubType,
  resolveMaterialSubTypeCandidate,
  resolveSubTypeValue,
} from '../utils/salesOrderOverviewEdit';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  // 저장된 항목의 "자재명세 보기"를 누르면 호출된다 — StylesManager를 거쳐 App.tsx가
  // Items(자재·BOM) 탭으로 전환하고 그 styleNo의 BOM을 바로 열어준다. 여기서 보여주는
  // 자재명세는 AI 분석 결과 미리보기일 뿐이라, 실제 저장된(병합 규칙이 적용된) 값은
  // 이 버튼으로 BOM 조회 화면에서 따로 확인해야 한다.
  onViewBom?: (styleNo: string) => void;
}

// PR-134: 수주(고객사로부터 받은 주문) 등록 — 작업지시서 문서를 올려 AI로 분석하고 오더개요/자재명세/작업명세/계약으로 저장한다.
// 예전에는 "작업지시" 탭(WorkOrdersManager)에 있었지만 이 흐름은 생산 실행 지시(WorkOrder)를 만들지 않는다 — 오더관리 탭으로 옮겼다.
export const SalesOrderUploadModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, onViewBom }) => {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<AiSalesOrderResult[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savedIndexes, setSavedIndexes] = useState<Set<number>>(new Set());
  const [dragActive, setDragActive] = useState(false);
  const [lastChargeKrw, setLastChargeKrw] = useState<number | null>(null);
  // PR-096: GEMINI_API_KEY 미설정 시 서버가 목업 데이터를 반환하는데(vision.service.ts),
  // 이 사실이 화면에 전혀 드러나지 않아 가짜 데이터를 실제 결과로 오인하고 그대로 진행할
  // 뻔한 사고가 있었다 — 응답의 isMock을 명시적으로 저장해 배너로 경고하고 저장을 막는다.
  const [isMock, setIsMock] = useState(false);
  const [usageSummary, setUsageSummary] = useState<AiUsageSummary | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    getAiUsageSummary()
      .then((res) => setUsageSummary(res))
      .catch(() => setUsageSummary(null));
  }, [isOpen]);

  // 파일을 브라우저 창에 드롭하면 기본 동작은 그 파일을 새 페이지로 여는 것이라
  // (드롭 영역 밖에서도) preventDefault로 항상 막아둔다 — 그렇지 않으면 드롭 영역을
  // 살짝 벗어나 드롭했을 때 파일이 새 탭에서 열려버린다.
  useEffect(() => {
    if (!isOpen) return;
    const preventDefault = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, [isOpen]);

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const res = await uploadSalesOrderImage(file);
      const data: AiSalesOrderResult[] = Array.isArray(res?.results) ? res.results : [];
      const charge: number = typeof res?.chargedAmountKrw === 'number' ? res.chargedAmountKrw : 0;
      const mock: boolean = res?.isMock === true;
      setResults(data);
      setLastChargeKrw(charge);
      setIsMock(mock);
      setSavedIndexes(new Set());
      setStep(2);
      if (mock) {
        toast.error('⚠️ 목업 데이터입니다 — 실제 AI 분석이 아닙니다. 관리자에게 GEMINI_API_KEY 설정을 요청하세요.', { duration: 10000 });
      } else if (charge > 0) {
        toast.success(`AI 분석 완료 — ${charge.toLocaleString()}원 과금되었습니다.`);
        getAiUsageSummary().then((r) => setUsageSummary(r)).catch(() => {});
      }
    } catch (e) {
      toast.error(getErrorMessage(e, 'AI 분석 실패'));
    } finally {
      setLoading(false);
    }
  };

  // PR-158: 검토 화면(저장 전)에서 오더개요 값을 바로 고칠 수 있게 한다 — AI가 납기를
  // 작성일로 잘못 인식하는 등 다른 필드에서도 오인식이 생길 수 있는데, 지금까지는
  // 전부 읽기전용이라 일단 저장한 뒤 오더관리 화면에서 다시 고쳐야 했다.
  const updateOverviewField = <K extends keyof AiSalesOrderResult['overview']>(
    index: number,
    field: K,
    value: AiSalesOrderResult['overview'][K],
  ) => {
    setResults((prev) => updateOverviewFieldPure(prev, index, field, value));
  };

  const handleSave = async (index: number) => {
    if (isMock) {
      toast.error('목업 데이터는 저장할 수 없습니다.');
      return;
    }
    const result = results[index];
    setSavingIndex(index);
    try {
      await commitSalesOrderAnalysis(result);
      toast.success(`${result.overview.styleNo ?? `#${index + 1}`} 저장되었습니다.`);
      setSavedIndexes((prev) => new Set(prev).add(index));
      onSuccess();
    } catch (e) {
      toast.error(getErrorMessage(e, '저장에 실패했습니다.'));
    } finally {
      setSavingIndex(null);
    }
  };

  // Style No.를 못 읽은 항목은 백엔드가 거부하므로(SalesOrdersService.commitAnalysis) 제외하고,
  // 병렬 실행하면 서로 다른 스타일이 같은 자재명을 참조할 때 mapping-commit의 "없으면 새로
  // 생성" 로직이 경합할 수 있어(PR-052와 동일한 이유) 순차 실행한다.
  const handleBulkSave = async () => {
    if (isMock) {
      toast.error('목업 데이터는 저장할 수 없습니다.');
      return;
    }
    const targets = results
      .map((result, index) => ({ result, index }))
      .filter(({ result, index }) => !!result.overview.styleNo && !savedIndexes.has(index));

    if (targets.length === 0) {
      toast.error('일괄 저장할 대상이 없습니다(Style No. 인식 실패 또는 이미 저장됨은 제외됩니다).');
      return;
    }

    setBulkSaving(true);
    setBulkProgress(0);
    let successCount = 0;
    const failures: { label: string; reason: string }[] = [];

    for (const { result, index } of targets) {
      const label = result.overview.styleNo ?? `#${index + 1}`;
      try {
        await commitSalesOrderAnalysis(result);
        setSavedIndexes((prev) => new Set(prev).add(index));
        successCount++;
      } catch (err) {
        const reason = getErrorMessage(err, '알 수 없는 오류');
        console.error(`[일괄 저장 실패] ${label}:`, err);
        failures.push({ label, reason });
      }
      setBulkProgress((p) => p + 1);
    }

    setBulkSaving(false);
    if (failures.length === 0) {
      toast.success(`일괄 저장 완료: ${successCount}건 성공`);
    } else {
      const reasonGroups = new Map<string, string[]>();
      for (const f of failures) {
        const list = reasonGroups.get(f.reason) ?? [];
        list.push(f.label);
        reasonGroups.set(f.reason, list);
      }
      const summary = Array.from(reasonGroups.entries())
        .map(([reason, labels]) => `- ${reason} (${labels.length}건: ${labels.slice(0, 3).join(', ')}${labels.length > 3 ? ' 외' : ''})`)
        .join('\n');
      toast.error(
        `일괄 저장 완료: ${successCount}건 성공, ${failures.length}건 실패\n${summary}\n(전체 목록은 브라우저 콘솔 참고)`,
        { duration: 20000 },
      );
      console.error('[일괄 저장 실패 목록]', failures);
    }
    onSuccess();
  };

  const handleClose = () => {
    setFile(null);
    setResults([]);
    setStep(1);
    setSavedIndexes(new Set());
    setLastChargeKrw(null);
    setIsMock(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          <div className="flex justify-between items-baseline mb-4">
            <h3 className="text-xl font-bold">수주 등록(작업지시서 업로드)</h3>
            {usageSummary && (
              <span className="text-xs text-gray-400">
                누적 AI 분석 {usageSummary.totalCalls}건 · 누적 과금 {usageSummary.totalChargedKrw.toLocaleString()}원
              </span>
            )}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <label
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer text-center ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}
              >
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <span className="text-gray-600">
                  {file ? file.name : '여기로 파일을 드래그하거나 클릭하여 선택하세요 (PDF, 이미지)'}
                </span>
              </label>
              <button onClick={handleUpload} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50" disabled={!file || loading}>
                {loading ? '분석 중...' : 'AI 분석 시작'}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {isMock && (
                <div className="bg-red-50 border-2 border-red-400 text-red-800 rounded-lg p-3 text-sm font-semibold">
                  ⚠️ 목업 데이터입니다 — 실제 AI 분석이 아닙니다. 관리자에게 GEMINI_API_KEY 설정을 요청하세요. (저장이 비활성화되었습니다)
                </div>
              )}
              <div className="flex justify-between items-center gap-4">
                <p className="text-sm text-gray-500">
                  {results.length}건 분석됨{lastChargeKrw != null && lastChargeKrw > 0 ? ` — 이번 분석 요금 ${lastChargeKrw.toLocaleString()}원` : ''} — 각 항목을 확인 후 개별 저장하거나, 일괄저장하세요.
                </p>
                <button
                  onClick={handleBulkSave}
                  disabled={bulkSaving || isMock}
                  className="bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {bulkSaving ? `일괄저장 중... (${bulkProgress}/${results.length})` : '일괄저장'}
                </button>
              </div>
              {results.map((result, index) => (
                <div key={index} className={`border rounded-lg p-4 space-y-3 ${isMock ? 'border-red-300 bg-red-50/30' : 'border-gray-200'}`}>
                  {isMock && (
                    <div className="bg-red-100 border border-red-300 text-red-700 rounded p-2 text-xs font-semibold">
                      ⚠️ 목업 데이터 — 저장 불가
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold">
                      {index + 1}. {result.overview.styleNo ?? '(Style No. 인식 실패)'}
                      {result.overview.styleName ? ` — ${result.overview.styleName}` : ''}
                    </h4>
                    <div className="flex gap-2">
                      {savedIndexes.has(index) && onViewBom && result.overview.styleNo && (
                        <button
                          onClick={() => onViewBom(result.overview.styleNo!)}
                          className="px-4 py-2 rounded text-sm font-medium text-white bg-purple-600 hover:bg-purple-700"
                        >자재명세 보기</button>
                      )}
                      <button
                        onClick={() => handleSave(index)}
                        disabled={savingIndex === index || savedIndexes.has(index) || isMock}
                        className={`px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50 ${savedIndexes.has(index) ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                      >
                        {savedIndexes.has(index) ? '저장됨' : savingIndex === index ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sm font-semibold text-gray-700 mb-1">1) 오더개요 (저장 전 직접 수정 가능)</h5>
                    <div className="grid grid-cols-4 gap-2 text-sm bg-gray-50 p-2 rounded">
                      <label className="flex flex-col">
                        <span className="text-gray-500 text-xs">Style No.</span>
                        <input
                          className="border rounded px-2 py-1"
                          value={result.overview.styleNo ?? ''}
                          onChange={(e) => updateOverviewField(index, 'styleNo', e.target.value || null)}
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-gray-500 text-xs">스타일명</span>
                        <input
                          className="border rounded px-2 py-1"
                          value={result.overview.styleName ?? ''}
                          onChange={(e) => updateOverviewField(index, 'styleName', e.target.value || null)}
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-gray-500 text-xs">품목</span>
                        <input
                          className="border rounded px-2 py-1"
                          value={result.overview.itemType ?? ''}
                          onChange={(e) => updateOverviewField(index, 'itemType', e.target.value || null)}
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-gray-500 text-xs">브랜드</span>
                        <input
                          className="border rounded px-2 py-1"
                          value={result.overview.brand ?? ''}
                          onChange={(e) => updateOverviewField(index, 'brand', e.target.value || null)}
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-gray-500 text-xs">생산유형</span>
                        <select
                          className="border rounded px-2 py-1"
                          value={result.overview.productionType ?? ''}
                          onChange={(e) => updateOverviewField(index, 'productionType', (e.target.value || null) as 'FOB' | 'CMT' | null)}
                        >
                          <option value="">-</option>
                          <option value="FOB">FOB</option>
                          <option value="CMT">CMT</option>
                        </select>
                      </label>
                      <label className="flex flex-col">
                        <span className="text-gray-500 text-xs">공장</span>
                        <input
                          className="border rounded px-2 py-1"
                          value={result.overview.factory ?? ''}
                          onChange={(e) => updateOverviewField(index, 'factory', e.target.value || null)}
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-gray-500 text-xs">바이어</span>
                        <input
                          className="border rounded px-2 py-1"
                          value={result.overview.buyer ?? ''}
                          onChange={(e) => updateOverviewField(index, 'buyer', e.target.value || null)}
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-gray-500 text-xs">총수량</span>
                        <input
                          type="number"
                          className="border rounded px-2 py-1"
                          value={result.overview.totalQty ?? ''}
                          onChange={(e) => updateOverviewField(index, 'totalQty', e.target.value === '' ? null : Number(e.target.value))}
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-gray-500 text-xs">
                          납기
                          {result.overview.documentDate && <span className="text-gray-400"> (작성일: {result.overview.documentDate}, 참고)</span>}
                        </span>
                        <input
                          type="text"
                          placeholder="YYYY-MM-DD"
                          data-testid={`target-rdd-input-${index}`}
                          className={`border rounded px-2 py-1 ${result.overview.targetRddSuspicious ? 'border-red-500 bg-red-50' : ''}`}
                          value={result.overview.targetRdd ?? ''}
                          onChange={(e) => updateOverviewField(index, 'targetRdd', e.target.value || null)}
                        />
                        {result.overview.targetRddSuspicious && (
                          <span className="text-xs text-red-600 mt-0.5" data-testid={`target-rdd-warning-${index}`}>
                            ⚠ 납기가 문서 작성일보다 빠르거나 과거 날짜입니다 — 확인해주세요
                          </span>
                        )}
                      </label>
                      <label className="flex flex-col">
                        <span className="text-gray-500 text-xs">CMT단가</span>
                        <input
                          type="number"
                          step="0.01"
                          data-testid={`cmt-price-input-${index}`}
                          className="border rounded px-2 py-1"
                          value={result.overview.cmtPrice ?? ''}
                          onChange={(e) => updateOverviewField(index, 'cmtPrice', e.target.value === '' ? null : Number(e.target.value))}
                        />
                        {/* PR-168: 미도 전용 — 작지 상단 수기 CMT단가 AI 후보. 자동으로
                            채우지 않고, 사람이 "이 값 사용"을 눌러야 위 입력란에 복사되며
                            그 뒤에도 "저장" 버튼을 눌러야 실제로 반영된다(이중 확인). */}
                        {result.overview.handwrittenCmtPriceCandidate != null && (
                          <div className="mt-1 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-xs text-yellow-800" data-testid={`cmt-price-candidate-${index}`}>
                            AI가 인식한 CMT단가 후보: <b>{result.overview.handwrittenCmtPriceCandidate}</b> — 이 값을 사용하시겠습니까?
                            <button
                              type="button"
                              onClick={() => updateOverviewField(index, 'cmtPrice', result.overview.handwrittenCmtPriceCandidate ?? null)}
                              className="ml-2 px-2 py-0.5 rounded bg-yellow-600 text-white hover:bg-yellow-700"
                            >사용</button>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sm font-semibold text-gray-700 mb-1">2) 자재명세 ({result.bomItems.length}건)</h5>
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="border text-sm">
                        <thead className="bg-gray-100"><tr><th className="border p-1">구분</th><th className="border p-1">자재명</th><th className="border p-1">규격</th><th className="border p-1">소요량</th><th className="border p-1">비고</th><th className="border p-1">실/테이프 종류</th></tr></thead>
                        <tbody>
                          {result.bomItems.map((item, i) => {
                            const candidate = item.materialSubTypeCandidate ?? null;
                            const resolved = resolveMaterialSubTypeCandidate(candidate);
                            const selectedValue = item.threadType ?? item.tapeType ?? '';
                            return (
                              <tr key={i}>
                                <td className="border p-1">{item.category ?? '-'}</td>
                                <td className="border p-1">{item.itemName}</td>
                                <td className="border p-1">{item.spec ?? '-'}</td>
                                <td className="border p-1">{item.consumption ?? '-'}</td>
                                <td className="border p-1">{item.remarks ?? '-'}</td>
                                <td className="border p-1">
                                  {candidate && resolved && !selectedValue && (
                                    <div className="mb-1 bg-yellow-50 border border-yellow-200 rounded px-1 py-0.5 text-xs text-yellow-800" data-testid={`subtype-candidate-${index}-${i}`}>
                                      AI가 인식한 자재 종류: <b>{candidate}</b> — 적용하시겠습니까?
                                      <button
                                        type="button"
                                        onClick={() => setResults((prev) => setBomItemSubType(prev, index, i, resolved))}
                                        className="ml-1 px-1 rounded bg-yellow-600 text-white hover:bg-yellow-700"
                                      >적용</button>
                                    </div>
                                  )}
                                  <select
                                    className="border rounded px-1 py-0.5 text-xs"
                                    aria-label="실/테이프 종류"
                                    value={selectedValue}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      const target = v ? resolveSubTypeValue(v) : null;
                                      setResults((prev) => setBomItemSubType(prev, index, i, target));
                                    }}
                                  >
                                    <option value="">미지정</option>
                                    <option value="COA_SA">코아사 (2500M/콘)</option>
                                    <option value="OBA_SA_SKU_I_SA">오바사·스쿠이사 (4000M/콘)</option>
                                    <option value="POLY_JINUIDO">폴리지누이도 (500M/콘)</option>
                                    <option value="DADE">다데 (50M/롤)</option>
                                    <option value="AMHOL">암홀 (50M/롤)</option>
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sm font-semibold text-gray-700 mb-1">3) 작업명세</h5>
                    {result.sizeSpecs.length > 0 && (
                      <div className="overflow-x-auto max-h-40 overflow-y-auto mb-2">
                        <table className="border text-sm">
                          <thead className="bg-gray-100"><tr><th className="border p-1">부위</th><th className="border p-1">사이즈</th><th className="border p-1">지시서</th><th className="border p-1">견본</th><th className="border p-1">완성</th></tr></thead>
                          <tbody>
                            {result.sizeSpecs.map((row, i) => (
                              <tr key={i}>
                                <td className="border p-1">{row.part}</td>
                                <td className="border p-1">{row.size}</td>
                                <td className="border p-1">{row.instructedValue ?? '-'}</td>
                                <td className="border p-1">{row.sampleValue ?? '-'}</td>
                                <td className="border p-1">{row.finalValue ?? '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {result.workNotes && (
                      <p className="text-sm bg-yellow-50 border border-yellow-200 rounded p-2 whitespace-pre-line">{result.workNotes}</p>
                    )}
                    {result.sizeSpecs.length === 0 && !result.workNotes && (
                      <p className="text-sm text-gray-400">추출된 작업명세가 없습니다.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end flex-shrink-0">
          <button onClick={handleClose} className="text-gray-500">닫기</button>
        </div>
      </div>
    </div>
  );
};
