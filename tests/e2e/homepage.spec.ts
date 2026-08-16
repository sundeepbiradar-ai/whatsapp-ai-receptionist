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

    // Should be on dashboard page
    await expect(page).toHaveURL("/dashboard");
  });
});

test.describe("Dashboard", () => {
  test("should display dashboard page", async ({ page }) => {
    await page.goto("/dashboard");

    // Check for dashboard heading
    const heading = page.locator("h1");
    await expect(heading).toContainText("Dashboard");
  });

  test("should show foundation ready message", async ({ page }) => {
    await page.goto("/dashboard");

    // Check for foundation ready section
    const foundationReady = page.locator("text=Foundation Ready");
    await expect(foundationReady).toBeVisible();
  });
});
