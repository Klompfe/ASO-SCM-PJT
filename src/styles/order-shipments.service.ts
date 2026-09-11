import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderShipment } from './entities/order-shipment.entity';
import { MasterStyle } from './entities/master-style.entity';
import { CreateOrderShipmentDto } from './dto/create-order-shipment.dto';
import { UpdateOrderShipmentDto } from './dto/update-order-shipment.dto';

@Injectable()
export class OrderShipmentsService {
  constructor(
    @InjectRepository(OrderShipment)
    private readonly shipmentRepository: Repository<OrderShipment>,
    @InjectRepository(MasterStyle)
    private readonly masterStyleRepository: Repository<MasterStyle>,
  ) {}

  // 차수(installmentNo)는 사용자가 직접 매기지 않고 해당 스타일의 기존 최대 차수 + 1로
  // 서버가 자동 부여한다 — 실제 생산일보에서 관찰된 "1차~5차 분할 출고" 패턴을 그대로 반영.
  async create(dto: CreateOrderShipmentDto): Promise<OrderShipment> {
    const style = await this.masterStyleRepository.findOne({ where: { styleNo: dto.styleNo } });
    if (!style) {
      throw new NotFoundException(`존재하지 않는 스타일입니다: ${dto.styleNo}`);
    }

    const existing = await this.shipmentRepository.find({ where: { styleNo: dto.styleNo } });
    const nextInstallmentNo = existing.reduce((max, s) => Math.max(max, s.installmentNo), 0) + 1;

    const shipment = this.shipmentRepository.create({
      styleNo: dto.styleNo,
      installmentNo: nextInstallmentNo,
      plannedShipDate: new Date(dto.plannedShipDate),
      quantity: dto.quantity,
      remark: dto.remark ?? null,
    });
    return this.shipmentRepository.save(shipment);
  }

  async update(id: number, dto: UpdateOrderShipmentDto): Promise<OrderShipment> {
    const shipment = await this.shipmentRepository.findOne({ where: { id } });
    if (!shipment) {
      throw new NotFoundException(`ID가 ${id}인 출고 건을 찾을 수 없습니다.`);
    }

    if (dto.plannedShipDate !== undefined) shipment.plannedShipDate = new Date(dto.plannedShipDate);
    if (dto.actualShipDate !== undefined) shipment.actualShipDate = new Date(dto.actualShipDate);
    if (dto.quantity !== undefined) shipment.quantity = dto.quantity;
    if (dto.remark !== undefined) shipment.remark = dto.remark;

    return this.shipmentRepository.save(shipment);
  }

  async findByStyleNo(styleNo: string): Promise<OrderShipment[]> {
    return this.shipmentRepository.find({ where: { styleNo }, order: { installmentNo: 'ASC' } });
  }

  // 오더관리 목록 화면에서 각 행마다 출고 이력을 개별 조회(N+1)하지 않도록, 실제
  // 출고된(actualShipDate가 있는) 건만 스타일별로 합산해 한 번에 반환한다(PR-064).
  async getShippedQtySummary(): Promise<{ styleNo: string; shippedQty: number }[]> {
    const rows = await this.shipmentRepository
      .createQueryBuilder('s')
      .select('s.styleNo', 'styleNo')
      .addSelect('SUM(s.quantity)', 'shippedQty')
      .where('s.actualShipDate IS NOT NULL')
      .groupBy('s.styleNo')
      .getRawMany();
    return rows.map((r) => ({ styleNo: r.styleNo, shippedQty: Number(r.shippedQty) }));
  }
}
