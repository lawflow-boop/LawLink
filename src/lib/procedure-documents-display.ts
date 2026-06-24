export const PROCEDURE_DOCUMENT_COLLAPSED_LIMIT = 10;

export function getVisibleProcedureDocuments<T>(documents: T[], expanded: boolean): T[] {
  return expanded ? documents : documents.slice(0, PROCEDURE_DOCUMENT_COLLAPSED_LIMIT);
}
