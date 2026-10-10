import { shouldSynchronizePostgres, RemoteSynchronizeError } from './should-synchronize-postgres.util';

// FIX-1: Postgres synchronize는 이제 NODE_ENV가 아니라 DB_SYNCHRONIZE(명시적 옵트인) +
// DB_HOST(로컬 Postgres만 허용)로만 켜진다. 원격 호스트에서 옵트인하면 서버가 뜨지
// 않도록 에러를 던진다(조용히 synchronize가 꺼지는 것도, 조용히 켜지는 것도 막는다).
describe('shouldSynchronizePostgres (FIX-1)', () => {
  it('DB_SYNCHRONIZE가 없거나 "true"가 아니면 호스트와 무관하게 꺼진다', () => {
    expect(shouldSynchronizePostgres({ dbHost: 'localhost' })).toBe(false);
    expect(shouldSynchronizePostgres({ dbSynchronize: 'false', dbHost: 'localhost' })).toBe(false);
    expect(shouldSynchronizePostgres({ dbSynchronize: '1', dbHost: 'localhost' })).toBe(false);
    expect(shouldSynchronizePostgres({ dbSynchronize: undefined, dbHost: 'ep-soft-sound-b3lvd0oe.neon.tech' })).toBe(false);
  });

  it('DB_SYNCHRONIZE=true + 로컬 호스트(localhost/127.0.0.1/postgres)면 켜진다', () => {
    expect(shouldSynchronizePostgres({ dbSynchronize: 'true', dbHost: 'localhost' })).toBe(true);
    expect(shouldSynchronizePostgres({ dbSynchronize: 'true', dbHost: '127.0.0.1' })).toBe(true);
    expect(shouldSynchronizePostgres({ dbSynchronize: 'true', dbHost: 'postgres' })).toBe(true); // docker-compose 서비스명
  });

  it('호스트 대소문자/공백은 무시한다', () => {
    expect(shouldSynchronizePostgres({ dbSynchronize: 'true', dbHost: ' LocalHost ' })).toBe(true);
  });

  it('DB_SYNCHRONIZE=true인데 원격 호스트면 에러를 던진다(조용히 넘어가지 않음)', () => {
    expect(() => shouldSynchronizePostgres({ dbSynchronize: 'true', dbHost: 'ep-soft-sound-b3lvd0oe.neon.tech' })).toThrow(RemoteSynchronizeError);
    expect(() => shouldSynchronizePostgres({ dbSynchronize: 'true', dbHost: 'ep-divine-scene-b3mhdu6u.neon.tech' })).toThrow('원격 DB에서는 synchronize를 켤 수 없습니다. 마이그레이션을 사용하세요.');
  });

  it('DB_SYNCHRONIZE=true인데 DB_HOST가 비어 있으면(설정 누락) 원격으로 간주해 에러를 던진다', () => {
    expect(() => shouldSynchronizePostgres({ dbSynchronize: 'true' })).toThrow(RemoteSynchronizeError);
    expect(() => shouldSynchronizePostgres({ dbSynchronize: 'true', dbHost: '' })).toThrow(RemoteSynchronizeError);
  });
});
