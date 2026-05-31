# Categories — Keyboard Shortcuts

The Categories page is built keyboard-first so the counter can manage inventory
groups without reaching for the mouse. This documents the keyboard behavior wired
into `categories.ts` / `categories.html`.

## Custom shortcut

| Key      | Context                         | Action                                              |
| -------- | ------------------------------- | --------------------------------------------------- |
| `Escape` | Anywhere on the Categories page | Cancels the open inline edit **and** archive prompt |

- Bound globally via the component `host` listener:
  `host: { '(document:keydown.escape)': 'onEscape()' }` (`categories.ts:27`).
- `onEscape()` (`categories.ts:215`) calls both `cancelEdit()` and `cancelArchive()`,
  so a single press backs out of whichever row action is open.

> Standard web behavior is intentionally **not** documented here: Tab order,
> `Enter` to submit a focused form, and arrow-key navigation inside the PrimeNG
> list and dropdown all come for free from the platform/PrimeNG. This file covers
> only the focus and key handling we wired up ourselves.

## Focus management (no keypress required)

Driven by an `effect` in the constructor (`categories.ts:71-74`):

- On page load, focus lands on the **Add a category** field for immediate typing.
- When a row enters edit mode, focus jumps to that row's **name** field.
- After a successful add, focus returns to the add field (`categories.ts:120`) so
  multiple categories can be entered in a row.

## Quick reference

- `Escape` — backs out of an open edit or archive prompt.
- After a successful add, the cursor returns to the add field automatically.
