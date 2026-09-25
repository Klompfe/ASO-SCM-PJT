import { of, throwError } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditAction } from './entities/audit-log.entity';

describe('AuditLogInterceptor (PR-151)', () => {
  let interceptor: AuditLogInterceptor;
  const reflector = { get: jest.fn() };
  const dataSource = { query: jest.fn() };
  const auditLogRepository = { create: jest.fn((v: any) => v), save: jest.fn().mockResolvedValue(undefined) };

  const buildContext = (method: string, params: Record<string, string>, user?: { userId: number }, ip = '127.0.0.1'): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ method, params, user, ip, headers: {} }) }),
      getHandler: () => ({}),
    }) as unknown as ExecutionContext;

  const handlerReturning = (value: unknown): CallHandler => ({ handle: () => of(value) });

  beforeEach(() => {
    jest.clearAllMocks();
    auditLogRepository.save.mockResolvedValue(undefined);
    interceptor = new AuditLogInterceptor(
      reflector as unknown as Reflector,
      dataSource as any,
      auditLogRepository as any,
    );
  });

  const runAndWait = async (context: ExecutionContext, handler: CallHandler) =>
    interceptor.intercept(context, handler).toPromise();

  it('메타데이터가 없는 라우트는 그냥 통과하고 아무것도 저장하지 않는다', async () => {
    reflector.get.mockReturnValue(undefined);
    const context = buildContext('POST', {}, { userId: 1 });
    const result = await runAndWait(context, handlerReturning({ id: 1 }));
    expect(result).toEqual({ id: 1 });
    expect(auditLogRepository.save).not.toHaveBeenCalled();
  });

  it('POST는 CREATE로, DELETE는 DELETE로, PATCH는 UPDATE로 기록한다', async () => {
    reflector.get.mockReturnValue({ entityType: 'X' });
    for (const [method, action] of [['POST', AuditAction.CREATE], ['PATCH', AuditAction.UPDATE], ['DELETE', AuditAction.DELETE]] as const) {
      await runAndWait(buildContext(method, { id: '1' }, { userId: 1 }), handlerReturning({ id: 1 }));
    }
    expect(auditLogRepository.create.mock.calls.map(([c]: any) => c.action)).toEqual([AuditAction.CREATE, AuditAction.UPDATE, AuditAction.DELETE]);
  });

  it('table/pkColumn이 지정돼 있으면 처리 전 DB 값을 조회해 beforeValue로 남긴다', async () => {
    reflector.get.mockReturnValue({ entityType: 'MasterStyle', table: 'master_style', pkColumn: 'styleNo' });
    dataSource.query.mockResolvedValue([{ styleNo: 'MB62SLM103Z', factory: '베트남' }]);
    await runAndWait(buildContext('DELETE', { styleNo: 'MB62SLM103Z' }, { userId: 7 }), handlerReturning({ message: '삭제됨' }));

    expect(dataSource.query).toHaveBeenCalledWith(
      'SELECT * FROM "master_style" WHERE "styleNo" = $1',
      ['MB62SLM103Z'],
    );
    const saved = auditLogRepository.create.mock.calls[0][0];
    expect(saved.beforeValue).toEqual({ styleNo: 'MB62SLM103Z', factory: '베트남' });
    expect(saved.entityId).toBe('MB62SLM103Z');
    expect(saved.userId).toBe(7);
  });

  it('table/pkColumn이 없으면 DB 조회 없이 beforeValue는 null이다', async () => {
    reflector.get.mockReturnValue({ entityType: 'Contract(bulkApprove)' });
    await runAndWait(buildContext('PATCH', {}, { userId: 1 }), handlerReturning({ approvedCount: 3 }));

    expect(dataSource.query).not.toHaveBeenCalled();
    const saved = auditLogRepository.create.mock.calls[0][0];
    expect(saved.beforeValue).toBeNull();
    expect(saved.entityId).toBeNull();
  });

  it('DB 조회 전(before) 조회가 실패해도 요청 자체는 계속 처리되고 beforeValue만 null이 된다', async () => {
    reflector.get.mockReturnValue({ entityType: 'X', table: 't', pkColumn: 'id' });
    dataSource.query.mockRejectedValue(new Error('DB down'));
    const result = await runAndWait(buildContext('DELETE', { id: '1' }, { userId: 1 }), handlerReturning({ ok: true }));

    expect(result).toEqual({ ok: true }); // 실제 요청은 정상 처리됨
    const saved = auditLogRepository.create.mock.calls[0][0];
    expect(saved.beforeValue).toBeNull();
  });

  it('응답/조회 결과에서 password 같은 민감 필드는 제거하고 저장한다', async () => {
    reflector.get.mockReturnValue({ entityType: 'User', table: 'users', pkColumn: 'id' });
    dataSource.query.mockResolvedValue([{ id: 1, username: 'a', password: 'hashed-before' }]);
    await runAndWait(
      buildContext('PATCH', { id: '1' }, { userId: 9 }),
      handlerReturning({ id: 1, username: 'a', password: 'hashed-after' }),
    );

    const saved = auditLogRepository.create.mock.calls[0][0];
    expect(saved.beforeValue).not.toHaveProperty('password');
    expect(saved.afterValue).not.toHaveProperty('password');
  });

  it('감사 로그 저장 자체가 실패해도 실제 응답에는 영향을 주지 않는다', async () => {
    reflector.get.mockReturnValue({ entityType: 'X' });
    auditLogRepository.save.mockRejectedValue(new Error('insert failed'));
    const result = await runAndWait(buildContext('POST', {}, { userId: 1 }), handlerReturning({ id: 5 }));
    expect(result).toEqual({ id: 5 });
  });

  it('핸들러 자체가 실패하면 그 에러가 그대로 전파된다(감사 로그가 에러를 삼키지 않음)', async () => {
    reflector.get.mockReturnValue({ entityType: 'X' });
    const failingHandler: CallHandler = { handle: () => throwError(() => new Error('handler failed')) };
    await expect(interceptor.intercept(buildContext('POST', {}, { userId: 1 }), failingHandler).toPromise()).rejects.toThrow('handler failed');
  });
});
