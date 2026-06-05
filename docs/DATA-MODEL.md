# LawLink 数据模型设计

> 版本：v0.46（程序当事人修订）
> 最后更新：2026-06-05
> 对应 PRD：v0.3
> 状态：已与叶森确认，可作为 Prisma schema 实现依据
>
> v0.3 主要变化（见 §八 决策表）：
> - `MatterType` → `MatterCategory`：诉讼细分为民商事/刑事/行政三类
> - `ProcedureType` 重新分组，加入侦查/审查起诉/死刑复核/行政复议/检察监督等
> - `MatterProcedure` 加 `handlingAgency`（办理机关，刑事核心字段）
> - `Matter` 新增 `ourStanding`（我方诉讼地位）、`intakeDate`（收案时间）
> - 反诉补充：`counterclaimAsPlaintiff` / `counterclaimAsDefendant`
> - `internalCode` 类型代码改为 2 字母：CC/CR/AD/NL/GC/SP
> - `ProcedureParty`：同一当事人可在不同案件程序中记录不同诉讼地位。

---

## 一、核心概念（先读这个再看模型）

LawLink 把律师承办的"一件事"抽象成三层：

```
Matter（案件 / 项目）
  └── MatterProcedure（程序阶段：一审 / 二审 / 仲裁 / 执行 ...）
         └── MatterStage（工作阶段：立案 / 举证 / 开庭 / 判决 ...）
                └── Task / Hearing / Deadline / Document
```

- **Matter** = 一个法律争议或非诉项目的整体容器。客户、案由、标的、整体状态、合同、财务、分成、沟通记录都挂在这里。
- **MatterProcedure** = 同一争议下的一个程序，比如"一审"、"二审"、"再审"、"劳动仲裁"、"撤销仲裁"、"执行"。每个程序有自己的案号、法院/仲裁机构、立案日、结案日、结果。**一个 Matter 可以有多个 Procedure 串接**。
- **MatterStage** = 一个 Procedure 内部的工作阶段（如"证据交换"、"开庭"）。
- **Task / Hearing / Deadline / Document** = 最末端的工作项，挂在 Procedure 或 Matter 上。

**为什么这样分**：律师视角下"青石建设诉华东置业建设工程合同纠纷"是**同一个案件**，无论它经历一审、二审、再审，客户永远是同一个，合同也通常一份贯穿。但每个程序有独立的案号、独立的开庭和期限，必须能分开管理。

---

## 二、设计原则

1. **单体单库**。所有表共享一个 PostgreSQL 数据库；不预留 `organizationId`。
2. **软删除**。`Matter` / `Client` / `Document` / `Note` 用 `deletedAt`。
3. **审计字段**。所有业务实体含 `createdAt` / `updatedAt`；关键实体含 `createdById`。
4. **金额用 `Decimal(14, 2)`**。绝不用 `Float`。
5. **枚举优先**。状态、角色、分类用 Prisma `enum`。
6. **可逆**。删除要么软删除，要么生成审计记录可追溯。
7. **多对多用显式关联表**（`MatterMember` / `MatterClient`），便于挂额外字段。
8. **敏感字段加密**。`Document` 支持密文存储，密钥从环境变量。

---

## 三、ER 概览

```
                                              ┌─ CauseOfAction (规范案由库，民/刑/行三套树)
                                              │
User ─── (member of) ──── Matter ──┬── 引用 ─┘
   │                       │       │
   │                       │       ├── MatterClient ── Client ── Contact
   │                       │       ├── MatterMember (主办/协办/助理)
   │                       │       ├── MatterProcedure ──┬── MatterStage ── Task
   │                       │       │  (一审/二审/侦查/   ├── Hearing
   │                       │       │   审查起诉/复议等)  ├── Deadline
   │                       │       │                      └── Document (可归)
   │                       │       ├── Party (当事人多个，可增减)
   │                       │       ├── RelatedEntity
   │                       │       ├── Note (沟通记录)
   │                       │       ├── Task (跨程序通用)
   │                       │       ├── Document (案件级)
   │                       │       ├── Billing ─── FeeEntry
   │                       │       ├── CommissionPlan (分成方案)
   │                       │       ├── TimelineEvent
   │                       │       └── ArchiveRecord
   │                       │
   │                       └── Intake ──┬── Party
   │                                    └── ConflictCheck ── ConflictHit
   │
   └── AuditLog
```

---

## 四、模型详细设计

### 4.1 User（用户）

```prisma
enum UserRole {
  ADMIN
  PRINCIPAL_LAWYER
  LAWYER
  ASSISTANT
  FINANCE
}

model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  passwordHash  String
  role          UserRole  @default(LAWYER)
  phone         String?
  avatar        String?
  active        Boolean   @default(true)
  lastLoginAt   DateTime?

  ownedMatters    Matter[]         @relation("MatterOwner")
  memberships     MatterMember[]
  commissionPlans CommissionPlan[]
  createdNotes    Note[]           @relation("NoteAuthor")
  auditLogs       AuditLog[]
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}
```

### 4.2 Client + Contact（客户与联系人）

```prisma
enum ClientType {
  INDIVIDUAL   // 自然人
  COMPANY      // 公司
  ORGANIZATION // 其他组织（事业单位、社团等）
}

model Client {
  id          String          @id @default(cuid())
  name        String
  type        ClientType
  idNumber    String?         // 自然人身份证 / 公司统一社会信用代码
  address     String?
  phone       String?
  email       String?
  source      String?         // 案源
  tags        String[]
  notes       String?
  contacts    Contact[]
  intakes     Intake[]
  matterLinks MatterClient[]
  deletedAt   DateTime?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@index([name])
  @@index([idNumber])
}

model Contact {
  id        String   @id @default(cuid())
  clientId  String
  client    Client   @relation(fields: [clientId], references: [id])
  name      String
  title     String?
  phone     String?
  email     String?
  wechat    String?
  isPrimary Boolean  @default(false)
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([clientId])
}
```

**说明（叶森决策 §2）**：以案件为中心，不做"客户合并"。同一客户多次咨询会建多份 `Intake`，每份独立流转。

### 4.3 Intake（收案）

