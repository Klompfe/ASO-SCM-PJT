import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { uploadSalesOrderImage, commitSalesOrderAnalysis, getAiUsageSummary, type AiSalesOrderResult, type AiUsageSummary } from '../api/salesOrders.service';
import { getErrorMessage } from '../utils/errorMessage';
import {
  updateOverviewField as updateOverviewFieldPure,
  setBomItemSubType,
  resolveMaterialSubTypeCandidate,
  resolveSubTypeValue,
  prefillHandwrittenCmtDraft,
} from '../utils/salesOrderOverviewEdit';
import {
  updateBomItemField as updateBomItemFieldPure,
  buildCommitResult,
  hasBlankMaterialName,
  computeBomRowBadges,
  normalizeMaterialName,
} from '../utils/salesOrderBomReview';
import { getAllItems } from '../api/items.service';
import { buildUploadFailureInfo, resolveUploadFailureToastMessage, type UploadFailureInfo } from '../utils/salesOrderUploadError';
import { getSimilarMasterStyles } from '../api/styles.service';
import { findSimilarStyleNos } from '../utils/styleNoSimilarity';
import {
  shouldBlockSaveForStyleNo,
  summarizeWarnings,
  groupDuplicateIndexes,
  applyKeepOnlyThisRow,
  findWarning,
  collectFormatConfirmItems,
  collectUnverifiedStyleItems,
  splitStyleNoForDisplay,
  getSaveGateInfo,
} from '../utils/visionGuardrails';
import { OriginalPagePreview } from './OriginalPagePreview';

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
  // PR-197: 자재명세 행을 저장 전에 사람이 정리할 수 있게 한다 — 제외 체크(결과 인덱스
  // → 제외된 bomItems 인덱스 집합)와 "수정됨" 표시(같은 모양의 맵). bomItems 자체(또는
  // 커밋 페이로드)에 플래그를 넣지 않고 컴포넌트에서만 들고 있다가 저장 직전에만
  // 적용한다(buildCommitResult) — 되돌리기(체크 해제)가 항상 가능하게 하기 위함.
  const [excludedBomIndexes, setExcludedBomIndexes] = useState<Map<number, Set<number>>>(new Map());
  const [editedBomIndexes, setEditedBomIndexes] = useState<Map<number, Set<number>>>(new Map());
  // PR-197: "자재 마스터에 없는 새 이름" 배지 — 정규화(공백/대소문자 무시)한 기존 자재명 집합.
  const [existingMaterialNames, setExistingMaterialNames] = useState<Set<string>>(new Set());
  // PR-192: 분석 실패가 토스트(사라짐)만으로 끝나면 "결과 없이 멈춘 것"처럼 보인다 —
  // 닫기 전까지 유지되는 안내 영역에 원인/시도시각/경과시간/다음 행동/재시도 버튼을 둔다.
  const [uploadError, setUploadError] = useState<UploadFailureInfo | null>(null);
  // PR-192: 분석 중(특히 페이지가 많을 때) "결과 없음"으로 오해하지 않도록 경과 초를 보여준다.
  const [loadingElapsedSec, setLoadingElapsedSec] = useState(0);
  // PR-192: 폴백 모델로 처리된 경우 — 저장 전 사람이 인식 결과를 더 꼼꼼히 확인하도록 안내.
  const [fallbackUsed, setFallbackUsed] = useState(false);
  // PR-198: 작지 AI가 읽은 스타일번호가 기존 스타일과 "끝 글자만 다른" 경우의 후보 목록
  // (결과 인덱스별) — 자동 변경하지 않고 버튼을 눌러야 입력칸 값이 바뀐다.
  const [similarStyleCandidates, setSimilarStyleCandidates] = useState<Map<number, string[]>>(new Map());
  // PR-200: 항목별 원본 페이지 미리보기 토글(기본 숨김 — 필요할 때만 넓게 쓸 수 있게).
  const [showOriginal, setShowOriginal] = useState<Set<number>>(new Set());
  // PR-200c: 스타일번호를 원본 페이지와 대조했는지(결과 인덱스 기준) — 기본 해제.
  // 형식이 맞고 반복 읽기가 일치해도 숫자 1개 오독은 가드레일로 못 잡는다(A4/PILOT-6) —
  // 경고와 별개로 사람이 직접 확인했는지만 보는 관문이다.
  const [verifiedStyleNo, setVerifiedStyleNo] = useState<Set<number>>(new Set());

  const refreshSimilarStyleCandidates = async (index: number, styleNo: string | null) => {
    if (!styleNo) {
      setSimilarStyleCandidates((prev) => { const next = new Map(prev); next.delete(index); return next; });
      return;
    }
    try {
      const similar = await getSimilarMasterStyles(styleNo);
      const candidates = findSimilarStyleNos(styleNo, similar.map((s) => s.styleNo));
      setSimilarStyleCandidates((prev) => { const next = new Map(prev); next.set(index, candidates); return next; });
    } catch {
      // 조회 실패는 조용히 넘어간다 — 이 경고는 참고용이라 실패해도 저장을 막지 않는다.
    }
  };

  useEffect(() => {
    if (!loading) return;
    const startedAt = Date.now();
    setLoadingElapsedSec(0);
    const timer = window.setInterval(() => {
      setLoadingElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

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
    setUploadError(null);
    const triedAt = new Date();
    const startedMs = Date.now();
    try {
      const res = await uploadSalesOrderImage(file);
      const data: AiSalesOrderResult[] = Array.isArray(res?.results) ? res.results : [];
      const charge: number = typeof res?.chargedAmountKrw === 'number' ? res.chargedAmountKrw : 0;
      const mock: boolean = res?.isMock === true;
      // PR-181: 미도 작지 수기 CMT단가 — AI 후보를 "사용" 버튼 없이 입력란에 초안으로
      // 미리 채운다. 초안일 뿐 확정이 아니며, 계약 승인 시점에 한 번 더 확인해야 한다.
      setResults(prefillHandwrittenCmtDraft(data));
      setLastChargeKrw(charge);
      setIsMock(mock);
      setFallbackUsed(res?.fallbackUsed === true);
      setSavedIndexes(new Set());
      setExcludedBomIndexes(new Map());
      setEditedBomIndexes(new Map());
      setStep(2);
      // PR-197: "자재 마스터에 없는 새 이름" 배지용 — 전체 자재명을 한 번 불러와 정규화해 둔다.
      getAllItems({})
        .then((items) => setExistingMaterialNames(new Set(items.map((it) => normalizeMaterialName(it.name)))))
        .catch(() => setExistingMaterialNames(new Set()));
      // PR-198: 결과마다 읽은 스타일번호가 기존 스타일과 끝 글자만 다른지 확인한다.
      setSimilarStyleCandidates(new Map());
      data.forEach((r, i) => { void refreshSimilarStyleCandidates(i, r.overview.styleNo ?? null); });
      if (mock) {
        toast.error('⚠️ 목업 데이터입니다 — 실제 AI 분석이 아닙니다. 관리자에게 GEMINI_API_KEY 설정을 요청하세요.', { duration: 10000 });
      } else if (charge > 0) {
        toast.success(`AI 분석 완료 — ${charge.toLocaleString()}원 과금되었습니다.`);
        getAiUsageSummary().then((r) => setUsageSummary(r)).catch(() => {});
      }
    } catch (e) {
      const elapsedSec = Math.round((Date.now() - startedMs) / 1000);
      const info = buildUploadFailureInfo(e, triedAt, elapsedSec);
      toast.error(resolveUploadFailureToastMessage(info.cause, getErrorMessage(e, '')));
      setUploadError(info);
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
    // PR-198: 스타일번호를 직접 고치면 그 값 기준으로 유사 스타일 후보를 다시 조회한다.
    if (field === 'styleNo') void refreshSimilarStyleCandidates(index, (value as string | null) ?? null);
  };

  // PR-200c: 스타일번호 입력칸에 "사람이 직접" 타이핑했을 때만 쓴다(= 원본을 보고 입력한
  // 것으로 간주해 자동으로 대조 완료 처리). 후보 칩 클릭은 updateOverviewField를 그대로
  // 쓰고 이 함수를 거치지 않는다 — 칩은 AI 후보일 뿐 사람이 원본을 본 게 아니다.
  const handleStyleNoManualEdit = (index: number, value: string | null) => {
    updateOverviewField(index, 'styleNo', value);
    setVerifiedStyleNo((prev) => new Set(prev).add(index));
  };

  // PR-197: 체크하면 저장 요청에서 빠진다(되돌릴 수 있음 — 체크 해제로 복원).
  const toggleExcludeBomItem = (index: number, bomIndex: number) => {
    setExcludedBomIndexes((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(index) ?? []);
      if (set.has(bomIndex)) set.delete(bomIndex); else set.add(bomIndex);
      next.set(index, set);
      return next;
    });
  };

  const updateBomItemField = <K extends keyof AiSalesOrderResult['bomItems'][number]>(
    index: number,
    bomIndex: number,
    field: K,
    value: AiSalesOrderResult['bomItems'][number][K],
  ) => {
    setResults((prev) => updateBomItemFieldPure(prev, index, bomIndex, field, value));
    setEditedBomIndexes((prev) => {
      const next = new Map(prev);
      next.set(index, new Set(next.get(index) ?? []).add(bomIndex));
      return next;
    });
  };

  const handleSave = async (index: number) => {
    if (isMock) {
      toast.error('목업 데이터는 저장할 수 없습니다.');
      return;
    }
    // PR-200: 끝 글자가 숫자인 스타일번호는 사람이 영문자로 고치기 전까지 저장을 막는다
    // (사용자가 확정한 사실 — 끝 글자는 숫자가 될 수 없음, 유일한 저장 차단 규칙).
    if (shouldBlockSaveForStyleNo(results[index].overview)) {
      toast.error('스타일번호 끝 글자가 숫자로 읽혔습니다 — 원본과 대조해 영문자로 고친 뒤 저장해 주세요.');
      return;
    }
    // PR-200c: 경고 여부와 무관하게 "원본과 대조했다"는 확인이 없으면 저장하지 않는다.
    if (!verifiedStyleNo.has(index)) {
      toast.error('스타일번호를 원본 페이지와 대조했는지 체크해 주세요.');
      return;
    }
    // PR-198: 저장 직전에도 한 번 더 확인 — 비슷한 스타일이 있는데 번호가 다르면
    // "새 스타일로 만들까요?"로 한 번 더 묻는다(자동 변경 없음, 사람이 계속 진행을 선택).
    const styleNo = results[index].overview.styleNo;
    const candidates = similarStyleCandidates.get(index) ?? [];
    if (styleNo && candidates.length > 0) {
      const proceed = window.confirm(
        `비슷한 스타일 ${candidates.join(', ')}이(가) 이미 있습니다 — 같은 스타일이면 번호를 확인해 주세요.\n` +
        `계속 "${styleNo}"로 새 스타일을 만들까요?`,
      );
      if (!proceed) return;
    }
    // PR-200b: 끝 글자 숫자는 아니지만 형식이 안 맞는 스타일번호(하이픈 섞임, 품목코드
    // 자리의 숫자 0 등)는 저장을 막지는 않되, 한 번 더 확인창을 띄운다.
    const formatConfirmItems = collectFormatConfirmItems([{ index, overview: results[index].overview }]);
    if (formatConfirmItems.length > 0) {
      const proceed = window.confirm(
        `스타일번호 형식이 맞지 않습니다 — 그대로 저장할까요? (${formatConfirmItems.map((i) => i.styleNo ?? `#${i.index + 1}`).join(', ')})`,
      );
      if (!proceed) return;
    }
    const result = buildCommitResult(results[index], excludedBomIndexes.get(index) ?? new Set());
    if (hasBlankMaterialName(result.bomItems)) {
      toast.error('자재명이 빈 행이 있습니다 — 자재명을 채우거나 그 행을 제외해 주세요.');
      return;
    }
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
    const candidateTargets = results
      .map((result, index) => ({ result, index }))
      .filter(({ result, index }) => !!result.overview.styleNo && !savedIndexes.has(index));

    if (candidateTargets.length === 0) {
      toast.error('일괄 저장할 대상이 없습니다(Style No. 인식 실패 또는 이미 저장됨은 제외됩니다).');
      return;
    }

    // PR-200c: 대조하지 않은 항목은 안내하고 그 항목만 빼고 저장한다(나머지는 그대로 진행).
    const unverified = collectUnverifiedStyleItems(
      candidateTargets.map(({ result, index }) => ({ index, styleNo: result.overview.styleNo })),
      verifiedStyleNo,
    );
    if (unverified.length > 0) {
      toast.error(
        `스타일번호를 원본과 대조하지 않은 항목은 저장하지 않습니다: ${unverified.map((u) => u.styleNo ?? `#${u.index + 1}`).join(', ')}`,
      );
    }
    const unverifiedIndexes = new Set(unverified.map((u) => u.index));
    const targets = candidateTargets.filter(({ index }) => !unverifiedIndexes.has(index));

    if (targets.length === 0) {
      toast.error('대조 확인이 끝난 저장 대상이 없습니다.');
      return;
    }

    // PR-200b: 일괄 저장 대상 중 형식 오류(끝 글자 숫자는 아닌) 스타일번호가 섞여 있으면
    // 한 번에 확인창을 띄운다(개별 저장과 동일한 규칙, 대상 전체를 한 목록으로).
    const formatConfirmItems = collectFormatConfirmItems(targets.map(({ result, index }) => ({ index, overview: result.overview })));
    if (formatConfirmItems.length > 0) {
      const proceed = window.confirm(
        `스타일번호 형식이 맞지 않습니다 — 그대로 저장할까요? (${formatConfirmItems.map((i) => i.styleNo ?? `#${i.index + 1}`).join(', ')})`,
      );
      if (!proceed) return;
    }

    setBulkSaving(true);
    setBulkProgress(0);
    let successCount = 0;
    const failures: { label: string; reason: string }[] = [];

    for (const { result: rawResult, index } of targets) {
      const result = buildCommitResult(rawResult, excludedBomIndexes.get(index) ?? new Set());
      const label = result.overview.styleNo ?? `#${index + 1}`;
      if (shouldBlockSaveForStyleNo(rawResult.overview)) {
        failures.push({ label, reason: '스타일번호 끝 글자가 숫자로 읽혔습니다 — 원본과 대조해 영문자로 고친 뒤 저장해 주세요.' });
        setBulkProgress((p) => p + 1);
        continue;
      }
      if (hasBlankMaterialName(result.bomItems)) {
        failures.push({ label, reason: '자재명이 빈 행이 있습니다 — 자재명을 채우거나 그 행을 제외해 주세요.' });
        setBulkProgress((p) => p + 1);
        continue;
      }
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
    setExcludedBomIndexes(new Map());
    setEditedBomIndexes(new Map());
    setUploadError(null);
    setFallbackUsed(false);
    setSimilarStyleCandidates(new Map());
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
                {loading ? `분석 중... (페이지가 많으면 수 분 걸립니다, ${loadingElapsedSec}초 경과)` : 'AI 분석 시작'}
              </button>
              {uploadError && (
                <div className="border-2 border-orange-300 bg-orange-50 rounded-lg p-3 text-sm space-y-1" data-testid="upload-error-panel">
                  <p className="font-semibold text-orange-800">⚠️ AI 분석 실패 — {uploadError.causeLabel}</p>
                  <p className="text-orange-700">시도 시각 {uploadError.triedAt} · 경과 {uploadError.elapsedSec}초</p>
                  <p className="text-orange-700">{uploadError.nextAction}</p>
                  <button
                    onClick={handleUpload}
                    disabled={loading}
                    className="mt-1 bg-orange-600 text-white px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                  >다시 시도</button>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {isMock && (
                <div className="bg-red-50 border-2 border-red-400 text-red-800 rounded-lg p-3 text-sm font-semibold">
                  ⚠️ 목업 데이터입니다 — 실제 AI 분석이 아닙니다. 관리자에게 GEMINI_API_KEY 설정을 요청하세요. (저장이 비활성화되었습니다)
                </div>
              )}
              {!isMock && fallbackUsed && (
                <div className="bg-blue-50 border border-blue-300 text-blue-800 rounded-lg p-3 text-sm" data-testid="fallback-model-notice">
                  ℹ️ 대체 AI 모델로 분석했습니다. 인식 결과를 더 꼼꼼히 확인해 주세요.
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
                      {index + 1}.{' '}
                      {result.overview.styleNo ? (
                        <span title="숫자 1·7·9는 작성자가 손글씨에서 자주 혼동합니다 — 원본과 확인하세요">
                          {splitStyleNoForDisplay(result.overview.styleNo).map((seg, si) => (
                            <span key={si} className={seg.highlight ? 'text-red-600 font-extrabold' : undefined}>{seg.text}</span>
                          ))}
                        </span>
                      ) : '(Style No. 인식 실패)'}
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
                        type="button"
                        onClick={() => setShowOriginal((prev) => {
                          const next = new Set(prev);
                          if (next.has(index)) next.delete(index); else next.add(index);
                          return next;
                        })}
                        className="px-3 py-2 rounded text-sm font-medium border border-gray-300 hover:bg-gray-50"
                        data-testid={`toggle-original-${index}`}
                      >
                        {showOriginal.has(index) ? '원본 숨기기' : '원본 보기'}
                      </button>
                      {/* PR-201(운영 화면 확인): 저장 비활성 이유가 툴팁(마우스를 올려야만
                          보임)으로만 나와 있어 한눈에 알기 어려웠다 — 체크박스와 이유 문장을
                          저장 버튼 바로 옆(같은 줄)에 항상 보이게 옮긴다. PR-200c의 대조 규칙
                          자체(체크 전 저장 비활성, 직접 수정 시 자동 체크, 일괄 저장 시 미대조
                          제외)는 그대로 — 안내만 고친다. */}
                      {!shouldBlockSaveForStyleNo(result.overview) && (
                        verifiedStyleNo.has(index) ? (
                          <span className="text-xs text-green-700" data-testid={`style-no-verified-badge-${index}`}>
                            ✓ 스타일번호 대조 완료
                          </span>
                        ) : (
                          <label className="flex items-center gap-1 text-xs text-gray-700">
                            <input
                              type="checkbox"
                              data-testid={`style-no-verified-${index}`}
                              checked={verifiedStyleNo.has(index)}
                              onChange={() => setVerifiedStyleNo((prev) => {
                                const next = new Set(prev);
                                if (next.has(index)) next.delete(index); else next.add(index);
                                return next;
                              })}
                            />
                            스타일번호 원본 대조
                          </label>
                        )
                      )}
                      <button
                        onClick={() => handleSave(index)}
                        disabled={savingIndex === index || savedIndexes.has(index) || isMock || getSaveGateInfo(result.overview, verifiedStyleNo.has(index)).disabled}
                        className={`px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50 ${savedIndexes.has(index) ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                      >
                        {savedIndexes.has(index) ? '저장됨' : savingIndex === index ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                  {/* 비활성 이유 — 툴팁이 아니라 항상 보이는 문장(체크·형식 확정으로
                      활성화되면, 또는 이미 저장됐으면 사라진다). */}
                  {!savedIndexes.has(index) && getSaveGateInfo(result.overview, verifiedStyleNo.has(index)).reason && (
                    <div className="text-xs text-red-600 -mt-2" data-testid={`save-disabled-reason-${index}`}>
                      {getSaveGateInfo(result.overview, verifiedStyleNo.has(index)).reason}
                    </div>
                  )}

                  {(() => {
                    const summary = summarizeWarnings([result]);
                    if (summary.totalCount === 0) return null;
                    return (
                      <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1" data-testid={`warning-summary-${index}`}>
                        확인 필요 {summary.totalCount}건 — {Object.entries(summary.byCode).map(([code, count]) => `${code} ${count}`).join(', ')}
                      </div>
                    );
                  })()}

                  {showOriginal.has(index) && (
                    <div className="lg:max-w-md">
                      {/* PR-200: 모드 A 관례상 results[index]는 업로드 PDF의 (index+1)번째
                          쪽과 1:1 대응한다(실제로 안 맞으면 컴포넌트 안의 ◀▶로 옆 쪽을 본다). */}
                      <OriginalPagePreview file={file} page={index + 1} resultCount={results.length} />
                    </div>
                  )}

                  <div>
                    <h5 className="text-sm font-semibold text-gray-700 mb-1">1) 오더개요 (저장 전 직접 수정 가능)</h5>
                    <div className="grid grid-cols-4 gap-2 text-sm bg-gray-50 p-2 rounded">
                      <label className="flex flex-col">
                        <span className="text-gray-500 text-xs">Style No.</span>
                        <input
                          className="border rounded px-2 py-1"
                          data-testid={`style-no-input-${index}`}
                          value={result.overview.styleNo ?? ''}
                          onChange={(e) => handleStyleNoManualEdit(index, e.target.value || null)}
                        />
                        {/* PR-200c: 경고와 별개인 확인 관문 — 원본과 대조하기 전엔 저장 불가
                            (직접 수정하면 자동으로 체크된다, 칩 클릭은 자동 체크 안 함). 체크박스
                            자체는 PR-201부터 저장 버튼 바로 옆(화면 위쪽 버튼 줄)에 있다 — 이
                            입력칸과 멀리 떨어져 있으면 무엇을 눌러야 하는지 알기 어렵다는 지적. */}
                        {/* PR-198: 끝 글자만 다른 기존 스타일이 있으면 알려준다 — 자동으로
                            바꾸지 않고 버튼을 눌러야 입력칸 값이 바뀐다. */}
                        {(similarStyleCandidates.get(index) ?? []).length > 0 && (
                          <div className="mt-0.5 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-1 text-xs text-yellow-800" data-testid={`similar-style-warning-${index}`}>
                            비슷한 스타일 {(similarStyleCandidates.get(index) ?? []).join(', ')}이(가) 이미 있습니다 — 같은 스타일이면 번호를 확인해 주세요.
                            {(similarStyleCandidates.get(index) ?? []).map((candidate) => (
                              <button
                                key={candidate}
                                type="button"
                                onClick={() => updateOverviewField(index, 'styleNo', candidate)}
                                className="ml-1 px-1 rounded bg-yellow-600 text-white hover:bg-yellow-700"
                              >{candidate}로 바꾸기</button>
                            ))}
                          </div>
                        )}
                        {/* PR-200: 끝 글자가 숫자거나 형식이 안 맞으면 후보 칩(어느 것도
                            미리 선택 안 됨 — 클릭해야 값이 채워지고 저장이 풀린다). */}
                        {(() => {
                          const lastDigit = findWarning(result.overview.warnings, 'STYLE_NO_LAST_DIGIT');
                          const format = findWarning(result.overview.warnings, 'STYLE_NO_FORMAT');
                          const rare = findWarning(result.overview.warnings, 'STYLE_NO_RARE_SUFFIX');
                          const warning = lastDigit ?? format ?? rare;
                          if (!warning) return null;
                          const isBlocking = warning.code === 'STYLE_NO_LAST_DIGIT';
                          return (
                            <div
                              className={`mt-0.5 rounded px-1.5 py-1 text-xs ${isBlocking ? 'bg-red-50 border border-red-300 text-red-800' : 'bg-yellow-50 border border-yellow-200 text-yellow-800'}`}
                              data-testid={`style-no-format-warning-${index}`}
                            >
                              {warning.message}
                              {result.overview.rawStyleNo && <div className="text-[10px] text-gray-500">읽은 원문: {result.overview.rawStyleNo}</div>}
                              {(warning.suggestions ?? []).length > 0 && (
                                <div className="mt-0.5 flex flex-wrap gap-1">
                                  {(warning.suggestions ?? []).map((candidate) => (
                                    <button
                                      key={candidate}
                                      type="button"
                                      onClick={() => updateOverviewField(index, 'styleNo', candidate)}
                                      className="px-1.5 py-0.5 rounded bg-white border border-gray-300 hover:bg-gray-50 font-mono"
                                    >{candidate}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
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
                        {/* PR-201: 기준이 "항상 오늘"에서 "작성일(신뢰 가능하면)·아니면 오늘"로
                            바뀌어, 어느 기준으로 보정했는지에 따라 문구를 바꾼다(작성일이
                            과거인 작지는 납기도 오늘보다 과거일 수 있어 혼동을 줄이기 위함).
                            자동 확정이 아니라 초안 보정임을 알리는 안내 — 빨간 경고와는 다른
                            색(파란)으로 구분한다. 사용자가 납기를 직접 고치면 사라진다
                            (updateOverviewField가 targetRddYearAdjusted를 함께 지운다). */}
                        {result.overview.targetRddYearAdjusted && (
                          <span className="text-xs text-blue-600 mt-0.5" data-testid={`target-rdd-year-adjusted-${index}`}>
                            납기가 {result.overview.targetRddAdjustBasis === 'DOCUMENT_DATE' ? '작성일' : '오늘(한국시간)'}보다 이른 날짜로 인식되어 연도를 다음 해로 자동 보정했습니다(원래 인식값: {result.overview.targetRddOriginal}) — 확인해주세요
                          </span>
                        )}
                        {/* PR-201d: 값은 안 바꿨지만 납기가 오늘보다 과거면 반드시 안내한다
                            (작성일 기준으로는 정상 — 또는 보정을 시도했지만 끝내 오늘을 못
                            넘긴 경우 — 둘 다 "조용히 넘어가지" 않게 한다, PR-201c 합성 입력
                            ③에서 확인된 사각지대). 보정 안내(파란)·의심 경고(빨강)와 구분되는
                            색(주황)으로 표시한다. */}
                        {result.overview.targetRddNotice === 'past-kept' && (
                          <span className="text-xs text-amber-600 mt-0.5" data-testid={`target-rdd-past-kept-${index}`}>
                            납기 {result.overview.targetRdd}가 오늘(한국시간)보다 이른 날짜입니다.{' '}
                            {result.overview.documentDate
                              ? `작성일(${result.overview.documentDate}) 이후라서 값을 바꾸지 않았습니다.`
                              : '연도를 자동으로 보정하지 못했습니다.'}{' '}
                            원본의 납기 연·월·일을 확인해 주세요.
                          </span>
                        )}
                        {result.overview.targetRddSuspicious && (
                          <span className="text-xs text-red-600 mt-0.5" data-testid={`target-rdd-warning-${index}`}>
                            ⚠ 납기가 문서 작성일보다 빠르거나 과거 날짜입니다 — 확인해주세요
                          </span>
                        )}
                      </label>
                      <label className="flex flex-col">
                        <span className="text-gray-500 text-xs flex items-center gap-1">
                          CMT단가
                          {/* PR-181: "사용" 버튼 단계를 없애고 AI 후보를 바로 초안으로 채운다
                              (prefillHandwrittenCmtDraft) — 이 값은 초안일 뿐 확정이 아니며,
                              계약 승인 시점에 담당 관리자가 한 번 더 확인·입력해야 한다. */}
                          {result.overview.handwrittenCmtPriceCandidate != null && (
                            <span className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded text-[10px] font-medium" data-testid={`cmt-price-draft-badge-${index}`}>
                              수기 초안 — 계약 승인 시 확정 필요
                            </span>
                          )}
                        </span>
                        <input
                          type="number"
                          step="any"
                          data-testid={`cmt-price-input-${index}`}
                          className="border rounded px-2 py-1"
                          value={result.overview.cmtPrice ?? ''}
                          onChange={(e) => updateOverviewField(index, 'cmtPrice', e.target.value === '' ? null : Number(e.target.value))}
                        />
                        {/* 단가를 비우면(null) 코멘트가 남아 있어도 저장 시 초안 없음으로 처리된다
                            (commitAnalysis는 cmtPrice가 있을 때만 코멘트를 계약에 반영한다). */}
                        <textarea
                          data-testid={`cmt-price-note-input-${index}`}
                          className="mt-1 border rounded px-2 py-1 text-xs"
                          rows={2}
                          placeholder="CMT단가 코멘트(선택) — 예: 작지 수기: 7,270 + 230 = 7,500"
                          value={result.overview.cmtPriceNote ?? ''}
                          onChange={(e) => updateOverviewField(index, 'cmtPriceNote', e.target.value === '' ? null : e.target.value)}
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    {(() => {
                      const excluded = excludedBomIndexes.get(index) ?? new Set<number>();
                      const edited = editedBomIndexes.get(index) ?? new Set<number>();
                      const badges = computeBomRowBadges(result.bomItems, result.overview.totalQty, existingMaterialNames);
                      const duplicateGroups = groupDuplicateIndexes(result.bomItems);
                      return (
                        <>
                          <h5 className="text-sm font-semibold text-gray-700 mb-1">
                            2) 자재명세 ({result.bomItems.length}건 중 {result.bomItems.length - excluded.size}건 포함)
                          </h5>
                          <p className="text-xs text-gray-400 mb-1">AI가 읽은 값이므로 작업지시서 원본과 대조해 주세요 — 잘못된 행은 수정하거나 제외할 수 있습니다.</p>
                          <div className="overflow-x-auto max-h-96 overflow-y-auto">
                            <table className="border text-sm">
                              <thead className="bg-gray-100 sticky top-0"><tr><th className="border p-1">제외</th><th className="border p-1">구분</th><th className="border p-1">자재명</th><th className="border p-1">규격</th><th className="border p-1">소요량</th><th className="border p-1">공급사</th><th className="border p-1">비고</th><th className="border p-1">실/테이프 종류</th><th className="border p-1">확인 필요</th></tr></thead>
                              <tbody>
                                {result.bomItems.map((item, i) => {
                                  const candidate = item.materialSubTypeCandidate ?? null;
                                  const resolved = resolveMaterialSubTypeCandidate(candidate);
                                  const selectedValue = item.threadType ?? item.tapeType ?? '';
                                  const isExcluded = excluded.has(i);
                                  const isEdited = edited.has(i);
                                  const rowBadges = badges[i];
                                  const unknownName = findWarning(item.warnings, 'UNKNOWN_NAME');
                                  const yocheokMismatch = findWarning(item.warnings, 'YOCHEOK_QTY_MISMATCH');
                                  const duplicateWarning = findWarning(item.warnings, 'POSSIBLE_DUPLICATE');
                                  const supplierSplit = findWarning(item.warnings, 'SUPPLIER_NAME_SPLIT');
                                  const unknownSupplier = findWarning(item.warnings, 'UNKNOWN_SUPPLIER');
                                  const duplicateGroup = duplicateGroups.find((g) => g.includes(i));
                                  const hasServerWarning = (item.warnings ?? []).length > 0;
                                  return (
                                    <tr key={i} className={isExcluded ? 'opacity-40' : hasServerWarning ? 'bg-yellow-50' : undefined}>
                                      <td className="border p-1 text-center">
                                        <input
                                          type="checkbox"
                                          aria-label={`${index + 1}번째 항목 자재명세 ${i + 1}행 제외`}
                                          data-testid={`bom-exclude-${index}-${i}`}
                                          checked={isExcluded}
                                          onChange={() => toggleExcludeBomItem(index, i)}
                                        />
                                      </td>
                                      <td className="border p-1">
                                        <input
                                          className="border rounded px-1 py-0.5 w-16 text-xs"
                                          value={item.category ?? ''}
                                          disabled={isExcluded}
                                          onChange={(e) => updateBomItemField(index, i, 'category', e.target.value || null)}
                                        />
                                      </td>
                                      <td className="border p-1">
                                        <input
                                          className="border rounded px-1 py-0.5 w-28 text-xs"
                                          data-testid={`bom-item-name-${index}-${i}`}
                                          value={item.itemName}
                                          disabled={isExcluded}
                                          onChange={(e) => updateBomItemField(index, i, 'itemName', e.target.value)}
                                        />
                                        {isEdited && <span className="ml-1 text-[10px] text-blue-600 align-middle">수정됨</span>}
                                      </td>
                                      <td className="border p-1">
                                        <input
                                          className="border rounded px-1 py-0.5 w-16 text-xs"
                                          value={item.spec ?? ''}
                                          disabled={isExcluded}
                                          onChange={(e) => updateBomItemField(index, i, 'spec', e.target.value || null)}
                                        />
                                      </td>
                                      <td className="border p-1">
                                        <input
                                          type="number"
                                          step="any"
                                          className="border rounded px-1 py-0.5 w-16 text-xs text-right"
                                          data-testid={`bom-consumption-${index}-${i}`}
                                          value={item.consumption ?? ''}
                                          disabled={isExcluded}
                                          onChange={(e) => updateBomItemField(index, i, 'consumption', e.target.value === '' ? null : Number(e.target.value))}
                                        />
                                        {/* PR-200: 손글씨 숫자를 AI가 확신하지 못했을 때만(uncertain)
                                            후보 칩을 보여준다 — 클릭해야 값이 바뀐다. */}
                                        {item.uncertain && (item.consumptionCandidates ?? []).length > 0 && (
                                          <div className="mt-0.5 flex flex-wrap gap-1 justify-end" data-testid={`consumption-candidates-${index}-${i}`}>
                                            {(item.consumptionCandidates ?? []).map((c) => (
                                              <button
                                                key={c}
                                                type="button"
                                                onClick={() => updateBomItemField(index, i, 'consumption', c)}
                                                className="px-1 py-0.5 rounded bg-yellow-100 border border-yellow-300 text-[10px] hover:bg-yellow-200"
                                              >{c}</button>
                                            ))}
                                          </div>
                                        )}
                                      </td>
                                      <td className="border p-1">
                                        <input
                                          className="border rounded px-1 py-0.5 w-20 text-xs"
                                          data-testid={`bom-supplier-${index}-${i}`}
                                          value={item.supplier ?? ''}
                                          disabled={isExcluded}
                                          onChange={(e) => updateBomItemField(index, i, 'supplier', e.target.value || null)}
                                        />
                                        {/* PR-200: "공급사)자재명"을 서버가 분리했으면 후보로
                                            보여준다 — 적용해야 기존 공급사 칸에 복사된다. */}
                                        {supplierSplit && item.supplierName && item.supplierName !== item.supplier && (
                                          <div className="mt-0.5 bg-sky-50 border border-sky-200 rounded px-1 py-0.5 text-[10px] text-sky-800">
                                            원문: {item.rawItemName}
                                            <button
                                              type="button"
                                              onClick={() => updateBomItemField(index, i, 'supplier', item.supplierName ?? null)}
                                              className="ml-1 px-1 rounded bg-sky-600 text-white hover:bg-sky-700"
                                            >"{item.supplierName}" 적용</button>
                                          </div>
                                        )}
                                        {unknownSupplier && (
                                          <div className="mt-0.5 text-[10px] text-sky-700">{unknownSupplier.message}</div>
                                        )}
                                      </td>
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
                                          <option value="AMHOL">암홀 (100M/롤)</option>
                                        </select>
                                      </td>
                                      <td className="border p-1 text-xs space-y-0.5" data-testid={`bom-badges-${index}-${i}`}>
                                        {rowBadges.isNewMaterial && (
                                          <div className="bg-sky-50 border border-sky-200 text-sky-800 rounded px-1 py-0.5">자재 마스터에 없는 새 이름</div>
                                        )}
                                        {rowBadges.requiredQtyMismatch && (
                                          <div className="bg-orange-50 border border-orange-200 text-orange-800 rounded px-1 py-0.5">요척×수량이 작지의 출고량과 다름 — 확인해주세요</div>
                                        )}
                                        {rowBadges.duplicateLooking && (
                                          <div className="bg-purple-50 border border-purple-200 text-purple-800 rounded px-1 py-0.5">이름만 다르고 소요량이 같은 행입니다 — 작업지시서와 대조해 주세요</div>
                                        )}
                                        {/* PR-200: 서버 후처리 경고(UNKNOWN_NAME/요척 불일치/중복 묶음) —
                                            위 배지(PR-197)와 별도로 표시한다(둘 다 서로 다른 로직). */}
                                        {unknownName && (
                                          <div className="bg-sky-50 border border-sky-200 text-sky-800 rounded px-1 py-0.5">
                                            {unknownName.message}
                                            {(unknownName.suggestions ?? []).map((s) => (
                                              <button key={s} type="button" onClick={() => updateBomItemField(index, i, 'itemName', s)} className="ml-1 px-1 rounded bg-sky-600 text-white hover:bg-sky-700">{s}로 바꾸기</button>
                                            ))}
                                          </div>
                                        )}
                                        {/* PR-201c: "요척 N로" 제안 버튼을 없앴다 — 불일치 원인이
                                            요척 오독만이 아니라(총수량 오독·색상 행 분할·출고량
                                            칸에 벌 수가 들어간 경우 등) 여러 가지인데, 버튼은
                                            항상 요척만 바꿔 실제로는 맞는 요척을 틀리게 바꾸는
                                            사례가 운영에서 확인됐다. 경고 문구만 그대로 둔다. */}
                                        {yocheokMismatch && (
                                          <div className="bg-orange-50 border border-orange-200 text-orange-800 rounded px-1 py-0.5">
                                            {yocheokMismatch.message}
                                          </div>
                                        )}
                                        {duplicateWarning && duplicateGroup && (
                                          <div className="bg-purple-50 border border-purple-200 text-purple-800 rounded px-1 py-0.5" data-testid={`duplicate-group-${index}-${i}`}>
                                            {duplicateWarning.message}(행 {duplicateGroup.map((g) => g + 1).join(', ')})
                                            <button
                                              type="button"
                                              onClick={() => setExcludedBomIndexes((prev) => {
                                                const next = new Map(prev);
                                                next.set(index, applyKeepOnlyThisRow(duplicateGroup, i, next.get(index) ?? new Set()));
                                                return next;
                                              })}
                                              className="ml-1 px-1 rounded bg-purple-600 text-white hover:bg-purple-700"
                                            >이 행만 남기기</button>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })()}
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
