import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { ExportShipmentLinePriceSource } from '../entities/export-shipment-line.entity';

// PR-157: PurchaseOrder.unitPrice가 없는 라인의 USD 단가를 사람이 최종 확정한다.
// 미도 단가표 후보(범위값/실 콘가격 환산 포함)는 화면에서 계산해 보여주고, 사람이
// 고른 최종 숫자만 여기로 보낸다 — 서버가 범위 중 하나를 자동으로 고르지 않는다.
export class ConfirmExportShipmentLinePriceDto {
  @ApiProperty({ enum: ExportShipmentLinePriceSource, enumName: 'ManualOrMidoPriceSource' })
  @IsEnum(ExportShipmentLinePriceSource)
  source: ExportShipmentLinePriceSource;

  // PR-173: 미도 단가표 실측 최대 소수 5자리(0.00012) 기준 6자리로 여유있게 허용.
  @ApiProperty({ example: 0.3 })
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  unitPriceUsd: number;

  @ApiPropertyOptional({ description: '근거로 쓴 미도 단가표 항목 id(참고용, source=MIDO_PRICE_TABLE일 때)' })
  @IsOptional()
  @IsNumber()
  midoPriceItemId?: number;
}
