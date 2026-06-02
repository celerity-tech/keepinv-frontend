import { Product } from '../../products/types/product.types';
import { Location } from '../../locations/types/location.types';

/** Lifecycle of an audit. Mirrors the backend `InventoryAuditStatus` enum. */
export type InventoryAuditStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

/**
 * How a batch of scans was captured. Mirrors `InventoryAuditScanMode`. Sent per
 * batch: a rapid Enter-terminated spray is `RFID`, an isolated scan is `BARCODE`,
 * and typed/pasted input is `MANUAL`.
 */
export type InventoryAuditScanMode = 'RFID' | 'BARCODE' | 'MANUAL';

/**
 * Server-assigned outcome of resolving one scan against the catalog. Mirrors
 * `InventoryAuditScanResult`. Note there is no "missing" result: missing is not a
 * scan, it is an expected unit that was never seen, so it lives in the summary and
 * the `missing` bucket instead.
 */
export type InventoryAuditScanResult = 'MATCHED' | 'MISPLACED' | 'UNKNOWN_TAG';

/** Lifecycle of a physical unit. Mirrors `ProductUnitStatus`. */
export type ProductUnitStatus =
  | 'IN_STOCK'
  | 'RESERVED'
  | 'SOLD'
  | 'DAMAGED'
  | 'RETURNED'
  | 'LOST';

/**
 * The person who ran an audit. Deliberately narrow: the backend embeds the full
 * user (including the password hash); we only ever read identity fields, and the
 * hash must never be referenced or rendered.
 */
export interface AuditUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
}

/**
 * One physical, serialized unit. The scan anchors live here (`rfidTag`,
 * `assetTag`, `serialNumber`); `product.barcode` is the fallback for non-serialized
 * goods. Embedded `product` / `location` are typed optional because list and
 * bucket payloads may trim them; render with null-safety.
 */
export interface AuditProductUnit {
  id: string;
  assetTag: string | null;
  serialNumber: string | null;
  rfidTag: string | null;
  status: ProductUnitStatus;
  productId: string;
  product?: Product | null;
  locationId: string | null;
  location?: Location | null;
}

/**
 * One resolved scan in an audit. `result` is server-computed from where the unit
 * actually lives versus the audited location. `productUnit` is null for an
 * unknown or ambiguous tag.
 */
export interface InventoryAuditScan {
  id: string;
  scanValue: string;
  scanMode: InventoryAuditScanMode;
  auditId: string;
  productUnitId: string | null;
  result: InventoryAuditScanResult;
  scannedAt: string;
  productUnit?: AuditProductUnit | null;
}

/** Server-computed tallies for an audit. */
export interface AuditSummary {
  /** Units the catalog expects at this location. */
  expectedCount: number;
  /** Distinct tags seen so far. */
  scannedCount: number;
  /** Present and expected here (verified). */
  matchedCount: number;
  /** Expected here but never scanned. */
  missingCount: number;
  /** Seen, but the catalog has an unknown/ambiguous tag for them. */
  unknownTagCount: number;
  /** Present here but the catalog expects them elsewhere. */
  misplacedCount: number;
}

/**
 * Scans (and expected units) grouped by outcome. `missing` holds the expected
 * units that were never scanned; the rest hold the scans that produced each
 * result.
 */
export interface AuditBuckets {
  matched: InventoryAuditScan[];
  missing: AuditProductUnit[];
  unknownTag: InventoryAuditScan[];
  misplaced: InventoryAuditScan[];
}

/**
 * The full audit report returned by create, get-by-id, add-scans, complete, and
 * cancel. The single source of truth the session and detail views render from.
 */
export interface InventoryAuditReport {
  id: string;
  auditNo: string;
  status: InventoryAuditStatus;
  startedAt: string;
  completedAt: string | null;
  locationId: string;
  location?: Location | null;
  userId: string;
  user?: AuditUser | null;
  createdAt: string;
  updatedAt: string;
  scans: InventoryAuditScan[];
  summary: AuditSummary;
  buckets: AuditBuckets;
}

