# LawLink

LawLink 是一个开源、自部署的律师案件 / 项目管理系统，主要面向中小律所，也适用于独立律师和小团队自部署使用。

第一版围绕律师日常办案主线：

`收案登记 → 冲突检索 → 转正式案件 → 持续跟进 → 财务记录 → 结案归档 → 数据导出`

> 项目状态：早期版本。适合本地试用、二次开发和自部署评估；正式用于真实案件前，请先完成服务器安全、备份、权限和密钥管理配置。

## 技术栈

- **框架**：Next.js 16 App Router + TypeScript
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
| [`docs/PUBLIC_RELEASE_CHECKLIST.md`](./docs/PUBLIC_RELEASE_CHECKLIST.md) | GitHub 公开发布前的敏感数据与打包检查 |
| [`docs/GITHUB_PUBLISHING_GUIDE.md`](./docs/GITHUB_PUBLISHING_GUIDE.md) | 第一次发布到 GitHub 的操作手册 |
| [`docs/PUBLISH_READINESS_REPORT.md`](./docs/PUBLISH_READINESS_REPORT.md) | 当前发布准备度体检报告 |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | 贡献说明 |
| [`SECURITY.md`](./SECURITY.md) | 安全问题报告方式 |
| [`CHANGELOG.md`](./CHANGELOG.md) | 版本变更记录 |

## 本地开发

### 1. 准备环境

- Node.js 20.9+
- PostgreSQL 16（本地建议用 Docker Compose 启动）

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
npx prisma migrate dev
npx prisma db seed                # 创建 admin 账号 + 案由库样本
```

### 4. 启动 dev

```bash
npm run dev
```

打开 http://localhost:3000，用 `.env` 里的 `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` 登录。

本地开发使用 `.next-dev`，生产构建使用 `.next-build`，避免 `npm run build` 后覆盖正在运行的开发缓存导致页面不渲染。

## 验证

```bash
npm run lint              # ESLint CLI
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

## 免责声明

LawLink 是通用案件管理软件，不提供法律意见，也不替代律师的专业判断。自行部署和使用时，请遵守所在地关于律师执业、个人信息保护、数据安全、档案管理和保密义务的规则。
