import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ALLOWED_CURRENCIES, DEFAULT_CURRENCY, effectiveCurrency, normalizeCurrency, resolveCurrencyInput, CurrencyField, INVALID_CURRENCY_MESSAGE } from './currency';
import { UpdateBomItemDto } from '../../boms/dto/update-bom-item.dto';
import { CreatePurchaseOrderDto } from '../../purchase-orders/dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from '../../purchase-orders/dto/update-purchase-order.dto';

describe('currency 상수·정규화 (PR-244a)', () => {
  it('허용 통화는 KRW, USD 둘이고 기본은 KRW', () => {
    expect([...ALLOWED_CURRENCIES]).toEqual(['KRW', 'USD']);
    expect(DEFAULT_CURRENCY).toBe('KRW');
  });

  it('대문자·공백 정규화, 비어 있으면 KRW, NULL 도 KRW 로 취급', () => {
    expect(normalizeCurrency(' usd ')).toBe('USD');
    expect(normalizeCurrency('')).toBe('KRW');
    expect(normalizeCurrency(null)).toBe('KRW');
    expect(effectiveCurrency(null)).toBe('KRW');
    expect(effectiveCurrency(undefined)).toBe('KRW');
    expect(effectiveCurrency('USD')).toBe('USD');
  });

  it('resolveCurrencyInput: 미전송은 undefined, 허용값은 정규화, 그 외는 한국어 400', () => {
    expect(resolveCurrencyInput(undefined)).toBeUndefined();
    expect(resolveCurrencyInput('usd')).toBe('USD');
    expect(resolveCurrencyInput('')).toBe('KRW');
    expect(() => resolveCurrencyInput('EUR')).toThrow(BadRequestException);
    expect(() => resolveCurrencyInput('EUR')).toThrow(INVALID_CURRENCY_MESSAGE);
  });

  class Probe {
    @CurrencyField()
    currency?: string;
  }
  const check = async (cls: any, payload: any) => {
    const inst = plainToInstance(cls, payload) as any;
    return { errors: await validate(inst), inst };
  };

  it('DTO 데코레이터: 소문자→대문자, 빈 값→KRW, 허용 외는 같은 메시지로 거절', async () => {
    expect((await check(Probe, { currency: 'usd' })).inst.currency).toBe('USD');
    expect((await check(Probe, { currency: '' })).inst.currency).toBe('KRW');
    expect((await check(Probe, {})).errors).toHaveLength(0);
    const bad = await check(Probe, { currency: 'EUR' });
    expect(bad.errors[0].constraints?.isIn).toBe(INVALID_CURRENCY_MESSAGE);
  });

  it('BOM 행 수정·발주 생성·발주 수정 DTO 가 모두 같은 규칙을 쓴다', async () => {
    for (const [cls, extra] of [
      [UpdateBomItemDto, {}],
      [CreatePurchaseOrderDto, { supplierId: 1, itemId: 1, quantity: 1 }],
      [UpdatePurchaseOrderDto, {}],
    ] as const) {
      const ok = await check(cls, { ...extra, currency: 'usd' });
      expect(ok.errors).toHaveLength(0);
      expect(ok.inst.currency).toBe('USD');
      const bad = await check(cls, { ...extra, currency: 'JPY' });
      expect(bad.errors.some((e) => e.property === 'currency')).toBe(true);
    }
  });
});
