import { Injectable } from '@nestjs/common';
import { StandardMaterialDto } from '../dto/standard-material.dto';

@Injectable()
export class MappingEngine {
  // 예시: 실제 구현 시에는 각 리포지토리를 주입받아 마스터 데이터를 조회해야 합니다.
  async normalize(rawMaterial: any): Promise<StandardMaterialDto> {
    const isMaterialValid = await this.checkMaterialExists(rawMaterial.itemName);
    const isVendorValid = await this.checkVendorExists(rawMaterial.vendor);

    if (!isMaterialValid || !isVendorValid) {
      return {
        ...rawMaterial,
        status: 'MANUAL_REVIEW',
        remarks: !isMaterialValid ? 'Material not found in Master Data' : 'Vendor not found in Master Data',
      };
    }

    return {
      ...rawMaterial,
      status: 'VALID',
    };
  }

  private async checkMaterialExists(name: string): Promise<boolean> {
    // 마스터 데이터 조회 로직 (현재는 스켈레톤)
    return !!name;
  }

  private async checkVendorExists(name: string): Promise<boolean> {
    // 마스터 데이터 조회 로직 (현재는 스켈레톤)
    return !!name;
  }
}
