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
  StockMovement,
  StockMovementListQuery,
  StockMovementRequest,
} from '../types/stock-movement.types';

/** A single page of stock movements plus its pagination metadata. */
export interface StockMovementPage {
  items: StockMovement[];
  meta: PageMeta;
}

/**
 * Talks to the stock-movements API. The ledger is append-only: it exposes a
 * server-paginated list, a single-record read, and a record (create) endpoint,
 * with no update or delete. The Bearer token is attached by the global auth
 * interceptor and the response envelope is unwrapped here.
 */
@Injectable({ providedIn: 'root' })
export class StockMovementsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/stock-movements`;

  list(query: StockMovementListQuery): Observable<StockMovementPage> {
    let params = new HttpParams().set('page', query.page).set('limit', query.limit);

    if (query.productId) {
      params = params.set('productId', query.productId);
    }
    if (query.stockMovementTypeId) {
      params = params.set('stockMovementTypeId', query.stockMovementTypeId);
    }
    if (query.dateFrom) {
      params = params.set('dateFrom', query.dateFrom);
    }
    if (query.dateTo) {
      params = params.set('dateTo', query.dateTo);
    }

    return this.http
      .get<PaginatedApiResponse<StockMovement>>(this.baseUrl, { params })
      .pipe(map((response) => ({ items: response.data, meta: response.meta })));
  }

  get(id: string): Observable<StockMovement> {
    return this.http
      .get<ApiResponse<StockMovement>>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data));
  }

  record(body: StockMovementRequest): Observable<StockMovement> {
    return this.http
      .post<ApiResponse<StockMovement>>(this.baseUrl, body)
      .pipe(map((response) => response.data));
  }
}
