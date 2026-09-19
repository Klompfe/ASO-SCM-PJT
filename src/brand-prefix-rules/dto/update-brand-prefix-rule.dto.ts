import { PartialType } from '@nestjs/swagger';
import { CreateBrandPrefixRuleDto } from './create-brand-prefix-rule.dto';

export class UpdateBrandPrefixRuleDto extends PartialType(CreateBrandPrefixRuleDto) {}
