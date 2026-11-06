import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ShortageTable } from './StyleShortagePanel';
import type { MaterialRequirementRow } from '../utils/bomRequirementReport';

// PR-191: 발주 화면 "스타일번호로 필요 자재 찾기"에서 머리글이 한 칸씩 밀려 보이던
// 문제(체크박스 <td>는 각 행 맨 앞인데 "일괄" <th>는 맨 뒤) — ShortageTable은 비동기
// 의존이 없는 순수 표시 컴포넌트라 renderToStaticMarkup으로 직접 검증 가능하다.
const row = (overrides: Partial<MaterialRequirementRow> = {}): MaterialRequirementRow => ({
  itemId: 1,
  itemCode: 'MAT-1',
  itemName: '다데<실크>',
  categories: ['부자재'],
  colors: [],
  consumptionPerUnit: 1,
  requiredQty: 100,
  orderedQty: 0,
  unlinkedOrderedQty: 0,
  shortageQty: 100,
  lineCount: 1,
  ...overrides,
});

function headerLabels(html: string): string[] {
  const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  const thead = theadMatch?.[1] ?? '';
  return [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].trim());
}

function firstRowCellCount(html: string): number {
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  const tbody = tbodyMatch?.[1] ?? '';
  const firstRowMatch = tbody.match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
  const firstRow = firstRowMatch?.[1] ?? '';
  return [...firstRow.matchAll(/<td[^>]*>/g)].length;
}

describe('ShortageTable 머리글 정렬 (PR-191)', () => {
  it('onToggle이 없으면 머리글 개수와 데이터 행의 칸 수가 일치한다', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row()], onPick: vi.fn() }));
    const headers = headerLabels(html);
    expect(headers).toHaveLength(firstRowCellCount(html));
    expect(headers).toEqual(['자재', '카테고리', '필요 총수량', '발주(스타일 연결)', '발주(미연결, 참고)', '부족 수량', '발주']);
  });

  it('onToggle이 있으면 "선택" 머리글이 맨 앞에 오고, 체크박스 칸도 맨 앞이라 전체 개수가 일치한다', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row()], onPick: vi.fn(), onToggle: vi.fn(), selected: new Set<number>() }));
    const headers = headerLabels(html);
    expect(headers[0]).toBe('선택');
    expect(headers).toEqual(['선택', '자재', '카테고리', '필요 총수량', '발주(스타일 연결)', '발주(미연결, 참고)', '부족 수량', '발주']);
    expect(headers).toHaveLength(firstRowCellCount(html));
  });

  it('버튼 열 머리글이 빈 칸이 아니라 "발주"다(예전엔 빈 th)', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row()], onPick: vi.fn() }));
    expect(headerLabels(html).at(-1)).toBe('발주');
  });
});

describe('ShortageTable "다른 스타일 미입고 발주" 참고 안내 (PR-191)', () => {
  it('otherStylePendingCountByItem에 건수가 있으면 참고 문구가 뜨고 버튼이 아니다(수정하기 대상 아님)', () => {
    const html = renderToStaticMarkup(
      createElement(ShortageTable, {
        rows: [row()],
        onPick: vi.fn(),
        otherStylePendingCountByItem: new Map([[1, 2]]),
      }),
    );
    expect(html).toContain('참고: 다른 스타일 미입고 발주 2건 있음');
    expect(html).toContain('이 자재로 발주하기'); // 수정하기가 아니라 발주하기 버튼
    expect(html).not.toContain('>수정하기<');
  });

  it('현재 스타일에 연결된 미입고 발주가 있으면(editable) "수정하기" 버튼이 뜬다', () => {
    const order = { id: 1, itemId: 1, status: 'PENDING' as const, quantity: 10 };
    const html = renderToStaticMarkup(
      createElement(ShortageTable, {
        rows: [row()],
        onPick: vi.fn(),
        onEdit: vi.fn(),
        editable: new Map([[1, { order, pendingCount: 1 }]]),
      }),
    );
    expect(html).toContain('>수정하기<');
  });

  it('건수가 0이거나 없으면 참고 문구가 렌더되지 않는다', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row()], onPick: vi.fn() }));
    expect(html).not.toContain('참고: 다른 스타일 미입고 발주');
  });
});

