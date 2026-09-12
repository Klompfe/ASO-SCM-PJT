import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, body, query } = request;
    const now = Date.now();

    this.logger.log(
      `[REQUEST] ${method} ${url} - Body: ${JSON.stringify(body)} Query: ${JSON.stringify(query)}`,
    );

    return next.handle().pipe(
      tap((data) => {
        // data가 undefined인 경우(void를 반환하는 컨트롤러, 예: DELETE) JSON.stringify(undefined)는
        // 문자열이 아닌 undefined 값을 반환하므로 .length 접근 시 TypeError가 발생한다 — 방어적으로 처리한다.
        const size = data === undefined ? 0 : JSON.stringify(data).length;
        this.logger.log(
          `[RESPONSE] ${method} ${url} ${Date.now() - now}ms - Data size: ${size} chars`,
        );
      }),
    );
  }
}
