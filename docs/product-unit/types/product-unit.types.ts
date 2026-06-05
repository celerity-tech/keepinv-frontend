import type { Prisma, Product } from '@prisma/client';

export const PRODUCT_UNIT_INCLUDE = {
  product: true,
  location: true,
} satisfies Prisma.ProductUnitInclude;

export const PRODUCT_UNIT_MOVEMENT_INCLUDE = {
  product: true,
  productUnit: {
    include: PRODUCT_UNIT_INCLUDE,
  },
  supplier: true,
  location: true,
  user: true,
} satisfies Prisma.StockMovementInclude;

export type ProductUnitWithRelations = Prisma.ProductUnitGetPayload<{
  include: typeof PRODUCT_UNIT_INCLUDE;
}>;

export type ProductUnitMovement = Prisma.StockMovementGetPayload<{
  include: typeof PRODUCT_UNIT_MOVEMENT_INCLUDE;
}>;

export interface RegisterProductUnitsResult {
  createdCount: number;
  product: Product;
  units: ProductUnitWithRelations[];
  movements: ProductUnitMovement[];
}

export interface ProductUnitStatusChangeResult {
  product: Product;
  unit: ProductUnitWithRelations;
  movement: ProductUnitMovement | null;
}
