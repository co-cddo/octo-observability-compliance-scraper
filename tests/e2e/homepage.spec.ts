import { test, expect } from "@playwright/test";

test("homepage is accessible and displays title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Compliance Scraper/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Compliance Scraper",
  );
});

test("homepage is accessible and displays title 2", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBeTruthy();
  expect(await response.text()).toContain("Compliance Scraper");
});
