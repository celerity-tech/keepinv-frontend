import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductUnitStatus, StockMovementType } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { RegisterProductUnitInputDTO, RegisterProductUnitsDTO } from './dto/register-product-units.dto';
import { FilterProductUnitsDTO } from './dto/filter-product-units.dto';
import { UpdateProductUnitDTO } from './dto/update-product-unit.dto';
import { WriteProductUnitTagDTO } from './dto/write-product-unit-tag.dto';
import { ChangeProductUnitStatusDTO } from './dto/change-product-unit-status.dto';
import { RetireProductUnitDTO } from './dto/retire-product-unit.dto';
import {
  PRODUCT_UNIT_INCLUDE,
  PRODUCT_UNIT_MOVEMENT_INCLUDE,
  ProductUnitMovement,
  ProductUnitStatusChangeResult,
  ProductUnitWithRelations,
  RegisterProductUnitsResult,
} from './types/product-unit.types';

type UnitIdentifierField = 'assetTag' | 'serialNumber' | 'rfidTag';
type UnitIdentifierMap = Partial<Record<UnitIdentifierField, string | null | undefined>>;
type ProductUnitPatchData = Partial<Record<UnitIdentifierField, string | null>> & {
  locationId?: string | null;
};
type ProductUnitForWrite = Prisma.ProductUnitGetPayload<{ include: { product: true } }>;

const STOCK_COUNTED_STATUSES = new Set<ProductUnitStatus>([
  ProductUnitStatus.IN_STOCK,
  ProductUnitStatus.RESERVED,
  ProductUnitStatus.RETURNED,
]);

const LOCATION_CLEARED_STATUSES = new Set<ProductUnitStatus>([
  ProductUnitStatus.SOLD,
  ProductUnitStatus.LOST,
]);

const TAG_WRITE_BLOCKED_STATUSES = new Set<ProductUnitStatus>([
  ProductUnitStatus.SOLD,
  ProductUnitStatus.LOST,
]);

@Injectable()
export class ProductUnitService {
  constructor(private readonly prisma: PrismaService) {}

