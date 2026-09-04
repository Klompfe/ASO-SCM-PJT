import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipment, ShipmentStatus } from './entities/shipment.entity';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
  ) {}

  async create(dto: CreateShipmentDto): Promise<Shipment> {
    const shipment = this.shipmentRepository.create(dto);
    return await this.shipmentRepository.save(shipment);
  }

  async findAll(): Promise<Shipment[]> {
    return await this.shipmentRepository.find({
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Shipment> {
    const shipment = await this.shipmentRepository.findOne({ where: { id } });
    if (!shipment) {
      throw new NotFoundException(`ID가 ${id}인 출하 정보를 찾을 수 없습니다.`);
    }
    return shipment;
  }

  async updateStatus(id: number, dto: UpdateShipmentStatusDto): Promise<Shipment> {
    const shipment = await this.findOne(id);

    if (shipment.status === ShipmentStatus.DELIVERED) {
      throw new BadRequestException(
        `이미 배송 완료(DELIVERED)된 출하(ID: ${id})는 상태를 다시 변경할 수 없습니다.`,
      );
    }

    if (dto.status !== ShipmentStatus.DELIVERED) {
      throw new BadRequestException('SHIPPING에서 DELIVERED로만 상태 전이가 가능합니다.');
    }

    shipment.status = dto.status;
    return await this.shipmentRepository.save(shipment);
  }

  async remove(id: number): Promise<void> {
    const shipment = await this.findOne(id);
    await this.shipmentRepository.remove(shipment);
  }
}
