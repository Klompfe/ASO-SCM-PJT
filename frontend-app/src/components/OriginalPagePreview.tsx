import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// PR-200: 작지 분석 검토 화면에서 AI가 읽은 값과 원본 페이지를 나란히 대조할 수 있게
// 한다 — 지금까지 발견된 오독(스타일번호 끝 글자, 손글씨 숫자 등)은 전부 "화질이 아니라
// 대조할 원본이 없어서" 놓친 것이었다(PR-200 배경). pdfjs-dist는 브라우저에서만
// 렌더링하므로 Node 쪽 canvas optionalDependency는 쓰지 않는다(package.json 참고).
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  file: File | null;
  // 1-based. 모드 A 관례상 results[index]는 업로드한 PDF의 (index+1)번째 쪽과 1:1
  // 대응한다(vision.service.ts 프롬프트 — "각 페이지마다 하나의 결과 항목을 배열로").
  // AI가 페이지를 건너뛰거나 겹쳐 읽었을 수 있어 아래 +/- 버튼으로 옆 쪽도 바로 볼 수
  // 있게 한다(자동 보정 없음 — 사람이 직접 눌러 맞는 쪽을 찾는다).
  page: number;
}

export const OriginalPagePreview: React.FC<Props> = ({ file, page }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [pageOffset, setPageOffset] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const isPdf = file?.type === 'application/pdf';
  const requestedPage = page + pageOffset;

  useEffect(() => setPageOffset(0), [page, file]);

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
        const clamped = Math.min(Math.max(1, requestedPage), doc.numPages);
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
  }, [file, isPdf, requestedPage, scale]);

  if (!file) return null;

  return (
    <div className="border rounded p-2 bg-gray-50" data-testid="original-page-preview">
      <div className="flex items-center justify-between mb-1 text-xs text-gray-500 flex-wrap gap-1">
        <span>
          원본{isPdf && pageCount ? ` (${Math.min(requestedPage, pageCount)}/${pageCount}쪽)` : ''}
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
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="overflow-auto max-h-[70vh] border bg-white">
        {isPdf
          ? <canvas ref={canvasRef} />
          : (imageUrl && <img src={imageUrl} alt="원본 작업지시서" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }} />)}
      </div>
    </div>
  );
};
