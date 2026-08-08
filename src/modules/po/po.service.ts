import { Injectable, NotFoundException } from '@nestjs/common';
import { POStateEngineService } from './po-state-engine.service';

@Injectable()
export class POService {
  constructor(
    private readonly poStateEngine: POStateEngineService,
  ) {}

  /**
   * PO 생성
   */
  async createPO(dto: any, tenantId?: string, userId?: string) {
    return {
      message: 'PO가 성공적으로 생성되었습니다.',
      data: {
        id: 'po-generated-id',
        ...dto,
        tenantId,
        createdBy: userId,
        status: 'DRAFT',
      },
    };
  }

  /**
   * 비구조화 텍스트 분석 (AI / OCR 등)
   */
  async parseUnstructuredPOText(rawText: string) {
    return {
      message: '텍스트 파싱이 완료되었습니다.',
      parsedData: {
        rawText,
        extractedItems: [],
      },
    };
  }

  /**
   * 자재 카탈로그 검색
   */
  async searchMaterialsCatalog(queryText: string, topK?: number) {
    return {
      query: queryText,
      topK: topK || 5,
      results: [],
    };
  }

  /**
   * PO 상태 변경 처리
   */
  async changeStatus(
    poId: string,
    nextStatus: string,
    userId: string,
    remark?: string,
  ) {
    const result = await this.poStateEngine.transitionState(
      poId,
      nextStatus,
      userId,
      remark,
    );

    if (!result) {
      throw new NotFoundException(`PO (ID: ${poId}) 상태 변경 처리에 실패했습니다.`);
    }

    return {
      message: 'PO 상태가 성공적으로 변경되었습니다.',
      data: result,
    };
  }

  async findAll() {
    return [];
  }

  async findOne(id: string) {
    return { id };
  }
}