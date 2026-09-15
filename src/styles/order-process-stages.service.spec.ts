import { computeOverallStatus } from './order-process-stages.service';

// PR-089: 발주·입고·출고 현황 보고서의 종합상태 계산 로직(poCreated/입고 N of M/exported
// 조합)을 스펙으로 검증한다. 서비스 전체를 인스턴스화할 필요 없는 순수 함수라 이 조합
// 판정 자체만 단위로 테스트한다.
describe('computeOverallStatus (PR-089)', () => {
  it('발주가 없으면(poCreated=false) 입고/출고 값과 무관하게 미발주다', () => {
    expect(computeOverallStatus(false, 0, 0, false)).toBe('미발주');
    expect(computeOverallStatus(false, 3, 3, true)).toBe('미발주');
  });

  it('발주는 있지만 일부만 입고되면(ready < total) 입고대기다', () => {
    expect(computeOverallStatus(true, 1, 3, false)).toBe('입고대기');
    expect(computeOverallStatus(true, 0, 3, false)).toBe('입고대기');
  });

  it('BOM 자재가 있는데 그 중 하나도 발주가 안 걸렸으면(total=0으로 판정 불가한 경우 제외) 입고대기다', () => {
    // poCreated=true인데 total=0인 경우는 실제로는 나오지 않지만(자재가 있어야 poCreated가
    // true가 될 수 있으므로), 방어적으로 total===0이면 입고대기로 처리되는지 확인한다.
    expect(computeOverallStatus(true, 0, 0, false)).toBe('입고대기');
  });

  it('전체 입고완료(ready === total)인데 아직 출고 전이면 출고대기다', () => {
    expect(computeOverallStatus(true, 3, 3, false)).toBe('출고대기');
  });

  it('전체 입고완료 + 출고(ExportShipmentLine 존재)까지 되면 완료다', () => {
    expect(computeOverallStatus(true, 3, 3, true)).toBe('완료');
  });
});
