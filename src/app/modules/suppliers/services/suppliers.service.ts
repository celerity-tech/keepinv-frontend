import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../../common/responses/api.response';
import {
  Supplier,
  SupplierLink,
  SupplierLinkRequest,
  SupplierRequest,
} from '../types/supplier.types';

/**
 * Talks to the suppliers API and its nested links. Thin by design: the Bearer
 * token is attached by the global auth interceptor, and the response envelope is
 * unwrapped here so callers only ever see domain types.
 */
@Injectable({ providedIn: 'root' })
export class SuppliersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/suppliers`;

  list(): Observable<Supplier[]> {
    return this.http
      .get<ApiResponse<Supplier[]>>(this.baseUrl)
      .pipe(map((response) => response.data));
  }

  create(body: SupplierRequest): Observable<Supplier> {
    return this.http
      .post<ApiResponse<Supplier>>(this.baseUrl, body)
      .pipe(map((response) => response.data));
  }

  update(id: string, body: SupplierRequest): Observable<Supplier> {
    return this.http
      .patch<ApiResponse<Supplier>>(`${this.baseUrl}/${id}`, body)
      .pipe(map((response) => response.data));
  }

  /** Soft delete: the backend exposes no hard-delete endpoint. */
  archive(id: string): Observable<Supplier> {
    return this.http
      .delete<ApiResponse<Supplier>>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data));
  }

  listLinks(supplierId: string): Observable<SupplierLink[]> {
    return this.http
      .get<ApiResponse<SupplierLink[]>>(`${this.baseUrl}/${supplierId}/links`)
      .pipe(map((response) => response.data));
  }

  createLink(supplierId: string, body: SupplierLinkRequest): Observable<SupplierLink> {
    return this.http
      .post<ApiResponse<SupplierLink>>(`${this.baseUrl}/${supplierId}/links`, body)
      .pipe(map((response) => response.data));
  }

  updateLink(
    supplierId: string,
    linkId: string,
    body: SupplierLinkRequest,
  ): Observable<SupplierLink> {
    return this.http
      .patch<ApiResponse<SupplierLink>>(`${this.baseUrl}/${supplierId}/links/${linkId}`, body)
      .pipe(map((response) => response.data));
  }

  archiveLink(supplierId: string, linkId: string): Observable<SupplierLink> {
    return this.http
      .delete<ApiResponse<SupplierLink>>(`${this.baseUrl}/${supplierId}/links/${linkId}`)
      .pipe(map((response) => response.data));
  }
}
