# App shell, custom keyboard behavior

Only the focus and key handling we added in code is listed here. Standard web
behavior (Tab order, browser shortcuts) is intentionally left out. These bindings
live on the authenticated layout, so they apply across every page inside it.

| Behavior | What happens | Source |
| --- | --- | --- |
| `N` then `P` / `A` | App-wide "new" leader chord: press `N`, then `P` to start a new product or `A` to start a new audit. A brief hint shows the options while `N` is pending (clears after 1.5s). Suppressed while typing in a field or while a scanner streams into an input, and ignored when Ctrl / Cmd / Alt is held, so browser shortcuts and scanners are never hijacked. | `layout.ts` → `onGlobalKeydown()`, `NEW_SHORTCUTS` |
| `Esc` closes the nav drawer | On narrow screens, `Esc` closes the open mobile navigation drawer. | `layout.ts` → `host: '(document:keydown.escape)'` → `closeMobile()` |

To add another `New…` target, add one entry to `NEW_SHORTCUTS` in `layout.ts`
(e.g. `m: { path: '/stock-movements' }`) and have the target page read `?new=1`.
