import { PartialType } from '@nestjs/swagger';
import { CreateMaterialPackagingUnitRuleDto } from './create-material-packaging-unit-rule.dto';

export class UpdateMaterialPackagingUnitRuleDto extends PartialType(CreateMaterialPackagingUnitRuleDto) {}