```prisma
enum IntakeStatus {
  INTAKE                // 已咨询
  PENDING_CONFIRMATION  // 待确认（冲突检索中 / 已检索待结论）
  CONVERTED             // 已转为正式案件
  DECLINED              // 不接案
}

/// 案件大类（替代旧 MatterType）。诉讼按民商事/刑事/行政三大法律体系区分，
/// 其余三类是非诉与服务型业务。律师在新建收案/案件时必选其一。
enum MatterCategory {
  // —— 诉讼三大类 ——
  CIVIL_COMMERCIAL   // 民商事诉讼
  CRIMINAL           // 刑事
  ADMINISTRATIVE     // 行政
  // —— 非诉与服务 ——
  NON_LITIGATION     // 非诉项目
  LEGAL_COUNSEL      // 常年顾问
  SPECIAL_PROJECT    // 专项法律服务
}

model Intake {
  id              String          @id @default(cuid())
  title           String
  category        MatterCategory  @default(CIVIL_COMMERCIAL)
  causeOfAction   String?
  description     String?
  source          String?
  status          IntakeStatus    @default(INTAKE)
  receivedAt      DateTime        @default(now())
  declinedReason  String?

  clientId        String?
  client          Client?         @relation(fields: [clientId], references: [id])
  parties         Party[]
  conflictChecks  ConflictCheck[]
  matter          Matter?

  createdById     String
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([status, receivedAt])
}
```

### 4.4 Matter（正式案件 / 项目）

> 删除了原单一 `caseNumber` / `court` / `procedure` 字段——这些信息**移到 `MatterProcedure`**，因为同一案件可能有多个程序，每个程序的案号和办理机关都不同。
> `acceptedAt` 拆为：`intakeDate`（律师收案日）+ `firstAcceptedAt`（首次立案日，从 Procedure 聚合）。

```prisma
enum MatterStatus {
  PENDING_ACCEPTANCE  // 已转化、待启动首程序
  IN_PROGRESS         // 办理中（至少一个 Procedure 进行中）
  ON_HOLD             // 暂停
  CLOSED              // 已结案（所有 Procedure 都已结）
  ARCHIVED            // 已归档（只读）
}

/// 我方在本案件中的诉讼地位（按案件类型动态可选项不同）
enum LitigationStanding {
  // 民商事 + 行政共用
  PLAINTIFF                  // 原告 / 行政原告
  JOINT_PLAINTIFF            // 兼容旧值；UI 不再作为独立选项
  DEFENDANT                  // 被告 / 行政被告
  JOINT_DEFENDANT            // 兼容旧值；UI 不再作为独立选项
  THIRD_PARTY                // 第三人
  COUNTERCLAIM_PLAINTIFF     // 反诉原告
  COUNTERCLAIM_DEFENDANT     // 反诉被告
  // 刑事专用
  CRIMINAL_DEFENDANT         // 刑事被告人
  CRIMINAL_VICTIM            // 被害人
  PRIVATE_PROSECUTOR         // 自诉人
  CRIMINAL_INCIDENTAL_PLAINTIFF // 刑事附带民事原告
  // 仲裁
  ARBITRATION_CLAIMANT       // 仲裁申请人
  ARBITRATION_RESPONDENT     // 仲裁被申请人
  // 非诉
  NON_LITIGATION_PARTY       // 非诉项目当事人（适用于非诉/顾问/专项）
}

model Matter {
  id              String          @id @default(cuid())
  /// 系统自动生成的内部编号：LL-{YYYY}-{CC|CR|AD|NL|GC|SP}-{4位流水}
  /// 例：LL-2026-CC-0015（2026 年第 15 件民商事案件）
  internalCode    String          @unique
  title           String
  category        MatterCategory  @default(CIVIL_COMMERCIAL)
  status          MatterStatus    @default(IN_PROGRESS)

  /// 案由（关联规范案由库，详见 §4.6 CauseOfAction）
  causeId         String?
  cause           CauseOfAction?  @relation(fields: [causeId], references: [id])
  /// 兜底自由文本（仅在 causeId 为空时使用，便于过渡和未收录场景）
  causeFreeText   String?

  claimAmount     Decimal?        @db.Decimal(14, 2)  // 标的金额（案件整体）

  /// 我方诉讼地位
  ourStanding     LitigationStanding?
  /// 反诉补充（仅 CIVIL_COMMERCIAL 适用）
  counterclaimAsPlaintiff  Boolean @default(false)  // 我方提起反诉
  counterclaimAsDefendant  Boolean @default(false)  // 我方是被反诉方

  /// 律师收案日（律师介入这件事的日期）
  intakeDate      DateTime?

  /// 主要客户（冗余字段，便于列表展示，详细多客户走 MatterClient）
  primaryClientId String?
  primaryClient   Client?         @relation(fields: [primaryClientId], references: [id])
  clientLinks     MatterClient[]

  /// 主办律师（冗余字段，便于列表展示，团队成员走 MatterMember）
  ownerId         String
  owner           User            @relation("MatterOwner", fields: [ownerId], references: [id])
  members         MatterMember[]

  /// 收案转化来源
  intakeId        String?         @unique
  intake          Intake?         @relation(fields: [intakeId], references: [id])

  /// 时间锚点（从 Procedure 聚合得出，但冗余存便于排序）
  firstAcceptedAt DateTime?       // 首程序立案/受理日
  closedAt        DateTime?       // 全部 Procedure 结案时间
  archivedAt     DateTime?

  procedures      MatterProcedure[]
  parties         Party[]
  relatedEntities RelatedEntity[]
  notes           Note[]
  tasks           Task[]
  documents       Document[]
  timelineEvents  TimelineEvent[]
  billings        Billing[]
  feeEntries      FeeEntry[]
  commissionPlans CommissionPlan[]
  archiveRecords  ArchiveRecord[]

  deletedAt       DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([status, updatedAt])
  @@index([ownerId])
  @@index([primaryClientId])
  @@index([category, status])
  @@index([causeId])
}

enum MatterMemberRole {
  LEAD       // 主办
  CO_LEAD    // 协办
  ASSISTANT  // 助理
}

model MatterMember {
  matterId String
  matter   Matter           @relation(fields: [matterId], references: [id])
  userId   String
  user     User             @relation(fields: [userId], references: [id])
  role     MatterMemberRole @default(ASSISTANT)
  joinedAt DateTime         @default(now())

  @@id([matterId, userId])
}

/// 案件↔客户多对多。一个案件可能多个原告共同委托。
model MatterClient {
  matterId  String
  matter    Matter   @relation(fields: [matterId], references: [id])
  clientId  String
  client    Client   @relation(fields: [clientId], references: [id])
  /// 该客户在本案件中的角色（如"原告 1"、"被告 1"——通常我方都是原告/被告之一）
  label     String?
  isPrimary Boolean  @default(false)
  addedAt   DateTime @default(now())

  @@id([matterId, clientId])
}
```

### 4.5 MatterProcedure（程序阶段）⭐ 核心新增

