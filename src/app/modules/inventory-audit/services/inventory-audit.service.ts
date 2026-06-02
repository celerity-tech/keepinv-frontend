import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  ApiResponse,
  PageMeta,
  PaginatedApiResponse,
} from '../../../../common/responses/api.response';
import {
  AddInventoryAuditScansRequest,
  CreateInventoryAuditRequest,
  ExpectedAssetsResult,
  InventoryAuditListItem,
  InventoryAuditListQuery,
  InventoryAuditReport,
} from '../types/inventory-audit.types';

/** A single page of audit history plus its pagination metadata. */
export interface InventoryAuditPage {
  items: InventoryAuditListItem[];
  meta: PageMeta;
}

/**
 * The add-scans response. The recomputed report is nested under `audit`; the
 * counts describe what this batch did (the backend dedupes against prior scans).
 */
export interface AddInventoryAuditScansResult {
  acceptedCount: number;
  duplicateCount: number;
  ignoredEmptyCount: number;
  audit: InventoryAuditReport;
}

/**
 * Talks to the inventory-audits API. The server owns all scan resolution: the
 * client posts raw scan values in batches and reads back an authoritative report
 * (summary + buckets). The Bearer token is attached by the global auth
 * interceptor and the response envelope is unwrapped here.
 */
@Injectable({ providedIn: 'root' })
export class InventoryAuditService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/inventory-audits`;

  list(query: InventoryAuditListQuery): Observable<InventoryAuditPage> {
    let params = new HttpParams().set('page', query.page).set('limit', query.limit);
    if (query.locationId) {
      params = params.set('locationId', query.locationId);
    }

    return this.http
      .get<PaginatedApiResponse<InventoryAuditListItem>>(this.baseUrl, { params })
      .pipe(map((response) => ({ items: response.data, meta: response.meta })));
  }

  /** Full report (summary + buckets) for one audit, for the detail pane or to resume. */
  get(id: string): Observable<InventoryAuditReport> {
    return this.http
      .get<ApiResponse<InventoryAuditReport>>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data));
  }

  /** What the catalog expects at a location, used to preview a session's scope. */
  expectedAssets(locationId: string): Observable<ExpectedAssetsResult> {
    const params = new HttpParams().set('locationId', locationId);
    return this.http
      .get<ApiResponse<ExpectedAssetsResult>>(`${this.baseUrl}/expected-assets`, { params })
      .pipe(map((response) => response.data));
  }

  create(body: CreateInventoryAuditRequest): Observable<InventoryAuditReport> {
    return this.http
      .post<ApiResponse<InventoryAuditReport>>(this.baseUrl, body)
      .pipe(map((response) => response.data));
  }

  /** Ingest a batch of scans; returns the recomputed report (nested under `audit`). */
  addScans(id: string, body: AddInventoryAuditScansRequest): Observable<InventoryAuditReport> {
    return this.http
      .post<ApiResponse<AddInventoryAuditScansResult>>(`${this.baseUrl}/${id}/scans`, body)
      .pipe(map((response) => response.data.audit));
  }

  /** Re-resolve and finalize the audit. Idempotent if already completed. */
  complete(id: string): Observable<InventoryAuditReport> {
    return this.http
      .post<ApiResponse<InventoryAuditReport>>(`${this.baseUrl}/${id}/complete`, {})
      .pipe(map((response) => response.data));
  }

  /** Abandon the audit. Idempotent if already cancelled. */
  cancel(id: string): Observable<InventoryAuditReport> {
    return this.http
      .post<ApiResponse<InventoryAuditReport>>(`${this.baseUrl}/${id}/cancel`, {})
      .pipe(map((response) => response.data));
  }
}
