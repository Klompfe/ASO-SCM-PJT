import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { POService } from './po.service';
import { POStatus } from './entities/po-header.entity';
import { RlsSessionGuard } from '../../common/guards/rls-session.guard';
import { RlsCleanupInterceptor } from '../../common/interceptors/rls-cleanup.interceptor';
import { CurrentUser, UserContext } from '../../common/decorators/current-user.decorator';

class CreatePODto {
  poNumber: string;
  vendorName: string;
  totalAmount: number;
}

class TransitionStatusDto {
  nextStatus: POStatus;
  remark?: string;
}

class ParsePOTextDto {
  rawText: string;
}

class MaterialSearchDto {
  queryText: string;
  topK?: number;
}

@Controller('v1/purchase-orders')
@UseGuards(RlsSessionGuard)
@UseInterceptors(RlsCleanupInterceptor)
export class POController {
  constructor(private readonly poService: POService) {}

  @Post()
  async create(
    @Body() dto: CreatePODto,
    @CurrentUser() user: UserContext,
  ) {
    return await this.poService.createPO(dto, user.tenantId, user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.poService.findOne(id);
  }

  @Patch(':id/status')
  async transitionStatus(
    @Param('id') id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser('userId') userId: string,
  ) {
    return await this.poService.changeStatus(id, dto.nextStatus, userId, dto.remark);
  }

  @Post('ai/parse-text')
  async parsePOText(@Body() dto: ParsePOTextDto) {
    return await this.poService.parseUnstructuredPOText(dto.rawText);
  }

  @Post('ai/search-materials')
  async searchMaterials(@Body() dto: MaterialSearchDto) {
    return await this.poService.searchMaterialsCatalog(dto.queryText, dto.topK);
  }
}