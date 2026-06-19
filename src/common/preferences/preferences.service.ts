import { Injectable, signal } from '@angular/core';

/** Identifiers for the offered text-size steps. */
export type TextScaleId = 'default' | 'large' | 'larger' | 'largest';

export interface TextScaleOption {
  readonly id: TextScaleId;
  readonly label: string;
  /** Root font-size as a percentage of the browser's default (so it honours OS/browser zoom too). */
  readonly percent: number;
}

/** localStorage key for the per-device text-size choice. Namespaced to avoid collisions. */
const STORAGE_KEY = 'aw:text-scale';

/**
 * Per-device UI preferences, persisted client-side (no account, no server). Today
 * it carries a single accessibility lever: text size. Every size in the app is
 * `rem`-based, so scaling the document root font-size enlarges text, spacing,
 * icons, and PrimeNG components together — a zoom that stays coherent at every
 * step rather than text-only growth that overflows containers.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  /** Ordered smallest-to-largest; drives both the picker and the applied scale. */
  readonly textScaleOptions: readonly TextScaleOption[] = [
    { id: 'default', label: 'Default', percent: 100 },
    { id: 'large', label: 'Large', percent: 112.5 },
    { id: 'larger', label: 'Larger', percent: 125 },
    { id: 'largest', label: 'Largest', percent: 137.5 },
  ];

  private readonly scaleId = signal<TextScaleId>(this.read());
  /** Current text-size selection. */
  readonly textScale = this.scaleId.asReadonly();

  /**
   * Push the stored preference to the document root. Called once at bootstrap (via
   * an app initializer) so the saved size is in place before first paint.
   */
  apply(): void {
    this.render(this.scaleId());
  }

  /** Change the text size, apply it immediately, and remember it on this device. */
  setTextScale(id: TextScaleId): void {
    this.scaleId.set(id);
    this.render(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Storage blocked (private mode, quota): the choice still holds for this session.
    }
  }

  private render(id: TextScaleId): void {
    document.documentElement.style.fontSize = `${this.optionFor(id).percent}%`;
  }

  private read(): TextScaleId {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && this.textScaleOptions.some((option) => option.id === stored)) {
        return stored as TextScaleId;
      }
    } catch {
      // Storage unavailable: fall back to the default size.
    }
    return 'default';
  }

  private optionFor(id: TextScaleId): TextScaleOption {
    return this.textScaleOptions.find((option) => option.id === id) ?? this.textScaleOptions[0];
  }
}
