import { calculateConePriceUsd, THREAD_CONE_LENGTH_M } from './thread-cone-price.util';
import { ThreadType } from '../entities/bom-item.entity';

describe('calculateConePriceUsd (PR-157)', () => {
  it('코아사: 미터단가 $0.00012 × 2500M = $0.30', () => {
    expect(calculateConePriceUsd(0.00012, ThreadType.COA_SA)).toBeCloseTo(0.3, 10);
  });

  it('오바사/스쿠이사: 미터단가 $0.00012 × 4000M = $0.48', () => {
    expect(calculateConePriceUsd(0.00012, ThreadType.OBA_SA_SKU_I_SA)).toBeCloseTo(0.48, 10);
  });

  it('폴리지누이도: 미터단가 $0.00012 × 500M = $0.06', () => {
    expect(calculateConePriceUsd(0.00012, ThreadType.POLY_JINUIDO)).toBeCloseTo(0.06, 10);
  });

  it('실 종류가 없으면(null/undefined) 추측하지 않고 null을 반환한다', () => {
    expect(calculateConePriceUsd(0.00012, null)).toBeNull();
    expect(calculateConePriceUsd(0.00012, undefined)).toBeNull();
  });

  it('콘길이 상수가 사용자 확인 자료와 정확히 일치한다', () => {
    expect(THREAD_CONE_LENGTH_M[ThreadType.COA_SA]).toBe(2500);
    expect(THREAD_CONE_LENGTH_M[ThreadType.OBA_SA_SKU_I_SA]).toBe(4000);
    expect(THREAD_CONE_LENGTH_M[ThreadType.POLY_JINUIDO]).toBe(500);
  });
});
