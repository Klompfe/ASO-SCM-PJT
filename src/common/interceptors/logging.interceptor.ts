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
        this.logger.log(
          `[RESPONSE] ${method} ${url} ${Date.now() - now}ms - Data size: ${
            JSON.stringify(data).length
          } chars`,
        );
      }),
    );
  }
}
