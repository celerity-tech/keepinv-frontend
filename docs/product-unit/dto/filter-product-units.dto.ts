import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ProductUnitStatus } from '@prisma/client';

import { PaginationQueryDTO } from '../../../common/dto/pagination-query.dto';

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class FilterProductUnitsDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsEnum(ProductUnitStatus)
  status?: ProductUnitStatus;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  search?: string;
}
