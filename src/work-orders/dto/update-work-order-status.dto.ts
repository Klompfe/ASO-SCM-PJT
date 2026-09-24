import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// PR-140: status-codes 마스터 테이블(domain='WORK_ORDER')의 활성 code만 유효한 값이다.
// 관리자가 코드를 추가/비활성화할 수 있어 컴파일 시점 enum으로는 검증할 수 없으므로,
// 형태만 문자열로 받고 실제 유효성은 WorkOrdersService.assertValidStatus()가 DB 기준으로 검증한다.
export class UpdateWorkOrderStatusDto {
  @ApiProperty({ description: '변경할 작업지시 상태(status-codes의 code 값)', example: 'COMPLETED' })
  @IsNotEmpty()
  @IsString()
  status: string;
}