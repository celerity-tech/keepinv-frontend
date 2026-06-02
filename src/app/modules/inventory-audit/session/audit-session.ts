import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import {
  EMPTY,
  Subject,
  buffer,
  catchError,
  concatMap,
  debounceTime,
  filter,
  finalize,
  merge,
  of,
  switchMap,
} from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { Popover, PopoverModule } from 'primeng/popover';

import { httpErrorMessage } from '../../../../common/http/http-error-message';
import { LocationsService } from '../../locations/services/locations.service';
import { InventoryAuditService } from '../services/inventory-audit.service';
import { AuditOutcomeBadge } from '../shared/audit-outcome-badge';
import {
  AuditOutcome,
  InventoryAuditReport,
  InventoryAuditScanMode,
  outcomeOfResult,
  scanLabel,
  unitLabel,
  unitTag,
} from '../types/inventory-audit.types';

/** A row in the live anomaly or missing lists. */
interface LiveRow {
  readonly key: string;
  readonly name: string;
  readonly tag: string;
  readonly outcome: AuditOutcome;
  readonly note: string | null;
}

/** A queued batch awaiting ingestion. */
interface PendingBatch {
  readonly tags?: string[];
  readonly rawInput?: string;
  readonly scanMode: InventoryAuditScanMode;
  readonly count: number;
}

interface ScanModeChip {
  readonly value: InventoryAuditScanMode;
  readonly label: string;
  readonly icon: string;
}

interface NamedRecord {
  readonly id: string;
  readonly name: string;
}

/** A scan stream that falls quiet for this long is treated as one batch. */
const BURST_QUIET_MS = 220;
/** Most recent resolved scans to show in the live feed. */
const RECENT_LIMIT = 12;

/**
 * The live audit capture session. The scan field owns focus for the whole
 * session, so a barcode trigger-pull or an RFID sweep always lands here. Incoming
 * tags are buffered until the stream goes quiet, deduped, then ingested as one
 * mode-tagged batch: a rapid multi-tag spray is sent as RFID, an isolated scan as
 * the selected mode. Batches are serialized so the running totals never race, and
 * the field never blocks while a batch is in flight, the next sweep keeps landing.
 * The server resolves every scan; this view renders the report it returns and
 * surfaces the exceptions (misplaced, unknown, still-missing) the operator must act on.
 */
