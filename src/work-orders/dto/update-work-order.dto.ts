import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkOrderDto } from './create-work-order.dto';
import { IsNumber, IsOptional } from 'class-validator';

export class UpdateWorkOrderDto extends PartialType(CreateWorkOrderDto) {
  @IsOptional()
  @IsNumber()
  producedQuantity?: number;
}