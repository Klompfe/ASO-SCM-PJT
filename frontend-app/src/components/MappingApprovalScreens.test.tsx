import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('../api/mapping.service', () => ({ commitMapping: vi.fn(), parseMappingFile: vi.fn(), checkStyleExists: vi.fn() }));

import { MappingPreviewModal } from './MappingPreviewModal';
import { StyleReviewList } from './StyleReviewList';

const data = {
  styleNo: 'MB62SLM103Z',
  overview: { factory: '베트남', totalQty: 700, buyer: '미도컴퍼니', shipDate: '2026-01-16' },
  bomItems: [{ category: '겉감', itemName: '겉감 OUT-SHELL', consumption: 1.47, requiredQty: 1029 }],
};
const modal = (alreadyExists: boolean) =>
  renderToStaticMarkup(createElement(MappingPreviewModal, { isOpen: true, onClose: vi.fn(), data, alreadyExists, onRefresh: vi.fn() }));

describe('스타일 미리보기 모달 — 이미 등록됨 경고/버튼 (PR-130)', () => {
  it('이미 등록된 스타일: 병합 동작을 설명하는 새 경고와 "재승인(병합)" 버튼', () => {
    const html = modal(true);
    expect(html).toContain('data-testid="reapprove-notice"');
    expect(html).toContain('이 Style No는 이미 등록되어 있습니다. 재승인하면 기존 데이터에 &quot;병합&quot;됩니다');
    expect(html).toContain('새로 나온 자재만 추가됩니다');
    expect(html).toContain('요척/필요량이 이번 파일과 다르면 자동으로 바뀌지 않습니다');
    expect(html).toContain('>재승인(병합)</button>');
    expect(html).toContain('이미 등록됨'); // 배지는 그대로
  });

  it('예전 문구와 "덮어쓰기" 버튼 라벨은 더 이상 나오지 않는다', () => {
    const html = modal(true);
    expect(html).not.toContain('덮어쓰기');
    expect(html).not.toContain('추가로 쌓이며');
  });

  it('신규 스타일: 경고 없이 "저장 및 승인" 버튼', () => {
    const html = modal(false);
    expect(html).not.toContain('reapprove-notice');
    expect(html).not.toContain('이미 등록됨');
    expect(html).toContain('>저장 및 승인</button>');
    expect(html).not.toContain('재승인');
  });
});

describe('업로드된 스타일 목록 배지 (PR-130)', () => {
  const styles: any[] = [
    { sheetName: 'S1', styleNo: 'NEW-1', overview: {}, bomItems: [] },
    { sheetName: 'S2', styleNo: 'EXIST-1', overview: {}, bomItems: [] },
    { sheetName: 'S3', styleNo: 'BAD-1', parseError: '형식 오류' },
  ];
  const html = renderToStaticMarkup(createElement(StyleReviewList, { styles, existsMap: { 'NEW-1': false, 'EXIST-1': true }, onSelect: vi.fn() }));

  it('정상 시트는 "확인 대기", 이미 등록된 시트는 "확인 대기"와 "이미 등록됨", 파싱 실패는 "파싱 실패"', () => {
    expect((html.match(/확인 대기/g) ?? []).length).toBe(2); // NEW-1, EXIST-1
    expect((html.match(/이미 등록됨/g) ?? []).length).toBe(1); // EXIST-1만
    expect((html.match(/파싱 실패/g) ?? []).length).toBe(1);
  });
});
