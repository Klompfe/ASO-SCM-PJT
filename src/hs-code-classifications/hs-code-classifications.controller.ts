import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HsCodeClassificationsService } from './hs-code-classifications.service';
import { CreateHsCodeClassificationDto } from './dto/create-hs-code-classification.dto';
import { GetHsCodeClassificationsFilterDto } from './dto/get-hs-code-classifications-filter.dto';
import { LookupHsCodeDto } from './dto/lookup-hs-code.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { Public } from '../auth/public.decorator';
import { HsCodeApiKeyGuard } from './guards/hs-code-api-key.guard';

// PR-081: 완제품 수입통관 HS코드 분류(품종+재직+혼용률 -> HS코드) 관리.
// - 내부(로그인 사용자): 목록 조회는 누구나, 등록/임포트는 MANAGER/ADMIN.
// - 외부(Python 수입통관 이메일 에이전트): /lookup, /by-style/:styleNo는
//   @Public()으로 전역 JwtAuthGuard를 우회하고 HsCodeApiKeyGuard(x-api-key)로
//   인증한다 — 이 프로젝트 밖의 서버 대 서버 호출이라 JWT 로그인 세션이 없다.
@ApiTags('HS코드 분류 (HS Code Classifications)')
@Controller('hs-code-classifications')
export class HsCodeClassificationsController {
  constructor(private readonly service: HsCodeClassificationsService) {}

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Post('import')
  @ApiOperation({ summary: 'HS코드 분류 엑셀 업로드 (시즌별 갱신, MANAGER/ADMIN)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  import(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('업로드할 엑셀 파일이 없습니다.');
    }
    return this.service.importFromExcel(file.buffer);
  }

  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'HS코드 분류 목록 조회 (품종/재직/혼용률 검색, 페이지네이션)' })
  findAll(@Query() filter: GetHsCodeClassificationsFilterDto) {
    return this.service.findAll(filter);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: 'HS코드 분류 수동 등록/수정 (MANAGER/ADMIN)' })
  create(@Body() dto: CreateHsCodeClassificationDto) {
    return this.service.upsertOne(dto);
  }

  @Public()
  @UseGuards(HsCodeApiKeyGuard)
  @Get('lookup')
  @ApiOperation({ summary: '[외부 API키 인증] 품종+재직+혼용률 정확 매칭 조회' })
  lookup(@Query() dto: LookupHsCodeDto) {
    return this.service.lookup(dto);
  }

  @Public()
  @UseGuards(HsCodeApiKeyGuard)
  @Get('by-style/:styleNo')
  @ApiOperation({ summary: '[외부 API키 인증] Style No로 HS코드 분류 조회' })
  findByStyle(@Param('styleNo') styleNo: string) {
    return this.service.findByStyle(styleNo);
  }
}
