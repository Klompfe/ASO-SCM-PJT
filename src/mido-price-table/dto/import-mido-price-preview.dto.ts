import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ImportMidoPricePreviewDto {
  @ApiProperty({ description: 'CSV 텍스트(헤더: itemName,priceUsdMin,priceUsdMax,unit,note)' })
  @IsNotEmpty()
  @IsString()
  csv: string;
}
