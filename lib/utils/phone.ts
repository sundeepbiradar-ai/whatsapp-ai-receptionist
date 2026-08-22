/**
 * Presentation-only phone helpers. These never alter the stored value and
 * must not be used for validation, search, or persistence.
 */

/**
 * Collapses incidental whitespace for consistent list/detail display.
 * Does not reformat digits, since the stored format is not guaranteed
 * to be normalized (see contacts duplicate-prevention audit).
 */
export function formatPhoneForDisplay(phone: string): string {
  return phone.trim().replace(/\s+/g, " ");
}
