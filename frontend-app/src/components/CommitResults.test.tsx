import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';

vi.mock('../api/mapping.service', () => ({ commitMapping: vi.fn() }));

import { BulkApproveResult, CommitResultPanel, NoticeList } from './CommitResultPanel';
import { MappingPreviewModalView } from './MappingPreviewModal';
import type { CommitNotice } from '../utils/commitNotices';

const factory: CommitNotice = { type: 'NEEDS_REVIEW', code: 'FACTORY_MISMATCH', message: "기존 factory 값 '베트남' → 새 값 '삼정' — 자동 반영하지 않음, 확인 후 수동 변경 필요" };
const diff: CommitNotice = { type: 'NEEDS_REVIEW', code: 'BOM_ITEM_VALUE_DIFF', message: '원단(BK/56) 기존 값(요척 1.47, 소요량 1029) → 새 값(요척 1.6, 소요량 1120) — 자동 반영하지 않음, 확인 후 수동 변경 필요' };
const lining: CommitNotice = { type: 'AUTO_APPLIED', code: 'LINING_COMPOSITION_DEFAULT', message: "안감 항목 '안감원단' 혼용률 미기재 — 기본값 POLYESTER 100% 자동 적용" };

const findAll = (node: ReactNode, pred: (el: ReactElement<any>) => boolean, out: ReactElement<any>[] = []): ReactElement<any>[] => {
  if (Array.isArray(node)) { node.forEach((n) => findAll(n, pred, out)); return out; }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement<any>;
  if (pred(el)) out.push(el);
  findAll(el.props?.children, pred, out);
  return out;
};
const textOf = (node: ReactNode): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf((node as ReactElement<any>).props?.children);
};

describe('알림 목록 표시 (PR-132)', () => {
  it('자동 반영 안 됨(NEEDS_REVIEW)은 노란색 경고, 자동 적용됨(AUTO_APPLIED)은 파란색 정보로 구분된다', () => {
    const html = renderToStaticMarkup(createElement(NoticeList, { notices: [factory, diff, lining] }));
    expect(html).toContain('data-testid="notices-needs-review"');
    expect(html).toContain('bg-yellow-50');
    expect(html).toContain('자동 반영되지 않았습니다 — 확인 후 수동으로 수정하세요 (2건)');
    expect(html).toContain('data-testid="notices-auto-applied"');
    expect(html).toContain('bg-blue-50');
    expect(html).toContain('자동 적용되었습니다 (참고용, 1건)');
    // 각 알림의 종류 배지와 서버 메시지 그대로
    expect(html).toContain('공장 불일치');
    expect(html).toContain('요척/필요량 차이');
    expect(html).toContain('혼용률 기본값 적용');
    expect(html).toContain('요척 1.47, 소요량 1029');
    expect(html).toContain('POLYESTER 100%');
  });

  it('확인 필요 항목이 없으면 노란 경고 상자가 없다(정보성만 → 파란 정보만)', () => {
    const html = renderToStaticMarkup(createElement(NoticeList, { notices: [lining] }));
    expect(html).not.toContain('notices-needs-review');
    expect(html).toContain('notices-auto-applied');
  });

  it('정보성 안내가 없으면 파란 정보 상자가 없다', () => {
    const html = renderToStaticMarkup(createElement(NoticeList, { notices: [factory] }));
    expect(html).toContain('notices-needs-review');
    expect(html).not.toContain('notices-auto-applied');
  });

  it('알림이 없으면 아무 상자도 그리지 않는다', () => {
    const html = renderToStaticMarkup(createElement(NoticeList, { notices: [] }));
    expect(html).not.toContain('notices-');
  });
});

describe('개별 승인 결과 패널 (PR-132)', () => {
  it('warnings 없음: "저장되었습니다. 자동 반영 안 된 항목이 없습니다."', () => {
    const html = renderToStaticMarkup(createElement(CommitResultPanel, { styleNo: 'MB62SLM103Z', notices: [] }));
    expect(html).toContain('MB62SLM103Z');
    expect(html).toContain('저장되었습니다. 자동 반영 안 된 항목이 없습니다.');
    expect(html).not.toContain('notices-');
  });

  it('warnings 있음: 확인 필요 건수 안내 + 유형별 목록', () => {
    const html = renderToStaticMarkup(createElement(CommitResultPanel, { styleNo: 'MB62SLM103Z', notices: [factory, lining] }));
    expect(html).toContain('자동 반영되지 않은 항목이 1건 있습니다');
    expect(html).toContain('notices-needs-review');
    expect(html).toContain('notices-auto-applied');
  });
});