```prisma
/// 程序类型（全集枚举，UI 上根据 MatterCategory 联动出可选子集）
/// 映射规则见 `src/lib/proceduresByCategory.ts`
enum ProcedureType {
  // —— 审判通用（民商事 / 行政 / 刑事 都可能用）——
  FIRST_INSTANCE                  // 一审
  SECOND_INSTANCE                 // 二审
  RETRIAL_REVIEW                  // 再审审查
  RETRIAL                         // 再审
  REMAND_FIRST                    // 发回重审 - 一审
  REMAND_SECOND                   // 发回重审 - 二审
  PROSECUTORIAL_SUPERVISION       // 检察监督 / 抗诉

  // —— 民商事仲裁 ——
  COMMERCIAL_ARBITRATION          // 民商事仲裁
  LABOR_ARBITRATION               // 劳动仲裁
  ARBITRATION_SET_ASIDE           // 申请撤销仲裁裁决
  ARBITRATION_ENFORCEMENT_REVIEW  // 不予执行仲裁裁决审查

  // —— 执行 ——
  ENFORCEMENT                     // 强制执行
  ENFORCEMENT_OBJECTION           // 执行异议 / 执行复议

  // —— 刑事专属 ——
  INVESTIGATION                   // 侦查阶段（公安 / 监察 / 国安）
  PROSECUTION_REVIEW              // 审查起诉（检察院）
  DEATH_PENALTY_REVIEW            // 死刑复核
  CRIMINAL_ENFORCEMENT            // 刑罚执行
  COMMUTATION_PAROLE_REVIEW       // 减刑 / 假释审查

  // —— 行政专属 ——
  ADMIN_RECONSIDERATION           // 行政复议
  ADMIN_NON_LITIGATION_ENFORCEMENT // 非诉行政执行

  // —— 非诉 / 顾问 / 专项的阶段 ——
  NON_LITIGATION_PHASE            // 非诉项目阶段（自由命名）

  // —— 兜底 ——
  CUSTOM
}

enum ProcedureStatus {
  PENDING       // 待启动
  IN_PROGRESS   // 进行中
  CONCLUDED     // 已结
}

/// 程序参与方式：决定该程序是否纳入日程/期限/任务等"工作"聚合。
enum ProcedureEngagement {
  /// 我方代理：完整工作流，挂阶段/开庭/期限/任务
  ENGAGED
  /// 前序程序参考：律师未代理（如一审由他人代理），仅录入元数据用于答辩参考
  /// 不会出现在日程、近期期限等聚合视图，仅在案件详情"程序阶段"里以灰显形式展示
  INFORMATIONAL
}

enum ProcedureOutcome {
  WON              // 胜诉/有利结果
  PARTIAL_WON      // 部分胜诉
  LOST             // 败诉/不利结果
  MEDIATED         // 调解
  WITHDRAWN        // 撤诉/撤回
  DISMISSED        // 驳回
  COMPLETED        // 完成（非诉项目）
  TRANSFERRED      // 移送/进入下一程序
  OTHER
}

model MatterProcedure {
  id            String           @id @default(cuid())
  matterId      String
  matter        Matter           @relation(fields: [matterId], references: [id])

  /// 程序类型，律师自由选择，**不强制从一审开始**。
  /// 律师可能从二审/再审/执行环节才介入，第一个 Procedure 直接选对应类型即可。
  type          ProcedureType
  /// 自定义类型时的标题（如 type=CUSTOM 时填）
  customLabel   String?
  /// 我方代理 / 前序参考（决定是否进工作聚合）
  engagement    ProcedureEngagement @default(ENGAGED)
  /// 本案件中的建档顺序（手动可调，仅用于 UI 排序，不暗示法律程序顺序）
  order         Int

  /// 本程序的案号（每个程序案号不同）
  caseNumber    String?
  /// 办理机关（按 ProcedureType 含义不同）：
  ///   INVESTIGATION → 公安局 / 监察委 / 国安局
  ///   PROSECUTION_REVIEW / PROSECUTORIAL_SUPERVISION → 检察院
  ///   FIRST_INSTANCE 等审判类 → 法院
  ///   COMMERCIAL_ARBITRATION → 仲裁委员会
  ///   LABOR_ARBITRATION → 劳动人事争议仲裁委
  ///   ADMIN_RECONSIDERATION → 复议机关
  ///   CRIMINAL_ENFORCEMENT → 监狱 / 看守所
  handlingAgency String?
  /// 庭别 / 合议庭 / 仲裁庭信息
  panel         String?
  /// 主审法官 / 检察官 / 仲裁员 / 侦查人员
  handler       String?

  /// 受理 / 立案日
  acceptedAt    DateTime?
  /// 结案日
  concludedAt   DateTime?

  status        ProcedureStatus  @default(PENDING)
  outcome       ProcedureOutcome?
  outcomeNote   String?          // 结果摘要（如"判决支持 80% 诉请"）

  stages        MatterStage[]
  hearings      Hearing[]
  deadlines     Deadline[]
  documents     Document[]       // 通过 procedureId 归集
  procedureParties ProcedureParty[] // 本程序下的当事人及诉讼地位

  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  @@index([matterId, order])
  @@index([status])
  @@unique([matterId, order])
}
```

#### ProcedureParty（程序当事人 / 程序内诉讼地位）

> 当事人本体仍在 `Party`，但诉讼地位下沉到具体 `MatterProcedure`。这样同一当事人在一审可以是"被告"，在二审可以是"上诉人"，在执行中可以是"申请执行人"。

```prisma
model ProcedureParty {
  id          String             @id @default(cuid())
  procedureId String
  procedure   MatterProcedure    @relation(fields: [procedureId], references: [id], onDelete: Cascade)
  partyId     String
  party       Party              @relation(fields: [partyId], references: [id], onDelete: Cascade)
  standing    LitigationStanding
  ordinal     Int                @default(1)
  note        String?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  @@unique([procedureId, partyId, standing])
  @@index([procedureId, standing, ordinal])
  @@index([partyId])
  @@map("procedure_parties")
}
```

程序内诉讼地位显示规则：

| 程序类型 | 必备地位 | 可选地位 |
|---|---|---|
| 一审 / 重审一审 | 原告、被告 | 第三人、反诉原告、反诉被告 |
| 二审 / 重审二审 | 上诉人、被上诉人 | 第三人 |
| 再审审查 / 再审 / 检察监督 | 再审申请人、再审被申请人 | 第三人 |
| 执行 / 执行异议 | 申请执行人、被执行人 | 第三人 |
| 仲裁 / 劳动仲裁 | 仲裁申请人、仲裁被申请人 | 第三人 |
| 行政复议 | 复议申请人、复议被申请人 | 第三人 |
| 非诉 / 自定义 | 项目当事人 | - |

**按案件类型的典型程序链**：

