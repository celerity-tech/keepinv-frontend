/** A vendor the shop buys stock from. Master data; products link to it later via supplierId. */
export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Payload for creating or updating a supplier. */
export interface SupplierRequest {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

/** A saved contact channel for a supplier (Messenger, WhatsApp, Email, ...): the reorder shortcut. */
export interface SupplierLink {
  id: string;
  supplierId: string;
  platform: string;
  url: string;
  label: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Payload for creating or updating a supplier link. */
export interface SupplierLinkRequest {
  platform: string;
  url: string;
  label?: string;
}

/** A selectable contact platform with its display icon. */
export interface PlatformOption {
  readonly label: string;
  readonly value: string;
  /** PrimeIcons class, e.g. `pi pi-whatsapp`. */
  readonly icon: string;
}

/**
 * Known platforms offered in the channel picker. The backend enum is open-ended
 * ("...etc"), so unknown values are handled gracefully by `platformMeta`.
 */
export const SUPPLIER_PLATFORMS: readonly PlatformOption[] = [
  { label: 'Messenger', value: 'MESSENGER', icon: 'pi pi-facebook' },
  { label: 'WhatsApp', value: 'WHATSAPP', icon: 'pi pi-whatsapp' },
  { label: 'Email', value: 'EMAIL', icon: 'pi pi-envelope' },
  { label: 'Phone', value: 'PHONE', icon: 'pi pi-phone' },
  { label: 'Website', value: 'WEBSITE', icon: 'pi pi-globe' },
  { label: 'Other', value: 'OTHER', icon: 'pi pi-link' },
];

/** Resolve a platform value to its label + icon, tolerating values the API may add later. */
export function platformMeta(value: string): PlatformOption {
  const known = SUPPLIER_PLATFORMS.find((platform) => platform.value === value);
  if (known) {
    return known;
  }
  const label = value
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
  return { label: label || 'Link', value, icon: 'pi pi-link' };
}
