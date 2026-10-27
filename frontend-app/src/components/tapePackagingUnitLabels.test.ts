import { describe, expect, it } from 'vitest';
// Vite의 ?raw 접미사로 파일을 문자열로 그대로 불러온다(vite/client 타입에 선언돼 있음).
import salesOrderUploadModalSrc from './SalesOrderUploadModal.tsx?raw';
import itemsManagerSrc from './ItemsManager.tsx?raw';

// PR-202: 암홀테이프 포장단위는 100M/롤, 다데테이프는 50M/롤이다(사용자 확정값).
// 드롭다운 선택지가 SalesOrderUploadModal.tsx·ItemsManager.tsx 두 곳에 각각
// 하드코딩돼 있어(공용 상수로 합치지 않음 — PR-201 지시서의 "최소 변경" 원칙)
// jsdom 없이도 회귀를 잡을 수 있게 소스 텍스트를 Vite의 `?raw` 임포트로 직접
// 확인한다(이 코드베이스는 jsdom/testing-library가 없어 이 드롭다운은 결과 상태가
// 있어야 렌더되는 영역이라 renderToStaticMarkup으로도 도달할 수 없다 —
// SalesOrderUploadModal.test.tsx 주석 참고).
describe('테이프 포장단위 드롭다운 문구 (PR-202)', () => {
  it.each([
    ['SalesOrderUploadModal.tsx', salesOrderUploadModalSrc],
    ['ItemsManager.tsx', itemsManagerSrc],
  ])('%s — 암홀은 100M/롤, 다데는 50M/롤로 표시된다', (_name, src: string) => {
    expect(src).toContain('<option value="AMHOL">암홀 (100M/롤)</option>');
    expect(src).toContain('<option value="DADE">다데 (50M/롤)</option>');
    expect(src).not.toContain('암홀 (50M/롤)');
  });
});