| 案件类别 | 可选 ProcedureType（UI 联动）|
|---|---|
| `CIVIL_COMMERCIAL` | FIRST_INSTANCE / SECOND_INSTANCE / RETRIAL_REVIEW / RETRIAL / REMAND_FIRST / REMAND_SECOND / COMMERCIAL_ARBITRATION / LABOR_ARBITRATION / ARBITRATION_SET_ASIDE / ARBITRATION_ENFORCEMENT_REVIEW / ENFORCEMENT / ENFORCEMENT_OBJECTION / PROSECUTORIAL_SUPERVISION / CUSTOM |
| `CRIMINAL` | INVESTIGATION / PROSECUTION_REVIEW / FIRST_INSTANCE / SECOND_INSTANCE / DEATH_PENALTY_REVIEW / RETRIAL_REVIEW / RETRIAL / CRIMINAL_ENFORCEMENT / COMMUTATION_PAROLE_REVIEW / PROSECUTORIAL_SUPERVISION / CUSTOM |
| `ADMINISTRATIVE` | ADMIN_RECONSIDERATION / FIRST_INSTANCE / SECOND_INSTANCE / RETRIAL_REVIEW / RETRIAL / ADMIN_NON_LITIGATION_ENFORCEMENT / PROSECUTORIAL_SUPERVISION / CUSTOM |
| `NON_LITIGATION` / `LEGAL_COUNSEL` / `SPECIAL_PROJECT` | NON_LITIGATION_PHASE / CUSTOM |

**典型程序链示例**：

民商事 — 完整代理：
- 建工纠纷：`FIRST_INSTANCE → SECOND_INSTANCE → ENFORCEMENT`
- 劳动争议：`LABOR_ARBITRATION → FIRST_INSTANCE → SECOND_INSTANCE`
- 商事仲裁：`COMMERCIAL_ARBITRATION → ARBITRATION_SET_ASIDE`（对方申请撤销）

刑事 — 完整代理：
- 普通刑案：`INVESTIGATION → PROSECUTION_REVIEW → FIRST_INSTANCE → SECOND_INSTANCE → CRIMINAL_ENFORCEMENT`
- 死刑案件：`FIRST_INSTANCE → SECOND_INSTANCE → DEATH_PENALTY_REVIEW`
- 减刑：`COMMUTATION_PAROLE_REVIEW`

行政 — 完整代理：
- 复议前置：`ADMIN_RECONSIDERATION → FIRST_INSTANCE → SECOND_INSTANCE`
- 直接起诉：`FIRST_INSTANCE → SECOND_INSTANCE`
- 非诉执行：`ADMIN_NON_LITIGATION_ENFORCEMENT`

中途介入（律师从二审/再审开始代理）：
- 仅二审：建一个 `SECOND_INSTANCE` (ENGAGED) 即可。
- 二审 + 补录一审参考：建 `FIRST_INSTANCE` (**INFORMATIONAL**，只填案号、法院、判决日期、结果) + `SECOND_INSTANCE` (ENGAGED)。
- 再审 + 一审/二审都是别人代理：两个 INFORMATIONAL + 一个 ENGAGED。

UI 上：
- **新建案件**时，律师在抽屉里选择"首次程序类型"（默认 FIRST_INSTANCE，但下拉可选任意 ProcedureType），默认 `engagement=ENGAGED`。
- **案件详情**"程序阶段"标签：横向 tab 切换不同 Procedure；INFORMATIONAL 程序 tab 灰显并带标识；"+ 添加程序"弹出抽屉，选择类型 + engagement。
- 日程、近期期限、任务等聚合视图**只显示 ENGAGED 程序**的内容。

### 4.6 Party / RelatedEntity（当事人与关联实体）

```prisma
enum PartyRole {
  CLIENT_PARTY    // 我方当事人（一案可多个）
  OPPOSING_PARTY  // 相对方
  THIRD_PARTY     // 第三人
  CO_LITIGANT     // 共同诉讼人
  AGENT           // 代理人（对方）
  WITNESS         // 证人
  OTHER
}

model Party {
  id        String     @id @default(cuid())
  intakeId  String?
  intake    Intake?    @relation(fields: [intakeId], references: [id])
  matterId  String?
  matter    Matter?    @relation(fields: [matterId], references: [id])
  role      PartyRole
  standing  LitigationStanding? // 旧的案件级/首程序地位，后续程序以 ProcedureParty 为准
  /// 同一角色下的序号（"被告 1"、"被告 2"）
  ordinal   Int        @default(1)
  name      String
  idNumber  String?
  phone     String?
  address   String?
  legalRep  String?    // 法定代表人（公司当事人时）
  notes     String?
  procedureParties ProcedureParty[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@index([matterId, role, ordinal])
  @@index([name])
  @@index([idNumber])
}

model RelatedEntity {
  id           String   @id @default(cuid())
  matterId     String
  matter       Matter   @relation(fields: [matterId], references: [id])
  name         String
  relationship String   // 股东/子公司/担保人/实际控制人
  notes        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([name])
}
```

**说明（叶森决策 §5）**：当事人字段无限制可增减。一案多原告、多被告、多第三人都用 `Party` 表达，UI 上"+ 添加被告"。

### 4.7 冲突检索

```prisma
enum ConflictSeverity {
  LOW
  MEDIUM
  HIGH
  BLOCKING
}

enum ConflictConclusion {
  PENDING       // 待结论
  SAME_SUBJECT  // 同一主体（确实冲突）
  DIFFERENT     // 不同主体（无冲突）
  NEED_INFO     // 信息不足
}

model ConflictCheck {
  id           String              @id @default(cuid())
  intakeId     String?
  intake       Intake?             @relation(fields: [intakeId], references: [id])
  queryPayload Json                // 检索字段（姓名/身份证/信用代码列表）
  hits         ConflictHit[]
  conclusion   ConflictConclusion  @default(PENDING)
  decidedById  String?
  decidedAt    DateTime?
  note         String?
  checkedAt    DateTime            @default(now())
}

model ConflictHit {
  id           String           @id @default(cuid())
  checkId      String
  check        ConflictCheck    @relation(fields: [checkId], references: [id])
  hitType      String           // HISTORICAL_CLIENT / HISTORICAL_PARTY / RELATED_ENTITY
  targetType   String           // "Matter" | "Party" | "Client"
  targetId     String
  matchedName  String
  matchedField String            // name | idNumber | phone
  matchedValue String
  matchedRatio Float?
  severity     ConflictSeverity
  reason       String
}
```

### 4.8 MatterStage / Task / Hearing / Deadline

