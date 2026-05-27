/**
 * v0.23 演示案件 seed
 *
 * 一次性内置三个完整案件，用于新装实例首屏不为空、便于用户体验：
 *   1. demo-intake-pending（待审批）  竞业限制纠纷
 *   2. demo-matter-active（进行中）   民间借贷纠纷
 *   3. demo-matter-archived（已归档） 物业服务合同纠纷
 *
 * 幂等：固定 id + upsert/create-if-missing。重复跑不会重复插入。
 */
import { PrismaClient } from "@prisma/client";

export async function seedV23DemoMatters(prisma: PrismaClient) {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    console.warn("× 未找到 ADMIN 用户，跳过 v0.23 演示案件 seed");
    return;
  }

  const causeJiebei = await prisma.causeOfAction.findFirst({
    where: { category: "CIVIL_COMMERCIAL", code: "CC-4-10-108-3" }
  });
  const causeWuye = await prisma.causeOfAction.findFirst({
    where: { category: "CIVIL_COMMERCIAL", code: "CC-4-10-126" }
  });
  const causeJingye = await prisma.causeOfAction.findFirst({
    where: { category: "CIVIL_COMMERCIAL", code: "CC-7-19-205-7" }
  });

  // ============================================================
  // 案件 1：待审批 — Intake（暂未转 Matter）
  // ============================================================
  const clientA = await prisma.client.upsert({
    where: { id: "demo-client-a" },
    update: {},
    create: {
      id: "demo-client-a",
      name: "上海星澜科技有限公司",
      type: "COMPANY",
      idNumber: "91310115DEMOAAAAA1",
      address: "上海市浦东新区张江路 100 号 9 层",
      phone: "021-68889999",
      email: "legal@xinglan-demo.cn",
      source: "客户主动咨询",
      tags: ["科技公司", "长期顾问候选"],
      notes: "由 CEO 李总介绍引荐"
    }
  });
  await prisma.contact.upsert({
    where: { id: "demo-contact-a1" },
    update: {},
    create: {
      id: "demo-contact-a1",
      clientId: clientA.id,
      name: "李振华",
      title: "总经理",
      phone: "13900001111",
      email: "li@xinglan-demo.cn",
      isPrimary: true
    }
  });

  const intakeA = await prisma.intake.upsert({
    where: { id: "demo-intake-pending" },
    update: {},
    create: {
      id: "demo-intake-pending",
      title: "上海星澜科技 与 周某竞业限制纠纷",
      category: "CIVIL_COMMERCIAL",
      causeId: causeJingye?.id,
      description:
        "周某 2025-03 从公司离职后违反竞业限制约定，加入直接竞争对手某竞品公司任 CTO，公司诉请其支付违约金 80 万并继续履行竞业限制。",
      status: "PENDING_CONFIRMATION",
      receivedAt: new Date("2026-05-22T10:00:00+08:00"),
      clientId: clientA.id,
      clientType: "COMPANY",
      contactName: "李振华",
      contactPhone: "13900001111",
      firstProcedureType: "LABOR_ARBITRATION",
      firstAgency: "上海市浦东新区劳动人事争议仲裁委员会",
      ourStanding: "ARBITRATION_CLAIMANT",
      claimAmount: 800000,
      claimDescription: "支付违约金 80 万元 + 继续履行竞业限制义务",
      feeType: "FIXED",
      feeAmount: 60000,
      feeSchedule: "签约付 50%，开庭前付 50%",
      ownerUserId: admin.id,
      coUserIds: [],
      createdById: admin.id,
      parties: {
        create: [
          {
            role: "OPPOSING_PARTY",
            standing: "ARBITRATION_RESPONDENT",
            ordinal: 1,
            name: "周某",
            idNumber: "31010519850612XXXX",
            phone: "13700002222",
            address: "上海市闵行区某小区 12 号楼 502 室",
            notes: "原星澜科技算法负责人"
          }
        ]
      }
    }
  });

  // ============================================================
  // 案件 2：进行中 — Matter IN_PROGRESS（民间借贷）
  // ============================================================
  const clientB = await prisma.client.upsert({
    where: { id: "demo-client-b" },
    update: {},
    create: {
      id: "demo-client-b",
      name: "张建国",
      type: "INDIVIDUAL",
      idNumber: "31010519720315XXXX",
      address: "上海市徐汇区某弄 21 号 301 室",
      phone: "13811112222",
      source: "老客户回访",
      tags: ["民间借贷", "回头客"]
    }
  });
  await prisma.contact.upsert({
    where: { id: "demo-contact-b1" },
    update: {},
    create: {
      id: "demo-contact-b1",
      clientId: clientB.id,
      name: "张建国",
      phone: "13811112222",
      isPrimary: true
    }
  });

  const intakeDateB = new Date("2026-03-10T09:00:00+08:00");
  const matterB = await prisma.matter.upsert({
    where: { id: "demo-matter-active" },
    update: {},
    create: {
      id: "demo-matter-active",
      internalCode: "LL-2026-CC-D002",
      title: "张建国 与 王伟民间借贷纠纷",
      category: "CIVIL_COMMERCIAL",
      status: "IN_PROGRESS",
      causeId: causeJiebei?.id,
      claimAmount: 1500000,
      ourStanding: "PLAINTIFF",
      intakeDate: intakeDateB,
      primaryClientId: clientB.id,
      ownerId: admin.id,
      firstAcceptedAt: new Date("2026-03-18T10:00:00+08:00")
    }
  });
  await prisma.matterMember.upsert({
    where: { matterId_userId: { matterId: matterB.id, userId: admin.id } },
    update: {},
    create: { matterId: matterB.id, userId: admin.id, role: "LEAD" }
  });
  await prisma.matterClient.upsert({
    where: { matterId_clientId: { matterId: matterB.id, clientId: clientB.id } },
    update: {},
    create: {
      matterId: matterB.id,
      clientId: clientB.id,
      isPrimary: true,
      label: "出借人 / 原告"
    }
  });
  await prisma.party.upsert({
    where: { id: "demo-party-b1" },
    update: {},
    create: {
      id: "demo-party-b1",
      matterId: matterB.id,
      role: "OPPOSING_PARTY",
      standing: "DEFENDANT",
      ordinal: 1,
      name: "王伟",
      idNumber: "31010119780820XXXX",
      address: "上海市黄浦区某路 88 号 1505 室",
      phone: "13522223333"
    }
  });
  const procedureB = await prisma.matterProcedure.upsert({
    where: { id: "demo-proc-b1" },
    update: {},
    create: {
      id: "demo-proc-b1",
      matterId: matterB.id,
      type: "FIRST_INSTANCE",
      engagement: "ENGAGED",
      order: 1,
      status: "IN_PROGRESS",
      caseNumber: "(2026)沪0101民初1234号",
      handlingAgency: "上海市黄浦区人民法院",
      handler: "周法官",
      acceptedAt: new Date("2026-03-25T10:00:00+08:00")
    }
  });
  await prisma.hearing.upsert({
    where: { id: "demo-hearing-b1" },
    update: {},
    create: {
      id: "demo-hearing-b1",
      procedureId: procedureB.id,
      title: "一审庭审",
      room: "黄浦法院 第五法庭",
      judge: "周法官",
      startsAt: new Date("2026-06-12T09:30:00+08:00"),
      endsAt: new Date("2026-06-12T11:30:00+08:00")
    }
  });
  await prisma.deadline.upsert({
    where: { id: "demo-deadline-b1" },
    update: {},
    create: {
      id: "demo-deadline-b1",
      procedureId: procedureB.id,
      title: "举证期限届满",
      category: "EVIDENCE",
      dueAt: new Date("2026-05-30T17:00:00+08:00"),
      remindDays: 5
    }
  });
  await prisma.billing.upsert({
    where: { id: "demo-billing-b1" },
    update: {},
    create: {
      id: "demo-billing-b1",
      matterId: matterB.id,
      title: "委托代理合同 - 固定收费",
      contractAmount: 80000,
      schedule: "签约付 50%，开庭前付 30%，结案付 20%",
      status: "ACTIVE",
      signedAt: new Date("2026-03-12T10:00:00+08:00")
    }
  });
  await prisma.feeEntry.upsert({
    where: { id: "demo-fee-b1" },
    update: {},
    create: {
      id: "demo-fee-b1",
      matterId: matterB.id,
      billingId: "demo-billing-b1",
      type: "RECEIVED",
      amount: 40000,
      occurredAt: new Date("2026-03-15T10:00:00+08:00"),
      payerOrPayee: "张建国",
      method: "银行转账",
      note: "首期律师费（50%）",
      recordedById: admin.id
    }
  });
  await prisma.timelineEvent.upsert({
    where: { id: "demo-tl-b1" },
    update: {},
    create: {
      id: "demo-tl-b1",
      matterId: matterB.id,
      eventType: "MATTER_CREATED",
      title: "案件已创建",
      occurredAt: intakeDateB
    }
  });
  await prisma.timelineEvent.upsert({
    where: { id: "demo-tl-b2" },
    update: {},
    create: {
      id: "demo-tl-b2",
      matterId: matterB.id,
      eventType: "PROCEDURE_ACCEPTED",
      title: "黄浦区人民法院受理立案",
      occurredAt: new Date("2026-03-25T10:00:00+08:00")
    }
  });

  // ============================================================
  // 案件 3：已归档 — Matter ARCHIVED（物业服务合同）
  // ============================================================
  const clientC = await prisma.client.upsert({
    where: { id: "demo-client-c" },
    update: {},
    create: {
      id: "demo-client-c",
      name: "上海绿庭物业服务有限公司",
      type: "COMPANY",
      idNumber: "91310105DEMOCCCCC1",
      address: "上海市长宁区某路 256 号",
      phone: "021-22335566",
      tags: ["物业", "已归档案例"]
    }
  });
  await prisma.contact.upsert({
    where: { id: "demo-contact-c1" },
    update: {},
    create: {
      id: "demo-contact-c1",
      clientId: clientC.id,
      name: "陈梅",
      title: "法务专员",
      phone: "13700004444",
      isPrimary: true
    }
  });
  const intakeDateC = new Date("2025-10-08T09:00:00+08:00");
  const closedAtC = new Date("2026-04-20T17:00:00+08:00");
  const matterC = await prisma.matter.upsert({
    where: { id: "demo-matter-archived" },
    update: {},
    create: {
      id: "demo-matter-archived",
      internalCode: "LL-2025-CC-D003",
      title: "绿庭物业 与 王某某物业服务合同纠纷",
      category: "CIVIL_COMMERCIAL",
      status: "ARCHIVED",
      causeId: causeWuye?.id,
      claimAmount: 36000,
      ourStanding: "PLAINTIFF",
      intakeDate: intakeDateC,
      primaryClientId: clientC.id,
      ownerId: admin.id,
      firstAcceptedAt: new Date("2025-10-20T10:00:00+08:00"),
      closedAt: closedAtC,
      archivedAt: new Date("2026-04-25T15:00:00+08:00")
    }
  });
  await prisma.matterMember.upsert({
    where: { matterId_userId: { matterId: matterC.id, userId: admin.id } },
    update: {},
    create: { matterId: matterC.id, userId: admin.id, role: "LEAD" }
  });
  await prisma.matterClient.upsert({
    where: { matterId_clientId: { matterId: matterC.id, clientId: clientC.id } },
    update: {},
    create: {
      matterId: matterC.id,
      clientId: clientC.id,
      isPrimary: true,
      label: "物业公司 / 原告"
    }
  });
  await prisma.party.upsert({
    where: { id: "demo-party-c1" },
    update: {},
    create: {
      id: "demo-party-c1",
      matterId: matterC.id,
      role: "OPPOSING_PARTY",
      standing: "DEFENDANT",
      ordinal: 1,
      name: "王某某",
      idNumber: "31010519801012XXXX",
      address: "上海市长宁区绿庭花园 8 号 1203"
    }
  });
  const procedureC = await prisma.matterProcedure.upsert({
    where: { id: "demo-proc-c1" },
    update: {},
    create: {
      id: "demo-proc-c1",
      matterId: matterC.id,
      type: "FIRST_INSTANCE",
      engagement: "ENGAGED",
      order: 1,
      status: "CONCLUDED",
      outcome: "WON",
      outcomeNote: "判决支持物业费 + 滞纳金共计 38,520 元",
      caseNumber: "(2025)沪0105民初9876号",
      handlingAgency: "上海市长宁区人民法院",
      handler: "马法官",
      acceptedAt: new Date("2025-10-20T10:00:00+08:00"),
      concludedAt: new Date("2026-04-15T16:00:00+08:00")
    }
  });
  await prisma.billing.upsert({
    where: { id: "demo-billing-c1" },
    update: {},
    create: {
      id: "demo-billing-c1",
      matterId: matterC.id,
      title: "委托代理合同 - 固定收费",
      contractAmount: 12000,
      schedule: "签约付清",
      status: "CLOSED",
      signedAt: new Date("2025-10-10T10:00:00+08:00")
    }
  });
  await prisma.feeEntry.upsert({
    where: { id: "demo-fee-c1" },
    update: {},
    create: {
      id: "demo-fee-c1",
      matterId: matterC.id,
      billingId: "demo-billing-c1",
      type: "RECEIVED",
      amount: 12000,
      occurredAt: new Date("2025-10-10T10:00:00+08:00"),
      payerOrPayee: "上海绿庭物业服务有限公司",
      method: "银行转账",
      note: "案件总律师费",
      recordedById: admin.id
    }
  });
  await prisma.timelineEvent.upsert({
    where: { id: "demo-tl-c1" },
    update: {},
    create: {
      id: "demo-tl-c1",
      matterId: matterC.id,
      eventType: "MATTER_CREATED",
      title: "案件已创建",
      occurredAt: intakeDateC
    }
  });
  await prisma.timelineEvent.upsert({
    where: { id: "demo-tl-c2" },
    update: {},
    create: {
      id: "demo-tl-c2",
      matterId: matterC.id,
      eventType: "JUDGMENT_RECEIVED",
      title: "收到一审判决书",
      content: "判决支持物业费 36,000 元 + 滞纳金 2,520 元",
      occurredAt: new Date("2026-04-15T16:00:00+08:00")
    }
  });
  await prisma.timelineEvent.upsert({
    where: { id: "demo-tl-c3" },
    update: {},
    create: {
      id: "demo-tl-c3",
      matterId: matterC.id,
      eventType: "MATTER_CLOSED",
      title: "案件结案",
      content: "判决生效，无上诉",
      occurredAt: closedAtC
    }
  });
  await prisma.archiveRecord.upsert({
    where: { id: "demo-archive-c1" },
    update: {},
    create: {
      id: "demo-archive-c1",
      matterId: matterC.id,
      archiveNo: "ARC-2026-D001",
      summary: "物业服务合同纠纷胜诉归档：判决支持全部诉请，判决生效",
      judgmentSummary: "支持物业费 36,000 元 + 滞纳金 2,520 元，案件受理费由被告承担",
      closedReason: "JUDGMENT",
      completedAt: closedAtC,
      checklistJson: {},
      missingItems: [],
      archivedBy: admin.name,
      archivedById: admin.id,
      archivedAt: new Date("2026-04-25T15:00:00+08:00"),
      status: "APPROVED",
      reviewedById: admin.id,
      reviewedAt: new Date("2026-04-25T15:30:00+08:00")
    }
  });

  console.log("✓ 演示案件：3 个已就绪（待审批 / 进行中 / 已归档）");
}
