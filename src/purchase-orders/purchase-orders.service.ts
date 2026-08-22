import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Item } from '../items/entities/item.entity';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    const supplier = await this.dataSource.getRepository(Supplier).findOne({
      where: { id: dto.supplierId },
    });
    if (!supplier) {
      throw new NotFoundException(`ID가 ${dto.supplierId}인 공급업체를 찾을 수 없습니다.`);
    }

    const item = await this.dataSource.getRepository(Item).findOne({
      where: { id: dto.itemId },
    });
    if (!item) {
      throw new NotFoundException(`ID가 ${dto.itemId}인 품목을 찾을 수 없습니다.`);
    }

    const po = this.poRepository.create({
      quantity: dto.quantity,
      supplier,
      item,
    });

    return await this.poRepository.save(po);
  }

  async findAll(): Promise<PurchaseOrder[]> {
    return await this.poRepository.find({
      relations: ['supplier', 'item', 'shipment'],
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<PurchaseOrder> {
    const po = await this.poRepository.findOne({
      where: { id },
      relations: ['supplier', 'item', 'shipment'],
    });
    if (!po) {
      throw new NotFoundException(`ID가 ${id}인 구매 주문을 찾을 수 없습니다.`);
    }
    return po;
  }

  async updateStatus(id: number, dto: UpdatePurchaseOrderStatusDto): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    po.status = dto.status;
    return await this.poRepository.save(po);
  }

  async cancel(id: number): Promise<PurchaseOrder> {
    const po = await this.findOne(id);

    const currentStatus = String(po.status);
    if (currentStatus === 'DELIVERED' || currentStatus === 'CANCELLED') {
      throw new BadRequestException('이미 완료되었거나 취소된 주문은 취소할 수 없습니다.');
    }

    po.status = 'CANCELLED' as any;
    return await this.poRepository.save(po);
  }

  async remove(id: number): Promise<void> {
    const po = await this.findOne(id);
    await this.poRepository.remove(po);
  }
}