// PR-219: [A] 부족자재 표의 단위 불일치 버그 완화 — conversionWarning만 있을 때(종류
// 미지정) 미터 필요량에서 콘 수를 그대로 빼지 않는다. suggestedPackaging이 있으면
// "참고" 콘/롤 수치를, 없으면 부족 칸에 "종류 확인 필요"를 보여준다.
describe('ShortageTable 단위 불일치 완화 (PR-219)', () => {
  it('conversionWarning만 있고 suggestedPackaging이 없으면 부족 칸에 숫자 대신 "종류 확인 필요"를 보여준다', () => {
    const html = renderToStaticMarkup(
      createElement(ShortageTable, {
        rows: [row({ requiredQty: 301270, orderedQty: 76, shortageQty: 301194, conversionWarning: '실/테이프 종류 미지정 — 선택해 주세요' })],
        onPick: vi.fn(),
      }),
    );
    expect(html).toContain('종류 확인 필요');
    expect(html).not.toContain('301,194'); // 미터-콘 뒤섞인 틀린 부족 수량이 보이면 안 됨
  });

  it('suggestedPackaging이 있으면 참고 콘/롤 수치를 보여주고(부족 0), 추천 종류/근거도 함께 보인다', () => {
    const html = renderToStaticMarkup(
      createElement(ShortageTable, {
        rows: [row({
          itemName: '오바사 60S/3H THREAD',
          requiredQty: 301270,
          orderedQty: 76,
          shortageQty: 301194,
          conversionWarning: '실/테이프 종류 미지정 — 선택해 주세요',
          suggestedPackaging: {
            packagingUnitLabel: '콘', unitLengthM: 4000, requiredPackages: 76, shortagePackages: 0,
            conversionFormula: '301,270m ÷ 4000m/콘 = 75.32 → 76콘',
            materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', reason: '오버로크·배색용 실',
          },
        })],
        onPick: vi.fn(),
      }),
    );
    expect(html).toContain('참고 0콘');
    expect(html).toContain('오바사·스쿠이사 추천');
    expect(html).not.toContain('301,194');
  });
});

// PR-220: 필요량이 작지 수량(sheetQty, 작업지시서 AI 인식)을 썼는지와, 작지 수량과
// 계산값(요척×기획수량)이 크게 다를 때의 확인 필요 표시.
describe('ShortageTable 작지 수량 출처/불일치 표시 (PR-220)', () => {
  it('basis가 "sheet"면 "작지 수량 기준" 배지가 보인다', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row({ basis: 'sheet' })], onPick: vi.fn() }));
    expect(html).toContain('작지 수량 기준');
  });

  it('basis가 "mixed"면 "일부 작지 수량 기준" 배지가 보인다', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row({ basis: 'mixed' })], onPick: vi.fn() }));
    expect(html).toContain('일부 작지 수량 기준');
  });

  it('basis가 "computed"면(기본) 아무 배지도 보이지 않는다(회귀 없음)', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row({ basis: 'computed' })], onPick: vi.fn() }));
    expect(html).not.toContain('작지 수량 기준');
  });

  it('mismatch:true면 작지 수량과 계산값을 함께 보여주는 확인 필요 문구가 뜬다', () => {
    const html = renderToStaticMarkup(
      createElement(ShortageTable, { rows: [row({ basis: 'sheet', mismatch: true, sheetQty: 1200, computedQty: 1518 })], onPick: vi.fn() }),
    );
    expect(html).toContain('확인이 필요합니다');
    expect(html).toContain('1,200');
    expect(html).toContain('1,518');
  });

  it('mismatch가 없으면(기본) 확인 필요 문구가 없다', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row({ basis: 'sheet' })], onPick: vi.fn() }));
    expect(html).not.toContain('확인이 필요합니다');
  });

  // PR-226 추가(사용자 확인 사실): 작지 값이 스타일 총수량과 정확히 같으면 출고량
  // 칸이 아니라 다른 칸(총수량 등)을 읽었을 가능성을 추가로 알린다.
  it('sheetQtyLooksLikeTotalQtyMisread:true면 "총수량과 같습니다" 안내가 함께 보인다', () => {
    const html = renderToStaticMarkup(
      createElement(ShortageTable, {
        rows: [row({ basis: 'computed', mismatch: true, sheetQty: 499, computedQty: 758.48, sheetQtyLooksLikeTotalQtyMisread: true })],
        onPick: vi.fn(),
      }),
    );
    expect(html).toContain('총수량과 같습니다');
  });

  it('sheetQtyLooksLikeTotalQtyMisread가 없으면(기본) 그 안내가 없다', () => {
    const html = renderToStaticMarkup(
      createElement(ShortageTable, { rows: [row({ basis: 'sheet', mismatch: true, sheetQty: 1200, computedQty: 1518 })], onPick: vi.fn() }),
    );
    expect(html).not.toContain('총수량과 같습니다');
  });
});

// PR-220b: 색상 있는 BOM 행에 작지 수량/색상×사이즈 수량표 근거가 전혀 없으면 숫자를
// 만들지 않는다(needsColorQty) — 필요/발주/부족 칸 모두 "색상별 수량 확인 필요"로 뜬다.
describe('ShortageTable needsColorQty 표시 (PR-220b)', () => {
  it('needsColorQty:true면 필요/발주/부족 칸이 모두 "색상별 수량 확인 필요"다', () => {
    const html = renderToStaticMarkup(
      createElement(ShortageTable, {
        rows: [row({ needsColorQty: true, basis: 'unknown', conversionWarning: '색상별 수량 확인 필요 — 작지 재업로드(수량 포함) 또는 MATERIAL LIST 재업로드로 색상×사이즈 수량을 채워 주세요' })],
        onPick: vi.fn(),
      }),
    );
    expect(html).toContain('색상별 수량 확인 필요');
    expect(html).toContain('작지 재업로드');
  });

  it('needsColorQty가 없으면(기본) "색상별 수량 확인 필요" 문구가 없다', () => {
    const html = renderToStaticMarkup(createElement(ShortageTable, { rows: [row()], onPick: vi.fn() }));
    expect(html).not.toContain('색상별 수량 확인 필요');
  });
});
