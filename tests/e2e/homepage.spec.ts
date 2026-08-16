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
    await expect(heading).toContainText("AI Customer Operations");
  });

  test("should have working navigation links", async ({ page }) => {
    await page.goto("/");

    // Check for navigation links
    const featuresLink = page.locator('a[href="#features"]');
    await expect(featuresLink).toBeVisible();

    const architectureLink = page.locator('a[href="#architecture"]');
    await expect(architectureLink).toBeVisible();
  });

  test("should display features section", async ({ page }) => {
    await page.goto("/");

    // Check for features
    const featuresSection = page.locator("text=Foundation Features");
    await expect(featuresSection).toBeVisible();
  });

  test("should navigate to dashboard", async ({ page }) => {
    await page.goto("/");

    // Click dashboard link
    const dashboardLink = page.locator('a:has-text("View Dashboard")');
    await dashboardLink.click();

    // Unauthenticated users must be sent to login
    await expect(page).toHaveURL("/login");
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
