import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateTransactionDto } from './create-transaction.dto';

// Transfers are immutable from the source side after creation — they have a paired
// row that would be hard to keep in sync on edits. So edits are limited to non-transfer
// fields.
export class UpdateTransactionDto extends PartialType(
  OmitType(CreateTransactionDto, ['transferToAccountId', 'transferToAmount'] as const),
) {}
