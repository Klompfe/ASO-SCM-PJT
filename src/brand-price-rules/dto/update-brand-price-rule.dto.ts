import { PartialType } from '@nestjs/swagger';
import { CreateBrandPriceRuleDto } from './create-brand-price-rule.dto';

export class UpdateBrandPriceRuleDto extends PartialType(CreateBrandPriceRuleDto) {}
