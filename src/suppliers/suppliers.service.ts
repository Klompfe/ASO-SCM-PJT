import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
  ) {}

  async create(createSupplierDto: CreateSupplierDto): Promise<Supplier> {
    const existing = await this.supplierRepository.findOne({
      where: { code: createSupplierDto.code },
    });
    if (existing) {
      throw new ConflictException(`이미 존재하는 업체 코드입니다: ${createSupplierDto.code}`);
    }

    const supplier = this.supplierRepository.create(createSupplierDto);
    return await this.supplierRepository.save(supplier);
  }

  async findAll(): Promise<Supplier[]> {
    return await this.supplierRepository.find({
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Supplier> {
    const supplier = await this.supplierRepository.findOne({ where: { id } });
    if (!supplier) {
      throw new NotFoundException(`ID가 ${id}인 공급업체를 찾을 수 없습니다.`);
    }
    return supplier;
  }

  async update(id: number, updateSupplierDto: UpdateSupplierDto): Promise<Supplier> {
    const supplier = await this.findOne(id);

    if (updateSupplierDto.code && updateSupplierDto.code !== supplier.code) {
      const existing = await this.supplierRepository.findOne({
        where: { code: updateSupplierDto.code },
      });
      if (existing) {
        throw new ConflictException(`이미 존재하는 업체 코드입니다: ${updateSupplierDto.code}`);
      }
    }

    Object.assign(supplier, updateSupplierDto);
    return await this.supplierRepository.save(supplier);
  }

  async remove(id: number): Promise<void> {
    const supplier = await this.findOne(id);
    await this.supplierRepository.remove(supplier);
  }
}