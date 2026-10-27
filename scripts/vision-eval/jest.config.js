// PR-199: 하네스 자체 단위 테스트용 jest 설정 — 저장소 루트 jest.config.js(rootDir:
// 'src')와 분리해 둔다. 그래야 기존 `npm test`는 전혀 건드리지 않고(scripts/ 디렉터리는
// rootDir 'src' 밖이라 원래도 수집되지 않음) 회귀 없음이 자동으로 보장된다.
module.exports = {
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
};
