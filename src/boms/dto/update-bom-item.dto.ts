import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ThreadType, TapeType } from '../entities/bom-item.entity';

// PR-073: 수출 선적서류(INVOICE/Packing List) 자동생성을 위해 BomItem에 혼용율/HS코드를
// 스타일별로 입력·수정할 수 있어야 한다. PR-197: 요척/규격/색상/구분(consumption/spec/
// colorCode/category) 수정도 여기 추가한다 — 실제 사례(자재명세 엑셀의 요척 2.9가
// BOM에는 2.7로 저장돼 필요량이 틀렸던 건)에서 고칠 화면·API가 없었다.
export class UpdateBomItemDto {
  @ApiPropertyOptional({ example: 'WOOL 98%, POLYURETHANE 2%' })
  @IsOptional()
  @IsString()
  composition?: string;

  @ApiPropertyOptional({ example: '6110.30' })
  @IsOptional()
  @IsString()
  hsCode?: string;

  // PR-197: 요척(제품 1개당 소요량). 바뀌면 requiredQty(소요량 스냅샷)도 같이
  // 재계산한다(스타일 총수량이 있을 때만 — BomsService.updateItem 참고).
  @ApiPropertyOptional({ example: 2.9, description: '요척(제품 1개당 소요량) — 바뀌면 소요량(requiredQty)도 같이 재계산됩니다' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  consumption?: number;

  @ApiPropertyOptional({ example: '53"' })
  @IsOptional()
  @IsString()
  spec?: string;

  @ApiPropertyOptional({ example: 'BK' })
  @IsOptional()
  @IsString()
  colorCode?: string;

  @ApiPropertyOptional({ example: '부자재' })
  @IsOptional()
  @IsString()
  category?: string;

  // PR-157: 실(THREAD) 자재의 콘가격 환산용 — 자재명 텍스트만으로는 신뢰성 있게
  // 자동 분류할 수 없어(실 데이터 조사 결과) 사람이 직접 고른다. 실이 아닌 자재는
  // 건드리지 않는다(보내지 않으면 기존 값 유지).
  @ApiPropertyOptional({ enum: ThreadType })
  @IsOptional()
  @IsEnum(ThreadType)
  threadType?: ThreadType;

  // PR-175: 테이프류(다데/암홀) 포장단위(50m/롤) 환산용 — threadType과 동일한 원칙
  // (사람이 직접 고른다, 보내지 않으면 기존 값 유지).
  @ApiPropertyOptional({ enum: TapeType })
  @IsOptional()
  @IsEnum(TapeType)
  tapeType?: TapeType;
}
