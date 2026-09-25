import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ContractsService } from './contracts.service';
import { IssueContractDto } from './dto/issue-contract.dto';
import { BulkApproveContractsDto } from './dto/bulk-approve-contracts.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AuditLog } from '../audit-log/audit-log.decorator';

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

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditLog({ entityType: 'Contract', table: 'contract', pkColumn: 'id' })
  @Patch(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.contractsService.approve(id, user.userId);
  }

  // PR-090: bulk-approve는 :id 세그먼트가 아니라 고정 경로라 ':id/approve'와
  // 세그먼트 수가 달라 라우트 순서와 무관하게 충돌하지 않는다.
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  // 여러 계약을 한 번에 승인하는 일괄 처리라 단일 대상 beforeValue를 특정할 수 없다.
  @AuditLog({ entityType: 'Contract(bulkApprove)' })
  @Patch('bulk-approve')
  bulkApprove(@Body() dto: BulkApproveContractsDto, @GetUser() user: any) {
    return this.contractsService.bulkApprove(dto?.ids, user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditLog({ entityType: 'Contract', table: 'contract', pkColumn: 'id' })
  @Patch(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.contractsService.reject(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditLog({ entityType: 'Contract', table: 'contract', pkColumn: 'id' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contractsService.remove(id);
  }
}
