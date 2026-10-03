import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ProductionType } from '../../styles/entities/style-overview.entity';

// 작업지시서 한 건(=오더개요) 정보. AI 분석은 문서에서 읽지 못한 값은 null로 둔다.
export class AiOverviewDto {
  @ApiPropertyOptional() @IsOptional() @IsString() styleNo: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() styleName: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() itemType: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() brand: string | null;
  @ApiPropertyOptional({ enum: ProductionType }) @IsOptional() @IsEnum(ProductionType) productionType: ProductionType | null;
  @ApiPropertyOptional() @IsOptional() @IsString() factory: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() buyer: string | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalQty: number | null;
  @ApiPropertyOptional({ description: '납기(YYYY-MM-DD)' }) @IsOptional() @IsString() targetRdd: string | null;
  // PR-158: 문서 상단에 적힌 작성일 — targetRdd(계획DELI 하위 '납기')와 서로 다른
  // 필드로 AI가 독립적으로 인식하게 해서, 둘을 혼동했는지 코드로 검증할 수 있게 한다.
  @ApiPropertyOptional({ description: '문서 상단 작성일(YYYY-MM-DD)' }) @IsOptional() @IsString() documentDate: string | null;
  // 서버가 계산해 내려주는 값 — AI가 채우는 필드가 아니다(analyzeSalesOrder에서 덮어씀).
  // 저장 요청(commit-analysis) 바디에도 포함될 수 있으나 commitAnalysis()가 무시한다.
  @ApiPropertyOptional({ description: '납기가 문서작성일/오늘보다 이르거나 같아 의심스러운지(서버 계산)' })
  @IsOptional()
  @IsBoolean()
  targetRddSuspicious?: boolean;

  // PR-168: 미도 전용 — 작업지시서 이미지 상단에 수기로 적힌 CMT단가 숫자(AI 후보일
  // 뿐, 그대로 저장되지 않는다). 미도가 아닌 바이어 건은 vision.service.ts가 결정적으로
  // null로 덮어쓴다(바이어 인식 자체를 AI 판단에만 맡기지 않음, PR-158과 동일한 원칙).
  @ApiPropertyOptional({ description: '미도 전용: 작지 상단 수기 CMT단가 후보(AI 추출, 그대로 저장 금지 — 사람이 확인 후 cmtPrice에 반영)' })
  @IsOptional()
  @IsNumber()
  handwrittenCmtPriceCandidate?: number | null;

  // 화면에서 사람이 확인/수정한 최종 CMT단가 — commitAnalysis가 이 값만 StyleOverview/
  // Contract.cmtPrice에 반영한다. handwrittenCmtPriceCandidate와 달리 AI가 채우는
  // 필드가 아니다(기본은 비어 있고, "이 값 사용" 버튼을 눌러야 후보값이 여기로 복사된다).
  @ApiPropertyOptional({ description: '사람이 확인한 최종 CMT단가(저장 대상)' })
  @IsOptional()
  @IsNumber()
  cmtPrice?: number | null;
}

export class AiBomItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category: string | null;
  @ApiProperty() @IsNotEmpty() @IsString() itemName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() spec: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() colorCode: string | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() consumption: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() requiredQty: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() supplier: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks: string | null;
}

// 사이즈 스펙표 한 행 (부위 x 사이즈). 원본이 손글씨 분수 표기라 문자열로 둔다.
export class AiSizeSpecRowDto {
  @ApiProperty() @IsNotEmpty() @IsString() part: string;
  @ApiProperty() @IsNotEmpty() @IsString() size: string;
  @ApiPropertyOptional() @IsOptional() @IsString() instructedValue: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() sampleValue: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() diffValue: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() finalValue: string | null;
}

// 작업지시서 한 페이지(=스타일 하나) 분석 결과. AI 응답 형태이자 최종저장 요청 바디로도 쓰인다.
export class AiSalesOrderResultDto {
  @ApiProperty({ type: AiOverviewDto })
  @ValidateNested()
  @Type(() => AiOverviewDto)
  overview: AiOverviewDto;

  @ApiProperty({ type: [AiBomItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiBomItemDto)
  bomItems: AiBomItemDto[];

  @ApiProperty({ type: [AiSizeSpecRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiSizeSpecRowDto)
  sizeSpecs: AiSizeSpecRowDto[];

  @ApiPropertyOptional({ description: '손글씨 봉제/후가공 지시사항 등 구조화하기 어려운 메모' })
  @IsOptional()
  @IsString()
  workNotes: string | null;
}
