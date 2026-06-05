import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Product, ProductUnit, ProductUnitStatus, StockMovementType } from '@prisma/client';

import { ProductUnitService } from './product-unit.service';
import { PrismaService } from '../../core/database/prisma.service';
import { FilterProductUnitsDTO } from './dto/filter-product-units.dto';

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';
const LOCATION_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const buildProduct = (overrides: Partial<Product> = {}): Product => ({
  id: PRODUCT_ID,
  name: 'Cisco Catalyst Switch',
  description: null,
  sku: 'CSC-C9200L-24P-4G',
  barcode: null,
  brand: null,
  costPrice: 0 as unknown as Product['costPrice'],
  sellingPrice: 0 as unknown as Product['sellingPrice'],
  quantityOnHand: 0,
  reorderPoint: null,
  isSerialized: true,
  isArchived: false,
  categoryId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  supplierId: null,
  locationId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const buildUnit = (overrides: Partial<ProductUnit> = {}) => ({
  id: '33333333-3333-3333-3333-333333333333',
  assetTag: null,
  serialNumber: 'SN-001',
  rfidTag: 'EPC-001',
  status: ProductUnitStatus.IN_STOCK,
  productId: PRODUCT_ID,
  locationId: LOCATION_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  product: buildProduct(),
  location: { id: LOCATION_ID, name: 'Warehouse A', code: null },
  stockMovements: [],
  inventoryAuditScans: [],
  ...overrides,
});

describe('ProductUnitService', () => {
  let service: ProductUnitService;
  let tx: {
    productUnit: { create: jest.Mock; update: jest.Mock };
    product: { update: jest.Mock };
    stockMovement: { create: jest.Mock };
  };
  let prisma: {
    product: { findFirst: jest.Mock };
    productUnit: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    location: { findFirst: jest.Mock };
    supplier: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    tx = {
      productUnit: { create: jest.fn(), update: jest.fn() },
      product: { update: jest.fn() },
      stockMovement: { create: jest.fn() },
    };

    prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(buildProduct()) },
      productUnit: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      location: { findFirst: jest.fn().mockResolvedValue({ id: LOCATION_ID }) },
      supplier: { findFirst: jest.fn() },
      $transaction: jest.fn().mockImplementation((arg) =>
        typeof arg === 'function' ? arg(tx) : Promise.resolve(arg),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductUnitService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ProductUnitService>(ProductUnitService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerProductUnits', () => {
    const register = () =>
      service.registerProductUnits(USER_ID, {
        productId: PRODUCT_ID,
        locationId: LOCATION_ID,
        movementType: StockMovementType.PURCHASE,
        note: 'PO-1001',
        units: [
          { serialNumber: 'SN-001', rfidTag: 'EPC-001' },
          { serialNumber: 'SN-002', rfidTag: 'EPC-002' },
        ],
      });

    it('creates serialized units and one stock movement per unit', async () => {
      tx.productUnit.create
        .mockResolvedValueOnce(buildUnit({ id: 'unit-1', serialNumber: 'SN-001' }))
        .mockResolvedValueOnce(buildUnit({ id: 'unit-2', serialNumber: 'SN-002' }));
      tx.product.update.mockResolvedValue(buildProduct({ quantityOnHand: 7 }));
      tx.stockMovement.create
        .mockResolvedValueOnce({ id: 'movement-1' })
        .mockResolvedValueOnce({ id: 'movement-2' });

      const result = await register();

      expect(result.createdCount).toBe(2);
      expect(tx.productUnit.create).toHaveBeenCalledTimes(2);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { quantityOnHand: { increment: 2 } },
      });
      expect(tx.stockMovement.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.PURCHASE,
            quantityChange: 1,
            quantityAfter: 6,
            productId: PRODUCT_ID,
            productUnitId: 'unit-1',
            locationId: LOCATION_ID,
            userId: USER_ID,
          }),
        }),
      );
      expect(tx.stockMovement.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            quantityChange: 1,
            quantityAfter: 7,
            productUnitId: 'unit-2',
          }),
        }),
      );
    });

    it('rejects non-serialized products', async () => {
      prisma.product.findFirst.mockResolvedValue(buildProduct({ isSerialized: false }));

      await expect(register()).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws when the target location is missing or archived', async () => {
      prisma.location.findFirst.mockResolvedValue(null);

      await expect(register()).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a unit with no scan identifier', async () => {
      await expect(
        service.registerProductUnits(USER_ID, {
          productId: PRODUCT_ID,
          locationId: LOCATION_ID,
          units: [{}],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.product.findFirst).not.toHaveBeenCalled();
    });

    it('rejects duplicate identifiers inside the payload', async () => {
      await expect(
        service.registerProductUnits(USER_ID, {
          productId: PRODUCT_ID,
          locationId: LOCATION_ID,
          units: [{ rfidTag: 'EPC-001' }, { serialNumber: 'EPC-001' }],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.product.findFirst).not.toHaveBeenCalled();
    });

    it('rejects identifiers already registered to another unit', async () => {
      prisma.productUnit.findFirst.mockResolvedValue({ id: 'existing-unit' });

      await expect(register()).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getAllProductUnits', () => {
    const filter = (overrides: Partial<FilterProductUnitsDTO> = {}): FilterProductUnitsDTO =>
      ({ page: 1, limit: 10, ...overrides } as FilterProductUnitsDTO);

    it('returns paginated product units', async () => {
      const rows = [buildUnit()];
      prisma.$transaction.mockResolvedValueOnce([rows, 11]);

      const result = await service.getAllProductUnits(filter({ page: 2, limit: 10 }));

      expect(result.data).toBe(rows);
      expect(result.meta).toEqual({ total: 11, page: 2, limit: 10, lastPage: 2 });
      expect(prisma.productUnit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('hides sold and retired units from the default list', async () => {
      prisma.$transaction.mockResolvedValueOnce([[], 0]);

      await service.getAllProductUnits(filter());

      const where = prisma.productUnit.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({
        notIn: [ProductUnitStatus.SOLD, ProductUnitStatus.LOST],
      });
    });

    it('builds product, location, status, and search filters', async () => {
      prisma.$transaction.mockResolvedValueOnce([[], 0]);

      await service.getAllProductUnits(
        filter({
          productId: PRODUCT_ID,
          locationId: LOCATION_ID,
          status: ProductUnitStatus.IN_STOCK,
          search: 'EPC',
        }),
      );

      const where = prisma.productUnit.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        product: { isArchived: false },
        productId: PRODUCT_ID,
        locationId: LOCATION_ID,
        status: ProductUnitStatus.IN_STOCK,
      });
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { rfidTag: { contains: 'EPC', mode: 'insensitive' } },
          { product: { sku: { contains: 'EPC', mode: 'insensitive' } } },
        ]),
      );
    });
  });

  describe('getProductUnit', () => {
    it('throws when the unit does not exist', async () => {
      prisma.productUnit.findFirst.mockResolvedValue(null);

      await expect(service.getProductUnit(buildUnit().id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProductUnit', () => {
    it('updates editable identity and location fields', async () => {
      const current = buildUnit({ id: 'unit-1', assetTag: 'ASSET-001' });
      const updated = buildUnit({
        id: 'unit-1',
        assetTag: 'ASSET-002',
        rfidTag: null,
      });
      prisma.productUnit.findFirst
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(null);
      prisma.productUnit.update.mockResolvedValue(updated);

      await expect(
        service.updateProductUnit('unit-1', {
          assetTag: 'ASSET-002',
          rfidTag: null,
          locationId: LOCATION_ID,
        }),
      ).resolves.toBe(updated);

      expect(prisma.productUnit.update).toHaveBeenCalledWith({
        where: { id: 'unit-1' },
        data: {
          assetTag: 'ASSET-002',
          rfidTag: null,
          locationId: LOCATION_ID,
        },
        include: expect.any(Object),
      });
    });

    it('rejects clearing the final scan identifier', async () => {
      prisma.productUnit.findFirst.mockResolvedValueOnce(
        buildUnit({ id: 'unit-1', assetTag: null, serialNumber: null, rfidTag: 'EPC-001' }),
      );

      await expect(service.updateProductUnit('unit-1', { rfidTag: null })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.productUnit.update).not.toHaveBeenCalled();
    });

    it('rejects identifier updates that collide with another unit', async () => {
      prisma.productUnit.findFirst
        .mockResolvedValueOnce(buildUnit({ id: 'unit-1' }))
        .mockResolvedValueOnce({ id: 'other-unit' });

      await expect(service.updateProductUnit('unit-1', { rfidTag: 'EPC-999' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.productUnit.update).not.toHaveBeenCalled();
    });
  });

  describe('writeProductUnitTag', () => {
    it('assigns a unique RFID tag to an active unit', async () => {
      const updated = buildUnit({ id: 'unit-1', rfidTag: 'EPC-NEW' });
      prisma.productUnit.findFirst
        .mockResolvedValueOnce(buildUnit({ id: 'unit-1', rfidTag: null }))
        .mockResolvedValueOnce(null);
      prisma.productUnit.update.mockResolvedValue(updated);

      await expect(
        service.writeProductUnitTag('unit-1', { rfidTag: 'EPC-NEW' }),
      ).resolves.toBe(updated);

      expect(prisma.productUnit.update).toHaveBeenCalledWith({
        where: { id: 'unit-1' },
        data: { rfidTag: 'EPC-NEW' },
        include: expect.any(Object),
      });
    });

    it('rejects tag writes for retired or sold units', async () => {
      prisma.productUnit.findFirst.mockResolvedValueOnce(
        buildUnit({ id: 'unit-1', status: ProductUnitStatus.LOST }),
      );

      await expect(
        service.writeProductUnitTag('unit-1', { rfidTag: 'EPC-NEW' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.productUnit.update).not.toHaveBeenCalled();
    });

    it('rejects a tag write that duplicates the same unit serial or asset tag', async () => {
      prisma.productUnit.findFirst.mockResolvedValueOnce(
        buildUnit({ id: 'unit-1', serialNumber: 'SN-001', rfidTag: null }),
      );

      await expect(
        service.writeProductUnitTag('unit-1', { rfidTag: 'SN-001' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.productUnit.update).not.toHaveBeenCalled();
    });
  });

  describe('changeProductUnitStatus', () => {
    it('writes a SALE movement when an on-hand unit is sold', async () => {
      prisma.productUnit.findFirst.mockResolvedValueOnce(
        buildUnit({ id: 'unit-1', status: ProductUnitStatus.IN_STOCK }),
      );
      tx.product.update.mockResolvedValue(buildProduct({ quantityOnHand: 4 }));
      tx.productUnit.update.mockResolvedValue(
        buildUnit({ id: 'unit-1', status: ProductUnitStatus.SOLD, locationId: null }),
      );
      tx.stockMovement.create.mockResolvedValue({ id: 'movement-1' });

      const result = await service.changeProductUnitStatus(USER_ID, 'unit-1', {
        status: ProductUnitStatus.SOLD,
        note: 'Sold on invoice INV-1',
      });

      expect(result.movement).toEqual({ id: 'movement-1' });
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { quantityOnHand: { increment: -1 } },
      });
      expect(tx.productUnit.update).toHaveBeenCalledWith({
        where: { id: 'unit-1' },
        data: { status: ProductUnitStatus.SOLD, locationId: null },
        include: expect.any(Object),
      });
      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.SALE,
            quantityChange: -1,
            quantityAfter: 4,
            productUnitId: 'unit-1',
            locationId: null,
            userId: USER_ID,
          }),
        }),
      );
    });

    it('updates status without a movement when quantity-on-hand is unchanged', async () => {
      const current = buildUnit({ id: 'unit-1', status: ProductUnitStatus.IN_STOCK });
      const updated = buildUnit({ id: 'unit-1', status: ProductUnitStatus.RESERVED });
      prisma.productUnit.findFirst.mockResolvedValueOnce(current);
      prisma.productUnit.update.mockResolvedValue(updated);

      const result = await service.changeProductUnitStatus(USER_ID, 'unit-1', {
        status: ProductUnitStatus.RESERVED,
      });

      expect(result).toEqual({ product: current.product, unit: updated, movement: null });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.productUnit.update).toHaveBeenCalledWith({
        where: { id: 'unit-1' },
        data: { status: ProductUnitStatus.RESERVED, locationId: LOCATION_ID },
        include: expect.any(Object),
      });
    });

    it('writes a RETURN movement when a sold unit comes back into stock', async () => {
      prisma.productUnit.findFirst.mockResolvedValueOnce(
        buildUnit({ id: 'unit-1', status: ProductUnitStatus.SOLD, locationId: null }),
      );
      tx.product.update.mockResolvedValue(buildProduct({ quantityOnHand: 5 }));
      tx.productUnit.update.mockResolvedValue(
        buildUnit({ id: 'unit-1', status: ProductUnitStatus.RETURNED }),
      );
      tx.stockMovement.create.mockResolvedValue({ id: 'movement-2' });

      await service.changeProductUnitStatus(USER_ID, 'unit-1', {
        status: ProductUnitStatus.RETURNED,
        locationId: LOCATION_ID,
      });

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { quantityOnHand: { increment: 1 } },
      });
      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.RETURN,
            quantityChange: 1,
            quantityAfter: 5,
            locationId: LOCATION_ID,
          }),
        }),
      );
    });
  });

  describe('retireProductUnit', () => {
    it('retires an on-hand unit with an ADJUSTMENT movement', async () => {
      prisma.productUnit.findFirst.mockResolvedValueOnce(
        buildUnit({ id: 'unit-1', status: ProductUnitStatus.RESERVED }),
      );
      tx.product.update.mockResolvedValue(buildProduct({ quantityOnHand: 3 }));
      tx.productUnit.update.mockResolvedValue(
        buildUnit({ id: 'unit-1', status: ProductUnitStatus.LOST, locationId: null }),
      );
      tx.stockMovement.create.mockResolvedValue({ id: 'movement-3' });

      await service.retireProductUnit(USER_ID, 'unit-1', { note: 'Disposed' });

      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.ADJUSTMENT,
            quantityChange: -1,
            note: 'Disposed',
            locationId: null,
          }),
        }),
      );
    });
  });
});
