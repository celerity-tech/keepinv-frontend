import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../../common/responses/api.response';
import {
  CreateStockMovementTypeRequest,
  StockMovementType,
  UpdateStockMovementTypeRequest,
} from '../types/stock-movement-type.types';

/**
 * Talks to the stock-movement-types API. Thin by design: the session cookie is
 * attached by the global auth interceptor and the response envelope is unwrapped
 * here so callers only ever see domain types. The list returns active (non-archived)
 * types, sorted by name.
 */
@Injectable({ providedIn: 'root' })
export class StockMovementTypesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/stock-movement-types`;

  list(): Observable<StockMovementType[]> {
    return this.http
      .get<ApiResponse<StockMovementType[]>>(this.baseUrl)
      .pipe(map((response) => response.data));
  }

  create(body: CreateStockMovementTypeRequest): Observable<StockMovementType> {
    return this.http
      .post<ApiResponse<StockMovementType>>(this.baseUrl, body)
      .pipe(map((response) => response.data));
  }

  update(id: string, body: UpdateStockMovementTypeRequest): Observable<StockMovementType> {
    return this.http
      .patch<ApiResponse<StockMovementType>>(`${this.baseUrl}/${id}`, body)
      .pipe(map((response) => response.data));
  }

  /** Soft delete: the backend archives rather than hard-deleting, and refuses system types. */
  archive(id: string): Observable<StockMovementType> {
    return this.http
      .delete<ApiResponse<StockMovementType>>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data));
  }
}
