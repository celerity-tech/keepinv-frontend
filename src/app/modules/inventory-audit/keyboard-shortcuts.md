# Inventory Audit, custom keyboard behavior

Only the focus and key handling we added in code is listed here. Standard web
behavior (Tab order, Enter to submit a focused form, arrow keys inside the
PrimeNG dropdowns) is intentionally left out.

The audit capture session is scanner-first: a barcode trigger and an RFID sweep
both arrive as keyboard input, so the work here is making sure that input always
lands in the scan field and nowhere else.

| Behavior | What happens | Source |
| --- | --- | --- |
| Capture field holds focus | While a session is listening, the scan field keeps focus so a barcode trigger or an RFID sweep always lands there, even after the view re-renders. | `session/audit-session.ts` → focus `effect()` on `listening()` |
| Focus on start / resume | Beginning a new audit, or continuing an in-progress one, opens straight into the capture field already focused. | `session/audit-session.ts` → `begin()` / `ngOnInit()` (resume) via the `listening()` effect |
| `Enter` commits a scan | Each `Enter` takes the field's current value as one tag and clears it; a rapid burst of `Enter`-terminated tags (RFID) is buffered and sent as one batch. | `session/audit-session.html` `(keydown.enter)` → `onScan()` |
| Refocus after a stray blur | If focus leaves the field to nothing (a click on empty space), it returns to the field. Focus moving to a real control (Pause, Discard, Finish) is left alone. | `session/audit-session.ts` → `(blur)` → `onCaptureBlur()` |
| Pause / Resume | Pause releases the capture field so scans are ignored and the mouse is usable; Resume re-focuses it. | `session/audit-session.ts` → `togglePause()` |
| Focus returns after mode change | Picking a scan mode (RFID / Barcode / Manual) returns focus to the capture field. | `session/audit-session.ts` → `setMode()` → `refocus()` |
| Focus returns after paste | Adding pasted tags closes the popover and returns focus to the capture field. | `session/audit-session.ts` → `submitPaste()` → `refocus()` |
