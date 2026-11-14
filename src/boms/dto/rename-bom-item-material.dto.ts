import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// PR-241: 자재명세(자재·BOM 조회)에서 "이 행만" 자재명을 바꾼다 — 자재 교체(기존 자재
// 선택)와 달리, 서버가 정규화 이름으로 기존 Item을 찾아 연결하거나(없으면) 현재 Item의
// 속성을 복사해 새 Item을 만든다. 다른 스타일/행에는 영향이 없다(BomsService.renameMaterial
// 참고 — 안전장치는 서비스 쪽에서 강제한다).
export class RenameBomItemMaterialDto {
  @ApiProperty({ example: '합성자재-새이름' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
