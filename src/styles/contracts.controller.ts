import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ContractsService } from './contracts.service';
import { IssueContractDto } from './dto/issue-contract.dto';
import { BulkApproveContractsDto } from './dto/bulk-approve-contracts.dto';
import { ApproveContractDto } from './dto/approve-contract.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/entities/user.entity';

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

  // PR-167: 승인 화면이 "판매시장 선택이 필요한지/제안 계약방식이 뭔지"를 먼저
  // 보여줄 수 있도록 조회 전용 엔드포인트 — 승인 권한 없이도(MANAGER 지정 전
  // 담당자가 미리 볼 수 있게) 조회만 허용한다.
  @Get(':id/approval-context')
  getApprovalContext(@Param('id', ParseIntPipe) id: number) {
    return this.contractsService.getApprovalContext(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Patch(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveContractDto, @GetUser() user: any) {
    return this.contractsService.approve(id, user.userId, dto);
  }

  // PR-090: bulk-approve는 :id 세그먼트가 아니라 고정 경로라 ':id/approve'와
  // 세그먼트 수가 달라 라우트 순서와 무관하게 충돌하지 않는다.
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Patch('bulk-approve')
  bulkApprove(@Body() dto: BulkApproveContractsDto, @GetUser() user: any) {
    return this.contractsService.bulkApprove(dto?.ids, user.userId, dto?.factory);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Patch(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.contractsService.reject(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contractsService.remove(id);
  }
}
