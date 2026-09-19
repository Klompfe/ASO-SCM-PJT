import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ImportShipment } from './entities/import-shipment.entity';
import {
  ImportShipmentPackingDetail,
  ImportShipmentPackingDetailSource,
} from './entities/import-shipment-packing-detail.entity';
import { GoodsReceiptLine } from '../goods-receipts/entities/goods-receipt-line.entity';
import { CreateImportShipmentPackingDetailsDto } from './dto/create-import-shipment-packing-details.dto';
import { UpdateImportShipmentPackingDetailDto } from './dto/update-import-shipment-packing-detail.dto';

export interface PackingDetailWithReceiptFlag extends ImportShipmentPackingDetail {
  hasReceipt: boolean;
}

@Injectable()
export class ImportShipmentPackingDetailsService {
  constructor(
    @InjectRepository(ImportShipment)
    private readonly importShipmentRepository: Repository<ImportShipment>,
    @InjectRepository(ImportShipmentPackingDetail)
    private readonly packingDetailRepository: Repository<ImportShipmentPackingDetail>,
    @InjectRepository(GoodsReceiptLine)
    private readonly goodsReceiptLineRepository: Repository<GoodsReceiptLine>,
  ) {}

  private async findShipmentOrFail(importShipmentId: number): Promise<ImportShipment> {
    const shipment = await this.importShipmentRepository.findOne({ where: { id: importShipmentId } });
    if (!shipment) {
      throw new NotFoundException(`ID가 ${importShipmentId}인 수입통관 문서를 찾을 수 없습니다.`);
    }
    return shipment;
  }

  // 여러 색상/사이즈 줄을 한 번에 등록(엑셀 자동연동이 아직 없어 전부 MANUAL로
  // 저장 — DETAIL PACKING 시트 실제 구조를 확보하면 후속 PR에서 EXCEL 값도 쓰게 된다).
  // PR-112: 엑셀(DPKL 시트) 자동 파싱 경로는 source=EXCEL로 넘긴다. 항상 "추가"만
  // 하고 기존 행을 지우거나 덮어쓰지 않는다(MANUAL과 공존).
  async createMany(
    importShipmentId: number,
    dto: CreateImportShipmentPackingDetailsDto,
    source: ImportShipmentPackingDetailSource = ImportShipmentPackingDetailSource.MANUAL,
  ): Promise<ImportShipmentPackingDetail[]> {
    const shipment = await this.findShipmentOrFail(importShipmentId);

    const created = await this.packingDetailRepository.save(
      dto.details.map((row) =>
        this.packingDetailRepository.create({
          importShipmentId,
          styleNo: shipment.styleNo,
          color: row.color,
          size: row.size,
          qty: row.qty,
          source,
        }),
      ),
    );
    return created;
  }

  async findAllByShipment(importShipmentId: number): Promise<PackingDetailWithReceiptFlag[]> {
    await this.findShipmentOrFail(importShipmentId);

    const details = await this.packingDetailRepository.find({
      where: { importShipmentId },
      order: { id: 'ASC' },
    });
    if (details.length === 0) return [];

    const lines = await this.goodsReceiptLineRepository.find({
      where: { packingDetailId: In(details.map((d) => d.id)) },
    });
    const detailIdsWithReceipt = new Set(lines.map((l) => l.packingDetailId));

    return details.map((detail) =>
      Object.assign(detail, { hasReceipt: detailIdsWithReceipt.has(detail.id) }),
    );
  }

  private async findDetailOrFail(importShipmentId: number, detailId: number): Promise<ImportShipmentPackingDetail> {
    const detail = await this.packingDetailRepository.findOne({ where: { id: detailId } });
    if (!detail || detail.importShipmentId !== importShipmentId) {
      throw new NotFoundException(
        `ID가 ${detailId}인 상세내역을 이 수입통관 문서(#${importShipmentId})에서 찾을 수 없습니다.`,
      );
    }
    return detail;
  }

  async update(
    importShipmentId: number,
    detailId: number,
    dto: UpdateImportShipmentPackingDetailDto,
  ): Promise<ImportShipmentPackingDetail> {
    const detail = await this.findDetailOrFail(importShipmentId, detailId);
    if (dto.color !== undefined) detail.color = dto.color;
    if (dto.size !== undefined) detail.size = dto.size;
    if (dto.qty !== undefined) detail.qty = dto.qty;
    return this.packingDetailRepository.save(detail);
  }

  // 이미 입고증 라인이 참조 중인 상세내역은 지우면 그 입고증 라인의 근거가
  // 사라지므로(FK RESTRICT로 DB 차원에서도 막혀 있음) 사용자에게 명확한 400으로
  // 안내한다 — 원시 FK violation 에러를 그대로 노출하지 않는다.
  async remove(importShipmentId: number, detailId: number): Promise<void> {
    const detail = await this.findDetailOrFail(importShipmentId, detailId);
    const existingLine = await this.goodsReceiptLineRepository.findOne({ where: { packingDetailId: detailId } });
    if (existingLine) {
      throw new BadRequestException(
        `이미 입고증(ID: ${existingLine.goodsReceiptId})에 사용된 상세내역이라 삭제할 수 없습니다.`,
      );
    }
    await this.packingDetailRepository.remove(detail);
  }
}
