import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiClientService } from './ai-client.service';

@Module({
  imports: [HttpModule],
  providers: [AiClientService],
  exports: [AiClientService, HttpModule], // AiClientService 및 HttpModule을 외부에 명시적으로 내보냄
})
export class AiClientModule {}