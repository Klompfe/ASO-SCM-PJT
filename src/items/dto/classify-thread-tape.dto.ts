import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ThreadTapeClassificationAssignmentDto } from './thread-tape-classification-assignment.dto';

// PR-186-FIX: all-or-nothing 일괄 적용 — 빈 배열/500건 초과/형식 오류는 400.
export class ClassifyThreadTapeDto {
  @ApiProperty({ type: [ThreadTapeClassificationAssignmentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ThreadTapeClassificationAssignmentDto)
  assignments: ThreadTapeClassificationAssignmentDto[];
}
