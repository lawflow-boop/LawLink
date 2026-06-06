/**
 * LawLink 初始 seed
 *
 * 包含：
 *   1. 默认 ADMIN 账号（从 SEED_ADMIN_* 环境变量读取）
 *   2. 案由库样本：民事 / 刑事 / 行政 各约 30 条最常用案由
 *      （V1 用样本即可工作；完整案由库 Stage 3 通过元典 MCP 抓取）
 *   3. 阶段模板、系统设置、文书模板和用章配置
 *
 * 运行方式：
 *   npx prisma db seed
 *
 * 幂等：所有 upsert 操作，可重复运行不会报错或重复插入。
 */

import { MatterCategory, PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { civilCauses } from "./seeds/causes-civil";
import { criminalCauses } from "./seeds/causes-criminal";
import { administrativeCauses } from "./seeds/causes-administrative";

const prisma = new PrismaClient();

type CauseSeed = {
  code: string;
  name: string;
  shortName?: string;
  level: number;
  parentCode?: string;
  keywords?: string[];
};

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@lawlink.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";
  const name = process.env.SEED_ADMIN_NAME ?? "系统管理员";

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      role: UserRole.ADMIN,
      passwordHash,
      active: true
    }
  });

  console.log(`✓ ADMIN 已就绪：${admin.email}`);
  if (password === "ChangeMe!2026") {
    console.warn("  ⚠ 当前使用默认密码 ChangeMe!2026，请尽快在 /settings 修改");
  }
}

async function seedCauses(category: MatterCategory, causes: CauseSeed[]) {
  // 第一遍：插入所有节点（parentId 暂空），记录 code → id 映射
  const codeToId = new Map<string, string>();
  const sourceNote =
    category === MatterCategory.CIVIL_COMMERCIAL
      ? "最高法《民事案件案由规定》2020 修正（样本）"
      : category === MatterCategory.CRIMINAL
        ? "刑法分则罪名（样本）"
        : "最高法《行政案件案由暂行规定》2021（样本）";

  for (const c of causes) {
    const upserted = await prisma.causeOfAction.upsert({
      where: { category_code: { category, code: c.code } },
      update: {
        name: c.name,
        shortName: c.shortName,
        level: c.level,
        keywords: c.keywords ?? [],
        sourceNote
      },
      create: {
        category,
        code: c.code,
        name: c.name,
        shortName: c.shortName,
        level: c.level,
        keywords: c.keywords ?? [],
        sourceNote
      }
    });
    codeToId.set(c.code, upserted.id);
  }

  // 第二遍：连接 parent
  for (const c of causes) {
    if (!c.parentCode) continue;
    const parentId = codeToId.get(c.parentCode);
    if (!parentId) {
      console.warn(`  ! ${c.code} 的 parent ${c.parentCode} 未找到，跳过`);
      continue;
    }
    await prisma.causeOfAction.update({
      where: { category_code: { category, code: c.code } },
      data: { parentId }
    });
  }

  console.log(`✓ 案由 [${category}]：${causes.length} 条已就绪`);
}

async function seedStageTemplates() {
  // 第一版只放最常用的一审/二审/侦查/审查起诉默认模板
  // 编辑入口在 /settings/templates
  const templates = [
    {
      procedureType: "FIRST_INSTANCE" as const,
      name: "一审标准阶段",
      steps: [
        { name: "立案", order: 1, defaultTasks: ["提交起诉状", "缴纳诉讼费"] },
        { name: "应诉", order: 2, defaultTasks: ["确认收到应诉通知"] },
        { name: "证据交换", order: 3, defaultTasks: ["提交证据目录", "举证期限内补充证据"] },
        { name: "开庭", order: 4, defaultTasks: ["庭前会议", "正式开庭"] },
        { name: "判决", order: 5, defaultTasks: ["收到判决书", "确认是否上诉"] }
      ]
    },
    {
      procedureType: "SECOND_INSTANCE" as const,
      name: "二审标准阶段",
      steps: [
        { name: "立案", order: 1, defaultTasks: ["提交上诉状"] },
        { name: "答辩", order: 2, defaultTasks: ["收到对方上诉状", "提交答辩状"] },
        { name: "开庭/询问", order: 3, defaultTasks: ["开庭或书面审理"] },
        { name: "判决", order: 4, defaultTasks: ["收到二审判决书"] }
      ]
    },
    {
      procedureType: "INVESTIGATION" as const,
      name: "侦查阶段标准流程",
      steps: [
        { name: "会见", order: 1, defaultTasks: ["首次会见", "持续会见"] },
        { name: "强制措施", order: 2, defaultTasks: ["申请取保候审", "羁押必要性审查"] },
        { name: "侦查终结", order: 3, defaultTasks: ["提出辩护意见"] }
      ]
    },
    {
      procedureType: "PROSECUTION_REVIEW" as const,
      name: "审查起诉阶段标准流程",
      steps: [
        { name: "阅卷", order: 1, defaultTasks: ["阅卷", "复制证据"] },
        { name: "辩护意见", order: 2, defaultTasks: ["提交不起诉/罪轻辩护意见"] },
        { name: "认罪认罚", order: 3, defaultTasks: ["签署具结书（如认罪）"] }
      ]
    }
  ];

  for (const t of templates) {
    await prisma.stageTemplate.upsert({
      where: { id: `default-${t.procedureType}` },
      update: { steps: t.steps as unknown as object, name: t.name },
      create: {
        id: `default-${t.procedureType}`,
        procedureType: t.procedureType,
        name: t.name,
        isDefault: true,
        steps: t.steps as unknown as object
      }
    });
  }
  console.log(`✓ 阶段模板：${templates.length} 个已就绪`);
}

async function seedSystemSettings() {
  await prisma.systemSetting.upsert({
    where: { key: "appearance" },
    update: {},
    create: {
      key: "appearance",
      value: { primaryColor: "#5B8DEF", theme: "dark" }
    }
  });
  console.log("✓ 系统设置：默认外观已就绪");
}

async function main() {
  console.log("开始 seed...\n");

  await seedAdmin();
  await seedCauses(MatterCategory.CIVIL_COMMERCIAL, civilCauses);
  await seedCauses(MatterCategory.CRIMINAL, criminalCauses);
  await seedCauses(MatterCategory.ADMINISTRATIVE, administrativeCauses);
  await seedStageTemplates();
  await seedSystemSettings();

  // v0.8: 文档模板 + 用章配置
  const { seedV08Templates, seedV08SealConfigs } = await import("./seeds/v08-templates-and-seals");
  await seedV08SealConfigs(prisma);
  await seedV08Templates(prisma);

  console.log("\n✓ Seed 完成");
}

main()
  .catch((e) => {
    console.error("✗ Seed 失败：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