describe('승인 모달 — 결과 확인 전에는 닫히지 않는다 (PR-132)', () => {
  const baseProps = () => ({
    data: { styleNo: 'MB62SLM103Z' },
    alreadyExists: true,
    styleOverview: { factory: '베트남', totalQty: 700, buyer: 'B', shipDate: '' },
    bomItems: [{ category: '겉감', itemName: '원단', consumption: 1, requiredQty: 10 }],
    saving: false,
    result: null as any,
    error: null as string | null,
    onCommit: vi.fn(),
    onClose: vi.fn(),
    onConfirm: vi.fn(),
  });
  const buttons = (props: any) => findAll(MappingPreviewModalView(props) as ReactElement, (e) => e.type === "button");

  it('승인 전: "닫기"와 재승인 버튼이 있고 결과 영역은 없다', () => {
    const props = baseProps();
    const labels = buttons(props).map(textOf);
    expect(labels).toEqual(['닫기', '재승인(병합)']);
    const html = renderToStaticMarkup(createElement(MappingPreviewModalView, props));
    expect(html).not.toContain('commit-result-section');
    expect(html).toContain('reapprove-notice');
  });

  it('승인 후: "확인" 버튼 하나만 남는다(닫기/재승인 버튼 없음) — 경고를 놓치고 닫을 수 없다', () => {
    const props = { ...baseProps(), result: { styleNo: 'MB62SLM103Z', notices: [factory, diff, lining] } };
    expect(buttons(props).map(textOf)).toEqual(['확인']);
    const html = renderToStaticMarkup(createElement(MappingPreviewModalView, props));
    expect(html).toContain('commit-result-section');
    expect(html).toContain('notices-needs-review');
    expect(html).toContain('notices-auto-applied');
    expect(html).not.toContain('reapprove-notice'); // 결과를 보여주는 동안 승인 전 경고는 숨긴다
    expect(html).not.toContain('저장 성공!'); // 예전 alert 문구
  });

  it('"확인"을 눌러야만 onConfirm(=모달 닫기)이 불리고, onClose는 결과 화면에 연결된 버튼이 없다', () => {
    const props = { ...baseProps(), result: { styleNo: 'MB62SLM103Z', notices: [] } };
    const [confirm] = buttons(props);
    expect(props.onConfirm).not.toHaveBeenCalled();
    confirm.props.onClick();
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('알림이 없는 승인 결과도 "확인"으로 닫는다: 자동 반영 안 된 항목이 없다는 안내', () => {
    const props = { ...baseProps(), alreadyExists: false, result: { styleNo: 'MB62SLM103Z', notices: [] } };
    const html = renderToStaticMarkup(createElement(MappingPreviewModalView, props));
    expect(html).toContain('저장되었습니다. 자동 반영 안 된 항목이 없습니다.');
    expect(buttons(props).map(textOf)).toEqual(['확인']);
  });

  it('저장 실패: 오류를 모달 안에 보여주고(alert 아님) 승인 버튼은 그대로 있어 다시 시도할 수 있다', () => {
    const props = { ...baseProps(), error: '저장에 실패했습니다.' };
    const html = renderToStaticMarkup(createElement(MappingPreviewModalView, props));
    expect(html).toContain('data-testid="commit-error"');
    expect(html).toContain('저장에 실패했습니다.');
    expect(buttons(props).map(textOf)).toEqual(['닫기', '재승인(병합)']);
  });
});

describe('일괄승인 결과 요약 (PR-132)', () => {
  const results = [
    { styleNo: 'S-CLEAN', notices: [] as CommitNotice[] },
    { styleNo: 'S-AUTO', notices: [lining] },
    { styleNo: 'S-REVIEW', notices: [factory, diff] },
  ];
  const html = renderToStaticMarkup(createElement(BulkApproveResult, { results, skipped: 2, onDismiss: vi.fn() }));

  it('스타일 수와 확인이 필요한 스타일 수를 요약한다', () => {
    expect(html).toContain('3개 스타일 승인 완료, 그중 1개 스타일에 확인이 필요한 차이 있음');
    expect(html).toContain('1개 스타일에 자동 적용 안내(참고용)가 있습니다.');
    expect(html).toContain('2개는 파싱 실패/이미 등록되어 일괄 승인에서 제외되었습니다');
  });

  it('스타일별로 "확인 필요 N건 / 자동 적용 N건 / 차이 없음" 배지가 있고 클릭해 펼치는 상세(details)가 있다', () => {
    expect(html).toContain('data-testid="bulk-style-S-REVIEW"');
    expect(html).toContain('확인 필요 2건');
    expect(html).toContain('자동 적용 1건');
    expect(html).toContain('차이 없음');
    expect((html.match(/<details/g) ?? []).length).toBe(3);
    expect((html.match(/<summary/g) ?? []).length).toBe(3);
    // 상세 안에 스타일별 알림 내용
    expect(html).toContain('요척 1.47, 소요량 1029');
    expect(html).toContain('POLYESTER 100%');
  });

  it('확인이 필요한 스타일이 목록 맨 위', () => {
    expect(html.indexOf('S-REVIEW')).toBeLessThan(html.indexOf('S-AUTO'));
    expect(html.indexOf('S-AUTO')).toBeLessThan(html.indexOf('S-CLEAN'));
  });

  it('차이가 하나도 없으면 초록 톤과 "확인이 필요한 차이는 없습니다"', () => {
    const clean = renderToStaticMarkup(createElement(BulkApproveResult, { results: [{ styleNo: 'A', notices: [] }, { styleNo: 'B', notices: [lining] }] }));
    expect(clean).toContain('2개 스타일 승인 완료, 확인이 필요한 차이는 없습니다.');
    expect(clean).toContain('bg-green-50');
    expect(clean).not.toContain('bg-yellow-50');
  });
});
