import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';

import { httpErrorMessage } from '../../../common/http/http-error-message';
import { LocationsService } from '../locations/services/locations.service';
import { InventoryAuditService } from './services/inventory-audit.service';
import {
  InventoryAuditListItem,
  InventoryAuditReport,
  InventoryAuditStatus,
} from './types/inventory-audit.types';
import { AuditSession } from './session/audit-session';
import { AuditDetail } from './detail/audit-detail';

interface NamedRecord {
  readonly id: string;
  readonly name: string;
}

interface StatusChip {
  readonly label: string;
  readonly classes: string;
}

const STATUS_CHIPS: Record<InventoryAuditStatus, StatusChip> = {
  IN_PROGRESS: { label: 'In progress', classes: 'bg-panel text-ink ring-1 ring-line' },
  COMPLETED: { label: 'Completed', classes: 'bg-success/10 text-success' },
  CANCELLED: { label: 'Cancelled', classes: 'bg-line/70 text-muted' },
};

/**
 * Inventory Audit. Two surfaces: a server-paginated history of past audits (with a
 * read-only breakdown pane), and a full-focus capture session for running a new
 * one. The session takes over the view because RFID sweeping is a heads-down task
 * that a cramped pane would fight; on finish or cancel it returns here and the
 * completed report drops straight into the detail pane.
 */
@Component({
  selector: 'app-inventory-audit',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    ButtonModule,
    SelectModule,
    TableModule,
    AuditSession,
    AuditDetail,
  ],
  templateUrl: './inventory-audit.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryAudit {
  private readonly service = inject(InventoryAuditService);
  private readonly locationsService = inject(LocationsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly mode = signal<'history' | 'session'>('history');
  /** When set, the session resumes this in-progress audit instead of starting fresh. */
  protected readonly resumeReport = signal<InventoryAuditReport | null>(null);

  protected readonly audits = signal<InventoryAuditListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly rows = 10;
  protected readonly first = signal(0);

  protected readonly locationFilter = new FormControl<string | null>(null);
  protected readonly locationOptions = signal<NamedRecord[]>([]);
  protected readonly hasFilters = computed(() => this.locationFilter.value !== null);

  protected readonly selectedId = signal<string | null>(null);
  /** The list row matching the selection, for the table's single-select highlight. */
  protected readonly selectedRow = computed(
    () => this.audits().find((audit) => audit.id === this.selectedId()) ?? null,
  );
  protected readonly selectedReport = signal<InventoryAuditReport | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal<string | null>(null);
  protected readonly paneOpenMobile = signal(false);

  protected readonly isEmpty = computed(
    () => !this.loading() && !this.loadError() && this.total() === 0 && !this.hasFilters(),
  );

  constructor() {
    this.loadLocations();

    this.locationFilter.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilter());

    // `?new=1` (from the global "new audit" shortcut) opens the start flow, then
    // strips the param so a refresh or back-nav doesn't reopen it.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        if (params.get('new') !== null) {
          this.startAudit();
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {},
            replaceUrl: true,
          });
        }
      });

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

  protected applyFilter(): void {
    this.first.set(0);
    this.selectedId.set(null);
    this.selectedReport.set(null);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.service
      .list({
        page: Math.floor(this.first() / this.rows) + 1,
        limit: this.rows,
        locationId: this.locationFilter.value ?? undefined,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ items, meta }) => {
          this.audits.set(items);
          this.total.set(meta.total);
        },
        error: (error: unknown) => this.loadError.set(httpErrorMessage(error)),
      });
  }

  protected startAudit(): void {
    this.resumeReport.set(null);
    this.mode.set('session');
  }

  protected resumeAudit(report: InventoryAuditReport): void {
    this.resumeReport.set(report);
    this.mode.set('session');
  }

  protected onSelectionChange(item: InventoryAuditListItem | null): void {
    // Single-selection toggles off on re-click; keep the current audit in view.
    if (item) {
      this.selectAudit(item);
    }
  }

  protected selectAudit(item: InventoryAuditListItem): void {
    this.selectedId.set(item.id);
    this.paneOpenMobile.set(true);
    this.detailError.set(null);
    this.detailLoading.set(true);
    this.selectedReport.set(null);
    this.service
      .get(item.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.detailLoading.set(false)),
      )
      .subscribe({
        next: (report) => {
          // A newer selection may have superseded this fetch; only apply if current.
          if (this.selectedId() === item.id) {
            this.selectedReport.set(report);
          }
        },
        error: (error: unknown) => {
          if (this.selectedId() === item.id) {
            this.detailError.set(httpErrorMessage(error));
          }
        },
      });
  }

  protected retryDetail(): void {
    const id = this.selectedId();
    const item = this.audits().find((audit) => audit.id === id);
    if (item) {
      this.selectAudit(item);
    }
  }

  protected onSessionCompleted(report: InventoryAuditReport): void {
    this.mode.set('history');
    this.resumeReport.set(null);
    this.selectedId.set(report.id);
    this.selectedReport.set(report);
    this.detailError.set(null);
    this.paneOpenMobile.set(true);
    this.first.set(0);
    this.load();
  }

  protected onSessionCancelled(): void {
    this.mode.set('history');
    this.resumeReport.set(null);
    this.selectedId.set(null);
    this.selectedReport.set(null);
    this.first.set(0);
    this.load();
  }

  /** Left the session with the audit still in progress; keep it selected and resumable. */
  protected onSessionExited(report: InventoryAuditReport | null): void {
    this.mode.set('history');
    this.resumeReport.set(null);
    if (report) {
      this.selectedId.set(report.id);
      this.selectedReport.set(report);
      this.detailError.set(null);
      this.paneOpenMobile.set(true);
    }
    this.first.set(0);
    this.load();
  }

  protected backToList(): void {
    this.paneOpenMobile.set(false);
  }

  protected clearFilters(): void {
    this.locationFilter.setValue(null);
  }

  protected statusChip(status: InventoryAuditStatus): StatusChip {
    return STATUS_CHIPS[status];
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
