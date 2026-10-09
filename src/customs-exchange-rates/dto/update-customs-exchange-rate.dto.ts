import { PartialType } from '@nestjs/swagger';
import { CreateCustomsExchangeRateDto } from './create-customs-exchange-rate.dto';

export class UpdateCustomsExchangeRateDto extends PartialType(CreateCustomsExchangeRateDto) {}
