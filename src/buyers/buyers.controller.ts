import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BuyersService } from './buyers.service';
import { CreateBuyerDto } from './dto/create-buyer.dto';
import { UpdateBuyerDto } from './dto/update-buyer.dto';
import { GetBuyersFilterDto } from './dto/get-buyers-filter.dto';
import { Buyer } from './entities/buyer.entity';

@ApiTags('Buyers (고객사 관리)')
@ApiBearerAuth()
@Controller('buyers')
export class BuyersController {
  constructor(private readonly buyersService: BuyersService) {}

  @Post()
  @ApiOperation({ summary: '고객사 등록' })
  @ApiResponse({ status: 201, description: '성공적으로 등록됨', type: Buyer })
  @ApiResponse({ status: 409, description: '고객사 코드 중복' })
  create(@Body() createBuyerDto: CreateBuyerDto): Promise<Buyer> {
    return this.buyersService.create(createBuyerDto);
  }

  @Get()
  @ApiOperation({ summary: '고객사 목록 조회 (keyword: 고객사명/코드/브랜드약칭 부분일치, 대소문자 무시)' })
  @ApiResponse({ status: 200, description: '조회 성공', type: [Buyer] })
  findAll(@Query() filter: GetBuyersFilterDto): Promise<Buyer[]> {
    return this.buyersService.findAll(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: '특정 고객사 상세 조회' })
  @ApiResponse({ status: 200, description: '조회 성공', type: Buyer })
  @ApiResponse({ status: 404, description: '고객사를 찾을 수 없음' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Buyer> {
    return this.buyersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '고객사 정보 수정' })
  @ApiResponse({ status: 200, description: '수정 완료', type: Buyer })
  @ApiResponse({ status: 404, description: '고객사를 찾을 수 없음' })
  @ApiResponse({ status: 409, description: '고객사 코드 중복' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateBuyerDto: UpdateBuyerDto,
  ): Promise<Buyer> {
    return this.buyersService.update(id, updateBuyerDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '고객사 삭제' })
  @ApiResponse({ status: 200, description: '삭제 완료' })
  @ApiResponse({ status: 404, description: '고객사를 찾을 수 없음' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.buyersService.remove(id);
  }
}
