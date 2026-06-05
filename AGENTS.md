## LawLink 工作区规则

> 这是项目的"约束先行"文档。任何 AI 助手（含 Claude Code）或人类协作者在本仓库工作前，必须先读完本文件。
> 规则与实践冲突时，先改本文件、再改代码。

---

### 一、项目定位

- **LawLink** 是面向独立律师、小团队和小型律所的**开源、自部署**案件/项目管理系统。
- 第一版主线工作流：
  `收案登记 → 冲突检索 → 转正式案件 → 持续跟进 → 财务记录 → 结案归档 → 数据导出`
- **不做共享 SaaS 多租户**。一个律所/团队部署一套实例，单体应用 + 单库。
- 协议：**MIT**。

---

### 二、技术栈（已定型）

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | Next.js 14 App Router + TypeScript | SSR + RSC，单仓单进程 |
| UI 组件 | **shadcn/ui** + Radix UI | 拷贝式组件，深度可定制 |
| 样式 | **Tailwind CSS** | 暗色优先 |
| 动效 | **Framer Motion** | 微交互、页面切换 |
| 图标 | lucide-react | |
| 图表 | Recharts | 工作台、财务统计 |
| 表单 | React Hook Form + Zod | |
| 表格 | TanStack Table | 表头筛选、排序、分页 |
| 数据库 | PostgreSQL 16 + Prisma 5 | |
| 鉴权 | NextAuth.js（Credentials Provider） | 邮箱密码登录 |
| 部署 | Docker Compose（app + postgres） | |

**已弃用**：Ant Design。不要再引入 `antd` 或 `@ant-design/*`。

**预留接入**（V1.5）：元典开放平台 MCP（law/case/company），用于冲突检索增强和企业核查。

---

### 三、目录约定

```
LawLink/
├── docs/                  # 设计文档（PRD / DATA-MODEL / UI-DESIGN）
├── prisma/                # schema、迁移、seed
├── public/                # 静态资源
├── storage/               # 本地私有文件（不入 git）
├── src/
│   ├── app/               # 路由与 Route Handler
│   │   ├── (auth)/        # 登录、注册路由分组
│   │   ├── (app)/         # 登录后的主应用路由分组
│   │   └── api/           # API 路由
│   ├── components/
│   │   ├── ui/            # shadcn/ui 组件（不直接改，按需重新生成）
│   │   ├── layout/        # AppShell、Sidebar、Topbar
│   │   ├── matters/       # 案件相关组合组件
│   │   └── ...
│   ├── lib/               # 业务规则、工具函数、Prisma client
│   │   ├── auth/          # NextAuth 配置、session helpers
│   │   ├── permissions/   # 角色权限、案件可见性
│   │   └── ...
│   ├── server/            # Server Actions、服务层
│   ├── types/             # 共享 TS 类型
│   └── styles/            # globals.css、Tailwind config 扩展
└── tests/                 # （V1.5 引入）
```

**规则**：
- `src/components/ui/` 只能放 shadcn CLI 生成的原子组件，业务组件放兄弟目录。
- 跨页面复用的组件提到 `src/components/`，仅单页用的组件就近放在路由目录下 `_components/`。
- 业务规则（金额计算、状态机、冲突匹配算法）一律沉淀到 `src/lib/` 或 `src/server/`，禁止散落在页面里。

---

### 四、命名约定

| 对象 | 风格 | 例 |
|---|---|---|
| 路由目录 | 小写英文复数 | `matters/`、`intakes/`、`conflicts/` |
| React 组件 | PascalCase | `MatterCard.tsx` |
| 工具函数 | camelCase | `formatCurrency`、`computeReceivable` |
| Server Action | camelCase + 动词开头 | `createMatter`、`closeMatter` |
| Prisma model | PascalCase 单数 | `Matter`、`Client` |
| Prisma 字段 | camelCase | `caseNumber`、`createdAt` |
| 数据库表（自动） | snake_case | Prisma `@@map` 控制 |

