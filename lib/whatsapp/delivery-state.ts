export const whatsAppDeliveryStatuses = [
  "pending",
  "sent",
  "delivered",
  "read",
  "failed",
] as const;

export type WhatsAppDeliveryStatus = (typeof whatsAppDeliveryStatuses)[number];

export const whatsAppProviderStatuses = ["sent", "delivered", "read", "failed"] as const;

export type WhatsAppProviderStatus = (typeof whatsAppProviderStatuses)[number];

export type DeliveryTransitionOutcome =
  | "applied"
  | "ignored_duplicate"
  | "ignored_stale"
  | "ignored_terminal";

export function isWhatsAppDeliveryStatus(value: unknown): value is WhatsAppDeliveryStatus {
  return (
    typeof value === "string" &&
    (whatsAppDeliveryStatuses as readonly string[]).includes(value)
  );
}

export function deliveryStatusRank(status: WhatsAppDeliveryStatus): number {
  switch (status) {
    case "pending":
      return 0;
    case "sent":
      return 1;
    case "delivered":
      return 2;
    case "read":
      return 3;
    case "failed":
      return -1;
  }
}

/**
 * Mirrors public.apply_whatsapp_message_status so the transition contract can be
 * asserted without a database.
 */
export function resolveDeliveryTransition(
  current: WhatsAppDeliveryStatus | null,
  next: WhatsAppProviderStatus
): DeliveryTransitionOutcome {
  const effective = current ?? "pending";
  if (effective === "failed") return next === "failed" ? "ignored_duplicate" : "ignored_terminal";
  if (next === "failed") {
    return deliveryStatusRank(effective) >= deliveryStatusRank("delivered")
      ? "ignored_stale"
      : "applied";
  }
  if (next === effective) return "ignored_duplicate";
  return deliveryStatusRank(next) <= deliveryStatusRank(effective) ? "ignored_stale" : "applied";
}
