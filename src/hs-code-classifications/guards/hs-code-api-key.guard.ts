import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

// PR-081: /hs-code-classifications/lookup, /by-style/:styleNo는 이 프로젝트 밖의
// Python 수입통관 이메일 에이전트가 호출한다 — 로그인 사용자가 아니라 서버 대
// 서버 호출이라 JWT 대신 API 키로 인증한다(@Public()으로 전역 JwtAuthGuard를
// 우회한 라우트에만 이 가드를 대신 씌운다, jwt-auth.guard.ts 스타일 참고).
// 요청 헤더 x-api-key 값이 환경변수 HS_CODE_LOOKUP_API_KEY와 정확히 일치해야
// 통과한다.
@Injectable()
export class HsCodeApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(HsCodeApiKeyGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedKey = this.configService.get<string>('HS_CODE_LOOKUP_API_KEY');
    if (!expectedKey) {
      // 운영자가 키를 설정하지 않은 채 배포하면 아무 키로나(또는 키 없이) 뚫리는
      // 사고를 막기 위해, 미설정 상태에서는 요청 자체를 실패시킨다(조용히
      // 허용하지 않음).
      this.logger.error('HS_CODE_LOOKUP_API_KEY 환경변수가 설정되지 않았습니다.');
      throw new InternalServerErrorException('HS코드 조회 API가 아직 설정되지 않았습니다.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];

    if (!providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException('유효하지 않은 API 키입니다.');
    }

    return true;
  }
}
