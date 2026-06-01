import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { httpErrorMessage } from '../../../common/http/http-error-message';
import { LocationsService } from './services/locations.service';
import { Location } from './types/location.types';

/**
 * Locations master data. A flat list of physical places stock lives. Each carries
 * an optional unique `code`, the scan anchor for future barcode auditing, captured
 * at creation so a location is scan-ready the moment it exists. Keyboard-first:
 * focus stays in the add field for rapid entry, and Escape backs out of any open
 * edit or archive prompt.
 */
@Component({
  selector: 'app-locations',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule],
  templateUrl: './locations.html',
  styleUrl: './locations.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class Locations {
  private readonly formBuilder = inject(FormBuilder);
  private readonly service = inject(LocationsService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly addInput = viewChild<ElementRef<HTMLInputElement>>('addInput');
  private readonly editNameInput = viewChild<ElementRef<HTMLInputElement>>('editNameInput');

  protected readonly locations = signal<Location[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  /** Quick-add: name plus an optional scannable code so the label can be printed at once. */
  protected readonly addForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    code: ['', [Validators.maxLength(50)]],
  });
  protected readonly creating = signal(false);
  protected readonly addError = signal<string | null>(null);

  protected readonly editingId = signal<string | null>(null);
  protected readonly editForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    code: ['', [Validators.maxLength(50)]],
    description: ['', [Validators.maxLength(255)]],
  });
  protected readonly editError = signal<string | null>(null);
  protected readonly savingEdit = signal(false);

  /** Row currently showing the archive confirmation. */
  protected readonly archivingId = signal<string | null>(null);
  /** Row with an archive request in flight. */
  protected readonly busyId = signal<string | null>(null);
  protected readonly archiveError = signal<string | null>(null);

  protected readonly count = computed(() => this.locations().length);
  protected readonly isEmpty = computed(
    () => !this.loading() && !this.loadError() && this.locations().length === 0,
  );

  constructor() {
    // Keyboard-first: focus the add field on load, then move focus into a row the
    // moment edit mode opens so the operator never reaches for the mouse.
    effect(() => {
      const input = this.editingId() ? this.editNameInput() : this.addInput();
      input?.nativeElement.focus();
    });
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
        next: (items) => this.locations.set(this.sortByName(items)),
        error: () => this.loadError.set(true),
      });
  }

  protected addLocation(): void {
    const name = this.addForm.controls.name.value.trim();
    const code = this.addForm.controls.code.value.trim();
    this.addError.set(null);

    if (!name) {
      this.addForm.controls.name.markAsTouched();
      return;
    }
    if (this.creating()) {
      return;
    }
    if (code && this.codeTaken(code)) {
      this.addError.set(`Code "${code}" is already in use.`);
      return;
    }

    this.creating.set(true);
    this.service
      .create({ name, code: code || undefined })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.creating.set(false)),
      )
      .subscribe({
        next: (created) => {
          this.locations.update((list) => this.sortByName([...list, created]));
          this.addForm.reset({ name: '', code: '' });
          this.addInput()?.nativeElement.focus();
        },
        error: (error: unknown) =>
          this.addError.set(httpErrorMessage(error, code ? `Code "${code}"` : undefined)),
      });
  }

  protected startEdit(location: Location): void {
    this.cancelArchive();
    this.editError.set(null);
    this.editForm.setValue({
      name: location.name,
      code: location.code ?? '',
      description: location.description ?? '',
    });
    this.editingId.set(location.id);
  }

  protected saveEdit(): void {
    const id = this.editingId();
    if (!id || this.savingEdit()) {
      return;
    }

    const name = this.editForm.controls.name.value.trim();
    const code = this.editForm.controls.code.value.trim();
    const description = this.editForm.controls.description.value.trim();
    this.editError.set(null);

    if (!name) {
      this.editForm.controls.name.markAsTouched();
      return;
    }
    if (code && this.codeTaken(code, id)) {
      this.editError.set(`Code "${code}" is already in use.`);
      return;
    }

    this.savingEdit.set(true);
    this.service
      .update(id, { name, code: code || undefined, description: description || undefined })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.savingEdit.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.locations.update((list) =>
            this.sortByName(list.map((location) => (location.id === id ? updated : location))),
          );
          this.editingId.set(null);
        },
        error: (error: unknown) =>
          this.editError.set(httpErrorMessage(error, code ? `Code "${code}"` : undefined)),
      });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editError.set(null);
  }

  protected confirmArchive(location: Location): void {
    this.cancelEdit();
    this.archiveError.set(null);
    this.archivingId.set(location.id);
  }

  protected cancelArchive(): void {
    this.archivingId.set(null);
    this.archiveError.set(null);
  }

  protected archive(location: Location): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(location.id);
    this.archiveError.set(null);
    this.service
      .archive(location.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busyId.set(null)),
      )
      .subscribe({
        next: () => {
          this.locations.update((list) => list.filter((item) => item.id !== location.id));
          this.archivingId.set(null);
        },
        error: (error: unknown) => this.archiveError.set(httpErrorMessage(error)),
      });
  }

  protected isEditing(location: Location): boolean {
    return this.editingId() === location.id;
  }

  protected isArchiving(location: Location): boolean {
    return this.archivingId() === location.id;
  }

  protected onEscape(): void {
    this.cancelEdit();
    this.cancelArchive();
  }

  /** Only `code` is unique in the schema; names may repeat across locations. */
  private codeTaken(code: string, exceptId?: string): boolean {
    const target = code.toLowerCase();
    return this.locations().some(
      (location) => location.id !== exceptId && location.code?.toLowerCase() === target,
    );
  }

  private sortByName(items: Location[]): Location[] {
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }
}
