import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AiClientService } from './ai-client.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 3,
    }),
    ConfigModule,
  ],
  providers: [AiClientService],
  exports: [AiClientService],
})
export class AiClientModule {}