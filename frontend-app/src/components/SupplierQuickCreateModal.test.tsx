import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// PR-172: 이 프로젝트 테스트 환경은 jsdom/이벤트 시뮬레이션이 없어(renderToStaticMarkup만
// 사용) 클릭/제출 같은 상호작용은 자동화 테스트로 검증할 수 없다 — 여기서는 모달이
// PackingReceiptsModal과 동일한 오버레이 스타일로 필요한 필드/버튼을 전부 렌더하는지만
// 정적으로 확인한다. 실제 "발주 폼 상태 유지 + 공급업체 자동 채움" 플로우는 라이브
// 브라우저(Puppeteer)로 검증했다(완료 보고 참고).
vi.mock('../api/suppliers.service', () => ({ createSupplier: vi.fn() }));

import { SupplierQuickCreateModal } from './SupplierQuickCreateModal';

describe('SupplierQuickCreateModal (PR-172)', () => {
  it('PackingReceiptsModal과 동일한 오버레이 스타일로 등록 폼 전체(이름/업체약칭/사업자번호/연락처/이메일/주소/등록/취소)를 렌더한다', () => {
    const html = renderToStaticMarkup(
      createElement(SupplierQuickCreateModal, { onCreated: vi.fn(), onClose: vi.fn() }),
    );
    expect(html).toContain('fixed inset-0 bg-black bg-opacity-50');
    expect(html).toContain('새 공급업체 등록');
    expect(html).toContain('이름');
    expect(html).toContain('업체약칭');
    expect(html).toContain('사업자번호');
    expect(html).toContain('연락처');
    expect(html).toContain('이메일');
    expect(html).toContain('주소');
    expect(html).toContain('등록');
    expect(html).toContain('취소');
    // PR-171(주요품목)이 이 시점에 main에 병합되지 않아 포함하지 않는다.
    expect(html).not.toContain('주요품목');
  });
});