```prisma
/// 程序内的工作阶段（立案/举证/开庭/判决）
model MatterStage {
  id           String     @id @default(cuid())
  procedureId  String
  procedure    MatterProcedure @relation(fields: [procedureId], references: [id])
  name         String     // "立案"、"证据交换"
  description  String?
  order        Int
  startedAt    DateTime?
  completedAt  DateTime?
  tasks        Task[]
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  @@index([procedureId, order])
}

/// 任务可挂 Matter（跨程序通用任务）或 Stage（程序内工作）
model Task {
  id          String       @id @default(cuid())
  matterId    String
  matter      Matter       @relation(fields: [matterId], references: [id])
  stageId     String?
  stage       MatterStage? @relation(fields: [stageId], references: [id])
  title       String
  description String?
  assigneeId  String?
  dueAt       DateTime?
  completed   Boolean      @default(false)
  completedAt DateTime?
  priority    Int          @default(0)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([matterId, completed, dueAt])
  @@index([assigneeId, completed])
}

model Hearing {
  id           String   @id @default(cuid())
  procedureId  String
  procedure    MatterProcedure @relation(fields: [procedureId], references: [id])
  title        String   // "第一次开庭"
  room         String?
  judge        String?
  startsAt     DateTime
  endsAt       DateTime?
  notes        String?  // 庭审纪要
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([procedureId, startsAt])
  @@index([startsAt])
}

enum DeadlineCategory {
  LIMITATION    // 诉讼时效
  EVIDENCE      // 举证期限
  APPEAL        // 上诉期限
  PERFORMANCE   // 履行期限
  RESPONSE      // 答辩期
  ENFORCEMENT   // 申请执行期限
  ARBITRATION_SET_ASIDE // 申请撤销仲裁期限
  CUSTOM        // 自定义
}

model Deadline {
  id           String           @id @default(cuid())
  procedureId  String
  procedure    MatterProcedure  @relation(fields: [procedureId], references: [id])
  title        String
  category     DeadlineCategory @default(CUSTOM)
  dueAt        DateTime
  basis        String?          // 期限计算依据
  remindDays   Int              @default(3)
  completed    Boolean          @default(false)
  completedAt  DateTime?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  @@index([procedureId, dueAt, completed])
  @@index([dueAt, completed])
}
```

### 4.9 Note（沟通记录）

```prisma
enum NoteChannel {
  PHONE
  WECHAT
  EMAIL
  MEETING
  COURT
  OTHER
}

model Note {
  id          String      @id @default(cuid())
  matterId    String
  matter      Matter      @relation(fields: [matterId], references: [id])
  authorId    String
  author      User        @relation("NoteAuthor", fields: [authorId], references: [id])
  channel     NoteChannel @default(OTHER)
  withWhom    String?     // 沟通对象
  occurredAt  DateTime    @default(now())
  content     String
  tags        String[]
  attachments String[]    // Document.id 列表
  deletedAt   DateTime?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@index([matterId, occurredAt])
}
```

### 4.10 Document（材料，含加密支持）

```prisma
enum DocumentCategory {
  EVIDENCE   // 证据材料
  PLEADING   // 诉讼文书
  PROCEDURE  // 程序性材料
  JUDGMENT   // 裁判文书
  CONTRACT   // 合同
  OTHER
}

model Document {
  id           String           @id @default(cuid())
  /// v0.4 起 matterId 可空：收案阶段上传的合同先挂 Intake，转化后回填
  matterId     String?
  matter       Matter?          @relation(fields: [matterId], references: [id])
  /// v0.4 新增：收案阶段的合同/材料先挂 Intake，转 Matter 时迁移
  intakeId     String?
  intake       Intake?          @relation(fields: [intakeId], references: [id])
  /// 可选关联到某个 Procedure 用于归集（如"二审的证据材料"）
  procedureId  String?
  procedure    MatterProcedure? @relation(fields: [procedureId], references: [id])
  name         String
  category     DocumentCategory @default(OTHER)
  version      Int              @default(1)
  isLatest     Boolean          @default(true)
  familyId     String?          // 多版本同 familyId

  /// 存储相对路径（storage/ 下）
  path         String
  mimeType     String?
  size         Int?
  /// SHA-256 摘要（明文计算，用于防篡改校验）
  sha256       String?

  /// 加密相关字段（决策 §8）
  encrypted    Boolean          @default(false)
  algorithm    String?          // "AES-256-GCM"
  iv           String?          // base64 IV（GCM 12 字节）
  authTag      String?          // base64 GCM auth tag

  tags         String[]
  uploadedById String
  deletedAt    DateTime?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  @@index([matterId, category])
  @@index([intakeId])
  @@index([procedureId])
  @@index([familyId])
}
```

**v0.4 约束**：应用层保证 `matterId` 与 `intakeId` 至少有一个非空（数据库不强制，server action 校验）；Intake 转 Matter 时 `matterId` 回填、`intakeId` 保留作为溯源。

**加密实现**（实施细节，写到 `src/lib/storage/crypto.ts`）：
- 主密钥从环境变量 `STORAGE_ENCRYPTION_KEY`（base64 32 字节）读取
- 用 AES-256-GCM 流式加密；每文件随机 12 字节 IV
- 解密通过 `/api/documents/[id]/download` 路由，验证权限 → 读密文 → 解密 → 流式返回
- 数据库只存密文路径 + iv + authTag，绝不入库明文
- 备份脚本同时备份加密文件 + Postgres（密钥必须独立保管，丢密钥则文件不可恢复 —— 这一点要写到部署文档中提醒）

### 4.11 财务：Billing / FeeEntry / CommissionPlan

```prisma
enum BillingStatus {
  DRAFT
  ACTIVE
  CLOSED
}

enum FeeEntryType {
  RECEIVABLE  // 应收
  RECEIVED    // 实收
  REFUND      // 退款
  COST        // 成本（差旅、诉讼费垫付）
  COMMISSION  // 分成支出（系统自动生成）
}

model Billing {
  id             String        @id @default(cuid())
  matterId       String
  matter         Matter        @relation(fields: [matterId], references: [id])
  title          String        // "委托代理合同 - 全程"
  contractAmount Decimal       @db.Decimal(14, 2)
  schedule       String?       // 阶段付款约定（自由文本）
  status         BillingStatus @default(DRAFT)
  signedAt       DateTime?
  feeEntries     FeeEntry[]
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@index([matterId, status])
}

model FeeEntry {
  id           String       @id @default(cuid())
  matterId     String
  matter       Matter       @relation(fields: [matterId], references: [id])
  billingId    String?
  billing      Billing?     @relation(fields: [billingId], references: [id])
  type         FeeEntryType
  amount       Decimal      @db.Decimal(14, 2)
  occurredAt   DateTime     @default(now())
  invoiceNo    String?
  invoiceFile  String?      // Document.id
  payerOrPayee String?
  method       String?      // 转账/现金/支付宝
  note         String?
  /// 自动分成生成：parentFeeEntryId 指向触发它的 RECEIVED 条目
  parentFeeEntryId String?
  parentFeeEntry   FeeEntry?  @relation("CommissionParent", fields: [parentFeeEntryId], references: [id])
  commissionChildren FeeEntry[] @relation("CommissionParent")
  /// 分成对应的受益人（type=COMMISSION 时填）
  beneficiaryUserId String?
  recordedById String
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@index([matterId, type, occurredAt])
  @@index([type, occurredAt])
  @@index([beneficiaryUserId, occurredAt])
}

/// 案件级分成方案（决策 §4）
/// 每条记录代表一位受益人在本案件的分成比例。
/// 当 Matter 发生 RECEIVED 时，系统按方案自动生成对应的 COMMISSION 条目。
model CommissionPlan {
  id        String   @id @default(cuid())
  matterId  String
  matter    Matter   @relation(fields: [matterId], references: [id])
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  /// 百分比 0-100，所有记录之和不强制 = 100（律所留存可隐含）
  percent   Decimal  @db.Decimal(5, 2)
  label     String?  // "主办律师" / "合伙人" / "推荐人"
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([matterId, userId])
  @@index([matterId])
  @@index([userId])
}
```