@Component({
  selector: 'app-audit-session',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    ButtonModule,
    SelectModule,
    TextareaModule,
    PopoverModule,
    AuditOutcomeBadge,
  ],
  templateUrl: './audit-session.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditSession implements OnInit {
  private readonly service = inject(InventoryAuditService);
  private readonly locationsService = inject(LocationsService);
  private readonly destroyRef = inject(DestroyRef);

  /** An in-progress audit to resume. When set, the session skips setup and opens capture. */
  readonly initialReport = input<InventoryAuditReport | null>(null);

  /** Emitted with the final report when the audit is completed. */
  readonly completed = output<InventoryAuditReport>();
  /** Emitted when the audit is cancelled (discarded). */
  readonly cancelled = output<void>();
  /**
   * Emitted when the operator leaves without finishing: with the current report
   * when closing an in-progress session (it stays resumable), or null from setup.
   */
  readonly exited = output<InventoryAuditReport | null>();

  private readonly captureInput = viewChild<ElementRef<HTMLInputElement>>('captureInput');

  protected readonly phase = signal<'setup' | 'capturing'>('setup');

  // --- Setup ---
  protected readonly locationOptions = signal<NamedRecord[]>([]);
  protected readonly locationControl = new FormControl<string | null>(null);
  protected readonly expectedPreview = signal<number | null>(null);
  protected readonly starting = signal(false);
  protected readonly setupError = signal<string | null>(null);

  // --- Capture ---
  protected readonly report = signal<InventoryAuditReport | null>(null);
  protected readonly modes: ScanModeChip[] = [
    { value: 'RFID', label: 'RFID', icon: 'pi pi-wifi' },
    { value: 'BARCODE', label: 'Barcode', icon: 'pi pi-qrcode' },
    { value: 'MANUAL', label: 'Manual', icon: 'pi pi-pencil' },
  ];
  protected readonly mode = signal<InventoryAuditScanMode>('RFID');
  protected readonly capture = new FormControl('', { nonNullable: true });
  protected readonly paused = signal(false);
  protected readonly pending = signal(0);
  protected readonly lastBatch = signal<{ mode: InventoryAuditScanMode; count: number } | null>(null);
  protected readonly batchError = signal<string | null>(null);
  protected readonly finishing = signal(false);
  protected readonly cancelling = signal(false);
  /** Leaving while keeping the audit in progress (drains pending scans, then exits). */
  protected readonly closing = signal(false);

  protected readonly pasteControl = new FormControl('', { nonNullable: true });

  private readonly token$ = new Subject<string>();
  private readonly flushNow$ = new Subject<void>();
  private readonly batchQueue$ = new Subject<PendingBatch>();

  protected readonly listening = computed(
    () =>
      this.phase() === 'capturing' &&
      !this.paused() &&
      !this.finishing() &&
      !this.cancelling() &&
      !this.closing(),
  );

  protected readonly summary = computed(() => this.report()?.summary ?? null);

  protected readonly progressPct = computed(() => {
    const s = this.summary();
    if (!s || s.expectedCount <= 0) {
      return null;
    }
    return Math.min(100, Math.round((s.matchedCount / s.expectedCount) * 100));
  });

  /** Misplaced + unknown scans, newest first: the things the operator must resolve. */
  protected readonly attention = computed<LiveRow[]>(() => {
    const buckets = this.report()?.buckets;
    if (!buckets) {
      return [];
    }
    const rows = [
      ...buckets.misplaced.map((scan) => ({
        key: scan.id,
        name: scanLabel(scan),
        tag: scan.scanValue,
        outcome: outcomeOfResult(scan.result),
        note: scan.productUnit?.location?.name
          ? `Belongs at ${scan.productUnit.location.name}`
          : 'Belongs at another location',
      })),
      ...buckets.unknownTag.map((scan) => ({
        key: scan.id,
        name: scan.scanValue,
        tag: scan.scanValue,
        outcome: 'UNTRACKED' as const,
        note: 'No matching unit in the catalog',
      })),
    ];
    return rows;
  });

  /** Expected here but not yet scanned. Shrinks as the sweep continues. */
  protected readonly missing = computed<LiveRow[]>(() => {
    const buckets = this.report()?.buckets;
    if (!buckets) {
      return [];
    }
    return buckets.missing.map((unit) => ({
      key: unit.id,
      name: unitLabel(unit),
      tag: unitTag(unit) ?? '—',
      outcome: 'MISSING' as const,
      note: null,
    }));
  });

  /** Most recent resolved scans, newest first, for the running feed. */
  protected readonly recent = computed<LiveRow[]>(() => {
    const scans = this.report()?.scans ?? [];
    return [...scans]
      .sort((a, b) => (a.scannedAt < b.scannedAt ? 1 : -1))
      .slice(0, RECENT_LIMIT)
      .map((scan) => ({
        key: scan.id,
        name: scanLabel(scan),
        tag: scan.scanValue,
        outcome: outcomeOfResult(scan.result),
        note: null,
      }));
  });

  constructor() {
    this.loadLocations();

    // Preview how many units the catalog expects at the chosen location.
    this.locationControl.valueChanges
      .pipe(
        switchMap((locationId) => {
          this.expectedPreview.set(null);
          if (!locationId) {
            return of(null);
          }
          return this.service.expectedAssets(locationId).pipe(
            catchError(() => of(null)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => this.expectedPreview.set(result?.expectedCount ?? null));

    // Collect tokens until the stream falls quiet (or a forced flush), then ingest
    // the batch. The closing notifier is the quiet gap OR an explicit flush request.
    this.token$
      .pipe(
        buffer(merge(this.token$.pipe(debounceTime(BURST_QUIET_MS)), this.flushNow$)),
        filter((batch) => batch.length > 0),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((batch) => this.enqueueScans(batch));

    // Serialize ingestion so summaries apply in order and the API is never flooded.
    this.batchQueue$
      .pipe(
        concatMap((batch) => {
          const audit = this.report();
          if (!audit) {
            this.pending.update((n) => Math.max(0, n - batch.count));
            return EMPTY;
          }
          return this.service
            .addScans(audit.id, {
              scanMode: batch.scanMode,
              tags: batch.tags,
              rawInput: batch.rawInput,
            })
            .pipe(
              catchError((error: unknown) => {
                this.batchError.set(httpErrorMessage(error));
                return EMPTY;
              }),
              finalize(() => {
                this.pending.update((n) => Math.max(0, n - batch.count));
                this.settleAfterDrain();
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((report) => {
        this.report.set(report);
        this.batchError.set(null);
      });

    // Keep the scan field focused whenever the session is listening.
    effect(() => {
      const el = this.captureInput();
      if (el && this.listening()) {
        el.nativeElement.focus();
      }
    });
  }

  ngOnInit(): void {
    // Resuming an in-progress audit: skip setup, open straight into capture.
    const resume = this.initialReport();
    if (resume) {
      this.report.set(resume);
      this.phase.set('capturing');
    }
  }

  // --- Setup actions ---

  protected begin(): void {
    const locationId = this.locationControl.value;
    if (!locationId || this.starting()) {
      this.setupError.set(locationId ? null : 'Choose a location to audit.');
      return;
    }
    this.starting.set(true);
    this.setupError.set(null);
    this.service
      .create({ locationId, scanMode: 'RFID' })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.starting.set(false)),
      )
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.phase.set('capturing');
        },
        error: (error: unknown) => this.setupError.set(httpErrorMessage(error)),
      });
  }

  protected exitSetup(): void {
    this.exited.emit(null);
  }

  /** Leave the capture screen but keep the audit in progress, so it can be resumed. */
  protected closeSession(): void {
    if (this.finishing() || this.cancelling() || this.closing()) {
      return;
    }
    // Flush buffered scans, then leave once the queue drains so nothing is lost.
    this.flushNow$.next();
    this.closing.set(true);
    this.settleAfterDrain();
  }

  // --- Capture actions ---

  protected setMode(mode: InventoryAuditScanMode): void {
    this.mode.set(mode);
    this.refocus();
  }

  /** A scanner (or the operator) committed one token with Enter. */
  protected onScan(event: Event): void {
    event.preventDefault();
    const value = this.capture.value.trim();
    this.capture.setValue('');
    if (value) {
      this.token$.next(value);
    }
  }

  protected onCaptureBlur(): void {
    if (!this.listening()) {
      return;
    }
    // Refocus only if focus fell to nothing (a stray blur), never if it moved to a
    // real control like Pause or Finish.
    setTimeout(() => {
      const el = this.captureInput()?.nativeElement;
      const active = document.activeElement;
      if (el && this.listening() && (active === document.body || active === null)) {
        el.focus();
      }
    });
  }

  protected refocus(): void {
    if (this.listening()) {
      this.captureInput()?.nativeElement.focus();
    }
  }

  protected togglePause(): void {
    this.paused.update((value) => !value);
    if (!this.paused()) {
      queueMicrotask(() => this.captureInput()?.nativeElement.focus());
    }
  }

  protected submitPaste(popover: Popover): void {
    const raw = this.pasteControl.value.trim();
    if (!raw) {
      return;
    }
    const count = raw.split(/[\s,;]+/).filter(Boolean).length || 1;
    this.pasteControl.setValue('');
    popover.hide();
    this.lastBatch.set({ mode: 'MANUAL', count });
    this.pending.update((n) => n + count);
    this.batchQueue$.next({ rawInput: raw, scanMode: 'MANUAL', count });
    setTimeout(() => this.refocus());
  }

  protected finish(): void {
    if (this.finishing() || this.cancelling() || this.closing()) {
      return;
    }
    // Flush anything still buffered, then complete once the queue drains.
    this.flushNow$.next();
    this.finishing.set(true);
    this.settleAfterDrain();
  }

  protected confirmCancel(popover: Popover): void {
    popover.hide();
    const audit = this.report();
    if (!audit || this.cancelling()) {
      this.cancelled.emit();
      return;
    }
    this.cancelling.set(true);
    this.service
      .cancel(audit.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.cancelled.emit(),
        error: () => this.cancelled.emit(),
      });
  }

  private enqueueScans(batch: string[]): void {
    const tags = Array.from(new Set(batch.map((value) => value.trim()).filter(Boolean)));
    if (tags.length === 0) {
      return;
    }
    // A multi-tag burst is an RFID sweep regardless of the picker, unless the
    // operator is deliberately in manual mode.
    const scanMode: InventoryAuditScanMode =
      tags.length > 1 && this.mode() !== 'MANUAL' ? 'RFID' : this.mode();
    this.lastBatch.set({ mode: scanMode, count: tags.length });
    this.pending.update((n) => n + tags.length);
    this.batchQueue$.next({ tags, scanMode, count: tags.length });
  }

  /** Once all queued batches have settled, carry out whichever exit was requested. */
  private settleAfterDrain(): void {
    if (this.pending() > 0) {
      return;
    }
    if (this.finishing()) {
      this.completeNow();
      return;
    }
    if (this.closing()) {
      this.closing.set(false);
      this.exited.emit(this.report());
    }
  }

  private completeNow(): void {
    const audit = this.report();
    if (!audit) {
      this.finishing.set(false);
      return;
    }
    this.service
      .complete(audit.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.finishing.set(false)),
      )
      .subscribe({
        next: (report) => this.completed.emit(report),
        error: (error: unknown) => this.batchError.set(httpErrorMessage(error)),
      });
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
