import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { Popover, PopoverModule } from 'primeng/popover';

import { LocationsService } from '../../locations/services/locations.service';
import { httpErrorMessage } from '../../../../common/http/http-error-message';
import { Product } from '../types/product.types';
import {
  PRODUCT_UNIT_STATUS_ORDER,
  ProductUnit,
  ProductUnitListQuery,
  ProductUnitStatus,
  canWriteTag,
  productUnitStatusMeta,
  statusCountsOnHand,
  statusStockDelta,
} from '../types/product-unit.types';
import { ProductUnitsService } from '../services/product-units.service';
import { ProductUnitStatusBadge } from './product-unit-status-badge';

interface NamedRecord {
  readonly id: string;
  readonly name: string;
}

interface StatusFilterChip {
  readonly label: string;
  readonly value: ProductUnitStatus | null;
}

/** Which form the single actions popover is showing for the active unit. */
type ActionView = 'menu' | 'writeTag' | 'status' | 'edit' | 'retire';

/**
 * The Units tab for a serialized product: a paginated roster of its physical
 * units and the per-unit actions the backend supports (write tag, change status,
 * edit identifiers, retire). The default view hides sold and lost units, matching
 * the API; the status chips opt those back in. Per-unit actions all run through a
 * single popover whose content switches by {@link ActionView}, so a dense row only
 * ever owns one overlay. Stock-moving mutations bubble up via `stockChanged` so
 * the catalog and the product's on-hand stay truthful.
 */
