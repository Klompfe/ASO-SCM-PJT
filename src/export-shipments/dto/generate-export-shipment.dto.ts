import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

// 발주(들)에서 파생할 수 없는 물류 헤더 정보 — generate 호출 시 알고 있으면 함께
// 넣고, 모르면 비워뒀다가 이후 화면에서 채운다(이번 PR은 값 자체보다 라인 자동생성이
// 핵심이라 헤더 수정 API는 범위 밖 — 필요하면 별도 PR로 추가).
export class GenerateExportShipmentDto {
  @ApiPropertyOptional({ example: 'TY-260704K' })
  @IsOptional()
  @IsString()
  sheetNo?: string;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shipperInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  consigneeInfo?: string;

  @ApiPropertyOptional({ example: 'INCHEON, KOREA' })
  @IsOptional()
  @IsString()
  portOfLoading?: string;

  @ApiPropertyOptional({ example: 'HAIPHONG, VIETNAM' })
  @IsOptional()
  @IsString()
  finalDestination?: string;

  @ApiPropertyOptional({ example: 'DONGJIN CONTINENTAL / 0217W' })
  @IsOptional()
  @IsString()
  carrier?: string;

  @ApiPropertyOptional({ example: '2026-09-20' })
  @IsOptional()
  @IsDateString()
  sailingDate?: string;

  // PR-157: unipass.customs.go.kr 크롤링은 robots.txt(/csp/ 전체 차단)로 구현하지
  // 않았다 — 담당자가 직접 입력한다(생성 시점에 몰라도 이후 별도 API로 채울 수 있음).
  // 버그 수정: @Min(0)은 0을 허용했는데 환율 0은 "계산 불가"로 조용히 무시되어
  // 각 라인의 USD 값이 경고 없이 비게 된다 — 양수만 허용한다.
  @ApiPropertyOptional({ example: 1387.5, description: 'USD/KRW 환율(수동 입력) — 있으면 각 라인의 USD 밸류를 함께 계산한다' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRateUsdKrw?: number;
}
