import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Supplier } from './entities/supplier.entity';

@ApiTags('Suppliers (공급업체 관리)')
@ApiBearerAuth()
@Controller('suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @ApiOperation({ summary: '공급업체 등록' })
  @ApiResponse({ status: 201, description: '성공적으로 등록됨', type: Supplier })
  @ApiResponse({ status: 409, description: '업체 코드 중복' })
  create(@Body() createSupplierDto: CreateSupplierDto): Promise<Supplier> {
    return this.suppliersService.create(createSupplierDto);
  }

  @Get()
  @ApiOperation({ summary: '공급업체 전체 목록 조회' })
  @ApiResponse({ status: 200, description: '조회 성공', type: [Supplier] })
  findAll(): Promise<Supplier[]> {
    return this.suppliersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '특정 공급업체 상세 조회' })
  @ApiResponse({ status: 200, description: '조회 성공', type: Supplier })
  @ApiResponse({ status: 404, description: '업체를 찾을 수 없음' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Supplier> {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '공급업체 정보 수정' })
  @ApiResponse({ status: 200, description: '수정 완료', type: Supplier })
  @ApiResponse({ status: 404, description: '업체를 찾을 수 없음' })
  @ApiResponse({ status: 409, description: '업체 코드 중복' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSupplierDto: UpdateSupplierDto,
  ): Promise<Supplier> {
    return this.suppliersService.update(id, updateSupplierDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '공급업체 삭제' })
  @ApiResponse({ status: 200, description: '삭제 완료' })
  @ApiResponse({ status: 404, description: '업체를 찾을 수 없음' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.suppliersService.remove(id);
  }
}