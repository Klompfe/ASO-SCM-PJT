import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

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
  ) {}

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

    for (let attempt = 1; attempt <= MAX_CODE_GENERATION_RETRIES; attempt++) {
      const code = await this.generateNextCode(abbrCode, yy);
      try {
        const supplier = this.supplierRepository.create({ ...createSupplierDto, code, abbrCode });
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
    Object.assign(supplier, updateSupplierDto);
    return await this.supplierRepository.save(supplier);
  }

  async remove(id: number): Promise<void> {
    const supplier = await this.findOne(id);
    await this.supplierRepository.remove(supplier);
  }
}
