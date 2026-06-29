import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';

import { MovementUser, StockMovement, movementDisplay } from '../types/stock-movement.types';

/**
 * Read-only detail for one ledger entry. Movements are immutable, so there are no
 * actions here: it simply shows what changed, the resulting on-hand, and the full
 * context (product, location, supplier, who recorded it, note, time).
 */
@Component({
  selector: 'app-stock-movement-detail',
  imports: [DatePipe],
  templateUrl: './stock-movement-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockMovementDetail {
  readonly movement = input.required<StockMovement>();

  protected readonly display = computed(() => movementDisplay(this.movement()));
  /** Signed change with an explicit + so inflows read unambiguously. */
  protected readonly changeLabel = computed(() => {
    const change = this.movement().quantityChange;
    return change > 0 ? `+${change}` : `${change}`;
  });
  protected readonly recordedBy = computed(() => this.userLabel(this.movement().user));

  private userLabel(user: MovementUser): string {
    return user.name?.trim() || user.email;
  }
}
