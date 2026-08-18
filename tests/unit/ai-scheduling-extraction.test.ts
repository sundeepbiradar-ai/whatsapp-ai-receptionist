import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseSchedulingExtraction, findContextReferents, schedulingExtractionSchema } =
  await import("@/lib/ai/scheduling-extraction");

describe("scheduling extraction schema", () => {
  it("accepts a complete local date and time", () => {
    expect(
      parseSchedulingExtraction('{"date":"2026-03-04","time":"15:00","mentionsExistingAppointment":false}')
    ).toEqual({ date: "2026-03-04", time: "15:00", mentionsExistingAppointment: false });
  });

  it("accepts partial values as nulls", () => {
    expect(
      parseSchedulingExtraction('{"date":"2026-03-04","time":null,"mentionsExistingAppointment":false}')
    ).toMatchObject({ date: "2026-03-04", time: null });
    expect(
      parseSchedulingExtraction('{"date":null,"time":"14:00","mentionsExistingAppointment":true}')
    ).toMatchObject({ date: null, time: "14:00" });
  });

  it("has no identifier field at all, so an id cannot be returned", () => {
    expect(Object.keys(schedulingExtractionSchema.shape).sort()).toEqual([
      "date",
      "mentionsExistingAppointment",
      "time",
    ]);
  });

  it("rejects a model-invented appointment identifier", () => {
    expect(
      parseSchedulingExtraction(
        '{"date":null,"time":null,"mentionsExistingAppointment":true,"appointmentId":"11111111-1111-4111-8111-111111111111"}'
      )
    ).toBeNull();
  });

  it.each([
    '{"date":"04/03/2026","time":null,"mentionsExistingAppointment":false}',
    '{"date":null,"time":"3pm","mentionsExistingAppointment":false}',
    '{"date":null,"time":"25:00","mentionsExistingAppointment":false}',
    '{"date":null,"time":null}',
    '{"date":null,"time":null,"mentionsExistingAppointment":"yes"}',
  ])("rejects malformed extraction %s", (raw) => {
    expect(parseSchedulingExtraction(raw)).toBeNull();
  });

  it.each(["not json", "{", "", "[]", "null", '"2026-03-04"'])(
    "rejects unusable output %j",
    (raw) => {
      expect(parseSchedulingExtraction(raw)).toBeNull();
    }
  );
});

describe("deterministic context referents", () => {
  it("finds a single clear referent", () => {
    expect(findContextReferents(["Your appointment is at 4pm", "See you then"])).toEqual(["4:00pm"]);
  });

  it("finds multiple distinct referents", () => {
    expect(
      findContextReferents(["Booked for 4pm", "Also holding 10:30am"]).sort()
    ).toEqual(["10:30am", "4:00pm"]);
  });

  it("deduplicates repeated mentions of the same referent", () => {
    expect(findContextReferents(["at 4pm", "confirming 4 PM", "4pm still works"])).toEqual([
      "4:00pm",
    ]);
  });

  it("returns nothing when history has no clock reference", () => {
    expect(findContextReferents(["hello", "can you help", "change it"])).toEqual([]);
  });

  it("ignores impossible clock values", () => {
    expect(findContextReferents(["at 0pm", "at 13pm", "at 99am"])).toEqual([]);
  });
});