  async registerProductUnits(
    userId: string,
    body: RegisterProductUnitsDTO,
  ): Promise<RegisterProductUnitsResult> {
    const movementType = body.movementType ?? StockMovementType.INITIAL;
    const units = body.units.map((unit) => this.normalizeUnitInput(unit));

    this.ensureUnitsHaveIdentifiers(units);
    this.ensurePayloadIdentifiersAreUnique(units);

    const product = await this.prisma.product.findFirst({
      where: { id: body.productId, isArchived: false },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (!product.isSerialized) {
      throw new BadRequestException('Product units can only be registered for serialized products');
    }

    await this.validateLocation(body.locationId);
    await this.validateSupplier(body.supplierId);
    await this.ensureIdentifiersAvailable(units);

    return this.prisma.$transaction(async (tx) => {
      const createdUnits: ProductUnitWithRelations[] = [];

      for (const unit of units) {
        createdUnits.push(
          await tx.productUnit.create({
            data: {
              ...unit,
              status: ProductUnitStatus.IN_STOCK,
              productId: body.productId,
              locationId: body.locationId,
            },
            include: PRODUCT_UNIT_INCLUDE,
          }),
        );
      }

      const updatedProduct = await tx.product.update({
        where: { id: body.productId },
        data: { quantityOnHand: { increment: createdUnits.length } },
      });
      const firstQuantityAfter = updatedProduct.quantityOnHand - createdUnits.length + 1;

      const movements: ProductUnitMovement[] = [];
      for (const [index, unit] of createdUnits.entries()) {
        movements.push(
          await tx.stockMovement.create({
            data: {
              type: movementType,
              quantityChange: 1,
              quantityAfter: firstQuantityAfter + index,
              note: body.note,
              productId: body.productId,
              productUnitId: unit.id,
              locationId: body.locationId,
              supplierId: body.supplierId,
              userId,
            },
            include: PRODUCT_UNIT_MOVEMENT_INCLUDE,
          }),
        );
      }

      return {
        createdCount: createdUnits.length,
        product: updatedProduct,
        units: createdUnits,
        movements,
      };
    });
  }

  async updateProductUnit(
    id: string,
    body: UpdateProductUnitDTO,
  ): Promise<ProductUnitWithRelations> {
    this.ensurePatchHasChanges(body);

    const current = await this.getProductUnitForWrite(id);
    const data = this.buildPatchData(body);

    const mergedIdentifiers: UnitIdentifierMap = {
      assetTag: data.assetTag === undefined ? current.assetTag : data.assetTag,
      serialNumber: data.serialNumber === undefined ? current.serialNumber : data.serialNumber,
      rfidTag: data.rfidTag === undefined ? current.rfidTag : data.rfidTag,
    };
    this.ensureUnitsHaveIdentifiers([mergedIdentifiers]);
    this.ensurePayloadIdentifiersAreUnique([mergedIdentifiers]);

    const identifiersToCheck: UnitIdentifierMap = {
      assetTag: data.assetTag ?? undefined,
      serialNumber: data.serialNumber ?? undefined,
      rfidTag: data.rfidTag ?? undefined,
    };
    await this.ensureIdentifiersAvailable([identifiersToCheck], id);

    if (Object.prototype.hasOwnProperty.call(data, 'locationId')) {
      if (data.locationId) await this.validateLocation(data.locationId);
      if (!data.locationId && this.isStockCountedStatus(current.status)) {
        throw new BadRequestException('Location is required for on-hand product units');
      }
    }

    return this.prisma.productUnit.update({
      where: { id },
      data,
      include: PRODUCT_UNIT_INCLUDE,
    });
  }

  async writeProductUnitTag(
    id: string,
    body: WriteProductUnitTagDTO,
  ): Promise<ProductUnitWithRelations> {
    const current = await this.getProductUnitForWrite(id);
    if (TAG_WRITE_BLOCKED_STATUSES.has(current.status)) {
      throw new BadRequestException('RFID tags cannot be written to retired or sold units');
    }

    this.ensurePayloadIdentifiersAreUnique([
      {
        assetTag: current.assetTag,
        serialNumber: current.serialNumber,
        rfidTag: body.rfidTag,
      },
    ]);
    await this.ensureIdentifiersAvailable([{ rfidTag: body.rfidTag }], id);

    return this.prisma.productUnit.update({
      where: { id },
      data: { rfidTag: body.rfidTag },
      include: PRODUCT_UNIT_INCLUDE,
    });
  }

  async changeProductUnitStatus(
    userId: string,
    id: string,
    body: ChangeProductUnitStatusDTO,
  ): Promise<ProductUnitStatusChangeResult> {
    const current = await this.getProductUnitForWrite(id);
    if (body.locationId) await this.validateLocation(body.locationId);

    const nextLocationId = this.resolveNextLocationId(current, body);
    if (this.isStockCountedStatus(body.status) && !nextLocationId) {
      throw new BadRequestException('Location is required for on-hand product units');
    }

    const delta = this.resolveStatusQuantityDelta(current.status, body.status);
    if (delta === 0) {
      const unit = await this.prisma.productUnit.update({
        where: { id },
        data: {
          status: body.status,
          locationId: nextLocationId,
        },
        include: PRODUCT_UNIT_INCLUDE,
      });

      return { product: current.product, unit, movement: null };
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: { id: current.productId },
        data: { quantityOnHand: { increment: delta } },
      });

      if (updatedProduct.quantityOnHand < 0) {
        throw new BadRequestException('Status change would drive stock below zero');
      }

      const unit = await tx.productUnit.update({
        where: { id },
        data: {
          status: body.status,
          locationId: nextLocationId,
        },
        include: PRODUCT_UNIT_INCLUDE,
      });

      const movement = await tx.stockMovement.create({
        data: {
          type: this.resolveStatusMovementType(current.status, body.status, delta),
          quantityChange: delta,
          quantityAfter: updatedProduct.quantityOnHand,
          note: body.note,
          productId: current.productId,
          productUnitId: id,
          locationId: nextLocationId,
          userId,
        },
        include: PRODUCT_UNIT_MOVEMENT_INCLUDE,
      });

      return { product: updatedProduct, unit, movement };
    });
  }

  async retireProductUnit(
    userId: string,
    id: string,
    body: RetireProductUnitDTO,
  ): Promise<ProductUnitStatusChangeResult> {
    return this.changeProductUnitStatus(userId, id, {
      status: ProductUnitStatus.LOST,
      note: body.note ?? 'Product unit retired',
    });
  }

  async getAllProductUnits(
    filter: FilterProductUnitsDTO,
  ): Promise<PaginatedResponse<ProductUnitWithRelations>> {
    const { page, limit } = filter;
    const where = this.buildWhere(filter);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.productUnit.findMany({
        where,
        include: PRODUCT_UNIT_INCLUDE,
        orderBy: [
          { product: { name: 'asc' } },
          { assetTag: 'asc' },
          { serialNumber: 'asc' },
          { rfidTag: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productUnit.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getProductUnit(id: string): Promise<ProductUnitWithRelations> {
    const unit = await this.prisma.productUnit.findFirst({
      where: { id, product: { isArchived: false } },
      include: PRODUCT_UNIT_INCLUDE,
    });
    if (!unit) throw new NotFoundException('Product unit not found');
    return unit;
  }

  private async getProductUnitForWrite(id: string): Promise<ProductUnitForWrite> {
    const unit = await this.prisma.productUnit.findFirst({
      where: { id, product: { isArchived: false } },
      include: { product: true },
    });
    if (!unit) throw new NotFoundException('Product unit not found');
    return unit;
  }

  private buildWhere(filter: FilterProductUnitsDTO): Prisma.ProductUnitWhereInput {
    const { productId, locationId, status, search } = filter;
    const where: Prisma.ProductUnitWhereInput = {
      product: { isArchived: false },
    };

    if (productId) where.productId = productId;
    if (locationId) where.locationId = locationId;
    where.status = status ?? { notIn: [ProductUnitStatus.SOLD, ProductUnitStatus.LOST] };

    if (search) {
      where.OR = [
        { assetTag: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
        { rfidTag: { contains: search, mode: 'insensitive' } },
        { product: { name: { contains: search, mode: 'insensitive' } } },
        { product: { sku: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private normalizeUnitInput(unit: RegisterProductUnitInputDTO): UnitIdentifierMap {
    return {
      assetTag: this.cleanOptional(unit.assetTag),
      serialNumber: this.cleanOptional(unit.serialNumber),
      rfidTag: this.cleanOptional(unit.rfidTag),
    };
  }

  private cleanOptional(value?: string): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private ensurePatchHasChanges(body: UpdateProductUnitDTO): void {
    const hasChanges = ['assetTag', 'serialNumber', 'rfidTag', 'locationId'].some((field) =>
      Object.prototype.hasOwnProperty.call(body, field),
    );
    if (!hasChanges) throw new BadRequestException('No product unit changes supplied');
  }

  private buildPatchData(body: UpdateProductUnitDTO): ProductUnitPatchData {
    const data: ProductUnitPatchData = {};

    if (Object.prototype.hasOwnProperty.call(body, 'assetTag')) {
      data.assetTag = this.cleanNullable(body.assetTag);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'serialNumber')) {
      data.serialNumber = this.cleanNullable(body.serialNumber);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'rfidTag')) {
      data.rfidTag = this.cleanNullable(body.rfidTag);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'locationId')) {
      data.locationId = body.locationId ?? null;
    }

    return data;
  }

  private cleanNullable(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private ensureUnitsHaveIdentifiers(units: UnitIdentifierMap[]): void {
    const missingIndex = units.findIndex((unit) => !this.identifierEntries(unit).length);
    if (missingIndex >= 0) {
      throw new BadRequestException(
        `units[${missingIndex}] must include assetTag, serialNumber, or rfidTag`,
      );
    }
  }

  private ensurePayloadIdentifiersAreUnique(units: UnitIdentifierMap[]): void {
    const seen = new Map<string, string>();

    units.forEach((unit, index) => {
      for (const [field, value] of this.identifierEntries(unit)) {
        const previous = seen.get(value);
        if (previous) {
          throw new BadRequestException(
            `Duplicate unit identifier "${value}" in ${previous} and units[${index}].${field}`,
          );
        }
        seen.set(value, `units[${index}].${field}`);
      }
    });
  }

  private async ensureIdentifiersAvailable(
    units: UnitIdentifierMap[],
    exceptId?: string,
  ): Promise<void> {
    const identifiers = Array.from(
      new Set(units.flatMap((unit) => this.identifierEntries(unit).map(([, value]) => value))),
    );
    if (identifiers.length === 0) return;

    const existing = await this.prisma.productUnit.findFirst({
      where: {
        ...(exceptId ? { id: { not: exceptId } } : {}),
        OR: [
          { assetTag: { in: identifiers } },
          { serialNumber: { in: identifiers } },
          { rfidTag: { in: identifiers } },
        ],
      },
      select: {
        assetTag: true,
        serialNumber: true,
        rfidTag: true,
      },
    });
    if (existing) throw new ConflictException('Unit identifier already in use');
  }

  private identifierEntries(unit: UnitIdentifierMap): [UnitIdentifierField, string][] {
    return (['assetTag', 'serialNumber', 'rfidTag'] as const)
      .map((field) => [field, unit[field]] as [UnitIdentifierField, string | null | undefined])
      .filter((entry): entry is [UnitIdentifierField, string] => Boolean(entry[1]));
  }

  private resolveNextLocationId(
    current: ProductUnitForWrite,
    body: ChangeProductUnitStatusDTO,
  ): string | null {
    if (body.locationId) return body.locationId;
    if (LOCATION_CLEARED_STATUSES.has(body.status)) return null;
    return current.locationId;
  }

  private resolveStatusQuantityDelta(
    currentStatus: ProductUnitStatus,
    nextStatus: ProductUnitStatus,
  ): number {
    const currentCounted = this.isStockCountedStatus(currentStatus);
    const nextCounted = this.isStockCountedStatus(nextStatus);

    if (currentCounted === nextCounted) return 0;
    return nextCounted ? 1 : -1;
  }

  private resolveStatusMovementType(
    currentStatus: ProductUnitStatus,
    nextStatus: ProductUnitStatus,
    delta: number,
  ): StockMovementType {
    if (delta < 0 && nextStatus === ProductUnitStatus.SOLD) return StockMovementType.SALE;
    if (delta > 0 && currentStatus === ProductUnitStatus.SOLD) return StockMovementType.RETURN;
    if (delta > 0 && nextStatus === ProductUnitStatus.RETURNED) return StockMovementType.RETURN;
    return StockMovementType.ADJUSTMENT;
  }

  private isStockCountedStatus(status: ProductUnitStatus): boolean {
    return STOCK_COUNTED_STATUSES.has(status);
  }

  private async validateLocation(locationId: string): Promise<void> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, isArchived: false },
    });
    if (!location) throw new NotFoundException('Location not found');
  }

  private async validateSupplier(supplierId?: string): Promise<void> {
    if (!supplierId) return;

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, isArchived: false },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
  }
}
