# Contributing to LawLink

感谢关注 LawLink。这个项目优先服务独立律师、小团队和小型律所的自部署案件管理场景。

## 先读规则

开始前请先阅读：

- [AGENTS.md](./AGENTS.md)：工作区规则和工程纪律。
- [docs/PRD.md](./docs/PRD.md)：产品边界和主工作流。
- [docs/DATA-MODEL.md](./docs/DATA-MODEL.md)：数据模型。
- [docs/UI-DESIGN.md](./docs/UI-DESIGN.md)：界面规范。

## 适合提交的内容

- 修复可复现的 bug。
- 改进自部署、备份、权限、安全、导入导出等基础能力。
- 围绕主线工作流的小而清晰的功能增强。
- 文档、示例、安装说明和错误排查改进。

## 暂不建议的内容

- 共享 SaaS 多租户改造。
- 引入 Ant Design 或替换既定 UI 技术栈。
- 没有产品文档支撑的大范围重构。
- 绕过权限、校验、审计日志或数据安全边界的实现。

## 本地开发

```bash
cp .env.example .env
npm install
docker compose up -d db
npx prisma migrate dev
npx prisma db seed
npm run dev
```

## 提交前验证

```bash
npm run lint
npm run typecheck
npm run prisma:validate
npm run build
```

涉及 UI 的改动还应在浏览器里走一遍对应业务流程。

## Pull Request 要求

- 一个 PR 只解决一个主题。
- 说明改了什么、为什么改、如何验证。
- 不提交 `.env`、数据库 dump、`storage/` 附件、真实案件数据或任何密钥。
- 数据库 schema 变更必须说明迁移影响；不要把临时迁移直接塞进 PR。
- 新增业务规则时，优先放到 `src/lib/` 或 `src/server/`，不要散落在 React 组件里。

## Issue 要求

报告 bug 时请尽量提供：

- 复现步骤。
- 期望结果和实际结果。
- 浏览器、Node.js、PostgreSQL、操作系统版本。
- 相关日志或截图。截图中请先遮盖真实客户、案件、手机号、身份证号、统一社会信用代码等信息。
