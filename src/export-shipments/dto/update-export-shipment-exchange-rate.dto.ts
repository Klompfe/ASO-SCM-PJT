import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

// PR-157: unipass.customs.go.kr 크롤링은 robots.txt로 막혀 있어 수동 입력만 지원한다.
// 자동조회 성공 시에도 값을 수동으로 덮어쓸 수 있어야 한다는 안전모드 원칙과 같은
// 이유로, 이 값은 항상 사람이 입력한다.
// 버그 수정: 기존 @Min(0)은 0을 허용했는데, calculateUsdValueFromKrw는 환율이
// 0이면 "계산 불가"로 보고 조용히 null을 반환한다 — 그러면 자동계산 라인들의
// USD 값이 아무 경고 없이 전부 비어버린다. 환율은 반드시 양수여야 의미가 있으므로
// 0을 막는다.
export class UpdateExportShipmentExchangeRateDto {
  @ApiProperty({ example: 1387.5 })
  @IsNumber()
  @IsPositive()
  exchangeRateUsdKrw: number;
}
