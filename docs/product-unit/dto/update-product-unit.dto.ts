import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trimNullable = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class UpdateProductUnitDTO {
  @IsOptional()
  @Transform(trimNullable)
  @IsString()
  @MaxLength(64)
  assetTag?: string | null;

  @IsOptional()
  @Transform(trimNullable)
  @IsString()
  @MaxLength(64)
  serialNumber?: string | null;

  @IsOptional()
  @Transform(trimNullable)
  @IsString()
  @MaxLength(128)
  rfidTag?: string | null;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;
}