@Component({
  selector: 'app-units-roster',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TextareaModule,
    PopoverModule,
    ProductUnitStatusBadge,
  ],
  templateUrl: './units-roster.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitsRoster {
  private readonly service = inject(ProductUnitsService);
  private readonly locationsService = inject(LocationsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly product = input.required<Product>();

  /** A mutation changed (or may have changed) on-hand stock; ask the parent to re-hydrate. */
  readonly stockChanged = output<void>();
  /** The operator wants to register units; the parent launches the commission session. */
  readonly commission = output<void>();

  protected readonly units = signal<ProductUnit[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  /** Page size. The backend caps `limit`; 10 keeps each fetch snappy, like the catalog. */
  protected readonly rows = 10;
  protected readonly first = signal(0);

  protected readonly statusFilter = signal<ProductUnitStatus | null>(null);
  protected readonly searchControl = new FormControl('', { nonNullable: true });

  protected readonly chips: StatusFilterChip[] = [
    { label: 'All', value: null },
    ...PRODUCT_UNIT_STATUS_ORDER.map((status) => ({
      label: productUnitStatusMeta(status).label,
      value: status,
    })),
  ];

  protected readonly locationOptions = signal<NamedRecord[]>([]);

  protected readonly hasQuery = computed(
    () => this.statusFilter() !== null || this.searchControl.value.trim().length > 0,
  );
  protected readonly isEmpty = computed(
    () => !this.loading() && !this.loadError() && this.total() === 0 && !this.hasQuery(),
  );

  // --- Per-unit actions (single popover, content switched by view) ---
  protected readonly actionUnit = signal<ProductUnit | null>(null);
  protected readonly actionView = signal<ActionView>('menu');
  protected readonly actionBusy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly writeTagControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  protected readonly targetStatus = signal<ProductUnitStatus | null>(null);
  protected readonly statusLocationId = signal<string | null>(null);
  protected readonly statusNote = new FormControl('', { nonNullable: true });

  protected readonly editAssetTag = new FormControl('', { nonNullable: true });
  protected readonly editSerialNumber = new FormControl('', { nonNullable: true });
  protected readonly editRfidTag = new FormControl('', { nonNullable: true });
  protected readonly editLocationId = signal<string | null>(null);

  protected readonly retireNote = new FormControl('', { nonNullable: true });

  /** Status choices for the picker: every status except the unit's current one. */
  protected readonly statusOptions = computed(() => {
    const current = this.actionUnit()?.status;
    return PRODUCT_UNIT_STATUS_ORDER.filter((status) => status !== current).map((status) => ({
      value: status,
      label: productUnitStatusMeta(status).label,
    }));
  });

  /** Moving to a stock-counted status needs a location when the unit has none. */
  protected readonly statusNeedsLocation = computed(() => {
    const target = this.targetStatus();
    const unit = this.actionUnit();
    if (!target || !unit) {
      return false;
    }
    return statusCountsOnHand(target) && !unit.locationId && !this.statusLocationId();
  });

  /** Show the location picker only when the target keeps the unit on-hand. */
  protected readonly statusShowsLocation = computed(() => {
    const target = this.targetStatus();
    return target ? statusCountsOnHand(target) : false;
  });

  /** Will the chosen status clear the unit's location server-side? */
  protected readonly statusClearsLocation = computed(() => {
    const target = this.targetStatus();
    return target === 'SOLD' || target === 'LOST';
  });

  /** On-hand effect of the pending status change, for the consequence line. */
  protected readonly statusDelta = computed(() => {
    const target = this.targetStatus();
    const unit = this.actionUnit();
    return target && unit ? statusStockDelta(unit.status, target) : 0;
  });

  /** Edit can't drop a unit's last identifier; mirror the backend rule client-side. */
  protected readonly editHasIdentifier = computed(
    () =>
      this.editAssetTag.value.trim().length > 0 ||
      this.editSerialNumber.value.trim().length > 0 ||
      this.editRfidTag.value.trim().length > 0,
  );

  private loadedForProductId: string | null = null;

  constructor() {
    this.loadLocations();

    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());

    // Switching to a different product resets the roster to its default view.
    effect(() => {
      const id = this.product().id;
      if (id === this.loadedForProductId) {
        return;
      }
      this.loadedForProductId = id;
      this.statusFilter.set(null);
      this.searchControl.setValue('', { emitEvent: false });
      this.first.set(0);
      this.load();
    });
  }

  /** Re-fetch the current page. Public so the parent can refresh after a commission. */
  reload(): void {
    this.load();
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const requestedFirst = event.first ?? 0;
    if (requestedFirst === this.first()) {
      return;
    }
    this.first.set(requestedFirst);
    this.load();
  }

  protected setFilter(value: ProductUnitStatus | null): void {
    if (this.statusFilter() === value) {
      return;
    }
    this.statusFilter.set(value);
    this.applyFilters();
  }

  protected applyFilters(): void {
    this.first.set(0);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);

    const query: ProductUnitListQuery = {
      page: Math.floor(this.first() / this.rows) + 1,
      limit: this.rows,
      productId: this.product().id,
      status: this.statusFilter() ?? undefined,
      search: this.searchControl.value.trim() || undefined,
    };

    this.service
      .list(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ items, meta }) => {
          this.units.set(items);
          this.total.set(meta.total);
          // A mutation can empty the last page; step back rather than strand it.
          if (!items.length && meta.total > 0 && this.first() > 0) {
            this.first.set(Math.max(0, Math.ceil(meta.total / this.rows) - 1) * this.rows);
            this.load();
          }
        },
        error: (error: unknown) => this.loadError.set(httpErrorMessage(error)),
      });
  }

  // --- Action popover lifecycle ---

  protected openActions(unit: ProductUnit, event: Event, popover: Popover): void {
    this.actionUnit.set(unit);
    this.actionView.set('menu');
    this.actionError.set(null);
    this.actionBusy.set(false);
    popover.toggle(event);
  }

  protected showWriteTag(): void {
    this.writeTagControl.reset('');
    this.actionError.set(null);
    this.actionView.set('writeTag');
  }

  protected showStatus(): void {
    this.targetStatus.set(null);
    this.statusLocationId.set(null);
    this.statusNote.reset('');
    this.actionError.set(null);
    this.actionView.set('status');
  }

  protected showEdit(): void {
    const unit = this.actionUnit();
    this.editAssetTag.setValue(unit?.assetTag ?? '');
    this.editSerialNumber.setValue(unit?.serialNumber ?? '');
    this.editRfidTag.setValue(unit?.rfidTag ?? '');
    this.editLocationId.set(unit?.locationId ?? null);
    this.actionError.set(null);
    this.actionView.set('edit');
  }

  protected showRetire(): void {
    this.retireNote.reset('');
    this.actionError.set(null);
    this.actionView.set('retire');
  }

  protected canWriteTag(status: ProductUnitStatus): boolean {
    return canWriteTag(status);
  }

  protected onTargetStatus(status: ProductUnitStatus): void {
    this.targetStatus.set(status);
    // A fresh target drops any location chosen for a previous one.
    this.statusLocationId.set(null);
  }

  // --- Action submissions ---

  protected submitWriteTag(popover: Popover): void {
    const unit = this.actionUnit();
    const rfidTag = this.writeTagControl.value.trim();
    if (!unit || !rfidTag || this.actionBusy()) {
      return;
    }
    this.runAction(this.service.writeTag(unit.id, { rfidTag }), popover, false);
  }

  protected submitStatus(popover: Popover): void {
    const unit = this.actionUnit();
    const status = this.targetStatus();
    if (!unit || !status || this.actionBusy()) {
      return;
    }
    if (this.statusNeedsLocation()) {
      this.actionError.set('Choose a location for this on-hand unit.');
      return;
    }
    const locationId = this.statusLocationId() ?? undefined;
    const note = this.statusNote.value.trim() || undefined;
    this.runAction(
      this.service.changeStatus(unit.id, { status, locationId, note }),
      popover,
      true,
    );
  }

  protected submitEdit(popover: Popover): void {
    const unit = this.actionUnit();
    if (!unit || this.actionBusy()) {
      return;
    }
    if (!this.editHasIdentifier()) {
      this.actionError.set('Keep at least one identifier: asset tag, serial, or RFID.');
      return;
    }
    this.runAction(
      this.service.update(unit.id, {
        assetTag: this.editAssetTag.value.trim() || null,
        serialNumber: this.editSerialNumber.value.trim() || null,
        rfidTag: this.editRfidTag.value.trim() || null,
        locationId: this.editLocationId(),
      }),
      popover,
      false,
    );
  }

  protected submitRetire(popover: Popover): void {
    const unit = this.actionUnit();
    if (!unit || this.actionBusy()) {
      return;
    }
    const note = this.retireNote.value.trim() || undefined;
    this.runAction(this.service.retire(unit.id, { note }), popover, true);
  }

  /**
   * Run a unit mutation, then close the popover and refresh the page. `affectsStock`
   * bubbles `stockChanged` so the catalog re-hydrates the product's on-hand.
   */
  private runAction(request: Observable<unknown>, popover: Popover, affectsStock: boolean): void {
    this.actionBusy.set(true);
    this.actionError.set(null);
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: () => {
          popover.hide();
          this.load();
          if (affectsStock) {
            this.stockChanged.emit();
          }
        },
        error: (error: unknown) => this.actionError.set(httpErrorMessage(error)),
      });
  }

  /** The unit's headline identifier with a matching icon: RFID leads, then serial, then asset. */
  protected primaryIdentifier(unit: ProductUnit): { icon: string; value: string } {
    if (unit.rfidTag) {
      return { icon: 'pi pi-wifi', value: unit.rfidTag };
    }
    if (unit.serialNumber) {
      return { icon: 'pi pi-hashtag', value: unit.serialNumber };
    }
    if (unit.assetTag) {
      return { icon: 'pi pi-tag', value: unit.assetTag };
    }
    return { icon: 'pi pi-question-circle', value: '—' };
  }

  /** The remaining identifiers, labelled, for the secondary line under the headline. */
  protected secondaryIdentifiers(unit: ProductUnit): { label: string; value: string }[] {
    const primary = this.primaryIdentifier(unit).value;
    return [
      { label: 'RFID', value: unit.rfidTag },
      { label: 'SN', value: unit.serialNumber },
      { label: 'Asset', value: unit.assetTag },
    ].filter((part): part is { label: string; value: string } => !!part.value && part.value !== primary);
  }

  private loadLocations(): void {
    this.locationsService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((items) =>
        this.locationOptions.set(items.map(({ id, name }) => ({ id, name }))),
      );
  }
}
