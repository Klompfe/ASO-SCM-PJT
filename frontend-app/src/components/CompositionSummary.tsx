import { formatCompositionSummary, type CompositionSummary as Summary } from '../utils/compositionReview';

// PR-246: 오더개요 영역의 혼용률 요약(읽기 전용). 자재 행에 입력된 혼용률을 중복 제거해 모아 보여 주고,
// 원단류 행 중 비어 있는 행이 있으면 노란 경고만 띄운다 — 저장·진행은 막지 않는다.
export function CompositionSummary({ summary, testIdSuffix }: { summary: Summary; testIdSuffix: string | number }) {
  const text = formatCompositionSummary(summary);
  return (
    <div className="mt-2 text-sm" data-testid={`composition-summary-${testIdSuffix}`}>
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
