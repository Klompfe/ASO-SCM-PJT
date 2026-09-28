import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

// PR-157: unipass.customs.go.kr 크롤링은 robots.txt로 막혀 있어 수동 입력만 지원한다.
// 자동조회 성공 시에도 값을 수동으로 덮어쓸 수 있어야 한다는 안전모드 원칙과 같은
// 이유로, 이 값은 항상 사람이 입력한다.
export class UpdateExportShipmentExchangeRateDto {
  @ApiProperty({ example: 1387.5 })
  @IsNumber()
  @Min(0)
  exchangeRateUsdKrw: number;
}
