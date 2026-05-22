# LawLink

LawLink 是一个开源、自部署的律师案件管理系统，面向独立律师、小团队和小型律所。

第一版围绕律师日常办案主线：

`收案登记 → 冲突检索 → 转正式案件 → 持续跟进 → 财务记录 → 结案归档 → 数据导出`

## 技术栈

- **框架**：Next.js 14 App Router + TypeScript
- **UI**：shadcn/ui + Tailwind CSS + Framer Motion（深色科技感）
- **数据库**：PostgreSQL 16 + Prisma 5
- **鉴权**：NextAuth.js（Credentials Provider）
- **图表**：Recharts
- **表格**：TanStack Table
- **部署**：Docker Compose 一键起

## 文档

| 文件 | 内容 |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | 工作区规则（所有协作者必读）|
| [`docs/PRD.md`](./docs/PRD.md) | 产品需求与功能范围 |
| [`docs/DATA-MODEL.md`](./docs/DATA-MODEL.md) | 数据模型详细设计 |
| [`docs/UI-DESIGN.md`](./docs/UI-DESIGN.md) | 设计语言 + 关键页面 wireframe |

## 本地开发

### 1. 准备环境

```bash
cp .env.example .env

# 生成 NEXTAUTH_SECRET 和 STORAGE_ENCRYPTION_KEY
openssl rand -base64 32   # 复制到 .env 的 NEXTAUTH_SECRET
openssl rand -base64 32   # 复制到 .env 的 STORAGE_ENCRYPTION_KEY
```

### 2. 启动数据库（Docker Compose）

```bash
docker compose up -d db
```

只起 Postgres 容器；应用本地用 `npm run dev` 起。

### 3. 初始化 schema 与 seed

```bash
npm install                       # 首次
npx prisma migrate dev --name init
npx prisma db seed                # 创建 admin 账号 + 案由库样本
```

### 4. 启动 dev

```bash
npm run dev
```

打开 http://localhost:3000，用 `.env` 里的 `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` 登录。

## 验证

```bash
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit
npm run prisma:validate   # Prisma schema 校验
npm run build             # 生产构建（最严的检查）
```

## 全栈 Docker 部署

应用容器默认不启动。要起完整环境（db + app）：

```bash
docker compose --profile full up -d
```

## 协议

[MIT](./LICENSE) — 自由使用、修改、商用。
