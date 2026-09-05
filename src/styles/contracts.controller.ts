import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ContractsService } from './contracts.service';
import { IssueContractDto } from './dto/issue-contract.dto';

@ApiTags('계약서 발행')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  issue(@Body() dto: IssueContractDto) {
    return this.contractsService.issue(dto);
  }

  @Get()
  @ApiQuery({ name: 'styleNo', required: true, example: 'MB62SLM103Z' })
  findByStyle(@Query('styleNo') styleNo: string) {
    if (!styleNo) {
      throw new BadRequestException('styleNo는 필수입니다.');
    }
    return this.contractsService.findByStyleNo(styleNo);
  }
}