**分成自动化流程**（实现细节，写到 `src/server/finance/commission.ts`）：
1. 创建 `FeeEntry { type: RECEIVED, amount: X }` 时，触发 `applyCommission(feeEntryId)`
2. 查 `CommissionPlan where matterId AND active=true`
3. 对每条 plan 生成 `FeeEntry { type: COMMISSION, amount: -X * percent / 100, parentFeeEntryId, beneficiaryUserId }`
4. 撤销实收时同步撤销关联的 COMMISSION 条目

### 4.12 TimelineEvent / ArchiveRecord / AuditLog

```prisma
model TimelineEvent {
  id          String   @id @default(cuid())
  matterId    String
  matter      Matter   @relation(fields: [matterId], references: [id])
  eventType   String   // "PROCEDURE_STARTED" | "HEARING_HELD" | "FEE_RECEIVED" | ...
  title       String
  content     String?
  occurredAt  DateTime
  refType     String?
  refId       String?
  createdAt   DateTime @default(now())

  @@index([matterId, occurredAt])
}

model ArchiveRecord {
  id          String   @id @default(cuid())
  matterId    String
  matter      Matter   @relation(fields: [matterId], references: [id])
  summary     String   // 结案小结
  archivedBy  String
  archivedAt  DateTime @default(now())
  exportPath  String?
  checksum    String?
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  action     String   // "LOGIN" | "MATTER_VIEW" | "DOCUMENT_DOWNLOAD" | ...
  targetType String?
  targetId   String?
  detail     Json?
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())

  @@index([userId, createdAt])
  @@index([action, createdAt])
}
```

### 4.13 系统配置

```prisma
/// 阶段模板：管理员可在 /settings 编辑
/// 模板按 ProcedureType 准备一套默认 stages
model StageTemplate {
  id            String        @id @default(cuid())
  procedureType ProcedureType
  isDefault     Boolean       @default(true)
  name          String
  steps         Json          // [{ name, order, defaultTasks: string[] }]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@index([procedureType])
}

/// 系统级 K-V 配置（含 internalCode 流水序号、主题色等）
model SystemSetting {
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt
}
```

### 4.14 CauseOfAction（规范案由库）⭐ 系统基础数据

**为什么需要规范化**：律师写"建设工程施工合同纠纷"和"建工合同纠纷"应该是同一个案由，否则统计/筛选/冲突检索都对不上。三大诉讼都有官方案由规范，必须从权威来源 seed 数据，禁止用户随手填字符串。