/**
 * A row in the paginated audit history. The heavy `scans` / `buckets` are not
 * assumed here: the breakdown loads via get-by-id when a row is opened. `summary`
 * is optional so a compact count can render in the row if the backend includes it.
 */
export interface InventoryAuditListItem {
  id: string;
  auditNo: string;
  status: InventoryAuditStatus;
  startedAt: string;
  completedAt: string | null;
  locationId: string;
  location?: Location | null;
  userId: string;
  user?: AuditUser | null;
  createdAt: string;
  updatedAt: string;
  summary?: AuditSummary;
}

/** Body for creating an audit. Tags/rawInput, if present, are ingested as the first batch. */
export interface CreateInventoryAuditRequest {
  locationId: string;
  scanMode: InventoryAuditScanMode;
  tags?: string[];
  rawInput?: string;
}

/** Body for adding a batch of scans to an open audit. */
export interface AddInventoryAuditScansRequest {
  scanMode: InventoryAuditScanMode;
  tags?: string[];
  rawInput?: string;
}

/** Query for the server-paginated audit list. Mirrors `FilterInventoryAuditsDTO`. */
export interface InventoryAuditListQuery {
  page: number;
  /** Capped by the backend. */
  limit: number;
  locationId?: string;
}

/** The expected-assets lookup: what the catalog says should be at a location. */
export interface ExpectedAssetsResult {
  locationId: string;
  expectedCount: number;
  assets: AuditProductUnit[];
}

/**
 * The four operator-facing outcomes. `VERIFIED` is the friendly label for the
 * backend's `MATCHED`; `MISSING` is derived (no scan produces it). Used to drive
 * badge labels, icons, and tone across the session and detail views.
 */
export type AuditOutcome = 'VERIFIED' | 'MISSING' | 'MISPLACED' | 'UNTRACKED';

/** Visual treatment for one outcome. `tone` keys into the status colour classes. */
export interface AuditOutcomeMeta {
  readonly outcome: AuditOutcome;
  readonly label: string;
  /** PrimeIcons class. */
  readonly icon: string;
  /** Semantic colour family used for text and /10 tints. */
  readonly tone: 'success' | 'danger' | 'info' | 'muted';
}

export const AUDIT_OUTCOMES: Record<AuditOutcome, AuditOutcomeMeta> = {
  VERIFIED: { outcome: 'VERIFIED', label: 'Verified', icon: 'pi pi-check-circle', tone: 'success' },
  MISSING: { outcome: 'MISSING', label: 'Missing', icon: 'pi pi-minus-circle', tone: 'danger' },
  MISPLACED: { outcome: 'MISPLACED', label: 'Misplaced', icon: 'pi pi-directions', tone: 'info' },
  UNTRACKED: { outcome: 'UNTRACKED', label: 'Untracked', icon: 'pi pi-question-circle', tone: 'muted' },
};

/** Map a server scan result to its operator-facing outcome. */
export function outcomeOfResult(result: InventoryAuditScanResult): AuditOutcome {
  switch (result) {
    case 'MATCHED':
      return 'VERIFIED';
    case 'MISPLACED':
      return 'MISPLACED';
    default:
      return 'UNTRACKED';
  }
}

/** A best-effort human name for a scanned unit's product, falling back to the raw tag. */
export function scanLabel(scan: InventoryAuditScan): string {
  return scan.productUnit?.product?.name ?? scan.scanValue;
}

/** A best-effort human name for an expected (possibly missing) unit. */
export function unitLabel(unit: AuditProductUnit): string {
  return (
    unit.product?.name ??
    unit.assetTag ??
    unit.serialNumber ??
    unit.rfidTag ??
    unit.product?.sku ??
    'Unit'
  );
}

/** The scan anchor printed/encoded on a unit, for display under its name. */
export function unitTag(unit: AuditProductUnit): string | null {
  return unit.rfidTag ?? unit.assetTag ?? unit.serialNumber ?? unit.product?.barcode ?? null;
}
