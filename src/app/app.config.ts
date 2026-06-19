import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { AssetWisePreset } from './theme/asset-wise-preset';
import { authInterceptor } from './modules/auth/interceptors/auth.interceptor';
import { PreferencesService } from '../common/preferences/preferences.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Apply the saved per-device text size before first paint, so it never flashes
    // at the default and then jump.
    provideAppInitializer(() => inject(PreferencesService).apply()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
    providePrimeNG({
      theme: {
        preset: AssetWisePreset,
        options: {
          // Light-only for now; point dark mode at a class that is never applied.
          darkModeSelector: '.app-dark',
          // Let Tailwind utilities win over PrimeNG component styles.
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng, components, utilities',
          },
        },
      },
    }),
  ],
};
