import { Controller, Post, Body } from '@nestjs/common';
import { MappingCommitService } from '../services/mapping-commit.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('데이터 매핑 커밋 API')
@Controller('mapping')
export class MappingCommitController {
  constructor(private readonly mappingCommitService: MappingCommitService) {}

  @ApiOperation({ summary: '최종 매핑 데이터 저장' })
  @Post('commit')
  async commit(@Body() payload: any) {
    return await this.mappingCommitService.commit(payload);
  }
}
