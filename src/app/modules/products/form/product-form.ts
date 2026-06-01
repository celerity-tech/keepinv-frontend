import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, finalize, forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { Popover, PopoverModule } from 'primeng/popover';

import { CategoriesService } from '../../categories/services/categories.service';
import { SuppliersService } from '../../suppliers/services/suppliers.service';
import { LocationsService } from '../../locations/services/locations.service';
import { Category } from '../../categories/types/category.types';
import { Supplier } from '../../suppliers/types/supplier.types';
import { Location } from '../../locations/types/location.types';
import { ProductsService } from '../services/products.service';
import { Product, ProductRequest } from '../types/product.types';
import { httpErrorMessage } from '../../../../common/http/http-error-message';

/** A record with the minimum a `p-select` option needs: an id and a name to show. */
interface NamedRecord {
  id: string;
  name: string;
}

/**
 * The single product form, used for both create (no `product`) and edit (a
 * `product` to seed from). Category, supplier, and location are picked from
 * master-data selects, each with an inline "+ New" popover so the operator can
 * add one without leaving a half-filled form. `quantityOnHand` is deliberately
 * absent: stock only moves through stock movements.
 */
@Component({
  selector: 'app-product-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    SelectModule,
    CheckboxModule,
    PopoverModule,
  ],
  templateUrl: './product-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductForm implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly products = inject(ProductsService);
  private readonly categories = inject(CategoriesService);
  private readonly suppliers = inject(SuppliersService);
  private readonly locations = inject(LocationsService);
  private readonly destroyRef = inject(DestroyRef);

  /** Present in edit mode; null/undefined in create mode. */
  readonly product = input<Product | null>(null);
  readonly saved = output<Product>();
  readonly cancelled = output<void>();

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  protected readonly isEdit = computed(() => this.product() != null);

  protected readonly categoryOptions = signal<NamedRecord[]>([]);
  protected readonly supplierOptions = signal<NamedRecord[]>([]);
  protected readonly locationOptions = signal<NamedRecord[]>([]);
  protected readonly optionsLoading = signal(true);

  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    sku: ['', [Validators.required, Validators.maxLength(64)]],
    barcode: ['', [Validators.maxLength(64)]],
    brand: ['', [Validators.maxLength(100)]],
    description: ['', [Validators.maxLength(1000)]],
    costPrice: this.formBuilder.control<number | null>(0, [Validators.min(0)]),
    sellingPrice: this.formBuilder.control<number | null>(0, [Validators.min(0)]),
    reorderPoint: this.formBuilder.control<number | null>(null, [Validators.min(0)]),
    isSerialized: [false],
    categoryId: ['', [Validators.required]],
    supplierId: this.formBuilder.control<string | null>(null),
    locationId: this.formBuilder.control<string | null>(null),
  });

  /** Quick-create controls live outside the main form so they never affect its validity. */
  protected readonly quickCategoryName = new FormControl('', { nonNullable: true });
  protected readonly quickSupplierName = new FormControl('', { nonNullable: true });
  protected readonly quickLocationName = new FormControl('', { nonNullable: true });
  protected readonly quickBusy = signal(false);
  protected readonly quickError = signal<string | null>(null);

  constructor() {
    afterNextRender(() => this.nameInput()?.nativeElement.focus());
  }

  ngOnInit(): void {
    // Inputs are populated by now (they are not in the constructor), so the edit
    // form seeds with the product's current values before the first render.
    this.seedFromProduct();
    this.loadOptions();
  }

  private seedFromProduct(): void {
    const product = this.product();
    if (!product) {
      return;
    }
    this.form.setValue({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode ?? '',
      brand: product.brand ?? '',
      description: product.description ?? '',
      costPrice: Number(product.costPrice),
      sellingPrice: Number(product.sellingPrice),
      reorderPoint: product.reorderPoint,
      isSerialized: product.isSerialized,
      categoryId: product.categoryId,
      supplierId: product.supplierId,
      locationId: product.locationId,
    });
  }

  private loadOptions(): void {
    this.optionsLoading.set(true);
    const product = this.product();

    // Load the three master-data lists together so optionsLoading reflects all
    // of them and a single error path covers every failure (a bare subscribe on
    // suppliers/locations would otherwise throw unhandled and leave the selects
    // empty with no feedback).
    forkJoin({
      categories: this.categories.list(),
      suppliers: this.suppliers.list(),
      locations: this.locations.list(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.optionsLoading.set(false)),
      )
      .subscribe({
        next: ({ categories, suppliers, locations }) => {
          this.categoryOptions.set(this.mergeCurrent(categories, product?.category ?? null));
          this.supplierOptions.set(this.mergeCurrent(suppliers, product?.supplier ?? null));
          this.locationOptions.set(this.mergeCurrent(locations, product?.location ?? null));
        },
        error: (error: unknown) =>
          this.formError.set(httpErrorMessage(error)),
      });
  }

  /**
   * Keep the product's current selection pickable even if the master list omits
   * it (e.g. an archived category the product still points at).
   */
  private mergeCurrent<T extends NamedRecord>(items: T[], current: T | null): NamedRecord[] {
    const list: NamedRecord[] = items.map(({ id, name }) => ({ id, name }));
    if (current && !list.some((item) => item.id === current.id)) {
      list.unshift({ id: current.id, name: current.name });
    }
    return list;
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set(this.validationMessage());
      return;
    }

    const raw = this.form.getRawValue();
    const body: ProductRequest = {
      name: raw.name.trim(),
      sku: raw.sku.trim(),
      description: this.optional(raw.description),
      barcode: this.optional(raw.barcode),
      brand: this.optional(raw.brand),
      costPrice: raw.costPrice ?? 0,
      sellingPrice: raw.sellingPrice ?? 0,
      reorderPoint: raw.reorderPoint ?? null,
      isSerialized: raw.isSerialized,
      categoryId: raw.categoryId,
      supplierId: raw.supplierId || null,
      locationId: raw.locationId || null,
    };

    const existing = this.product();
    const request$ = existing
      ? this.products.update(existing.id, body)
      : this.products.create(body);

    this.saving.set(true);
    this.formError.set(null);
    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (product) => this.saved.emit(product),
        error: (error: unknown) => this.formError.set(httpErrorMessage(error, `SKU "${body.sku}"`)),
      });
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  protected createCategory(popover: Popover): void {
    this.runQuickCreate(this.quickCategoryName, (name) => this.categories.create({ name }), (created) => {
      this.categoryOptions.update((list) => [{ id: created.id, name: created.name }, ...list]);
      this.form.controls.categoryId.setValue(created.id);
      popover.hide();
    });
  }

  protected createSupplier(popover: Popover): void {
    this.runQuickCreate(this.quickSupplierName, (name) => this.suppliers.create({ name }), (created) => {
      this.supplierOptions.update((list) => [{ id: created.id, name: created.name }, ...list]);
      this.form.controls.supplierId.setValue(created.id);
      popover.hide();
    });
  }

  protected createLocation(popover: Popover): void {
    this.runQuickCreate(this.quickLocationName, (name) => this.locations.create({ name }), (created) => {
      this.locationOptions.update((list) => [{ id: created.id, name: created.name }, ...list]);
      this.form.controls.locationId.setValue(created.id);
      popover.hide();
    });
  }

  /** Reset a quick-create popover's transient state as it opens. */
  protected openQuick(control: FormControl<string>): void {
    this.quickError.set(null);
    control.reset('');
  }

  private runQuickCreate<T extends NamedRecord>(
    control: FormControl<string>,
    create: (name: string) => Observable<T>,
    onCreated: (created: T) => void,
  ): void {
    const name = control.value.trim();
    this.quickError.set(null);
    if (!name) {
      this.quickError.set('Enter a name.');
      return;
    }
    if (this.quickBusy()) {
      return;
    }

    this.quickBusy.set(true);
    create(name)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.quickBusy.set(false)),
      )
      .subscribe({
        next: (created) => {
          onCreated(created);
          control.reset('');
        },
        error: (error: unknown) => this.quickError.set(httpErrorMessage(error, `"${name}"`)),
      });
  }

  private optional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  private validationMessage(): string {
    const controls = this.form.controls;
    if (controls.name.invalid) {
      return 'A product name is required.';
    }
    if (controls.sku.invalid) {
      return 'A SKU is required.';
    }
    if (controls.categoryId.invalid) {
      return 'Choose a category for this product.';
    }
    return 'Check the highlighted fields and try again.';
  }
}
