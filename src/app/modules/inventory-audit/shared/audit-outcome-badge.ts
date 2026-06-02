import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AUDIT_OUTCOMES, AuditOutcome } from '../types/inventory-audit.types';

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

/** A small, self-labelling status pill for an audit outcome (icon + word + tint). */
@Component({
  selector: 'app-audit-outcome-badge',
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
export class AuditOutcomeBadge {
  readonly outcome = input.required<AuditOutcome>();
  protected readonly meta = computed(() => AUDIT_OUTCOMES[this.outcome()]);
  protected readonly classes = computed(() => TONE_CLASSES[this.meta().tone]);
}
