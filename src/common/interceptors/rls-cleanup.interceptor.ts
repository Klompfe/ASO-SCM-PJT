import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { QueryRunner } from 'typeorm';

@Injectable()
export class RlsCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      finalize(async () => {
        const queryRunner = request['rlsQueryRunner'] as QueryRunner;
        if (queryRunner && !queryRunner.isReleased) {
          try {
            await queryRunner.release();
          } catch (err) {
            // Log silent error on connection release failure
            console.error('Failed to release RLS QueryRunner connection:', err);
          }
        }
      }),
    );
  }
}