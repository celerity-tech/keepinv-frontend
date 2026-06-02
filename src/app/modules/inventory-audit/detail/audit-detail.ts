import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';

import { AuditOutcomeBadge } from '../shared/audit-outcome-badge';
import {
  AUDIT_OUTCOMES,
  AuditOutcome,
  AuditProductUnit,
  InventoryAuditReport,
  InventoryAuditScan,
  InventoryAuditStatus,
  outcomeOfResult,
  scanLabel,
  unitLabel,
  unitTag,
} from '../types/inventory-audit.types';

/** One flattened, display-ready audited asset row. */
interface AuditRow {
  readonly key: string;
  readonly tag: string;
  readonly name: string;
  readonly serial: string | null;
  readonly expectedLocation: string | null;
  readonly outcome: AuditOutcome;
}

/** One summary tally chip. */
interface Tally {
  readonly outcome: AuditOutcome;
  readonly label: string;
  readonly icon: string;
  readonly count: number;
  readonly tone: string;
}

const TALLY_TONE: Record<string, string> = {
  success: 'text-success',
  danger: 'text-danger',
  info: 'text-info',
  muted: 'text-muted',
};

/** Exceptions first: a reader scans for what went wrong before what went right. */
const OUTCOME_ORDER: Record<AuditOutcome, number> = {
  MISSING: 0,
  MISPLACED: 1,
  UNTRACKED: 2,
  VERIFIED: 3,
};

/**
 * Read-only breakdown of a single audit: lifecycle, who/when/where, the tally
 * strip, and every audited asset with its outcome. Renders purely from the report
 * the parent supplies, so it serves both the history detail pane and the
 * post-completion summary.
 */
@Component({
  selector: 'app-audit-detail',
  imports: [DatePipe, AuditOutcomeBadge],
  templateUrl: './audit-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditDetail {
  readonly report = input.required<InventoryAuditReport>();

  protected readonly locationName = computed(() => this.report().location?.name ?? 'Location');

  protected readonly operatorName = computed(() => {
    const user = this.report().user;
    if (!user) {
      return 'Unknown';
    }
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return name || user.email;
  });

  protected readonly statusChip = computed(() => STATUS_CHIPS[this.report().status]);

  protected readonly tallies = computed<Tally[]>(() => {
    const s = this.report().summary;
    return [
      tally('VERIFIED', s.matchedCount),
      tally('MISSING', s.missingCount),
      tally('MISPLACED', s.misplacedCount),
      tally('UNTRACKED', s.unknownTagCount),
    ];
  });

  protected readonly rows = computed<AuditRow[]>(() => {
    const { buckets } = this.report();
    const fallbackLocation = this.report().location?.name ?? null;

    const fromScans = (scans: InventoryAuditScan[]): AuditRow[] =>
      scans.map((scan) => ({
        key: scan.id,
        tag: scan.scanValue,
        name: scanLabel(scan),
        serial: scan.productUnit?.serialNumber ?? null,
        expectedLocation: scan.productUnit?.location?.name ?? null,
        outcome: outcomeOfResult(scan.result),
      }));

    const fromUnits = (units: AuditProductUnit[]): AuditRow[] =>
      units.map((unit) => ({
        key: unit.id,
        tag: unitTag(unit) ?? '—',
        name: unitLabel(unit),
        serial: unit.serialNumber,
        expectedLocation: unit.location?.name ?? fallbackLocation,
        outcome: 'MISSING' as const,
      }));

    return [
      ...fromUnits(buckets.missing),
      ...fromScans(buckets.misplaced),
      ...fromScans(buckets.unknownTag),
      ...fromScans(buckets.matched),
    ].sort((a, b) => OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome]);
  });

  protected readonly isClean = computed(() => {
    const s = this.report().summary;
    return s.missingCount === 0 && s.misplacedCount === 0 && s.unknownTagCount === 0;
  });
}

function tally(outcome: AuditOutcome, count: number): Tally {
  const meta = AUDIT_OUTCOMES[outcome];
  return { outcome, label: meta.label, icon: meta.icon, count, tone: TALLY_TONE[meta.tone] };
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
