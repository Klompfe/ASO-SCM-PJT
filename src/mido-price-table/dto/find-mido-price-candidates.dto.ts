import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class FindMidoPriceCandidatesDto {
  @ApiProperty({ example: "겉감 WOOL" })
  @IsNotEmpty()
  @IsString()
  materialName: string;
}
