# Suppliers, custom keyboard behavior

Only the focus and key handling we added in code is listed here. Standard web
behavior (Tab order, Enter to submit a focused form, arrow keys inside the
PrimeNG list and dropdown) is intentionally left out.

| Behavior | What happens | Source |
| --- | --- | --- |
| Focus on load | The **Add a supplier** field is focused as soon as the page renders, so you can type or scan a name right away. | `suppliers.ts` → `afterNextRender(() => addInput.focus())` |
| Focus after add | After a supplier is created, focus returns to the **Add a supplier** field for the next entry. | `suppliers.ts` → `addSupplier()` success |
| Focus on edit | Opening **Edit** in the detail pane moves focus straight to the **Name** field. | `supplier-detail.ts` → focus effect on `editing()` |
| `Esc` to cancel | Cancels whatever is open in the detail pane: supplier edit, archive confirmation, channel edit, or channel removal. Does not clear the directory selection. | `supplier-detail.ts` → `host: '(document:keydown.escape)'` → `onEscape()` |
