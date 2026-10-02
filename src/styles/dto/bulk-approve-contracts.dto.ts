import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class BulkApproveContractsDto {
  // 지정하면 그 계약 id들만 대상으로 하고, 생략하면 현재 PENDING_APPROVAL 전체를 대상으로 한다.
  @ApiPropertyOptional({ example: [1, 2, 3], description: '대상 계약 id 목록. 생략 시 승인대기 전체.' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  ids?: number[];

  // PR-167: ids를 생략했을 때만 의미가 있다 — 생산처(오더개요.factory)가 이 값과
  // 일치하는 스타일의 PENDING_APPROVAL 계약만 대상으로 좁힌다(재원/삼정 등은
  // 완전히 숨기지 않고, 기본 필터로 "태일"만 다루게 하려는 목적).
  @ApiPropertyOptional({ example: '태일', description: '생략 시 전체, 지정 시 그 생산처 건만(ids 생략 시에만 적용)' })
  @IsOptional()
  @IsString()
  factory?: string;
}
