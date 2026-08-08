import { Injectable } from '@nestjs/common';
import { POHistoryEntity } from './entities/po-history.entity';

@Injectable()
export class POStateEngineService {
  /**
   * PO 상태 전환 및 이력 관리 엔진
   */
  async transitionState(
    poId: string,
    nextStatus: string,
    userId: string,
    remark?: string,
  ): Promise<any> {
    return {
      success: true,
      poId,
      nextStatus,
      userId,
      remark,
    };
  }

  validateHistory(history: POHistoryEntity): boolean {
    return !!history;
  }
}