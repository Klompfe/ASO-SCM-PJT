import * as XLSX from 'xlsx';
import { findWriteAnchor, writeCellSafe, insertRows, deleteRows } from './safe-write.util';

const cell = (v: string | number): XLSX.CellObject => ({
  v,
  t: typeof v === 'number' ? 'n' : 's',
});

describe('findWriteAnchor / writeCellSafe (MLA-003)', () => {
  it('병합이 아닌 셀은 그 셀 자신이 대표 셀이다', () => {
    expect(findWriteAnchor([], 3, 2)).toEqual({ r: 3, c: 2 });
  });

  it('병합 범위 안의 셀은 좌상단(대표) 셀 좌표를 돌려준다', () => {
    const merges = [{ s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }];
    expect(findWriteAnchor(merges, 3, 0)).toEqual({ r: 2, c: 0 });
    expect(findWriteAnchor(merges, 2, 0)).toEqual({ r: 2, c: 0 });
  });

  it('병합되지 않은 일반 셀은 해제 없이 그 주소에 그대로 값을 쓴다', () => {
    const sheet: XLSX.WorkSheet = {};
    writeCellSafe(sheet, 0, 0, '겉감');
    expect(sheet['A1']?.v).toBe('겉감');
  });

  it('병합 범위의 대표(좌상단) 셀에 쓰면 그 주소에 값이 들어간다', () => {
    const sheet: XLSX.WorkSheet = { '!merges': [{ s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }] };
    writeCellSafe(sheet, 2, 0, '심지');
    expect(sheet['A3']?.v).toBe('심지'); // row 2(0-based) = A3
  });

  it('병합 범위의 비대표 셀에 쓰면 병합을 풀지 않고 대표 셀로 리다이렉트된다(비대표 주소에는 값이 생기지 않는다)', () => {
    const sheet: XLSX.WorkSheet = { '!merges': [{ s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }] };
    writeCellSafe(sheet, 3, 0, '요척 12'); // 0-based row 3 = A4, 병합의 아래쪽 행
    expect(sheet['A4']).toBeUndefined();
    expect(sheet['A3']?.v).toBe('요척 12'); // 대표 셀(A3)에 대신 쓰임
  });

  it('기존 셀 스타일(.s)은 값만 바꿔도 보존된다', () => {
    const sheet: XLSX.WorkSheet = { A1: { v: 'old', t: 's', s: { font: { sz: 16 } } } as any };
    writeCellSafe(sheet, 0, 0, 'new');
    expect((sheet['A1'] as any).s).toEqual({ font: { sz: 16 } });
    expect(sheet['A1']?.v).toBe('new');
  });

  it('기존에 수식이 있던 셀에 리터럴 값을 쓰면 더 이상 유효하지 않은 수식(.f)은 지운다', () => {
    const sheet: XLSX.WorkSheet = { A1: { v: 10, t: 'n', f: 'B1*2' } };
    writeCellSafe(sheet, 0, 0, 5);
    expect(sheet['A1']?.f).toBeUndefined();
    expect(sheet['A1']?.v).toBe(5);
  });
});

