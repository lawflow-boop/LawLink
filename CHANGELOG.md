# Changelog

本项目遵循面向使用者可读的变更记录格式。版本号在正式发布前可能不完全遵循语义化版本。

## Unreleased

### Added

- 收案登记、冲突检索、正式案件、案件跟进、财务记录、结案归档和数据导出主流程。
- Next.js 14 App Router、Prisma、PostgreSQL、NextAuth.js、shadcn/ui 基础架构。
- 本地开发与 Docker Compose 部署配置。
- 私有附件存储、文件下载鉴权、基础审计日志和角色权限设计。
- GitHub 公开发布前检查清单与发布手册。

### Security

- `.env`、`storage/`、备份、构建缓存和本地输出目录默认不进入 Git。
- demo 案件 seed 默认不启用，避免真实或拟真业务数据进入公开仓库。

## 0.1.0

- 初始公开准备版本。
