import type { MasterStyle } from '../api/styles.service';

// PR-124: 수입통관 등록 폼의 스타일번호는 자유 입력이다. 입력값이 기존 MasterStyle과 정확히 일치하지 않으면 "신규 스타일"로
// 등록된다는 안내를 보여준다(제출은 막지 않는다). 스타일 목록은 입력 후 잠시 뒤(디바운스) 조회되므로, 그 입력값에 대한
// 조회가 끝나기 전에는 "신규"라고 단정하지 않는다(깜빡이는 오안내 방지).
export const effectiveStyleNo = (selected: string, typed: string): string => (selected || typed).trim();

export const isNewStyleNo = (
  selected: string,
  typed: string,
  styles: Pick<MasterStyle, 'styleNo'>[],
  loadedForQuery: string | null,
): boolean => {
  const value = effectiveStyleNo(selected, typed);
  if (!value) return false;
  if (selected && selected.trim() === value) return false; // 목록에서 고른 값은 기존 스타일
  if (loadedForQuery !== typed) return false; // 아직 이 입력값의 조회 결과가 없다
  return !styles.some((s) => s.styleNo === value);
};

// 등록 폼의 선적 정보 검증: ETA(도착예정일)는 ETD(출항일)보다 빠를 수 없다(둘 다 있을 때만).
export const validateVoyageDates = (etd: string, eta: string): string | null =>
  etd && eta && eta < etd ? 'ETA(도착예정일)는 ETD(출항일)보다 빠를 수 없습니다.' : null;

export const dayOnly = (v?: string | null): string => (v ? String(v).slice(0, 10) : '');
