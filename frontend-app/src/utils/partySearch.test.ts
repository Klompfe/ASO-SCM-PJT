import { describe, it, expect } from 'vitest';
import {
  normalizeSearchText, filterByText, buyerSearchFields, supplierSearchFields,
  formatResultCount, findDuplicateName, NO_RESULT_MESSAGE,
} from './partySearch';
import type { Buyer } from '../api/buyers.service';
import type { Supplier } from '../api/suppliers.service';

// PR-245: 고객사·공급업체 목록 텍스트 조회. 합성 데이터만 사용한다.
const buyers: Buyer[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  code: `TY-BYR${i + 1}-260${i}`,
  name: i === 0 ? '합성 Alpha 고객사' : `합성고객사${i + 1}`,
  contactPerson: i === 1 ? '김합성' : null,
  contactPhone: i === 2 ? '010-0000-0003' : null,
  email: i === 3 ? 'Contact@Synthetic.Test' : undefined,
  country: i === 4 ? 'Vietnam' : null,
  address: i === 5 ? '합성시 가상구 1번지' : undefined,
  brandCode: i === 6 ? 'BRANDX' : null,
}));

const search = (q: string) => filterByText(buyers, q, buyerSearchFields).map((b) => b.id);

describe('[재현] 고객사 목록 10건에서 이름 일부로 좁히기 (PR-245)', () => {
  it('이름 일부로 좁힌다', () => {
    expect(search('Alpha')).toEqual([1]);
    expect(search('고객사3')).toEqual([3]);
  });
});

describe('normalizeSearchText', () => {
  it('앞뒤 공백 제거, 대소문자 무시, 연속 공백은 하나로', () => {
    expect(normalizeSearchText('  Hello   World \t X ')).toBe('hello world x');
    expect(normalizeSearchText(null)).toBe('');
    expect(normalizeSearchText(undefined)).toBe('');
  });
});

describe('filterByText', () => {
  it('빈 검색어(공백만 포함)는 전체 목록을 그대로 돌려준다', () => {
    expect(filterByText(buyers, '', buyerSearchFields)).toBe(buyers);
    expect(filterByText(buyers, '   ', buyerSearchFields)).toBe(buyers);
  });

  it('부분 일치 · 대소문자 무시 · 앞뒤/연속 공백 무시', () => {
    expect(search('  alpha  ')).toEqual([1]);
    expect(search('합성   alpha')).toEqual([1]); // 검색어의 연속 공백, 이름은 단일 공백
    expect(search('ALPHA 고객')).toEqual([1]);
  });

  it('이름이 아닌 필드도 검색된다: 코드·담당자·연락처·이메일·국가·주소·약칭', () => {
    expect(search('ty-byr2')).toEqual([2]);
    expect(search('김합성')).toEqual([2]);
    expect(search('0000-0003')).toEqual([3]);
    expect(search('contact@synthetic')).toEqual([4]);
    expect(search('vietnam')).toEqual([5]);
    expect(search('가상구')).toEqual([6]);
    expect(search('brandx')).toEqual([7]);
  });

  it('한글 부분 일치와 결과 없음', () => {
    expect(search('합성고객사').length).toBe(9); // 첫 번째만 "합성 Alpha 고객사"
    expect(search('없는검색어')).toEqual([]);
  });

  it('원래 순서(정렬)를 유지한다', () => {
    expect(search('합성고객사')).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('공급업체 검색 필드·품목군 AND', () => {
  const suppliers: Supplier[] = [
    { id: 1, code: 'TY-AAA-2601', name: '합성원단사', abbrCode: 'AAA', businessNumber: '123-45-67890', contactPhone: '02-111-2222', email: 'a@x.test', address: '가상시', categories: [{ id: 1, name: '겉감' }] },
    { id: 2, code: 'TY-BBB-2602', name: '합성부자재사', abbrCode: 'BBB', categories: [{ id: 2, name: '부자재' }] },
    { id: 3, code: 'TY-CCC-2603', name: '합성본사', abbrCode: 'CCC', categories: [] },
  ];
  const find = (q: string) => filterByText(suppliers, q, supplierSearchFields).map((s) => s.id);

  it('이름·코드·약칭·사업자번호·연락처·이메일·주소·취급 품목군 이름', () => {
    expect(find('원단')).toEqual([1]);
    expect(find('ty-bbb')).toEqual([2]);
    expect(find('ccc')).toEqual([3]);
    expect(find('123-45')).toEqual([1]);
    expect(find('02-111')).toEqual([1]);
    expect(find('A@X.TEST')).toEqual([1]);
    expect(find('가상시')).toEqual([1]);
    expect(find('부자재')).toEqual([2]); // 이름과 품목군 모두 일치해도 한 번만
  });

  it('서버가 품목군으로 좁힌 목록에 텍스트 검색을 적용하면 AND 가 된다', () => {
    const categoryFiltered = suppliers.filter((s) => s.categories?.some((c) => c.id === 1 || c.id === 2));
    expect(filterByText(categoryFiltered, '합성', supplierSearchFields).map((s) => s.id)).toEqual([1, 2]);
    expect(filterByText(categoryFiltered, '본사', supplierSearchFields)).toEqual([]);
  });
});

describe('formatResultCount / 0건 안내', () => {
  it('검색어가 없으면 "전체 N건", 있으면 "전체 N건 중 M건"', () => {
    expect(formatResultCount(10, 10, '')).toBe('전체 10건');
    expect(formatResultCount(10, 3, 'abc')).toBe('전체 10건 중 3건');
    expect(formatResultCount(10, 10, '   ')).toBe('전체 10건');
  });

  it('0건 안내 문구', () => {
    expect(NO_RESULT_MESSAGE).toBe('검색 결과가 없습니다. 검색어를 지우면 전체 목록이 보입니다');
  });
});

describe('findDuplicateName (등록 폼 중복 안내)', () => {
  const items = [{ id: 1, name: '합성 본사' }, { id: 2, name: 'Alpha Corp' }];

  it('공백·대소문자만 다른 같은 이름은 중복으로 본다', () => {
    expect(findDuplicateName('  합성   본사 ', items)?.id).toBe(1);
    expect(findDuplicateName('alpha corp', items)?.id).toBe(2);
  });

  it('부분 일치는 중복이 아니다 / 빈 이름은 중복 아님', () => {
    expect(findDuplicateName('합성', items)).toBeNull();
    expect(findDuplicateName('', items)).toBeNull();
    expect(findDuplicateName('   ', items)).toBeNull();
  });

  it('수정 중인 항목 자신은 제외할 수 있다', () => {
    expect(findDuplicateName('합성 본사', items, 1)).toBeNull();
  });
});
