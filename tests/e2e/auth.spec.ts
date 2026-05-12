import { test, expect } from "@playwright/test";

test.describe("authentication flow", () => {
  test("sign in via OIDC mock and access protected page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("**/accessibility");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign out" })).toBeVisible();
  });

  test("unauthenticated user is redirected to homepage", async ({ page }) => {
    await page.goto("/accessibility");
    await expect(page).toHaveURL(/\/$/);
  });

  test("returnTo redirects to originally requested page", async ({ page }) => {
    await page.goto("/services");
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/services");
  });

  test("logout clears session", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/accessibility");

    await page.getByRole("link", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/accessibility");
    await expect(page).toHaveURL(/\/$/);
  });
});
