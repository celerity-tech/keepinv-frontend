import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class RetireProductUnitDTO {
  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(255)
  note?: string;
}
