import { describe, expect, it } from "vitest";
import { buildPggCaseworkGate } from "@/lib/pgg-casework-gate";

describe("buildPggCaseworkGate", () => {
  it("maps PGG/OA evidence into the six required trusted-casework roles", () => {
    const gate = buildPggCaseworkGate({
      values: {
        pgg_source_path: "/cases/0003",
        pgg_sync_status: "深度同步",
        pgg_receipt_count: 2,
        pgg_document_count: 12,
        pgg_evidence_count: 4,
        pgg_extraction_summary: "已提取候选事实；需人工复核"
      },
      documents: [
        { category: "EVIDENCE", tags: ["PGG深度导入"] },
        { category: "PLEADING", tags: ["PGG深度导入"] },
        { category: "PROCEDURE", tags: ["PGG深度导入", "receipt/审计"] },
        { name: "secondary_llm_or_subagent_current_review_receipt.md", category: "OTHER", tags: ["PGG深度导入", "receipt/审计"] }
      ],
      procedureCount: 1,
      partyCount: 2,
      taskCount: 3,
      noteCount: 1,
      timelineCount: 2
    });

    expect(gate.roles.map((role) => role.key)).toEqual([
      "cms",
      "matter_department",
      "evidence_management",
      "legal_support",
      "inspection_audit",
      "secondary_llm_or_subagent"
    ]);
    expect(gate.summary.total).toBe(6);
    expect(gate.summary.satisfied).toBe(6);
    expect(gate.summary.blocked).toBe(0);
    expect(gate.deliveryStatus).toBe("trusted_ready");
  });

  it("keeps imported PGG cases blocked for trusted delivery when audit or secondary receipt is missing", () => {
    const gate = buildPggCaseworkGate({
      values: {
        pgg_source_path: "/cases/0008",
        pgg_sync_status: "深度同步",
        pgg_document_count: 4,
        pgg_evidence_count: 2
      },
      documents: [
        { category: "EVIDENCE", tags: ["PGG深度导入"] },
        { category: "PLEADING", tags: ["PGG深度导入"] }
      ],
      procedureCount: 1,
      partyCount: 1,
      taskCount: 0,
      noteCount: 0,
      timelineCount: 1
    });

    const audit = gate.roles.find((role) => role.key === "inspection_audit");
    const secondary = gate.roles.find((role) => role.key === "secondary_llm_or_subagent");

    expect(audit?.status).toBe("blocked");
    expect(secondary?.status).toBe("blocked");
    expect(gate.deliveryStatus).toBe("blocked_for_trusted_delivery");
    expect(gate.boundary).toContain("不能标记为可信终稿");
  });
});
