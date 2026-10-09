import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MaterialCategory } from './entities/material-category.entity';
import { CreateMaterialCategoryDto } from './dto/create-material-category.dto';
import { UpdateMaterialCategoryDto } from './dto/update-material-category.dto';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Item } from '../items/entities/item.entity';

@Injectable()
export class MaterialCategoriesService {
  constructor(
    @InjectRepository(MaterialCategory)
    private readonly repository: Repository<MaterialCategory>,
    private readonly dataSource: DataSource,
  ) {}

  // 활성 우선, 그다음 sortOrder 순 — 화면 선택 목록과 관리 목록이 같은 순서를 쓴다.
  async findAll(): Promise<MaterialCategory[]> {
    return this.repository
      .createQueryBuilder('c')
      .orderBy('c.isActive', 'DESC')
      .addOrderBy('c.sortOrder', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .getMany();
  }

  private async assertNameAvailable(name: string, excludeId?: number): Promise<void> {
    const existing = await this.repository.findOne({ where: { name } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`품목군 이름 "${name}"은 이미 있습니다.`);
    }
  }

  async create(dto: CreateMaterialCategoryDto): Promise<MaterialCategory> {
    await this.assertNameAvailable(dto.name);
    const category = this.repository.create({
      name: dto.name,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    return this.repository.save(category);
  }

  private async findOneOrFail(id: number): Promise<MaterialCategory> {
    const category = await this.repository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`ID가 ${id}인 품목군을 찾을 수 없습니다.`);
    }
    return category;
  }

  async update(id: number, dto: UpdateMaterialCategoryDto): Promise<MaterialCategory> {
    const category = await this.findOneOrFail(id);
    if (dto.name !== undefined && dto.name !== category.name) {
      await this.assertNameAvailable(dto.name, id);
    }
    Object.assign(category, dto);
    return this.repository.save(category);
  }

  // 공급업체나 품목이 쓰고 있는 품목군은 삭제하지 않는다 — 데이터가 조용히 사라지지 않도록
  // 비활성으로 바꾸도록 안내한다(PR-183 안전 규칙).
  async remove(id: number): Promise<void> {
    const category = await this.findOneOrFail(id);
    const supplierUses = await this.dataSource
      .getRepository(Supplier)
      .createQueryBuilder('s')
      .innerJoin('s.categories', 'c')
      .where('c.id = :id', { id })
      .getCount();
    const itemUses = await this.dataSource.getRepository(Item).count({ where: { categoryId: id } });
    if (supplierUses > 0 || itemUses > 0) {
      throw new BadRequestException(
        `"${category.name}" 품목군은 공급업체 ${supplierUses}곳, 품목 ${itemUses}건에서 사용 중이라 삭제할 수 없습니다. 비활성으로 바꿔 주세요.`,
      );
    }
    await this.repository.remove(category);
  }
}