**术语固定**：
- 收案线索 → `Intake`
- 正式案件/项目 → `Matter`
- 客户（机构/个人） → `Client`
- 客户联系人 → `Contact`
- 当事人/相对方/第三人 → `Party`
- 收/付费记录 → `FeeEntry`
- 结算单（合同/账单） → `Billing`
- 法定期限 → `Deadline`（带 `category`：诉讼时效/举证/上诉/履行/其他）

---

### 五、开发纪律

1. **改文档优先于改代码**。需求或规范变了，先改 `docs/` 和本文件，再写实现。
2. **新模块顺序**：数据模型 → 类型 → Server Action → UI。不允许先写 UI 再补数据。
3. **业务规则集中**。状态机（`Intake → Matter` 转化、`Matter` 阶段跃迁）、金额计算、权限判定，统一在 `src/lib/` 或 `src/server/`，不要在 React 组件里写。
4. **不为了让代码跑起来**注释掉校验、绕过权限判断、`@ts-ignore` 整段。找根因。
5. **密钥、token、密码**不进代码、不进 commit、不进日志、不进截图。`.env` 永远在 `.gitignore`。
6. **Prisma 迁移**先用 `prisma migrate dev --create-only` 生成 SQL 给叶森看，再执行。生产迁移走 `prisma migrate deploy`。
7. **删除文件、`.env` / CI 修改、`git reset/rebase/push`、生产部署**必须先征得叶森确认（红线）。
8. **附件**默认私有存储在 `storage/`，下载经鉴权 API，不暴露公开直链。

---

### 六、权限与审计

- **角色**（V1）：`ADMIN` / `PRINCIPAL_LAWYER` / `LAWYER` / `ASSISTANT` / `FINANCE`。
- **可见性**：`Matter` 默认只对 `owner` + `members` + `ADMIN` 可见；`FINANCE` 可见所有案件的财务字段但不能编辑案件正文。
- **审计日志**（`AuditLog`）必须记录：登录/登出、案件创建/查看/编辑/归档、材料下载、财务变更、冲突检索、权限变更。
- 第一版**不做字段级权限矩阵**，能用"角色 + 案件成员"覆盖的就不上更复杂的方案。

---

### 七、验证命令（每次改完主动跑）

```bash
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit
npm run prisma:validate   # Prisma schema 校验
npm run build             # 生产构建（最严的检查）
```

UI 改动还要：在浏览器里把"金线"（典型工作流）走一遍，不只看类型/构建过。

---

### 八、安全底线

- 附件私有，下载链接带短期 token。
- 案件正文、客户联系方式、身份证号、统一社会信用代码视为敏感数据，前端展示要支持"打码/明文"切换。
- 日志中不输出 PII（身份证、电话、住址完整值）。
- `AuditLog` 不可由业务代码删除，只能归档。

---

### 九、文档清单

| 文件 | 作用 |
|---|---|
| `AGENTS.md`（本文件） | 工作区铁律，所有协作者必读 |
| `docs/PRD.md` | 产品需求与功能范围 |
| `docs/DATA-MODEL.md` | 数据模型详细设计与 ER 图 |
| `docs/UI-DESIGN.md` | 设计语言、色板、关键页面 wireframe |
| `README.md` | 仓库门面，安装运行说明 |
| `CHANGELOG.md` | 版本变更（V1 发布时建立） |

---

### 十、给 AI 助手的特别说明

- 默认中文回应，代码/字段/路由用英文。
- 结论先行，方案有问题直接指出。
- 涉及红线（删文件、改 `.env`/CI、`git push`/`reset`/`rebase`、生产部署、Schema 迁移）**必须**先征得叶森同意。
- 不为了"看起来很忙"提交大量改动。每次改动控制在可审阅的范围。
- 自动验证清单见第七节。
