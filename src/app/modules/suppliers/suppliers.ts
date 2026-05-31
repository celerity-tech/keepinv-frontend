import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';

import { SuppliersService } from './services/suppliers.service';
import { httpErrorMessage } from './utils/error-message';
import { Supplier } from './types/supplier.types';
import { SupplierDetail } from './detail/supplier-detail';

/**
 * Suppliers master data. Two-pane directory: a searchable, client-paginated list
 * on the left, the selected supplier's contact details and reorder channels on
 * the right. Keeps the directory in sync as the detail pane mutates a supplier.
 */
@Component({
  selector: 'app-suppliers',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, TableModule, SupplierDetail],
  templateUrl: './suppliers.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Suppliers {
  private readonly formBuilder = inject(FormBuilder);
  private readonly service = inject(SuppliersService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly addInput = viewChild<ElementRef<HTMLInputElement>>('addInput');

  protected readonly suppliers = signal<Supplier[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  /** Rows per page for the client-side paginator (records stay well under 100). */
  protected readonly rows = 8;
  protected readonly filterFields = ['name', 'contactName', 'email', 'phone'];

  /** Quick-add: name only. Contact details and channels are filled in via the detail pane. */
  protected readonly addForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });
  protected readonly creating = signal(false);
  protected readonly addError = signal<string | null>(null);

  protected readonly selectedId = signal<string | null>(null);
  /** Derived so the detail pane always sees the freshest supplier object after edits. */
  protected readonly selected = computed(
    () => this.suppliers().find((supplier) => supplier.id === this.selectedId()) ?? null,
  );
  /** On narrow screens the detail pane replaces the list; this toggles between them. */
  protected readonly detailOpenMobile = signal(false);

  protected readonly count = computed(() => this.suppliers().length);
  protected readonly isEmpty = computed(
    () => !this.loading() && !this.loadError() && this.suppliers().length === 0,
  );

  constructor() {
    afterNextRender(() => this.addInput()?.nativeElement.focus());
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.service
      .list()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (items) => {
          const sorted = this.sortByName(items);
          this.suppliers.set(sorted);
          if (!this.selected() && sorted.length) {
            this.selectedId.set(sorted[0].id);
          }
        },
        error: () => this.loadError.set(true),
      });
  }

  protected addSupplier(): void {
    const name = this.addForm.controls.name.value.trim();
    this.addError.set(null);

    if (!name) {
      this.addForm.controls.name.markAsTouched();
      return;
    }
    if (this.creating()) {
      return;
    }

    this.creating.set(true);
    this.service
      .create({ name })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.creating.set(false)),
      )
      .subscribe({
        next: (created) => {
          this.suppliers.update((list) => this.sortByName([...list, created]));
          this.addForm.reset({ name: '' });
          this.selectSupplier(created);
          this.addInput()?.nativeElement.focus();
        },
        error: (error: unknown) => this.addError.set(httpErrorMessage(error, `"${name}"`)),
      });
  }

  protected selectSupplier(supplier: Supplier): void {
    this.selectedId.set(supplier.id);
    this.detailOpenMobile.set(true);
  }

  protected onSelectionChange(supplier: Supplier | null): void {
    // Single-selection toggles off on re-click; ignore the deselect so the
    // directory always keeps one supplier in view.
    if (supplier) {
      this.selectSupplier(supplier);
    }
  }

  protected backToList(): void {
    this.detailOpenMobile.set(false);
  }

  protected onSupplierUpdated(updated: Supplier): void {
    this.suppliers.update((list) =>
      this.sortByName(list.map((supplier) => (supplier.id === updated.id ? updated : supplier))),
    );
  }

  protected onSupplierArchived(id: string): void {
    this.suppliers.update((list) => list.filter((supplier) => supplier.id !== id));
    if (this.selectedId() === id) {
      this.selectedId.set(this.suppliers()[0]?.id ?? null);
    }
    this.detailOpenMobile.set(false);
  }

  private sortByName(items: Supplier[]): Supplier[] {
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }
}
