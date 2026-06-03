import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { ProductUnitStatus, productUnitStatusMeta } from '../types/product-unit.types';

/**
 * Tone to concrete utility classes. Kept as literals so Tailwind detects them.
 * No amber: status badges must never compete with the one signal colour.
 */
const TONE_CLASSES: Record<string, string> = {
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
  muted: 'bg-line/70 text-muted',
};

/** A small, self-labelling status pill for a product unit (icon + word + tint). */
@Component({
  selector: 'app-product-unit-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
      [class]="classes()"
    >
      <i [class]="meta().icon" class="text-[0.7rem]" aria-hidden="true"></i>
      {{ meta().label }}
    </span>
  `,
})
export class ProductUnitStatusBadge {
  readonly status = input.required<ProductUnitStatus>();
  protected readonly meta = computed(() => productUnitStatusMeta(this.status()));
  protected readonly classes = computed(() => TONE_CLASSES[this.meta().tone]);
}