**数据来源**（实施时通过 [yuandian-law MCP](#) 或官方公开文件抓取，落到 `prisma/seeds/`）：

| 案件类别 | 数据来源 | 层级结构 | 数量级 |
|---|---|---|---|
| `CIVIL_COMMERCIAL` | 最高法《民事案件案由规定》(2020 年修正) | 一级（10 部分） / 二级 / 三级 / 四级 | 约 480 个三级 + 少量四级 |
| `CRIMINAL` | 《刑法》分则 + 历次刑法修正案最新罪名（含 2024 年刑法修正案十二）；最高法《关于执行〈刑法〉确定罪名的补充规定》 | 一级（10 章） / 二级（节） / 三级（具体罪名） | 约 469 个罪名 |
| `ADMINISTRATIVE` | 最高法《关于行政案件案由的暂行规定》(2021 年) | 一级（行政行为种类 / 复议 / 协议 / 赔偿 / 公益诉讼） / 二级 / 三级 | 约 80-100 个 |

```prisma
model CauseOfAction {
  id          String         @id @default(cuid())
  /// 所属诉讼大类
  category    MatterCategory
  /// 官方编号（如民事 "123.(2)甲"、刑事 "第二百三十二条 故意杀人罪"）
  code        String?
  /// 完整名称
  name        String
  /// 简称 / 俗称（便于搜索，如"借贷"对应"民间借贷纠纷"）
  shortName   String?
  /// 层级：1 一级、2 二级、3 三级（最常用）、4 四级
  level       Int
  /// 父节点（构建案由树）
  parentId    String?
  parent      CauseOfAction?  @relation("CauseHierarchy", fields: [parentId], references: [id])
  children    CauseOfAction[] @relation("CauseHierarchy")
  /// 是否仍可选（旧规定中的案由弃用时标 false，但已存在的 Matter 仍保留引用）
  active      Boolean         @default(true)
  /// 全文检索辅助：拼音、关键词
  pinyin      String?
  keywords    String[]
  /// 关联到该案由的 Matter（反向）
  matters     Matter[]
  /// 来源说明（如"民事案由规定 2020 修正"）
  sourceNote  String?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@unique([category, code])
  @@index([category, level])
  @@index([category, active, level])
  @@index([name])
  @@index([parentId])
}
```

**UI 选择交互**：
- 表单上的"案由"字段：默认显示按 `MatterCategory` 过滤的可搜索下拉
- 用户输入"民间借贷" → 模糊匹配 `name` / `shortName` / `pinyin` / `keywords`
- 也可以浏览树形结构（在弹层里展开"合同纠纷 → 借款合同纠纷 → 民间借贷纠纷"）
- 若官方库未收录极少数特殊案件，可启用 `causeFreeText`（系统标黄提醒，不计入统计）

**Seed 策略**：
- `prisma/seeds/causes-civil.json`、`causes-criminal.json`、`causes-administrative.json`
- 部署初始化时通过 `prisma db seed` 写入
- 实施时通过 `yuandian-law MCP` 调用 `yuandian_rh_fg_detail` 抓取最高法规定原文进行结构化，或人工整理一次性导入
- 案由更新策略：跟随官方修正版本号，更新时旧案由 `active=false` 保留历史引用，新增/重命名的进入新版本

### 4.15 DocumentFolder（卷宗目录）⭐ v0.8 新增

每个 Matter 内部的物理归档目录。新建 Matter 时按 `MatterCategory` 自动 seed 默认结构（民商事/行政 8 个，刑事 9 个，非诉/顾问/专项 5 个）。

| 字段 | 说明 |
|---|---|
| `id` / `matterId` | cuid / 归属案件（onDelete: Cascade） |
| `name` | 卷宗名（同案件内 unique） |
| `orderIndex` | 排序权重 |
| `isDefault` | 系统预置，**不可删，可改名** |

**与 `Document.category` 的关系**：正交保留。`category` 是跨案件检索的逻辑分类（CONTRACT/EVIDENCE 等），`folderId` 是该案件内的物理归档位。Document 可同时具备两者。

**默认结构 seed**（`src/lib/default-folders.ts`）：
- 民商事 / 行政：收案 / 立案 / 委托手续 / 证据 / 程序文书 / 庭审 / 裁判 / 结案
- 刑事：收案 / 委托手续 / 阅卷 / 会见 / 取证 / 庭前 / 庭审 / 判决与上诉 / 结案
- 非诉 / 顾问 / 专项：立项 / 调研 / 工作底稿 / 出具文件 / 归档

### 4.16 DocumentTemplate（文档模板）⭐ v0.8 新增

模板库。v0.8.0 内置 8 个（`isBuiltIn=true`）：民事/刑事收案登记表、风险告知书、委托代理合同(个人/单位)、授权委托书(个人)、民事起诉状/答辩状。

| 字段 | 说明 |
|---|---|
| `id` | cuid |
| `name` | 模板名 |
| `category` | TemplateCategory 枚举（INTAKE/RETAINER/LITIGATION/HEARING/WORK_PRODUCT/ARCHIVE/CLOSING/BLANK） |
| `applicableCategories` | MatterCategory[]，空数组 = 全适用 |
| `docxBlobId` | FK → Document（加密存储的 docx 源文件，unique） |
| `variables` | Json `string[]`：该模板用到的变量路径清单，用于缺失提示 |
| `isBuiltIn` | 系统内置（不可删） |
| `enabled` | 是否上架（管理员可禁用） |
| `createdById` | 创建者（内置由首个 ADMIN 持有） |

**渲染机制**（`src/lib/template-engine.ts`）：
- 占位符语法 `{{var}}`（双大括号，避免与 docx 内嵌"{"冲突）
- 上下文从 Matter / Client / Party / Proceeding / 主办律师 / SystemSetting 律所抬头自动拼装
- 缺失变量在 UI Dialog 行内补全（即写即存源表）：`client.idNumber/address/phone` 和 `opposing.idNumber/address/phone`
- 生成的 Document 自动归档到匹配卷宗（按 `suggestFolderByTemplateCategory` 推荐，可手选），存 `templateContextSnapshot` 用于复核

### 4.17 SealTypeConfig（章种类配置）⭐ v0.8 新增

5 种内置章的审批角色映射。Seed 初始化（`prisma/seeds/v08-templates-and-seals.ts`）。

| 字段 | 说明 |
|---|---|
| `type` | SealType 枚举（@id） |
| `label` | 中文显示名 |
| `approverRoles` | UserRole[]，多角色 OR 关系（v0.8.9 决策 #2） |
| `requiresLegalRep` | 是否必须法定代表人本人审批（取 SystemSetting `firmLegalRepUserId`） |
| `enabled` | 是否启用 |

**5 种内置**：
- `OFFICIAL_SEAL` 公章 → PRINCIPAL_LAWYER
- `CONTRACT_SEAL` 合同专用章 → PRINCIPAL_LAWYER
- `FINANCE_SEAL` 财务专用章 → FINANCE
- `LEGAL_REP_SEAL` 法定代表人章 → `requiresLegalRep=true`（仅 Settings 指定 User）
- `CONTRACT_REVIEW_SEAL` 合同审核章 → PRINCIPAL_LAWYER

ADMIN 跨章种类总可审批（in code，不在 approverRoles 数组里）。

### 4.18 SealRequest（用章申请工作流）⭐ v0.8 新增

律师向所内申请加盖律所/财务/法人等章的工作流。状态：`PENDING → APPROVED → STAMPED`（驳回进入 `REJECTED`，撤销进入 `CANCELLED`）。

| 字段 | 说明 |
|---|---|
| `code` | 流水号 `SEAL-YYYY-NNNN`（计数器存 SystemSetting `seal-counter-YYYY`） |
| `sealType` | 见 4.17 |
| `matterId` | 关联案件（**可选**，所内行政等场景可空） |
| `purpose` / `documentTitle` | 用章事由 / 文件标题（必填） |
| `pageCount` / `requireCrossPageSeal` / `copies` / `urgency` | 工艺字段，骑缝是勾选项不是独立 SealType |
| `draftDocId` | FK → Document，待盖章稿（@unique，必传） |
| `stampedDocId` | FK → Document，盖章后扫描件（@unique，盖章完成时必补） |
| `parentSealRequestId` | 被驳回后重新申请的溯源链 |
| `requestedById` / `approvedById` / `stampedById` | 三角色 User FK |

**关键约束**：
- `draftDocId` / `stampedDocId` 都是 unique，意味着同一 Document 不能同时被两个 SealRequest 用。卷宗联动"提交用章"时，server action **复制一份 Document 副本**作为 draft（解密 → 重新加密 → 新 path）
- 状态机：仅 PENDING 可 approve/reject/cancel；仅 APPROVED 可 stamp；其他终态

**与卷宗模板联动**（PRD §12.7）：
卷宗页文档卡片 → "提交用章" 按钮 → `/seals?new=1&draftDocId=...&matterId=...&documentTitle=...` → 自动打开 SealRequestSheet 预填字段。

### 4.19 SmsMessage（法院短信收件箱）⭐ v0.9 新增

PRD §13.2。律师每天被 12368 / 法院短信轰炸，复制粘贴到 `/inbox` 后自动解析、自动匹配 Matter、一键生成 Hearing/Deadline。

| 字段 | 说明 |
|---|---|
| `rawText` | 原始短信全文 |
| `receivedAt` | 收件时间 |
| `receivedById` | 收件律师 |
| `parsedJson` | 解析结果 JSON（caseNumbers / court / hearingDate / urls / judge / clerk / phones / appealDeadline / amounts / platforms ...） |
| `smsType` | 9 类（开庭/送达/缴费/调解/执行/立案/判决/提交材料/其他） |
| `matchedMatterId` / `matchedBy` | 关联 Matter + 匹配方式（AUTO_CASE_NUMBER / MANUAL / UNMATCHED） |
| `generatedHearingId` / `generatedDeadlineId` | 一键生成的产物追溯 |
| `processed` / `processedAt` | 是否已处理（已生成动作或手动标记） |

**关键约束**：
- 解析 100% 本地正则（v0.9.0 不依赖 AI），AI 兜底留 v0.9.1
- 匹配逻辑：从 `parsedJson.caseNumbers[]` 取每个案号去 `MatterProcedure.caseNumber` 反查
- `receivedBy` onDelete=Restrict：用户被禁用前需清理短信归属

### 4.20 Preservation / PreservationRenewal（财产保全）⭐ v0.9 新增

PRD §13.3。商事案件几乎每案必涉。漏续保 = 冻结失效 = 执业事故。

| 字段 | 说明 |
|---|---|
| `matterId` | **可空**（决策 §13.8.3 — 诉前保全期间 Matter 可能未建立，立案后回填） |
| `type` | 诉前/诉中/执行 |
| `propertyType` | 银行存款/房产/车辆/股权/知识产权/其他 |
| `amount` | 保全金额（Decimal 18,2） |
| `respondent` | 被保全人 |
| `guaranteeType` | 保证金/保函/财产担保/无需担保 |
| `startDate` | 生效日（必填） |
| `duration` | 保全期限（天）；默认按 propertyType 推荐 |
| `expiryDate` | 到期日 = startDate + duration，可手动覆盖 |
| `remindDays` | 提醒阈值默认 [30, 15, 7, 3, 1] |
| `status` | 生效/已续保/已到期/已解除 |
| `renewals` | 续保记录（PreservationRenewal） |

**保全期限默认值（法律依据写死，民诉法第 244 条）**：

| propertyType | 默认天数 |
|---|---|
| BANK_DEPOSIT | 365（1 年） |
| VEHICLE / OTHER | 730（2 年） |
| REAL_ESTATE / EQUITY / IP | 1095（3 年） |

**关键约束**：
- `matter` onDelete=SetNull：案件被软删时保全记录保留（用于审计），matterId 置空
- `owner` onDelete=SetNull：跟进人离职不删保全
- 续保后 `Preservation.expiryDate` 更新为新到期日，status 变 RENEWED
- 到期预警通过现有 `Deadline` 派生条目（不重复存提醒逻辑），dashboard 显示

---

## 五、internalCode 编号规则（v0.3 修订）

格式：`LL-{YYYY}-{CODE}-{4位流水}`

| CODE | 对应 MatterCategory | 说明 |
|---|---|---|
| `CC` | CIVIL_COMMERCIAL | 民商事诉讼 |
| `CR` | CRIMINAL | 刑事案件 |
| `AD` | ADMINISTRATIVE | 行政案件 |
| `NL` | NON_LITIGATION | 非诉项目 |
| `GC` | LEGAL_COUNSEL | 常年顾问（General Counsel） |
| `SP` | SPECIAL_PROJECT | 专项法律服务 |

示例：
- `LL-2026-CC-0001` — 2026 年第 1 件民商事案件
- `LL-2026-CR-0003` — 2026 年第 3 件刑事案件
- `LL-2026-AD-0002` — 2026 年第 2 件行政案件
- `LL-2026-NL-0015` — 2026 年第 15 件非诉项目
- `LL-2026-GC-0002` — 2026 年第 2 单顾问

流水按 `YYYY+CODE` 组合年度独立计数，通过 `SystemSetting`（key=`code-counter-2026-CC`）原子递增维护。

---

## 六、关键索引

| 索引 | 用途 |
|---|---|
| `Matter(status, updatedAt)` | 列表默认排序 |
| `Matter(category, status)` | 按案件类别 + 状态筛选 |
| `Matter(causeId)` | 按案由聚合统计 |
| `CauseOfAction(category, active, level)` | 案由下拉的快速过滤 |
| `MatterProcedure(matterId, order)` | 案件下程序时序 |
| `Deadline(dueAt, completed)` | 全所近期期限 |
| `Hearing(startsAt)` | 全所开庭日历 |
| `Party(name)` / `Party(idNumber)` | 冲突检索热路径 |
| `Client(name)` / `Client(idNumber)` | 冲突检索热路径 |
| `FeeEntry(matterId, type, occurredAt)` | 案件财务流水 |
| `FeeEntry(beneficiaryUserId, occurredAt)` | 律师个人分成统计 |
| `AuditLog(userId, createdAt)` | 个人操作回溯 |

---

## 七、敏感字段处理

| 字段 | 处理 |
|---|---|
| `User.passwordHash` | bcrypt cost=12 |
| `Client.idNumber` / `Party.idNumber` | 入库明文，**展示时按权限脱敏**（仅 ADMIN / Matter.owner / 主办协办可看明文，其他角色看 `***`） |
| `Document.path` | 不暴露给前端，统一走 `/api/documents/[id]/download` 鉴权 |
| `Document` 加密 | 可选 AES-256-GCM；密钥环境变量 `STORAGE_ENCRYPTION_KEY` 独立保管 |
| `AuditLog` | 不可由业务代码 DELETE，只能由维护脚本归档 |

---

## 八、已锁定决策（v0.3）

| # | 决策 |
|---|---|
| 1 | `internalCode` 自动生成，格式 `LL-{YYYY}-{CC/CR/AD/NL/GC/SP}-{4位流水}` |
| 2 | 不做"客户合并"。同一客户多次咨询分别建 Intake，案件分别建档 |
| 3 | 团队成员区分 LEAD / CO_LEAD / ASSISTANT（`MatterMember.role`） |
| 4 | 内置分成计算（`CommissionPlan` + 自动生成 COMMISSION 条目） |
| 5 | 支持多客户（`MatterClient`）、多被告/第三人（`Party` 无限增减） |
| 6 | **同一案件支持多程序串接**，且律师可自由选择首次介入程序类型；前序程序可选录为 `INFORMATIONAL` 参考 |
| 7 | 材料支持可选加密存储（AES-256-GCM） |
| 8 | 数据迁移工具：V1 不做，V1.5 评估 |
| 9 | **案件类型按三大法律体系区分**：民商事 / 刑事 / 行政 + 非诉 / 顾问 / 专项（`MatterCategory`） |
| 10 | **程序按案件类别动态可选**：刑事独有侦查/审查起诉/死刑复核；行政独有行政复议/非诉行政执行（`ProcedureType` + `proceduresByCategory` 映射） |
| 11 | **办理机关**（`MatterProcedure.handlingAgency`）：刑事侦查阶段对应公安/监察，审查起诉对应检察院，审判对应法院，执行对应监狱等 |
| 12 | **诉讼地位独立建模**（`Matter.ourStanding`）：原告/被告/第三人/反诉原告/反诉被告/刑事被告人/被害人/自诉人/仲裁申请人 等 |
| 13 | **案由规范化**（`CauseOfAction`）：从最高法案由规定 + 刑法罪名 + 行政案由规定 seed，禁止随意手填；兜底 `causeFreeText` 字段仅在极特殊场景使用 |
| 14 | `intakeDate`（律师收案日）与 `firstAcceptedAt`（首次立案日）拆为两个字段 |
