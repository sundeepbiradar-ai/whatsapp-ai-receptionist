import { describe, expect, it } from "vitest";

import {
  authFormSchema,
  getOrganizationValues,
  getAuthErrorMessage,
  getAuthFormValues,
} from "@/lib/auth/validation";

describe("authentication validation", () => {
  it("accepts a valid email and password", () => {
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "secure-password");

    const values = getAuthFormValues(
      formData
    );

    expect(values).toEqual({ email: "user@example.com", password: "secure-password" });
  });

  it("rejects invalid credentials input", () => {
    const result = authFormSchema.safeParse({ email: "invalid", password: "short" });

    expect(result.success).toBe(false);
    expect(getAuthErrorMessage(result.success ? undefined : result.error)).toContain("valid email");
  });

  it("does not expose provider or database error details", () => {
    expect(getAuthErrorMessage(new Error("internal database detail"))).toBe(
      "We could not complete that request. Please try again."
    );
  });

  it("generates a URL-safe lowercase organization slug", () => {
    const formData = new FormData();
    formData.set("name", "  My First Clinic!  ");

    expect(getOrganizationValues(formData)).toEqual({
      name: "My First Clinic!",
      slug: "my-first-clinic",
    });
  });

  it("rejects an organization name without slug-compatible characters", () => {
    const formData = new FormData();
    formData.set("name", "!!!");

    expect(() => getOrganizationValues(formData)).toThrow(
      "Organization name must include letters or numbers."
    );
  });
});
