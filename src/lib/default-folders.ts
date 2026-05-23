import type { MatterCategory } from "@prisma/client";
import type { Prisma } from "@prisma/client";

/**
 * v0.8 默认卷宗结构（按案件类别）
 * 新建 Matter 时自动 seed；isDefault=true 不可删，可改名。
 */
export const DEFAULT_FOLDERS_BY_CATEGORY: Record<MatterCategory, readonly string[]> = {
  CIVIL_COMMERCIAL: ["收案", "立案", "委托手续", "证据", "程序文书", "庭审", "裁判", "结案"],
  ADMINISTRATIVE: ["收案", "立案", "委托手续", "证据", "程序文书", "庭审", "裁判", "结案"],
  CRIMINAL: ["收案", "委托手续", "阅卷", "会见", "取证", "庭前", "庭审", "判决与上诉", "结案"],
  NON_LITIGATION: ["立项", "调研", "工作底稿", "出具文件", "归档"],
  LEGAL_COUNSEL: ["立项", "调研", "工作底稿", "出具文件", "归档"],
  SPECIAL_PROJECT: ["立项", "调研", "工作底稿", "出具文件", "归档"]
} as const;

/**
 * 在事务中为新 Matter 创建默认卷宗。
 * 调用方提供 tx；本函数只写库，不做权限/校验。
 */
export async function seedDefaultFolders(
  tx: Prisma.TransactionClient,
  matterId: string,
  category: MatterCategory
) {
  const names = DEFAULT_FOLDERS_BY_CATEGORY[category];
  if (!names || names.length === 0) return;
  await tx.documentFolder.createMany({
    data: names.map((name, i) => ({
      matterId,
      name,
      orderIndex: i,
      isDefault: true
    }))
  });
}

/**
 * 按模板大类推荐默认归档卷宗名（用于"从模板新建"时自动选目标卷宗）。
 * 推荐不到时返回 null，由 UI 让用户手选。
 */
export function suggestFolderByTemplateCategory(
  templateCategory: string,
  matterCategory: MatterCategory
): string | null {
  const isLitigation =
    matterCategory === "CIVIL_COMMERCIAL" ||
    matterCategory === "ADMINISTRATIVE" ||
    matterCategory === "CRIMINAL";

  const mapLitigation: Record<string, string> = {
    INTAKE: "收案",
    RETAINER: "委托手续",
    LITIGATION: matterCategory === "CRIMINAL" ? "庭前" : "程序文书",
    HEARING: matterCategory === "CRIMINAL" ? "庭审" : "庭审",
    WORK_PRODUCT: matterCategory === "CRIMINAL" ? "取证" : "证据",
    ARCHIVE: matterCategory === "CRIMINAL" ? "结案" : "结案",
    CLOSING: "结案",
    BLANK: matterCategory === "CRIMINAL" ? "收案" : "收案"
  };

  const mapNonLitigation: Record<string, string> = {
    INTAKE: "立项",
    RETAINER: "立项",
    LITIGATION: "出具文件",
    HEARING: "工作底稿",
    WORK_PRODUCT: "出具文件",
    ARCHIVE: "归档",
    CLOSING: "归档",
    BLANK: "工作底稿"
  };

  const map = isLitigation ? mapLitigation : mapNonLitigation;
  return map[templateCategory] ?? null;
}
