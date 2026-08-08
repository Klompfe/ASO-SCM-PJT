import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class RlsSessionGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.headers['x-tenant-id'] as string;
    const userId = request.headers['x-user-id'] as string;

    if (!tenantId || !userId) {
      throw new UnauthorizedException(
        'Missing required security session headers: x-tenant-id and x-user-id are required.',
      );
    }

    // Attach user context to request object for downstream usage
    request.user = { tenantId, userId };

    try {
      // Inject session variables into PostgreSQL session for Row-Level Security (RLS)
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      // Escape values safely against SQL injection
      await queryRunner.query(
        `SET LOCAL app.current_tenant_id = ${queryRunner.connection.driver.escape(tenantId)};`,
      );
      await queryRunner.query(
        `SET LOCAL app.current_user_id = ${queryRunner.connection.driver.escape(userId)};`,
      );

      // Store queryRunner in request object for cleanup interceptor
      request['rlsQueryRunner'] = queryRunner;
      return true;
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to establish RLS database session context: ${(error as Error).message}`,
      );
    }
  }
}