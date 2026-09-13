import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// 사용자가 HS코드를 직접 입력/수정한다 — 이 값은 그대로 저장될 뿐 아니라 서비스
// 레이어에서 PR-081 HsCodeClassification에도 새 조합으로 등록되어(3절) 다음부터는
// 같은 조합이 자동조회되게 한다.
export class UpdateImportShipmentLineDto {
  @ApiProperty({ example: '6202.20.1000' })
  @IsNotEmpty()
  @IsString()
  hsCode: string;
}
