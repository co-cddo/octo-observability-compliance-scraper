import { Page } from "playwright";
import type { ComplianceLinkType } from "../types";

export type LinkCandidate = { href: string; text: string };

const BLOCKED_HOSTS = new Set(["www.w3.org", "w3.org"]);

type SearchTerms = { exact: string[]; substring: string };

const SEARCH_TERMS: Record<ComplianceLinkType, SearchTerms> = {
  accessibility: {
    exact: ["accessibility statement", "accessibility policy"],
    substring: "accessibility",
  },
  cookies: {
    exact: ["cookie policy", "cookies"],
    substring: "cookie",
  },
  privacy: {
    exact: ["privacy notice", "privacy policy"],
    substring: "privacy",
  },
};

function isBlockedHref(href: string): boolean {
  if (!href || href.startsWith("javascript:")) return true;
  try {
    const url = new URL(href);
    return BLOCKED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function rankByText(
  links: LinkCandidate[],
  terms: SearchTerms,
): LinkCandidate[] {
  const tiers: LinkCandidate[][] = terms.exact.map(() => []);
  const general: LinkCandidate[] = [];

  for (const link of links) {
    const text = link.text.toLowerCase();
    let matched = false;
    for (let i = 0; i < terms.exact.length; i++) {
      if (text.includes(terms.exact[i])) {
        tiers[i].push(link);
        matched = true;
        break;
      }
    }
    if (!matched && text.includes(terms.substring)) {
      general.push(link);
    }
  }

  return [...tiers.flat(), ...general];
}

export async function findComplianceLink(
  page: Page,
  baseUrl: string,
  type: ComplianceLinkType,
): Promise<LinkCandidate | null> {
  const terms = SEARCH_TERMS[type];
  const substringPattern = terms.substring;

  const rawLinks = await page.evaluate(
    (pattern: string): Array<{ href: string; text: string }> => {
      const allLinks = Array.from(document.querySelectorAll("a[href]"));
      const re = new RegExp(pattern, "i");

      function linksFrom(
        elements: Element[],
      ): Array<{ href: string; text: string }> {
        return elements
          .filter(
            (el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement,
          )
          .map((a) => ({
            href: a.getAttribute("href") ?? "",
            text: a.textContent?.trim() ?? "",
          }));
      }

      const footer = document.querySelector("footer");
      if (footer) {
        const candidates = linksFrom(
          Array.from(footer.querySelectorAll("a[href]")),
        );
        const matches = candidates.filter((l) => re.test(l.text));
        if (matches.length > 0) return matches;
      }

      const contentInfo = document.querySelector('[role="contentinfo"]');
      if (contentInfo) {
        const candidates = linksFrom(
          Array.from(contentInfo.querySelectorAll("a[href]")),
        );
        const matches = candidates.filter((l) => re.test(l.text));
        if (matches.length > 0) return matches;
      }

      const pageHeight = document.documentElement.scrollHeight;
      const threshold = pageHeight * 0.75;
      const bottomLinks = allLinks.filter((a) => {
        const rect = a.getBoundingClientRect();
        return rect.top + window.scrollY > threshold;
      });
      const bottomMatches = linksFrom(bottomLinks).filter((l) =>
        re.test(l.text),
      );
      if (bottomMatches.length > 0) return bottomMatches;

      return linksFrom(allLinks).filter((l) => re.test(l.text));
    },
    substringPattern,
  );

  const resolved = rawLinks
    .map((l) => ({ href: resolveUrl(l.href, baseUrl), text: l.text }))
    .filter((l) => !isBlockedHref(l.href));

  const ranked = rankByText(resolved, terms);
  return ranked[0] ?? null;
}

export async function findAccessibilityLink(
  page: Page,
  baseUrl: string,
): Promise<LinkCandidate | null> {
  return findComplianceLink(page, baseUrl, "accessibility");
}

export async function findDeeperStatementLink(
  page: Page,
  currentUrl: string,
  type: ComplianceLinkType = "accessibility",
): Promise<LinkCandidate | null> {
  const terms = SEARCH_TERMS[type];
  const substringPattern = terms.substring;

  const rawLinks = await page.evaluate(
    (): Array<{ href: string; text: string }> => {
      const main =
        document.querySelector("main") ??
        document.getElementById("main-content") ??
        document.body;

      return Array.from(main.querySelectorAll("a[href]"))
        .filter(
          (el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement,
        )
        .map((a) => ({
          href: a.getAttribute("href") ?? "",
          text: a.textContent?.trim() ?? "",
        }));
    },
  );

  const resolved = rawLinks
    .map((l) => ({ href: resolveUrl(l.href, currentUrl), text: l.text }))
    .filter((l) => !isBlockedHref(l.href) && l.href !== currentUrl);

  const subpathLinks = resolved.filter((l) =>
    l.href.startsWith(currentUrl + "/"),
  );
  if (subpathLinks.length > 0) {
    const ranked = rankByText(subpathLinks, terms);
    if (ranked.length > 0) return ranked[0];
    return subpathLinks[0];
  }

  try {
    const currentHost = new URL(currentUrl).hostname;
    const matchingLinks = resolved.filter((l) => {
      try {
        return (
          new URL(l.href).hostname === currentHost &&
          new RegExp(substringPattern, "i").test(l.text)
        );
      } catch {
        return false;
      }
    });
    const ranked = rankByText(matchingLinks, terms);
    if (ranked.length > 0) return ranked[0];
  } catch {
    // malformed URL
  }

  return null;
}
