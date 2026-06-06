# LawLink 第一次发布到 GitHub 操作手册

这份手册面向第一次使用 GitHub 发布项目的人。它只覆盖公开源代码仓库，不包含生产部署。

## 当前结论

LawLink 已具备公开仓库的基础材料：README、MIT License、`.env.example`、Dockerfile、docker-compose、发布检查清单和项目设计文档。

正式公开前还必须完成三件事：

1. 确认当前未提交改动全部都是准备公开的内容。
2. 跑完验证命令。
3. 在 GitHub 创建仓库后再由你确认是否推送。

## GitHub 仓库建议填写内容

- Repository name: `LawLink`
- Description: `Open-source, self-hosted case and project management system for small and mid-sized law firms.`
- Visibility: `Public`
- License: `MIT`
- Topics:
  - `legal-tech`
  - `law-firm`
  - `case-management`
  - `self-hosted`
  - `nextjs`
  - `prisma`
  - `postgresql`
  - `typescript`
  - `tailwindcss`
  - `docker-compose`

如果你希望中文描述，可以用：

`开源、自部署的律师案件 / 项目管理系统，主要面向中小律所。`

## 发布前本机检查

在项目根目录执行：

```bash
git status --short --branch
git ls-files | rg '^(\\.env$|\\.env\\.(local|production|development|test)|backups/|outputs/|\\.next|node_modules/)'
git ls-files storage | rg -v '^storage/\\.gitkeep$'
git status --ignored --short
rg -n -l 'API_KEY|SECRET|TOKEN|PASSWORD|sk-|Bearer ' . -g '!node_modules' -g '!.next*' -g '!storage/**' -g '!outputs/**'
npm run lint
npm run typecheck
npm run prisma:validate
npm run build
./scripts/create-public-archive.sh
```

解释：

- `git status`：确认哪些文件会被发布。
- `git ls-files`：确认没有把 `.env`、附件、备份、构建产物加入版本库。上面两条命令正常应当没有输出。
- `rg`：扫一遍看起来像密钥的字符串。命中不一定是泄露，需要逐条判断。
- 四条 `npm` 命令：确认代码质量、类型、Prisma schema 和生产构建。
- 打包脚本：生成一份可人工抽查的公开源码压缩包。

## GitHub 网页操作步骤

1. 登录 GitHub。
2. 右上角点击 `+`，选择 `New repository`。
3. 填写仓库名 `LawLink`。
4. 选择 `Public`。
5. 不要勾选自动创建 README、LICENSE、`.gitignore`，因为本地项目已经有这些文件。
6. 创建仓库。
7. GitHub 会显示一段 `git remote add origin ...` 和 `git push ...` 命令。先不要急着执行，推送前请再次确认工作树和验证结果。

## 首次推送命令模板

只有确认要公开后才执行：

```bash
git remote add origin git@github.com:<your-account>/LawLink.git
git branch -M main
git push -u origin main
```

如果 GitHub 账号没有配置 SSH key，也可以使用 HTTPS 地址：

```bash
git remote add origin https://github.com/<your-account>/LawLink.git
git branch -M main
git push -u origin main
```

推送属于公开发布动作。按本项目规则，必须由你明确确认后再执行。

## 发布后的仓库设置建议

建议发布后在 GitHub 网页上配置：

- About: 填写 description、website（如有）、topics。
- Features: 开启 Issues；暂时不开 Wiki 也可以。
- Security: 开启 private vulnerability reporting。
- Branch protection: 保护 `main` 分支，要求 PR 合并。
- Discussions: 如果之后想收集路线图建议再开。

可选但需要另行确认后再加：

- GitHub Actions：自动跑 lint、typecheck、Prisma validate、build。
- Dependabot：自动提醒依赖升级。

## 不要上传的内容

- `.env` 或任何真实环境变量文件。
- `storage/` 里的附件、模板、归档包。
- 数据库 dump、备份文件、还原包。
- 真实案件、客户、联系人、当事人、发票、用章、审计日志。
- AI、元典、AWS、数据库、NextAuth、文件加密等密钥。

## 你发布时可以用的项目介绍

短版：

> LawLink 是一个开源、自部署的律师案件 / 项目管理系统，主要面向中小律所，也适用于独立律师和小团队自部署使用，覆盖收案登记、冲突检索、案件跟进、财务记录、结案归档和数据导出。

长版：

> LawLink is an open-source, self-hosted case and project management system primarily for small and mid-sized law firms, while still fitting solo lawyers and small teams that want to self-host their own practice workspace. It focuses on the everyday workflow from intake registration and conflict checks to matter management, finance records, archive review, and data export. The stack is Next.js, TypeScript, Prisma, PostgreSQL, shadcn/ui, and Docker Compose.
