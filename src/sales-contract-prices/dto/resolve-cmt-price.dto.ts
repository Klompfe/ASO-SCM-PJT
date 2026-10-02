import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ResolveCmtPriceDto {
  @ApiPropertyOptional({ example: 'BF6821C13' })
  @IsNotEmpty()
  @IsString()
  styleNo: string;

  // 생략하면 서버가 styleNo로 MasterStyle.overview.itemType을 찾아 쓴다 — 조회
  // 시점에 이미 알고 있으면(예: 계약서 발행 화면) 그대로 넘겨도 된다.
  @ApiPropertyOptional({ example: "WOMEN'S PANTS" })
  @IsOptional()
  @IsString()
  itemType?: string;
}
