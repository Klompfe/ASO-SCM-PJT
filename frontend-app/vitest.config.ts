import { defineConfig } from 'vitest/config';

// PR-110: 엑셀 내보내기 유틸(순수 함수, DOM 불필요) 단위 테스트를 위한 최소 설정.
// 기존 vite.config.ts(dev 서버 proxy 등)는 건드리지 않고 별도 파일로 분리했다.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
