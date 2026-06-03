import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { StockMovementType } from '@prisma/client';

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class RegisterProductUnitInputDTO {
  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(64)
  assetTag?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(64)
  serialNumber?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(128)
  rfidTag?: string;
}

export class RegisterProductUnitsDTO {
  @IsUUID()
  productId!: string;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsIn([StockMovementType.INITIAL, StockMovementType.PURCHASE])
  movementType?: StockMovementType;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(255)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RegisterProductUnitInputDTO)
  units!: RegisterProductUnitInputDTO[];
}
