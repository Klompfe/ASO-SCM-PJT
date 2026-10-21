import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { clampPage, pageMismatchNotice } from '../utils/visionGuardrails';

// PR-200: 작지 분석 검토 화면에서 AI가 읽은 값과 원본 페이지를 나란히 대조할 수 있게
// 한다 — 지금까지 발견된 오독(스타일번호 끝 글자, 손글씨 숫자 등)은 전부 "화질이 아니라
// 대조할 원본이 없어서" 놓친 것이었다(PR-200 배경). pdfjs-dist는 브라우저에서만
// 렌더링하므로 Node 쪽 canvas optionalDependency는 쓰지 않는다(package.json 참고).
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// PR-200b: 작게/보통/크게 — 기본은 보통. 좁은 화면(1024px 미만, 모달 본문의 lg: 분기와
// 동일 기준)에서는 표가 완전히 안 가려지게 40vh를 넘지 않게 캡한다.
const HEIGHT_PRESETS = { small: 25, normal: 40, large: 60 } as const;
type HeightPreset = keyof typeof HEIGHT_PRESETS;
const NARROW_MAX_VH = 40;
const NARROW_MEDIA_QUERY = '(max-width: 1023px)';

interface Props {
  file: File | null;
  // 1-based. 모드 A 관례상 results[index]는 업로드한 PDF의 (index+1)번째 쪽과 1:1
  // 대응한다(vision.service.ts 프롬프트 — "각 페이지마다 하나의 결과 항목을 배열로").
  // AI가 페이지를 건너뛰거나 겹쳐 읽었을 수 있어 아래 +/- 버튼으로 옆 쪽도 바로 볼 수
  // 있게 한다(자동 보정 없음 — 사람이 직접 눌러 맞는 쪽을 찾는다).
  page: number;
  // PR-200b: AI 결과 총 건수 — PDF 실제 쪽수와 다르면 쪽 번호가 안 맞을 수 있다는
  // 안내를 보여주는 데 쓴다(이미지 업로드면 pageCount를 몰라 안내하지 않음).
  resultCount: number;
}

export const OriginalPagePreview: React.FC<Props> = ({ file, page, resultCount }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [pageOffset, setPageOffset] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [heightPreset, setHeightPreset] = useState<HeightPreset>('normal');
  const [isNarrow, setIsNarrow] = useState(false);

  const isPdf = file?.type === 'application/pdf';
  const requestedPage = clampPage(page + pageOffset, pageCount);

  useEffect(() => setPageOffset(0), [page, file]);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_MEDIA_QUERY);
    setIsNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!file || isPdf) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isPdf]);

  useEffect(() => {
    if (!file || !isPdf) return;
    let cancelled = false;
    let doc: pdfjsLib.PDFDocumentProxy | null = null;
    setError(null);
    (async () => {
      try {
        const data = await file.arrayBuffer();
        doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        const clamped = clampPage(requestedPage, doc.numPages);
        const pdfPage = await doc.getPage(clamped);
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      } catch {
        if (!cancelled) setError('원본 페이지를 불러오지 못했습니다 — 파일이 손상됐거나 지원하지 않는 형식일 수 있습니다.');
      }
    })();
    return () => {
      cancelled = true;
      void doc?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestedPage는 pageCount 보정을 거치므로 page/pageOffset/pageCount 변화에 맞춰 재계산된다.
  }, [file, isPdf, page, pageOffset, pageCount, scale]);

  if (!file) return null;

  const effectiveVh = isNarrow ? Math.min(HEIGHT_PRESETS[heightPreset], NARROW_MAX_VH) : HEIGHT_PRESETS[heightPreset];
  const notice = isPdf ? pageMismatchNotice(resultCount, pageCount) : null;

  return (
    // PR-200b: 표를 스크롤해도 패널이 화면 위쪽에 붙어 있게 sticky — 가장 가까운 스크롤
    // 조상은 SalesOrderUploadModal의 "p-6 overflow-y-auto flex-1 min-h-0" 본문 영역이고,
    // 이 패널이 들어가는 결과 카드 자체는 overflow를 안 걸어 둬서(기본 visible) sticky가
    // 그 스크롤 영역 기준으로 동작한다(부모가 overflow:hidden을 걸면 sticky가 안 먹는데,
    // 이 구조에는 그런 조상이 없음을 확인했다).
    <div className="border rounded p-2 bg-gray-50 sticky top-0 z-10 shadow-sm" data-testid="original-page-preview">
      <div className="flex items-center justify-between mb-1 text-xs text-gray-500 flex-wrap gap-1">
        <span>
          원본{isPdf && pageCount ? ` (${requestedPage}/${pageCount}쪽)` : ''}
        </span>
        <div className="flex gap-1">
          {isPdf && (
            <>
              <button type="button" onClick={() => setPageOffset((o) => o - 1)} className="px-1.5 border rounded" aria-label="이전 쪽">◀</button>
              <button type="button" onClick={() => setPageOffset((o) => o + 1)} className="px-1.5 border rounded" aria-label="다음 쪽">▶</button>
            </>
          )}
          <button type="button" onClick={() => setScale((s) => Math.max(0.5, s - 0.25))} className="px-1.5 border rounded" aria-label="축소">－</button>
          <button type="button" onClick={() => setScale(1)} className="px-1.5 border rounded">100%</button>
          <button type="button" onClick={() => setScale((s) => Math.min(3, s + 0.25))} className="px-1.5 border rounded" aria-label="확대">＋</button>
        </div>
      </div>
      <div className="flex gap-1 mb-1 text-xs">
        <span className="text-gray-400">높이:</span>
        {(Object.keys(HEIGHT_PRESETS) as HeightPreset[]).map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setHeightPreset(preset)}
            aria-pressed={heightPreset === preset}
            className={`px-1.5 border rounded ${heightPreset === preset ? 'bg-gray-700 text-white' : ''}`}
          >
            {preset === 'small' ? '작게' : preset === 'normal' ? '보통' : '크게'}
          </button>
        ))}
      </div>
      {notice && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 mb-1" data-testid="page-mismatch-notice">{notice}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="overflow-auto border bg-white" style={{ maxHeight: `${effectiveVh}vh` }}>
        {isPdf
          ? <canvas ref={canvasRef} />
          : (imageUrl && <img src={imageUrl} alt="원본 작업지시서" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }} />)}
      </div>
    </div>
  );
};
