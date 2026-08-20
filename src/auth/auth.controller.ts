import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@ApiTags('인증 API (Auth)')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @ApiOperation({ summary: '신규 사용자 회원가입' })
  @ApiResponse({ status: 201, description: '회원가입 성공' })
  @ApiResponse({ status: 400, description: '잘못된 입력 데이터' })
  @Post('register')
  async register(@Body() registerDto: any) {
    return await this.authService.register(registerDto);
  }

  @Public()
  @ApiOperation({ summary: '사용자 로그인 및 JWT 발급' })
  @ApiResponse({ status: 200, description: '로그인 성공' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  @Post('login')
  async login(@Body() loginDto: any) {
    return await this.authService.login(loginDto);
  }
}