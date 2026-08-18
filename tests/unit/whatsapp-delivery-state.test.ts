import { describe, expect, it } from "vitest";

import {
  deliveryStatusRank,
  isWhatsAppDeliveryStatus,
  resolveDeliveryTransition,
  whatsAppDeliveryStatuses,
} from "@/lib/whatsapp/delivery-state";
import { classifyWhatsAppFailure } from "@/lib/whatsapp/failures";

describe("WhatsApp delivery state machine", () => {
  it("orders the normal progression monotonically", () => {
    expect(deliveryStatusRank("pending")).toBeLessThan(deliveryStatusRank("sent"));
    expect(deliveryStatusRank("sent")).toBeLessThan(deliveryStatusRank("delivered"));
    expect(deliveryStatusRank("delivered")).toBeLessThan(deliveryStatusRank("read"));
  });

  it("recognizes only known delivery statuses", () => {
    for (const status of whatsAppDeliveryStatuses) expect(isWhatsAppDeliveryStatus(status)).toBe(true);
    expect(isWhatsAppDeliveryStatus("queued")).toBe(false);
    expect(isWhatsAppDeliveryStatus(null)).toBe(false);
    expect(isWhatsAppDeliveryStatus(2)).toBe(false);
  });

  it("advances sent then delivered then read", () => {
    expect(resolveDeliveryTransition(null, "sent")).toBe("applied");
    expect(resolveDeliveryTransition("pending", "sent")).toBe("applied");
    expect(resolveDeliveryTransition("sent", "delivered")).toBe("applied");
    expect(resolveDeliveryTransition("delivered", "read")).toBe("applied");
  });

  it("allows skipping intermediate states forward", () => {
    expect(resolveDeliveryTransition("pending", "read")).toBe("applied");
    expect(resolveDeliveryTransition("sent", "read")).toBe("applied");
  });

  it("never regresses on out-of-order events", () => {
    expect(resolveDeliveryTransition("read", "delivered")).toBe("ignored_stale");
    expect(resolveDeliveryTransition("read", "sent")).toBe("ignored_stale");
    expect(resolveDeliveryTransition("delivered", "sent")).toBe("ignored_stale");
  });

  it("treats repeated identical statuses as duplicates", () => {
    expect(resolveDeliveryTransition("sent", "sent")).toBe("ignored_duplicate");
    expect(resolveDeliveryTransition("delivered", "delivered")).toBe("ignored_duplicate");
    expect(resolveDeliveryTransition("read", "read")).toBe("ignored_duplicate");
    expect(resolveDeliveryTransition("failed", "failed")).toBe("ignored_duplicate");
  });

  it("applies failure only before the message was delivered", () => {
    expect(resolveDeliveryTransition(null, "failed")).toBe("applied");
    expect(resolveDeliveryTransition("pending", "failed")).toBe("applied");
    expect(resolveDeliveryTransition("sent", "failed")).toBe("applied");
    expect(resolveDeliveryTransition("delivered", "failed")).toBe("ignored_stale");
    expect(resolveDeliveryTransition("read", "failed")).toBe("ignored_stale");
  });

  it("keeps failed terminal", () => {
    expect(resolveDeliveryTransition("failed", "sent")).toBe("ignored_terminal");
    expect(resolveDeliveryTransition("failed", "delivered")).toBe("ignored_terminal");
    expect(resolveDeliveryTransition("failed", "read")).toBe("ignored_terminal");
  });
});

describe("WhatsApp failure classification", () => {
  it("classifies definite provider responses and connect failures as retryable", () => {
    expect(classifyWhatsAppFailure("whatsapp_provider_unavailable")).toBe("retryable");
    expect(classifyWhatsAppFailure("whatsapp_provider_rate_limited")).toBe("retryable");
    expect(classifyWhatsAppFailure("whatsapp_provider_unreachable")).toBe("retryable");
  });

  it("classifies outcomes the provider may have accepted as ambiguous", () => {
    expect(classifyWhatsAppFailure("whatsapp_provider_network_failure")).toBe("ambiguous");
    expect(classifyWhatsAppFailure("whatsapp_provider_response_invalid")).toBe("ambiguous");
    expect(classifyWhatsAppFailure("whatsapp_message_unconfirmed")).toBe("ambiguous");
  });

  it("classifies request and configuration failures as permanent", () => {
    expect(classifyWhatsAppFailure("whatsapp_provider_rejected")).toBe("permanent");
    expect(classifyWhatsAppFailure("whatsapp_destination_invalid")).toBe("permanent");
    expect(classifyWhatsAppFailure("whatsapp_message_invalid")).toBe("permanent");
    expect(classifyWhatsAppFailure("whatsapp_configuration_unavailable")).toBe("permanent");
  });
});
