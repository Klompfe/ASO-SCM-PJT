import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImportShipment, ImportShipmentStatus } from './entities/import-shipment.entity';
import { ImportShipmentLine } from './entities/import-shipment-line.entity';
import { CreateImportShipmentDto } from './dto/create-import-shipment.dto';
import { UpdateImportShipmentLineDto } from './dto/update-import-shipment-line.dto';
import { HsCodeClassificationsService } from '../hs-code-classifications/hs-code-classifications.service';

// PENDING_CLEARANCE -> CLEARED만 허용, 역행 불가 — export-shipments.service.ts의
// ALLOWED_TRANSITIONS와 동일 패턴(완제품 수입통관은 3단계까지는 불필요해 2단계로 단순화).
const ALLOWED_TRANSITIONS: Record<ImportShipmentStatus, ImportShipmentStatus[]> = {
  [ImportShipmentStatus.PENDING_CLEARANCE]: [ImportShipmentStatus.CLEARED],
  [ImportShipmentStatus.CLEARED]: [],
};

const DEFAULT_FABRIC_TYPE = '직물';

export interface ImportShipmentLineWithMatch extends ImportShipmentLine {
  unmatched: boolean;
}

export interface ImportShipmentWithMatch extends ImportShipment {
  lines?: ImportShipmentLineWithMatch[];
}

// hsCode가 null인 라인은 PR-081 HsCodeClassification에 일치하는 조합이 없었다는
// 뜻이다 — 별도 컬럼으로 중복 저장하지 않고 응답 시점에 계산해 unmatched:true로
// 표시한다(화면에서 "HS코드 미확인" 배지로 강조하는 용도).
const withUnmatchedFlag = (line: ImportShipmentLine): ImportShipmentLineWithMatch =>
  Object.assign(line, { unmatched: line.hsCode == null });

const decorateShipment = (shipment: ImportShipment): ImportShipmentWithMatch => {
  shipment.lines = (shipment.lines ?? []).map(withUnmatchedFlag);
  return shipment as ImportShipmentWithMatch;
};

@Injectable()
export class ImportShipmentsService {
  constructor(
    @InjectRepository(ImportShipment)
    private readonly importShipmentRepository: Repository<ImportShipment>,
    @InjectRepository(ImportShipmentLine)
    private readonly importShipmentLineRepository: Repository<ImportShipmentLine>,
    private readonly hsCodeClassificationsService: HsCodeClassificationsService,
  ) {}

  // 3절: 라인 저장 시 (itemType,fabricType(trim),composition)으로 PR-081
  // HsCodeClassification을 조회한다. 일치하면 hsCode를 자동으로 채우고 이
  // ImportShipment의 styleNo로 StyleHsCodeMapping을 upsert한다 — "품종은 최초
  // 수입용 INV/PKL 확인 시점에 파악된다"는 요구사항이 반영되는 지점이 여기다.
  // 일치하지 않으면 hsCode는 null로 저장한다(호출 측에서 unmatched 표시).
  async create(dto: CreateImportShipmentDto): Promise<ImportShipmentWithMatch> {
    const shipment = await this.importShipmentRepository.save(
      this.importShipmentRepository.create({
        styleNo: dto.styleNo,
        invoiceNo: dto.invoiceNo ?? null,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : null,
        status: ImportShipmentStatus.PENDING_CLEARANCE,
      }),
    );

    for (const lineDto of dto.lines) {
      const fabricType = (lineDto.fabricType ?? DEFAULT_FABRIC_TYPE).trim() || DEFAULT_FABRIC_TYPE;
      const match = await this.hsCodeClassificationsService.findMatch(
        lineDto.itemType,
        fabricType,
        lineDto.composition,
      );

      if (match) {
        await this.hsCodeClassificationsService.upsertStyleMapping(dto.styleNo, match.id);
      }

      await this.importShipmentLineRepository.save(
        this.importShipmentLineRepository.create({
          importShipmentId: shipment.id,
          itemType: lineDto.itemType,
          composition: lineDto.composition,
          fabricType,
          hsCode: match?.hsCode ?? null,
          qty: lineDto.qty,
          unit: lineDto.unit,
          unitPrice: lineDto.unitPrice ?? null,
          amount: lineDto.amount ?? null,
          netWeight: lineDto.netWeight ?? null,
          grossWeight: lineDto.grossWeight ?? null,
          packageCount: lineDto.packageCount ?? null,
        }),
      );
    }

    return this.findOneOrFail(shipment.id);
  }

  async findAll(): Promise<ImportShipmentWithMatch[]> {
    const shipments = await this.importShipmentRepository.find({
      relations: ['lines', 'style', 'style.overview'],
      order: { id: 'DESC', lines: { id: 'ASC' } } as any,
    });
    return shipments.map(decorateShipment);
  }

  async findOneOrFail(id: number): Promise<ImportShipmentWithMatch> {
    const shipment = await this.importShipmentRepository.findOne({
      where: { id },
      relations: ['lines', 'style', 'style.overview'],
      order: { lines: { id: 'ASC' } } as any,
    });
    if (!shipment) {
      throw new NotFoundException(`ID가 ${id}인 수입통관 문서를 찾을 수 없습니다.`);
    }
    return decorateShipment(shipment);
  }

  async updateStatus(id: number, newStatus: ImportShipmentStatus): Promise<ImportShipmentWithMatch> {
    const shipment = await this.findOneOrFail(id);

    const allowedNextStates = ALLOWED_TRANSITIONS[shipment.status];
    if (!allowedNextStates.includes(newStatus)) {
      throw new BadRequestException(
        `${shipment.status} 상태에서 ${newStatus}(으)로 전이할 수 없습니다. (허용: ${allowedNextStates.join(', ') || '없음'})`,
      );
    }

    shipment.status = newStatus;
    shipment.clearedAt = newStatus === ImportShipmentStatus.CLEARED ? new Date() : shipment.clearedAt;
    await this.importShipmentRepository.save(shipment);
    return this.findOneOrFail(id);
  }

  // 3절: 사용자가 HS코드를 직접 입력하면 그 값으로 HsCodeClassification에도 새
  // 조합을 등록(upsertOne 재사용)해 다음부터는 자동조회되게 하고, 이
  // ImportShipment의 styleNo로 StyleHsCodeMapping도 함께 upsert한다.
  async updateLineHsCode(
    importShipmentId: number,
    lineId: number,
    dto: UpdateImportShipmentLineDto,
  ): Promise<ImportShipmentLineWithMatch> {
    const shipment = await this.findOneOrFail(importShipmentId);

    const line = await this.importShipmentLineRepository.findOne({ where: { id: lineId } });
    if (!line || line.importShipmentId !== importShipmentId) {
      throw new NotFoundException(`ID가 ${lineId}인 라인을 찾을 수 없습니다.`);
    }

    line.hsCode = dto.hsCode;
    await this.importShipmentLineRepository.save(line);

    const classification = await this.hsCodeClassificationsService.upsertOne({
      itemType: line.itemType,
      fabricType: line.fabricType,
      composition: line.composition,
      hsCode: dto.hsCode,
    });
    await this.hsCodeClassificationsService.upsertStyleMapping(shipment.styleNo, classification.id);

    return withUnmatchedFlag(line);
  }
}
