import { calculateConePriceUsd } from './thread-cone-price.util';

// PR-175: 룩업 테이블(material-packaging-unit-rules)에서 가져온 맵을 그대로
// 넘긴다고 가정 — 실제 DB 조회는 MaterialPackagingUnitRulesService.findAllAsLengthMap()
// 쪽 테스트에서 다룬다. 여기서는 순수 계산 로직만 검증한다.
const LENGTH_MAP = {
  COA_SA: 2500,
  OBA_SA_SKU_I_SA: 4000,
  POLY_JINUIDO: 500,
  DADE: 50,
  AMHOL: 50,
};

describe('calculateConePriceUsd (PR-157, PR-175 DB 룩업 전환)', () => {
  it('코아사: 미터단가 $0.00012 × 2500M = $0.30 (기존 하드코딩 값과 동일 — 회귀 없음)', () => {
    expect(calculateConePriceUsd(0.00012, 'COA_SA', LENGTH_MAP)).toBeCloseTo(0.3, 10);
  });

  it('오바사/스쿠이사: 미터단가 $0.00012 × 4000M = $0.48 (기존 하드코딩 값과 동일 — 회귀 없음)', () => {
    expect(calculateConePriceUsd(0.00012, 'OBA_SA_SKU_I_SA', LENGTH_MAP)).toBeCloseTo(0.48, 10);
  });

  it('폴리지누이도: 미터단가 $0.00012 × 500M = $0.06 (기존 하드코딩 값과 동일 — 회귀 없음)', () => {
    expect(calculateConePriceUsd(0.00012, 'POLY_JINUIDO', LENGTH_MAP)).toBeCloseTo(0.06, 10);
  });

  it('다데(테이프, 50m/롤): 미터단가 $0.0008 × 50M = $0.04', () => {
    expect(calculateConePriceUsd(0.0008, 'DADE', LENGTH_MAP)).toBeCloseTo(0.04, 10);
  });

  it('암홀(테이프, 50m/롤): 미터단가 $0.01 × 50M = $0.5', () => {
    expect(calculateConePriceUsd(0.01, 'AMHOL', LENGTH_MAP)).toBeCloseTo(0.5, 10);
  });

  it('자재 서브타입이 없으면(null/undefined) 추측하지 않고 null을 반환한다', () => {
    expect(calculateConePriceUsd(0.00012, null, LENGTH_MAP)).toBeNull();
    expect(calculateConePriceUsd(0.00012, undefined, LENGTH_MAP)).toBeNull();
  });

  it('룩업 테이블에 없는 서브타입이면(DB에서 삭제된 규칙 등) 추측하지 않고 null을 반환한다', () => {
    expect(calculateConePriceUsd(0.00012, 'UNKNOWN_TYPE', LENGTH_MAP)).toBeNull();
  });
});
