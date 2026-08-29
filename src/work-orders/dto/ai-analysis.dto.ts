import { ApiProperty } from '@nestjs/swagger';

export class BomItemDto {
  @ApiProperty()
  itemName: string;

  @ApiProperty()
  spec: string;

  @ApiProperty()
  requiredQuantity: number;

  @ApiProperty()
  unit: string;
}

export class AiAnalysisResultDto {
  @ApiProperty()
  itemType: string;

  @ApiProperty()
  brand: string;

  @ApiProperty()
  styleNo: string;

  @ApiProperty({ type: [BomItemDto] })
  bom: BomItemDto[];
}
