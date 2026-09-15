import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProductionContractsService } from './production-contracts.service';
import { CreateProductionContractDto } from './dto/create-production-contract.dto';
import { UpdateProductionContractDto } from './dto/update-production-contract.dto';
import { ProductionContract } from './entities/production-contract.entity';

@ApiTags('생산계약 (태일비나 Sales Contract)')
@ApiBearerAuth()
@Controller('production-contracts')
export class ProductionContractsController {
  constructor(private readonly productionContractsService: ProductionContractsService) {}

  @Post()
  @ApiOperation({ summary: '생산계약 등록' })
  @ApiResponse({ status: 201, description: '성공적으로 등록됨', type: ProductionContract })
  @ApiResponse({ status: 400, description: 'priceSource/cmtPrice 조합이 잘못됨' })
  create(@Body() dto: CreateProductionContractDto): Promise<ProductionContract> {
    return this.productionContractsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '생산계약 전체 목록 조회' })
  @ApiResponse({ status: 200, description: '조회 성공', type: [ProductionContract] })
  findAll(): Promise<ProductionContract[]> {
    return this.productionContractsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '생산계약 상세 조회' })
  @ApiResponse({ status: 200, description: '조회 성공', type: ProductionContract })
  @ApiResponse({ status: 404, description: '생산계약을 찾을 수 없음' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ProductionContract> {
    return this.productionContractsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '생산계약 수정' })
  @ApiResponse({ status: 200, description: '수정 완료', type: ProductionContract })
  @ApiResponse({ status: 404, description: '생산계약을 찾을 수 없음' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductionContractDto,
  ): Promise<ProductionContract> {
    return this.productionContractsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '생산계약 삭제' })
  @ApiResponse({ status: 200, description: '삭제 완료' })
  @ApiResponse({ status: 404, description: '생산계약을 찾을 수 없음' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.productionContractsService.remove(id);
  }
}
