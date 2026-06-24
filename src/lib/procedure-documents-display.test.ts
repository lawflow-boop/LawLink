import { describe, expect, it } from "vitest";
import { getVisibleProcedureDocuments, PROCEDURE_DOCUMENT_COLLAPSED_LIMIT } from "@/lib/procedure-documents-display";

const docs = Array.from({ length: 12 }, (_, index) => ({ id: `doc-${index + 1}` }));

describe("getVisibleProcedureDocuments", () => {
  it("keeps only the first ten documents when collapsed", () => {
    expect(PROCEDURE_DOCUMENT_COLLAPSED_LIMIT).toBe(10);
    expect(getVisibleProcedureDocuments(docs, false).map((doc) => doc.id)).toEqual([
      "doc-1",
      "doc-2",
      "doc-3",
      "doc-4",
      "doc-5",
      "doc-6",
      "doc-7",
      "doc-8",
      "doc-9",
      "doc-10"
    ]);
  });

  it("returns all documents when expanded", () => {
    expect(getVisibleProcedureDocuments(docs, true)).toHaveLength(12);
  });
});
