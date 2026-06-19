import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { PreferencesService, TextScaleId } from '../../../common/preferences/preferences.service';

/**
 * Per-device preferences. Currently a single accessibility control — text size —
 * that scales the whole UI and persists in this browser. Reads and writes go
 * through {@link PreferencesService}; the page only renders the choice.
 */
@Component({
  selector: 'app-settings',
  templateUrl: './settings.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  private readonly preferences = inject(PreferencesService);

  protected readonly textScaleOptions = this.preferences.textScaleOptions;
  protected readonly textScale = this.preferences.textScale;

  protected setTextScale(id: TextScaleId): void {
    this.preferences.setTextScale(id);
  }
}
