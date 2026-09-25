import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// PR-152: INVOICE/Packing List(invoiceNo) 단위 일괄 통관완료처리. 원문이 "INV/PKL별로"라고
// 명시했고 화면도 인보이스 단위로 목록을 보는 경우가 많아 invoiceNo를 기본으로 권장하되,
// ids 배열도 함께 받는다 — 서비스 계층에서 invoiceNo가 있으면 그쪽을 우선한다.
export class BulkClearImportShipmentsDto {
  @ApiPropertyOptional({ description: 'INVOICE 번호(권장) — 이 번호를 가진 문서 중 PENDING_CLEARANCE 건을 전부 처리', example: 'TYVN2026-26' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'invoiceNo는 빈 문자열일 수 없습니다.' })
  invoiceNo?: string;

  @ApiPropertyOptional({ description: 'ImportShipment id 배열(invoiceNo 대신 특정 건들만 지정하고 싶을 때)', example: [1, 2, 3] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'ids는 빈 배열일 수 없습니다.' })
  @IsInt({ each: true })
  ids?: number[];
}
