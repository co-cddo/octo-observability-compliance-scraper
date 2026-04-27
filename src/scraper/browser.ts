import { chromium, Browser, BrowserContext } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function launchBrowser(): Promise<Browser> {
  const args =
    process.env["NODE_ENV"] !== "production"
      ? ["--ignore-certificate-errors"]
      : [];
  return chromium.launch({ headless: true, args });
}

export async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: USER_AGENT,
    locale: "en-GB",
  });
}
