import { BadRequestException, Controller, Get, Post, Body, Query } from '@nestjs/common';
import { MappingCommitService } from '../services/mapping-commit.service';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CommitMappingDto } from '../dto/commit-mapping.dto';

@ApiTags('데이터 매핑 커밋 API')
@Controller('mapping')
export class MappingCommitController {
  constructor(private readonly mappingCommitService: MappingCommitService) {}

  @ApiOperation({ summary: '해당 styleNo가 이미 등록(승인)되어 있는지 확인' })
  @ApiQuery({ name: 'styleNo', required: true, example: 'MB62SLM103Z' })
  @Get('check-exists')
  async checkExists(@Query('styleNo') styleNo: string) {
    if (!styleNo) throw new BadRequestException('styleNo는 필수입니다.');
    return await this.mappingCommitService.checkExists(styleNo);
  }

  @ApiOperation({ summary: '최종 매핑 데이터 저장' })
  @Post('commit')
  async commit(@Body() payload: CommitMappingDto) {
    return await this.mappingCommitService.commit(payload);
  }
}
