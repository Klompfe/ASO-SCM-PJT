import { IsNotEmpty, IsNumber, IsUUID, Min } from 'class-validator';

export class CreateBomDto {
  @IsUUID()
  @IsNotEmpty()
  parentItemId: string;

  @IsUUID()
  @IsNotEmpty()
  childItemId: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;
}