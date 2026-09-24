import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController();
  const originalEnv = process.env.RENDER_GIT_COMMIT;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = originalEnv;
  });

  it('RENDER_GIT_COMMIT이 있으면 commit 필드에 그대로 담는다', () => {
    process.env.RENDER_GIT_COMMIT = 'abc1234';
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.commit).toBe('abc1234');
    expect(typeof result.deployedAt).toBe('string');
    expect(new Date(result.deployedAt).toString()).not.toBe('Invalid Date');
  });

  it('RENDER_GIT_COMMIT이 없으면 commit은 unknown이다', () => {
    delete process.env.RENDER_GIT_COMMIT;
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.commit).toBe('unknown');
  });
});
