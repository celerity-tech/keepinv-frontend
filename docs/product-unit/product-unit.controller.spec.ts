import { Test, TestingModule } from '@nestjs/testing';
import { ProductUnitController } from './product-unit.controller';
import { ProductUnitService } from './product-unit.service';

describe('ProductUnitController', () => {
  let controller: ProductUnitController;
  let service: Record<keyof ProductUnitService, jest.Mock>;

  beforeEach(async () => {
    service = {
      registerProductUnits: jest.fn(),
      getAllProductUnits: jest.fn(),
      getProductUnit: jest.fn(),
      updateProductUnit: jest.fn(),
      writeProductUnitTag: jest.fn(),
      changeProductUnitStatus: jest.fn(),
      retireProductUnit: jest.fn(),
    } as unknown as Record<keyof ProductUnitService, jest.Mock>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductUnitController],
      providers: [{ provide: ProductUnitService, useValue: service }],
    }).compile();

    controller = module.get<ProductUnitController>(ProductUnitController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates registerProductUnits with the authenticated user id', async () => {
    const user = { id: 'user-1' };
    const body = {
      productId: '11111111-1111-1111-1111-111111111111',
      locationId: '22222222-2222-2222-2222-222222222222',
      units: [{ rfidTag: 'EPC-001' }],
    };

    await controller.registerProductUnits(user as never, body);

    expect(service.registerProductUnits).toHaveBeenCalledWith(user.id, body);
  });

  it('delegates getAllProductUnits with the query filter', async () => {
    const filter = { page: 1, limit: 10 };

    await controller.getAllProductUnits(filter);

    expect(service.getAllProductUnits).toHaveBeenCalledWith(filter);
  });

  it('delegates updateProductUnit with the path id and body', async () => {
    const body = { assetTag: 'ASSET-001' };

    await controller.updateProductUnit('unit-1', body);

    expect(service.updateProductUnit).toHaveBeenCalledWith('unit-1', body);
  });

  it('delegates writeProductUnitTag with the path id and body', async () => {
    const body = { rfidTag: 'EPC-001' };

    await controller.writeProductUnitTag('unit-1', body);

    expect(service.writeProductUnitTag).toHaveBeenCalledWith('unit-1', body);
  });

  it('delegates changeProductUnitStatus with the authenticated user id', async () => {
    const user = { id: 'user-1' };
    const body = { status: 'SOLD' };

    await controller.changeProductUnitStatus(user as never, 'unit-1', body as never);

    expect(service.changeProductUnitStatus).toHaveBeenCalledWith(user.id, 'unit-1', body);
  });

  it('delegates retireProductUnit with the authenticated user id', async () => {
    const user = { id: 'user-1' };
    const body = { note: 'Disposed' };

    await controller.retireProductUnit(user as never, 'unit-1', body);

    expect(service.retireProductUnit).toHaveBeenCalledWith(user.id, 'unit-1', body);
  });
});
