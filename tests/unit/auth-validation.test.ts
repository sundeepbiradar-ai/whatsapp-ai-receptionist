import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import LoginPage from "@/app/login/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
import ResetPasswordPage from "@/app/reset-password/page";
import { GET as authCallbackHandler } from "@/app/auth/callback/route";
import { requestPasswordResetAction, updatePasswordAction } from "@/lib/auth/actions";
import { getExchangeRedirectType, passwordRecoveryCookie } from "@/lib/auth/recovery";
import {
  authFormSchema,
  getOrganizationValues,
  getAuthErrorMessage,
  getAuthFormValues,
} from "@/lib/auth/validation";

vi.mock("next/headers", () => {
  const store = new Map<string, string>();
  const cookieStore = {
    get: (name: string) => (store.has(name) ? { name, value: store.get(name) as string } : undefined),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
  };
  return {
    cookies: vi.fn(async () => cookieStore),
    __cookieStore: store,
  };
});

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormState: vi.fn((action: unknown, initialState: unknown) => [initialState, action]),
    useFormStatus: vi.fn(() => ({ pending: false })),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

async function getRecoveryCookieStore(): Promise<Map<string, string>> {
  const { __cookieStore } = (await import("next/headers")) as unknown as {
    __cookieStore: Map<string, string>;
  };
  return __cookieStore;
}

describe("authentication validation", () => {
  beforeEach(async () => {
    (await getRecoveryCookieStore()).clear();
  });

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

  it("renders a forgot-password link on the login screen", () => {
    const html = renderToStaticMarkup(LoginPage());

    expect(html).toContain("Forgot password?");
    expect(html).toContain("/forgot-password");
  });

  it("renders the forgot password page", () => {
    const html = renderToStaticMarkup(ForgotPasswordPage());

    expect(html).toContain("Forgot password?");
    expect(html).toContain("Send reset instructions");
    expect(html).toContain("Back to sign in");
  });

  it("returns the same neutral message for known and unknown reset emails", async () => {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      },
    } as never);

    const formData = new FormData();
    formData.set("email", "user@example.com");
    const success = await requestPasswordResetAction({}, formData);
    expect(success).toEqual({ message: "If an account exists for that email, we've sent password reset instructions." });

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        resetPasswordForEmail: vi.fn().mockResolvedValue({ error: { message: "User not found" } }),
      },
    } as never);

    const unknownFormData = new FormData();
    unknownFormData.set("email", "missing@example.com");
    const unknown = await requestPasswordResetAction({}, unknownFormData);

    expect(unknown).toEqual({ message: "If an account exists for that email, we've sent password reset instructions." });
  });

  it("keeps normal (non-recovery) auth callbacks on the dashboard", async () => {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user-normal" }, redirectType: null }, error: null }),
      },
    } as never);

    const normalCallback = await authCallbackHandler({
      nextUrl: new URL("https://example.com/auth/callback?code=normal-code"),
      url: "https://example.com/auth/callback?code=normal-code",
    } as never);

    expect(normalCallback.headers.get("location")).toBe("https://example.com/dashboard");
    expect((await getRecoveryCookieStore()).has(passwordRecoveryCookie)).toBe(false);
  });

  it("only unlocks the reset flow when Supabase's own exchange reports redirectType 'recovery'", async () => {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user-recovery" }, redirectType: "recovery" }, error: null }),
      },
    } as never);

    const recoveryCallback = await authCallbackHandler({
      nextUrl: new URL("https://example.com/auth/callback?code=recovery-code&type=recovery"),
      url: "https://example.com/auth/callback?code=recovery-code&type=recovery",
    } as never);

    expect(recoveryCallback.headers.get("location")).toBe("https://example.com/reset-password");
    expect((await getRecoveryCookieStore()).get(passwordRecoveryCookie)).toBe("user-recovery");
  });

  it("does not trust a client-supplied ?type=recovery flag on a non-recovery code exchange", async () => {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    // Simulates an attacker appending ?type=recovery to a valid, ordinary auth
    // code. Supabase's own PKCE exchange still reports no recovery redirectType,
    // so the URL flag alone must not be able to unlock the reset form.
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "attacker" }, redirectType: null }, error: null }),
      },
    } as never);

    const spoofedCallback = await authCallbackHandler({
      nextUrl: new URL("https://example.com/auth/callback?code=ordinary-code&type=recovery"),
      url: "https://example.com/auth/callback?code=ordinary-code&type=recovery",
    } as never);
    expect(spoofedCallback.headers.get("location")).toBe("https://example.com/dashboard");
    expect((await getRecoveryCookieStore()).has(passwordRecoveryCookie)).toBe(false);
  });

  it("fails closed when the runtime redirectType field is entirely absent, even with ?type=recovery", async () => {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    // Distinct from redirectType: null — this simulates a future auth-js
    // response shape that drops the field altogether.
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { user: { id: "user-x" } }, error: null }),
      },
    } as never);

    const callback = await authCallbackHandler({
      nextUrl: new URL("https://example.com/auth/callback?code=some-code&type=recovery"),
      url: "https://example.com/auth/callback?code=some-code&type=recovery",
    } as never);

    expect(callback.headers.get("location")).toBe("https://example.com/dashboard");
    expect((await getRecoveryCookieStore()).has(passwordRecoveryCookie)).toBe(false);
  });

  it("redirects to a fixed, app-controlled path on exchange errors (no arbitrary redirect target)", async () => {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "invalid" } }),
      },
    } as never);

    const failedCallback = await authCallbackHandler({
      nextUrl: new URL("https://example.com/auth/callback?code=bad-code&type=recovery"),
      url: "https://example.com/auth/callback?code=bad-code&type=recovery",
    } as never);

    expect(failedCallback.headers.get("location")).toBe("https://example.com/reset-password?error=invalid");
  });
});

