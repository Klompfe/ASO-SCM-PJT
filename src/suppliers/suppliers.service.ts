import { BadRequestException, Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { Item } from '../items/entities/item.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { GetSuppliersFilterDto } from './dto/get-suppliers-filter.dto';

// PR-088: 회사 고정 접두사(상수) — "TY-{업체약칭}-{YY}{일련번호4자리}" 형식의
// 자동채번(예: TY-GM-260001)에 쓴다(Buyer, PR-085와 동일 패턴).
const COMPANY_PREFIX = 'TY';
// 업체명에 알파벳이 전혀 없는 경우(순수 한글 업체명 등)의 고정 fallback.
const FALLBACK_ABBR_CODE = 'SP';
// 사전 계산(generateNextCode)과 실제 save() 사이의 시간차 동안 다른 요청이 같은
// code를 선점하는 TOCTOU race(6.7절, PR-072와 동일한 종류의 문제)를 대비한 재시도 횟수.
const MAX_CODE_GENERATION_RETRIES = 3;

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
  ) {}

  // PR-171: mainItemIds(Item.id 배열)를 실제 Item 엔티티로 바꾼다. 존재하지 않는
  // id가 섞여 있으면 조용히 무시하지 않고 400으로 알린다(오타/삭제된 품목을 그대로
  // 저장해 나중에 "왜 품목이 안 보이지"로 헷갈리는 상황을 막는다).
  private async resolveMainItems(ids: number[]): Promise<Item[]> {
    if (ids.length === 0) return [];
    const items = await this.itemRepository.findBy({ id: In(ids) });
    if (items.length !== ids.length) {
      const foundIds = new Set(items.map((i) => i.id));
      const missing = ids.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`존재하지 않는 품목 ID: ${missing.join(', ')}`);
    }
    return items;
  }

  // 업체약칭 결정: dto.abbrCode가 있으면 trim+uppercase 그대로 사용한다. 없으면
  // 업체명(name)에서 알파벳만 추출해 앞 2글자를 대문자로 쓴다. 알파벳이 1글자뿐이면
  // 그 글자+'X'로 2자리를 채우고, 알파벳이 아예 없으면(순수 한글 업체명 등) 고정
  // fallback을 쓰고 로그를 남긴다(Buyer/PR-085와 동일 구조).
  private determineAbbrCode(dto: CreateSupplierDto): string {
    if (dto.abbrCode && dto.abbrCode.trim()) {
      return dto.abbrCode.trim().toUpperCase();
    }

    const letters = (dto.name.match(/[A-Za-z]/g) ?? []).join('').toUpperCase();
    if (letters.length >= 2) {
      return letters.slice(0, 2);
    }
    if (letters.length === 1) {
      return `${letters}X`;
    }

    this.logger.warn(
      `업체명("${dto.name}")에서 알파벳을 추출할 수 없어 업체약칭을 기본값(${FALLBACK_ABBR_CODE})으로 대체했습니다.`,
    );
    return FALLBACK_ABBR_CODE;
  }

  // 해당 (abbrCode, 연도) 조합의 다음 일련번호를 계산한다. COUNT 방식은 중간에
  // 삭제된 행이 있으면 번호가 중복될 수 있어 쓰지 않는다 — 반드시 기존 code들의
  // 끝 4자리 중 최댓값+1을 사용한다(없으면 1).
  private async generateNextCode(abbrCode: string, yy: string): Promise<string> {
    const prefix = `${COMPANY_PREFIX}-${abbrCode}-${yy}`;
    const existing = await this.supplierRepository.find({ where: { code: Like(`${prefix}%`) } });

    let maxSeq = 0;
    for (const supplier of existing) {
      const suffix = supplier.code.slice(prefix.length);
      if (/^\d{4}$/.test(suffix)) {
        maxSeq = Math.max(maxSeq, Number(suffix));
      }
    }

    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  async create(createSupplierDto: CreateSupplierDto): Promise<Supplier> {
    const abbrCode = this.determineAbbrCode(createSupplierDto);
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0');
    const { mainItemIds, ...rest } = createSupplierDto;
    const mainItems = await this.resolveMainItems(mainItemIds ?? []);

    for (let attempt = 1; attempt <= MAX_CODE_GENERATION_RETRIES; attempt++) {
      const code = await this.generateNextCode(abbrCode, yy);
      try {
        const supplier = this.supplierRepository.create({ ...rest, code, abbrCode, mainItems });
        return await this.supplierRepository.save(supplier);
      } catch (error) {
        const isUniqueViolation =
          (error as any)?.code === '23505' || (error as any)?.code === 'SQLITE_CONSTRAINT';
        if (!isUniqueViolation) throw error;
        // 사전 계산(generateNextCode)과 실제 save() 사이의 시간차 동안 동시 요청이
        // 같은 code를 선점한 경우 — 다음 시도에서 최신 최댓값을 다시 계산해 재시도한다.
        this.logger.warn(
          `공급업체 코드(${code}) 채번 충돌(${attempt}번째 시도) — 재계산 후 재시도합니다.`,
        );
      }
    }

    throw new ConflictException('공급업체 코드 자동채번에 반복적으로 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }

  // PR-126: keyword가 있으면 업체명/코드/약칭 부분일치(LOWER() LIKE LOWER()라 SQLite/PostgreSQL에서 똑같이 동작).
  async findAll(filter?: GetSuppliersFilterDto): Promise<Supplier[]> {
    const keyword = filter?.keyword?.trim();
    if (!keyword) {
      return await this.supplierRepository.find({
        relations: ['mainItems'],
        order: { id: 'DESC' },
      });
    }
    return await this.supplierRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.mainItems', 'mainItems')
      .where('(LOWER(s.name) LIKE LOWER(:kw) OR LOWER(s.code) LIKE LOWER(:kw) OR LOWER(s.abbrCode) LIKE LOWER(:kw))', { kw: `%${keyword}%` })
      .orderBy('s.id', 'DESC')
      .getMany();
  }

  async findOne(id: number): Promise<Supplier> {
    const supplier = await this.supplierRepository.findOne({ where: { id }, relations: ['mainItems'] });
    if (!supplier) {
      throw new NotFoundException(`ID가 ${id}인 공급업체를 찾을 수 없습니다.`);
    }
    return supplier;
  }

  async update(id: number, updateSupplierDto: UpdateSupplierDto): Promise<Supplier> {
    // mainItems 관계를 미리 로드해둬야 TypeORM이 save() 시 기존 join 행과 새
    // 배열을 비교해 제거/추가를 정확히 계산한다(로드 안 된 상태로 재할당하면
    // 추가만 되고 빠진 품목의 기존 행이 안 지워질 수 있음).
    const supplier = await this.findOne(id);
    const { mainItemIds, ...rest } = updateSupplierDto;
    Object.assign(supplier, rest);
    // undefined면 필드 자체를 안 보낸 것(기존 값 유지) — PATCH 의미론과 동일하게
    // 처리한다. 빈 배열([])은 "전부 선택 해제"라는 명시적 의도이므로 그대로 반영한다.
    if (mainItemIds !== undefined) {
      supplier.mainItems = await this.resolveMainItems(mainItemIds);
    }
    return await this.supplierRepository.save(supplier);
  }

  async remove(id: number): Promise<void> {
    const supplier = await this.findOne(id);
    await this.supplierRepository.remove(supplier);
  }
}
