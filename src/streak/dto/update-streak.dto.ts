import { PartialType } from '@nestjs/swagger';

import { CreateStreakDto } from './create-streak.dto';

export class UpdateStreakDto extends PartialType(CreateStreakDto) {}