describe("reset password page recovery gating", () => {
  it("does not unlock the reset form for a normal authenticated user with no recovery cookie", async () => {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "signed-in-user" } }, error: null }),
      },
    } as never);

    const html = renderToStaticMarkup(await ResetPasswordPage({}));

    expect(html).toContain("Password reset unavailable");
  });

  it("does not unlock the reset form when the recovery cookie belongs to a different user", async () => {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    (await getRecoveryCookieStore()).set(passwordRecoveryCookie, "some-other-user");
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "signed-in-user" } }, error: null }),
      },
    } as never);

    const html = renderToStaticMarkup(await ResetPasswordPage({}));

    expect(html).toContain("Password reset unavailable");
  });

  it("unlocks the reset form once the recovery cookie matches the current user", async () => {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    (await getRecoveryCookieStore()).set(passwordRecoveryCookie, "recovering-user");
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "recovering-user" } }, error: null }),
      },
    } as never);

    const html = renderToStaticMarkup(await ResetPasswordPage({}));

    expect(html).toContain("Set new password");
  });
});

describe("getExchangeRedirectType (isolated internal-API guard)", () => {
  it("returns 'recovery' only for the exact expected literal", () => {
    expect(getExchangeRedirectType({ redirectType: "recovery" })).toBe("recovery");
  });

  it("returns null for other known redirect types", () => {
    expect(getExchangeRedirectType({ redirectType: "signup" })).toBeNull();
    expect(getExchangeRedirectType({ redirectType: "magiclink" })).toBeNull();
  });

  it("returns null when the field is absent", () => {
    expect(getExchangeRedirectType({})).toBeNull();
  });

  it("returns null for null, undefined, and non-object input", () => {
    expect(getExchangeRedirectType(null)).toBeNull();
    expect(getExchangeRedirectType(undefined)).toBeNull();
    expect(getExchangeRedirectType("recovery")).toBeNull();
    expect(getExchangeRedirectType(42)).toBeNull();
  });

  it("returns null for unexpected value types on the field itself", () => {
    expect(getExchangeRedirectType({ redirectType: true })).toBeNull();
    expect(getExchangeRedirectType({ redirectType: null })).toBeNull();
    expect(getExchangeRedirectType({ redirectType: ["recovery"] })).toBeNull();
  });
});

describe("password update action", () => {
  it("rejects mismatched passwords before contacting Supabase", async () => {
    const formData = new FormData();
    formData.set("password", "correct-horse-1");
    formData.set("confirmPassword", "different-horse-2");

    const result = await updatePasswordAction({}, formData);

    expect(result).toEqual({ error: "Passwords do not match." });
  });

  it("rejects the update when there is no verified recovery session", async () => {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-no-recovery" } }, error: null }),
      },
    } as never);

    const formData = new FormData();
    formData.set("password", "new-password-123");
    formData.set("confirmPassword", "new-password-123");

    const result = await updatePasswordAction({}, formData);

    expect(result).toEqual({
      error: "This password reset link is invalid or has expired. Please request a new reset email.",
    });
  });

  it("updates the password and signs the user out on success", async () => {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    (await getRecoveryCookieStore()).set(passwordRecoveryCookie, "user-success");
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-success" } }, error: null }),
        updateUser,
        signOut,
      },
    } as never);

    const formData = new FormData();
    formData.set("password", "brand-new-password");
    formData.set("confirmPassword", "brand-new-password");

    const result = await updatePasswordAction({}, formData);

    expect(updateUser).toHaveBeenCalledWith({ password: "brand-new-password" });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      message: "Your password has been updated successfully. Please sign in with your new password.",
    });
    expect((await getRecoveryCookieStore()).get(passwordRecoveryCookie)).toBe("");
  });

  it("sanitizes provider errors instead of exposing raw Supabase error details", async () => {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    (await getRecoveryCookieStore()).set(passwordRecoveryCookie, "user-error");
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-error" } }, error: null }),
        updateUser: vi.fn().mockResolvedValue({ error: { message: "internal provider trace details" } }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    } as never);

    const formData = new FormData();
    formData.set("password", "brand-new-password");
    formData.set("confirmPassword", "brand-new-password");

    const result = await updatePasswordAction({}, formData);

    expect(result).toEqual({
      error: "We could not update your password. Please request a new reset link and try again.",
    });
  });
});
