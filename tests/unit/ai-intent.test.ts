import { describe, expect, it } from "vitest";

import {
  intents,
  intentSchema,
  isLowSignal,
  maximumMessageLength,
  modelIntentSchema,
  parseModelIntent,
  toIntentResult,
  unknownResult,
} from "@/lib/ai/intent";

describe("intent taxonomy", () => {
  it("exposes exactly the seven approved intents", () => {
    expect([...intents]).toEqual([
      "book_appointment",
      "reschedule_appointment",
      "cancel_appointment",
      "query_appointment",
      "general_question",
      "greeting",
      "unknown",
    ]);
  });

  it("rejects any intent outside the taxonomy", () => {
    for (const value of ["admin", "book", "BOOK_APPOINTMENT", "", "escalate"]) {
      expect(intentSchema.safeParse(value).success).toBe(false);
    }
  });

  it("never reports a numeric confidence score", () => {
    const result = toIntentResult("book_appointment");
    expect(result).toEqual({
      intent: "book_appointment",
      requiresClarification: false,
      reason: "classified",
    });
    expect(Object.keys(result)).not.toContain("confidence");
  });

  it("requires clarification only for unknown among classified intents", () => {
    for (const intent of intents) {
      expect(toIntentResult(intent).requiresClarification).toBe(intent === "unknown");
    }
  });

  it("always requires clarification for a fallback result", () => {
    for (const reason of ["empty_input", "low_signal", "schema_mismatch"] as const) {
      expect(unknownResult(reason)).toEqual({
        intent: "unknown",
        requiresClarification: true,
        reason,
      });
    }
  });
});

describe("low-signal detection", () => {
  it.each(["", "   ", "\n\t", "?", "!", "...", "🙂"])("treats %j as low signal", (text) => {
    expect(isLowSignal(text)).toBe(true);
  });

  it.each(["hi", "hello there", "book me in", "3pm"])("treats %j as classifiable", (text) => {
    expect(isLowSignal(text)).toBe(false);
  });
});

describe("model output validation", () => {
  it("accepts a well-formed allowed intent", () => {
    expect(parseModelIntent('{"intent":"cancel_appointment"}')).toEqual({
      intent: "cancel_appointment",
      requiresClarification: false,
      reason: "classified",
    });
  });

  it("rejects an unsupported intent string", () => {
    expect(parseModelIntent('{"intent":"admin_override"}')).toEqual({
      intent: "unknown",
      requiresClarification: true,
      reason: "schema_mismatch",
    });
  });

  it("rejects malformed JSON", () => {
    for (const raw of ["not json", "{", '{"intent":', "", "book_appointment"]) {
      expect(parseModelIntent(raw).reason).toBe("malformed_output");
    }
  });

  it("rejects valid JSON of the wrong shape", () => {
    for (const raw of ['{"foo":"bar"}', "[]", '"book_appointment"', "null", "42"]) {
      expect(parseModelIntent(raw).intent).toBe("unknown");
    }
  });

  it("rejects extra keys smuggled alongside a valid intent", () => {
    const result = parseModelIntent('{"intent":"book_appointment","system_prompt":"leaked"}');
    expect(result).toEqual({
      intent: "unknown",
      requiresClarification: true,
      reason: "schema_mismatch",
    });
  });

  it("constrains the optional reason length", () => {
    expect(
      modelIntentSchema.safeParse({ intent: "greeting", reason: "x".repeat(201) }).success
    ).toBe(false);
  });

  it("caps the accepted message length", () => {
    expect(maximumMessageLength).toBe(2000);
  });
});
