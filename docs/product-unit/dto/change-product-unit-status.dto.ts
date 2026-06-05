import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ProductUnitStatus } from '@prisma/client';

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class ChangeProductUnitStatusDTO {
  @IsEnum(ProductUnitStatus)
  status!: ProductUnitStatus;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(255)
  note?: string;
}
