// @vitest-environment node
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TOPBAR = join(ROOT, "src/components/layout/topbar.tsx");
const APP_DIR = join(ROOT, "src/app/(app)");

function internalPathFromHref(href: string) {
  if (!href.startsWith("/")) return null;
  return href.split("?")[0].replace(/\/$/, "") || "/";
}

function routePageExists(pathname: string) {
  if (pathname === "/") return existsSync(join(APP_DIR, "page.tsx"));
  return existsSync(join(APP_DIR, pathname.slice(1), "page.tsx"));
}

function extractTopbarHrefs() {
  const source = readFileSync(TOPBAR, "utf8");
  const quoted = [...source.matchAll(/href:\s*"([^"]+)"|href=\"([^\"]+)\"/g)].map((m) => m[1] ?? m[2]);
  return Array.from(new Set(quoted));
}

describe("Topbar navigation", () => {
  it("does not point right-top menu links at missing internal routes", () => {
    const missing = extractTopbarHrefs()
      .map(internalPathFromHref)
      .filter((href): href is string => Boolean(href))
      .filter((pathname) => !pathname.startsWith("/api/"))
      .filter((pathname) => !routePageExists(pathname));

    expect(missing).toEqual([]);
  });

  it("renders app shortcuts as direct anchors instead of a click-fragile dropdown", () => {
    const source = readFileSync(TOPBAR, "utf8");
    expect(source).toContain("aria-label=\"应用快捷入口\"");
    expect(source).toContain("<nav");
    expect(source).not.toContain("title=\"应用\"\n            aria-label=\"应用\"");
  });
});
