import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Buyer } from './entities/buyer.entity';
import { CreateBuyerDto } from './dto/create-buyer.dto';
import { UpdateBuyerDto } from './dto/update-buyer.dto';

@Injectable()
export class BuyersService {
  constructor(
    @InjectRepository(Buyer)
    private readonly buyerRepository: Repository<Buyer>,
  ) {}

  async create(createBuyerDto: CreateBuyerDto): Promise<Buyer> {
    const existing = await this.buyerRepository.findOne({
      where: { code: createBuyerDto.code },
    });
    if (existing) {
      throw new ConflictException(`이미 존재하는 고객사 코드입니다: ${createBuyerDto.code}`);
    }

    const buyer = this.buyerRepository.create(createBuyerDto);
    return await this.buyerRepository.save(buyer);
  }

  async findAll(): Promise<Buyer[]> {
    return await this.buyerRepository.find({
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Buyer> {
    const buyer = await this.buyerRepository.findOne({ where: { id } });
    if (!buyer) {
      throw new NotFoundException(`ID가 ${id}인 고객사를 찾을 수 없습니다.`);
    }
    return buyer;
  }

  async update(id: number, updateBuyerDto: UpdateBuyerDto): Promise<Buyer> {
    const buyer = await this.findOne(id);

    if (updateBuyerDto.code && updateBuyerDto.code !== buyer.code) {
      const existing = await this.buyerRepository.findOne({
        where: { code: updateBuyerDto.code },
      });
      if (existing) {
        throw new ConflictException(`이미 존재하는 고객사 코드입니다: ${updateBuyerDto.code}`);
      }
    }

    Object.assign(buyer, updateBuyerDto);
    return await this.buyerRepository.save(buyer);
  }

  async remove(id: number): Promise<void> {
    const buyer = await this.findOne(id);
    await this.buyerRepository.remove(buyer);
  }
}
