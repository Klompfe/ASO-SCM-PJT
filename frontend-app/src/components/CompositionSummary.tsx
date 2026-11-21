import { formatCompositionSummary, type CompositionSummary as Summary, type OuterFabricStatus } from '../utils/compositionReview';

// PR-255: 겉감 혼용률 상태 표시 — 완제품 재수입 시 세율 기준이 되므로 다른 원단류보다 강하게(빨간색) 경고한다.
// 저장·진행은 막지 않는다(버튼은 "겉감 행 추가"뿐, 저장 버튼을 건드리지 않는다).
export function OuterFabricNotice({ status, testIdSuffix, onAddOuterRow }: { status: OuterFabricStatus; testIdSuffix: string | number; onAddOuterRow?: () => void }) {
  if (status.kind === 'filled') {
    return (
      <div className="mb-1 bg-gray-50 border-2 border-gray-400 rounded px-2 py-1 font-semibold text-gray-900" data-testid={`outer-fabric-filled-${testIdSuffix}`}>
        겉감 혼용률: {status.values.join(' / ')}
      </div>
    );
  }
  if (status.kind === 'blank') {
    return (
      <div className="mb-1 bg-red-50 border border-red-400 rounded px-2 py-1 text-red-700 font-semibold text-xs" data-testid={`outer-fabric-blank-${testIdSuffix}`}>
        ⚠ 겉감 혼용률이 비어 있습니다 — 완제품 재수입 세율 기준이 되는 값입니다(저장은 가능합니다)
      </div>
    );
  }
  return (
    <div className="mb-1 bg-red-50 border border-red-400 rounded px-2 py-1 text-red-700 font-semibold text-xs" data-testid={`outer-fabric-norow-${testIdSuffix}`}>
      ⚠ 겉감 행이 없습니다 — 완제품 재수입 세율 기준이 되는 겉감 혼용률을 담을 행이 없습니다(저장은 가능합니다).
      {onAddOuterRow ? (
        <button type="button" data-testid={`outer-fabric-add-${testIdSuffix}`} className="ml-2 px-2 py-0.5 rounded border border-red-400 bg-white text-red-700" onClick={onAddOuterRow}>
          겉감 행 추가
        </button>
      ) : (
        <span className="ml-1 font-normal">자재·BOM 조회에서 겉감 행을 추가해 주세요.</span>
      )}
    </div>
  );
}

// PR-246: 오더개요 영역의 혼용률 요약(읽기 전용). 자재 행에 입력된 혼용률을 중복 제거해 모아 보여 주고,
// 원단류 행 중 비어 있는 행이 있으면 노란 경고만 띄운다 — 저장·진행은 막지 않는다.
export function CompositionSummary({ summary, testIdSuffix, onAddOuterRow }: { summary: Summary; testIdSuffix: string | number; onAddOuterRow?: () => void }) {
  const text = formatCompositionSummary(summary);
  return (
    <div className="mt-2 text-sm" data-testid={`composition-summary-${testIdSuffix}`}>
      <OuterFabricNotice status={summary.outer} testIdSuffix={testIdSuffix} onAddOuterRow={onAddOuterRow} />
      {text ? (
        <div className="bg-gray-50 border rounded px-2 py-1">
          <span className="font-medium text-gray-700">혼용률: </span>
          <span data-testid={`composition-summary-text-${testIdSuffix}`}>{text}</span>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-300 rounded px-2 py-1 text-yellow-800" data-testid={`composition-summary-empty-${testIdSuffix}`}>
          혼용률 미기재(저장 후 자재·BOM 조회에서도 입력할 수 있습니다)
        </div>
      )}
      {summary.missingRows > 0 && (
        <div className="mt-1 bg-yellow-50 border border-yellow-300 rounded px-2 py-1 text-yellow-800 text-xs" data-testid={`composition-missing-warning-${testIdSuffix}`}>
          ⚠ 혼용률 미기재 {summary.missingRows}행 — 저장은 가능합니다. 수입 서류·HS코드 조회에 필요하니 가능하면 아래 자재명세 표에서 입력해 주세요.
        </div>
      )}
    </div>
  );
}

// PR-248: 매핑 미리보기용 "혼용률 미기재" 안내(경고만) — 원단류 행 중 비어 있는 행 수. 저장·승인을 막지 않는다.
export function CompositionMissingNotice({ missingRows }: { missingRows: number }) {
  if (missingRows <= 0) return null;
  return (
    <div className="mb-2 bg-yellow-50 border border-yellow-300 rounded px-2 py-1 text-yellow-800 text-xs" data-testid="composition-missing-notice">
      ⚠ 혼용률 미기재 {missingRows}행 — 저장 후에도 자재·BOM 조회에서 입력할 수 있습니다
    </div>
  );
}
