import { Injectable } from '@nestjs/common';
import { AiAnalysisResultDto } from './dto/ai-analysis.dto';

@Injectable()
export class VisionService {
  async analyzeWorkOrder(file: Express.Multer.File): Promise<AiAnalysisResultDto> {
    // 여기에 실제 AI (Gemini 등) API 호출 로직 구현
    // 지금은 테스트를 위한 가상 데이터 반환
    return {
      itemType: 'PANTS',
      brand: '미센스',
      styleNo: 'MB6YSLM115Z',
      bom: [
        { itemName: '원단-폴리', spec: '150cm', requiredQuantity: 1.5, unit: 'YARD' },
        { itemName: '지퍼', spec: '20cm', requiredQuantity: 1, unit: 'EA' },
      ],
    };
  }
}
