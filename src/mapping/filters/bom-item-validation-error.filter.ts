import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';
import { Request, Response } from 'express';

// PR-236(사용자 보고): class-validator의 기본 영문 오류("bomItems.13.colorOf must be
// a string")가 일괄 승인 토스트에 그대로 노출됐다. 이 필터는 /mapping/commit 라우트
// (@UseFilters로 그 메서드에만 적용, 전역 아님)에서 class-validator가 만든 "bomItems.N.필드명 ..."
// 형태의 메시지만 한국어(행 번호 1부터, 항목명 한글)로 바꾼다. 이 패턴과 무관한
// BadRequestException(예: styleNo 필수 등)은 손대지 않고 AllExceptionsFilter와 같은
// 응답 모양으로 그대로 내려보낸다(동작 변경 없음).
const FIELD_LABELS: Record<string, string> = {
  colorOf: '색상',
  spec: '규격',
  category: '구분',
  colorCode: '색상코드',
  supplier: '공급처',
  remarks: '비고',
  englishName: '영문명',
  itemName: '자재명',
  consumption: '요척',
  requiredQty: '소요량',
};

const ROW_FIELD_ERROR_REGEX = /^bomItems\.(\d+)\.(\w+) /;

function translate(message: string): string {
  const match = ROW_FIELD_ERROR_REGEX.exec(message);
  if (!match) return message;
  const rowNumber = Number(match[1]) + 1; // 0부터 세는 인덱스를 사람이 읽는 1부터 번호로.
  const label = FIELD_LABELS[match[2]] ?? match[2];
  return `${rowNumber}번째 자재 행의 '${label}' 값이 올바르지 않습니다`;
}

@Catch(BadRequestException)
export class BomItemValidationErrorFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const body = exception.getResponse();

    const rawMessages: string[] = Array.isArray((body as any)?.message)
      ? (body as any).message
      : typeof (body as any)?.message === 'string'
        ? [(body as any).message]
        : typeof body === 'string'
          ? [body]
          : [];

    const translatedMessages = rawMessages.map(translate);
    const message = rawMessages.length > 0 ? { ...(body as any), message: translatedMessages } : body;

    // AllExceptionsFilter와 같은 응답 모양을 유지한다(프런트 getErrorMessage가 그대로 동작).
    response.status(400).json({
      statusCode: 400,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
    });
  }
}
