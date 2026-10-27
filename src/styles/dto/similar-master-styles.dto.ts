import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SimilarMasterStylesDto {
  @ApiProperty({ description: '작지 AI가 읽은(또는 입력 중인) 스타일번호', example: 'MB73SKM109' })
  @IsNotEmpty()
  @IsString()
  styleNo: string;
}
