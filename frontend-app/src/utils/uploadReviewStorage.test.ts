import { describe, it, expect, beforeEach } from 'vitest';
import { saveUploadReview, loadUploadReview, clearUploadReview, hasPendingUploadReviewWork, type StoredUploadReview } from './uploadReviewStorage';

// 이 프로젝트의 vitest 환경은 'node'(jsdom 없음) — sessionStorage가 전역에 없을 수 있어
// 간단한 메모리 폴리필로 대체해 저장/복원/삭제 동작을 검증한다(try/catch 경로 자체는
// "보관소 접근 불가" 테스트에서 폴리필을 깨뜨려 따로 확인한다).
function installFakeSessionStorage() {
  const store = new Map<string, string>();
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  return store;
}

const sampleState: StoredUploadReview = {
  styles: [{ sheetName: 'Sheet1', styleNo: 'SYN-STYLE-001', matchStatus: null }],
  existsMap: { 'SYN-STYLE-001': false },
  failuresBySheet: {},
};

describe('uploadReviewStorage (PR-237)', () => {
  beforeEach(() => {
    installFakeSessionStorage();
  });

  it('저장한 뒤 그대로 복원된다', () => {
    const res = saveUploadReview(sampleState);
    expect(res.saved).toBe(true);
    expect(loadUploadReview()).toEqual(sampleState);
  });

  it('저장된 것이 없으면 null', () => {
    expect(loadUploadReview()).toBeNull();
  });

  it('삭제하면 더 이상 복원되지 않는다', () => {
    saveUploadReview(sampleState);
    clearUploadReview();
    expect(loadUploadReview()).toBeNull();
  });

  it('너무 크면(용량 초과) 저장하지 않고 안내 문구를 돌려준다', () => {
    const huge: StoredUploadReview = { ...sampleState, styles: Array.from({ length: 200000 }, (_, i) => ({ sheetName: `S${i}`, matchStatus: null })) };
    const res = saveUploadReview(huge);
    expect(res.saved).toBe(false);
    expect(res.reason).toContain('임시로 보관');
    expect(loadUploadReview()).toBeNull();
  });

  it('보관소 접근 자체가 안 되면(프라이빗 모드 등) 저장이 조용히 실패로 처리되고 예외가 새지 않는다', () => {
    (globalThis as any).sessionStorage = {
      getItem: () => { throw new Error('access denied'); },
      setItem: () => { throw new Error('access denied'); },
      removeItem: () => { throw new Error('access denied'); },
    };
    expect(() => saveUploadReview(sampleState)).not.toThrow();
    expect(saveUploadReview(sampleState).saved).toBe(false);
    expect(() => loadUploadReview()).not.toThrow();
    expect(loadUploadReview()).toBeNull();
    expect(() => clearUploadReview()).not.toThrow();
  });

  it('sessionStorage 자체가 전역에 없어도(지원하지 않는 환경) 예외가 새지 않는다', () => {
    delete (globalThis as any).sessionStorage;
    expect(() => saveUploadReview(sampleState)).not.toThrow();
    expect(saveUploadReview(sampleState).saved).toBe(false);
    expect(loadUploadReview()).toBeNull();
  });

  it('깨진 JSON이 들어있으면 복원 대신 null(앱이 죽지 않음)', () => {
    (globalThis as any).sessionStorage.setItem('materialUploadReview:v1', '{이것은 JSON이 아님');
    expect(loadUploadReview()).toBeNull();
  });

  it('hasPendingUploadReviewWork — 저장된 스타일이 있으면 true, 없거나 비어 있으면 false', () => {
    expect(hasPendingUploadReviewWork()).toBe(false);
    saveUploadReview(sampleState);
    expect(hasPendingUploadReviewWork()).toBe(true);
    saveUploadReview({ ...sampleState, styles: [] });
    expect(hasPendingUploadReviewWork()).toBe(false);
  });
});