describe('insertRows (MLA-003)', () => {
  it('지정한 행부터 기존 데이터가 그만큼 아래로 밀려난다', () => {
    const sheet: XLSX.WorkSheet = {
      A1: cell('헤더'),
      A2: cell('항목1'),
      A3: cell('항목2'),
    };
    insertRows(sheet, 1, 1); // row index 1(=A2) 앞에 1행 삽입
    expect(sheet['A1']?.v).toBe('헤더'); // 삽입 지점 이전은 그대로
    expect(sheet['A2']).toBeUndefined(); // 새로 생긴 빈 행
    expect(sheet['A3']?.v).toBe('항목1'); // 한 칸 아래로 이동
    expect(sheet['A4']?.v).toBe('항목2');
  });

  it('삽입 지점보다 완전히 위에 있는 병합은 영향받지 않는다', () => {
    const sheet: XLSX.WorkSheet = { '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }] };
    insertRows(sheet, 5, 2);
    expect(sheet['!merges']).toEqual([{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]);
  });

  it('삽입 지점과 같거나 그 아래에 있는 병합은 행 수만큼 그대로 이동한다', () => {
    const sheet: XLSX.WorkSheet = { '!merges': [{ s: { r: 5, c: 0 }, e: { r: 6, c: 0 } }] };
    insertRows(sheet, 3, 2);
    expect(sheet['!merges']).toEqual([{ s: { r: 7, c: 0 }, e: { r: 8, c: 0 } }]);
  });

  it('삽입 지점이 병합 범위 내부에 걸치면 새 행을 포함하도록 늘어난다', () => {
    const sheet: XLSX.WorkSheet = { '!merges': [{ s: { r: 2, c: 0 }, e: { r: 4, c: 0 } }] };
    insertRows(sheet, 3, 2); // 병합(2~4) 내부인 3행 앞에 2행 삽입
    expect(sheet['!merges']).toEqual([{ s: { r: 2, c: 0 }, e: { r: 6, c: 0 } }]);
  });

  it('같은 행을 참조하는 수식은 이동한 행 번호로 재정렬된다', () => {
    // row index 4(=행 5)에 있는 셀의 수식이 같은 행(K5*B5)을 참조
    const sheet: XLSX.WorkSheet = {
      R5: { v: 0, t: 'n', f: 'K5*B5' } as any,
    };
    insertRows(sheet, 1, 1); // row index 4 -> 5 (행 번호 5 -> 6)
    const moved = sheet['R6'] as XLSX.CellObject;
    expect(moved.f).toBe('K6*B6');
  });

  it('다른 행을 참조하는 수식은 건드리지 않는다(같은 행 수식만 대상)', () => {
    const sheet: XLSX.WorkSheet = {
      R5: { v: 0, t: 'n', f: 'SUM(K1:K4)' } as any,
    };
    insertRows(sheet, 1, 1);
    const moved = sheet['R6'] as XLSX.CellObject;
    expect(moved.f).toBe('SUM(K1:K4)');
  });

  it('!rows(행 높이)도 삽입 지점에 맞춰 밀려나고 새 행은 기본 높이(undefined)로 들어간다', () => {
    const sheet: XLSX.WorkSheet = { '!rows': [{ hpx: 20 }, { hpx: 30 }] as any };
    insertRows(sheet, 1, 1);
    expect(sheet['!rows']).toEqual([{ hpx: 20 }, undefined, { hpx: 30 }]);
  });

  it('!ref 범위가 삽입한 행 수만큼 늘어난다', () => {
    const sheet: XLSX.WorkSheet = { '!ref': 'A1:B3' };
    insertRows(sheet, 1, 2);
    expect(sheet['!ref']).toBe('A1:B5');
  });
});

describe('deleteRows (MLA-003)', () => {
  it('지정한 행 구간의 데이터가 제거되고 아래 행이 위로 당겨진다', () => {
    const sheet: XLSX.WorkSheet = {
      A1: cell('헤더'),
      A2: cell('삭제될 항목'),
      A3: cell('항목2'),
    };
    deleteRows(sheet, 1, 1); // row index 1(=A2) 삭제
    expect(sheet['A1']?.v).toBe('헤더');
    expect(sheet['A2']?.v).toBe('항목2'); // 한 칸 위로 당겨짐
    expect(sheet['A3']).toBeUndefined();
  });

  it('삭제 구간보다 완전히 위에 있는 병합은 영향받지 않는다', () => {
    const sheet: XLSX.WorkSheet = { '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }] };
    deleteRows(sheet, 5, 2);
    expect(sheet['!merges']).toEqual([{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]);
  });

  it('삭제 구간보다 완전히 아래에 있는 병합은 행 수만큼 위로 당겨진다', () => {
    const sheet: XLSX.WorkSheet = { '!merges': [{ s: { r: 8, c: 0 }, e: { r: 9, c: 0 } }] };
    deleteRows(sheet, 3, 2);
    expect(sheet['!merges']).toEqual([{ s: { r: 6, c: 0 }, e: { r: 7, c: 0 } }]);
  });

  it('삭제 구간에 완전히 포함된 병합은 소멸한다', () => {
    const sheet: XLSX.WorkSheet = { '!merges': [{ s: { r: 3, c: 0 }, e: { r: 4, c: 0 } }] };
    deleteRows(sheet, 2, 4); // 2~5행 삭제, 병합(3~4)은 그 안에 완전히 포함
    expect(sheet['!merges']).toEqual([]);
  });

  it('삭제 구간과 부분적으로 겹치는 병합은 겹치는 만큼 줄어든다', () => {
    // 병합이 2~6행, 삭제가 4~7행 — 겹치는 아래쪽이 잘려나가 2~3행만 남는다
    const sheet: XLSX.WorkSheet = { '!merges': [{ s: { r: 2, c: 0 }, e: { r: 6, c: 0 } }] };
    deleteRows(sheet, 4, 4);
    expect(sheet['!merges']).toEqual([{ s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }]);
  });

  it('같은 행을 참조하는 수식은 당겨진 행 번호로 재정렬된다', () => {
    const sheet: XLSX.WorkSheet = {
      R5: { v: 0, t: 'n', f: 'K5*B5' } as any, // row index 4
    };
    deleteRows(sheet, 1, 1); // row index 4 -> 3 (행 번호 5 -> 4)
    const moved = sheet['R4'] as XLSX.CellObject;
    expect(moved.f).toBe('K4*B4');
  });

  it('!rows(행 높이)도 삭제 구간만큼 제거된다', () => {
    const sheet: XLSX.WorkSheet = { '!rows': [{ hpx: 10 }, { hpx: 20 }, { hpx: 30 }] as any };
    deleteRows(sheet, 1, 1);
    expect(sheet['!rows']).toEqual([{ hpx: 10 }, { hpx: 30 }]);
  });

  it('!ref 범위가 삭제한 행 수만큼 줄어든다', () => {
    const sheet: XLSX.WorkSheet = { '!ref': 'A1:B5' };
    deleteRows(sheet, 1, 2);
    expect(sheet['!ref']).toBe('A1:B3');
  });
});
