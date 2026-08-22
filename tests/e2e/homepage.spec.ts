import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("should load the landing page", async ({ page }) => {
    await page.goto("/");

    // Check page title
    await expect(page).toHaveTitle(/AI Customer Operations Platform/);
  });

  test("should display hero section", async ({ page }) => {
    await page.goto("/");

    // Check for hero content
    const heading = page.locator("h1");
    await expect(heading).toContainText("Turn customer enquiries into organized conversations and appointments.");
  });

  test("should have working navigation links", async ({ page }) => {
    await page.goto("/");

    // Check for navigation links
    const featuresLink = page.locator('a[href="#features"]');
    await expect(featuresLink).toBeVisible();

    const howItWorksLink = page.locator('a[href="#how-it-works"]');
    await expect(howItWorksLink).toBeVisible();
  });

  test("should display features section", async ({ page }) => {
    await page.goto("/");

    // Check for features
    const featuresSection = page.locator("text=Core features");
    await expect(featuresSection).toBeVisible();
  });

  test("should navigate Sign in to login", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Sign in" }).first().click();

    await expect(page).toHaveURL("/login");
  });

  test("should navigate Get started to signup", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Get started" }).first().click();

    await expect(page).toHaveURL("/signup");
  });
});

test.describe("Authentication", () => {
  test("should load the login page", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator("h1")).toContainText("Welcome back");
    await expect(page.getByLabel("Email address")).toBeVisible();
  });

  test("should load the signup page", async ({ page }) => {
    await page.goto("/signup");

    await expect(page.locator("h1")).toContainText("Create your account");
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("should redirect unauthenticated dashboard access to login", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL("/login");
  });
});
