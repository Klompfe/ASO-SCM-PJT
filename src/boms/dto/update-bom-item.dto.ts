import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ThreadType, TapeType } from '../entities/bom-item.entity';
import { CurrencyField } from '../../common/constants/currency';

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

  // PR-231: 이 행(자재×색상 행)의 필요수량을 직접 지정 — 있으면 계산값/작지 값보다
  // 항상 우선 적용된다. null(또는 보내지 않고 생략이 아니라 명시적으로 null)을 보내면
  // 수동 지정을 해제(세 컬럼 모두 NULL, 계산값으로 돌아감). @IsOptional()은
  // class-validator 규칙상 undefined와 null 둘 다 아래 검증을 건너뛰므로 null도 그대로
  // 통과해 서비스가 "해제" 요청으로 처리할 수 있다.
  @ApiPropertyOptional({
    example: 499,
    nullable: true,
    description: '필요수량 직접 지정(그 행 기준 총 필요수량, 그 자재 단위) — null을 보내면 수동 지정을 해제합니다(계산값 사용).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  manualRequiredQty?: number | null;

  @ApiPropertyOptional({ example: '작지 출고량과 실측이 달라 현장 확인 후 직접 입력', maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  manualRequiredQtyNote?: string | null;

  // PR-241: 이 행(이 스타일의 이 자재)만의 공급업체/단가 — 자재마스터·다른 스타일에는
  // 영향 없다(기존 BomItem.supplier/unitPrice 컬럼, PR-098/PR-240이 이미 읽던 값).
  // 화면은 공급업체 마스터에서 고르게 하지만(자유 입력 금지), 서버는 문자열 그대로
  // 받는다 — BomItem.supplier가 FK가 아니라 자유 텍스트 컬럼이기 때문(기존 설계,
  // 이번 PR에서 스키마를 바꾸지 않는다). null/빈 문자열을 보내면 "미정"으로 해제한다.
  @ApiPropertyOptional({ example: '합성공급사A', nullable: true, description: '이 행의 공급업체(이름) — null/빈 문자열이면 미정으로 해제' })
  @IsOptional()
  @IsString()
  supplier?: string | null;

  // PR-241: 0 또는 생략 = 없음(PR-240 규칙과 동일). 음수·NaN은 거부한다.
  @ApiPropertyOptional({ example: 1000, description: '이 행의 단가(통화 미지정, 0 이상)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  // PR-244a: 이 행 단가의 통화. 바꿔도 단가 숫자는 자동 환산하지 않는다.
  @CurrencyField()
  currency?: string;
}
