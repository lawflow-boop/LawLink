// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const componentDir = join(root, "src/app/(app)/matters/[id]/_components");

describe("matter detail click actions", () => {
  it("keeps critical matter-detail buttons responsive from pointerdown, not only click", () => {
    const checks = [
      ["info-panel.tsx", "onPointerDown={() => setTeamEditorOpen(true)}"],
      ["matter-detail-tabs.tsx", "onPointerDown={() => setAddProcOpen(true)}"],
      ["matter-detail-tabs.tsx", "onPointerDown={() => setProcEditOpen(true)}"],
      ["procedure-content.tsx", "onPointerDown={openAddDialog}"],
      ["procedure-documents-section.tsx", "onPointerDown={() => setOpen(true)}"],
      ["approvals-panel.tsx", "onPointerDown={handleOpenSheet}"]
    ] as const;

    for (const [file, expected] of checks) {
      const source = readFileSync(join(componentDir, file), "utf8");
      expect(source, `${file} should contain ${expected}`).toContain(expected);
    }
  });

  it("clears stale page-level interaction locks when no dialog is open", () => {
    const source = readFileSync(join(root, "src/components/layout/app-shell.tsx"), "utf8");

    expect(source).toContain("unlockStaleInteractionLock");
    expect(source).toContain('document.body.style.pointerEvents = ""');
    expect(source).toContain('querySelectorAll<HTMLElement>("[inert]")');
    expect(source).toContain("hasOpenModal");
  });
});
