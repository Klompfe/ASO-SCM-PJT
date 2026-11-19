import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { applyDecorators, BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';

// PR-244a: 단가 통화. 허용 통화는 여기 한 곳에서만 정의한다(추후 확장은 배열에 추가).
// DB 컬럼은 varchar(3) NULL 허용 + 기본값 'KRW' — 코드는 NULL 도 KRW 로 취급한다.
export const ALLOWED_CURRENCIES = ['KRW', 'USD'] as const;
export type Currency = (typeof ALLOWED_CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = 'KRW';
export const INVALID_CURRENCY_MESSAGE = '허용되지 않는 통화입니다. KRW 또는 USD 만 선택할 수 있습니다.';

// 대문자·공백 정규화. 비어 있으면(undefined/null/'') 기본 통화(KRW). 허용 값이 아니면
// 그대로(대문자) 돌려줘 검증 쪽이 거절하게 한다.
export function normalizeCurrency(value: unknown): string {
  if (value == null) return DEFAULT_CURRENCY;
  const v = String(value).trim().toUpperCase();
  return v === '' ? DEFAULT_CURRENCY : v;
}

// DB 에 저장된 값(NULL 포함)을 통화로 해석 — NULL/빈 값은 KRW.
export function effectiveCurrency(stored: string | null | undefined): string {
  return normalizeCurrency(stored);
}

export function isAllowedCurrency(value: string): value is Currency {
  return (ALLOWED_CURRENCIES as readonly string[]).includes(value);
}

// 서비스에서 DTO 값을 쓸 때(ValidationPipe transform 여부와 무관하게) 한 번 더 확인한다.
// undefined 는 "보내지 않음"이므로 그대로 undefined.
export function resolveCurrencyInput(value: unknown): Currency | undefined {
  if (value === undefined) return undefined;
  const v = normalizeCurrency(value);
  if (!isAllowedCurrency(v)) {
    throw new BadRequestException(INVALID_CURRENCY_MESSAGE);
  }
  return v;
}

// DTO 필드용 데코레이터: 대문자 정규화(+null/빈 문자열은 KRW) 후 허용 값 검사.
export function CurrencyField() {
  return applyDecorators(
    ApiPropertyOptional({ enum: ALLOWED_CURRENCIES as unknown as string[], example: 'KRW', description: '단가 통화(KRW/USD). 비우면 KRW. 통화를 바꿔도 단가 숫자는 자동 환산되지 않습니다.' }),
    IsOptional(),
    Transform(({ value }) => (value === undefined ? value : normalizeCurrency(value))),
    IsIn(ALLOWED_CURRENCIES as unknown as string[], { message: INVALID_CURRENCY_MESSAGE }),
  );
}
