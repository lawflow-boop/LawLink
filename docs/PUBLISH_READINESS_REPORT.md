# LawLink GitHub 发布前体检报告

## 结论

LawLink 已经具备公开仓库的主要门面材料，生产依赖安全审计已清零。当前可以按“当前文件快照”准备公开；剩余需要人工确认的是当前未提交改动范围，以及是否要整理 Git 历史。

当前判断：

1. `npm audit --omit=dev`：0 vulnerabilities。
2. 验证链已通过。
3. 当前工作树仍存在大量未提交改动，需要先确认哪些属于本次公开版本。
4. Git 历史里曾出现 `outputs/cause_taxonomy` 文件；不是密钥或案件附件，但如果要求首发历史极简干净，需要单独整理历史。

## 已准备好的内容

### 仓库基础

- `README.md`：项目介绍、本地开发、验证命令、Docker 部署、免责声明。
- `LICENSE`：MIT License。
- `package.json`：项目名称、版本、MIT 协议、常用脚本。
- `.env.example`：环境变量模板，不含真实密钥。
- `.gitignore`：忽略 `.env`、`storage/`、备份、输出、构建缓存、依赖目录等。
- `.dockerignore`：避免 Docker build context 带入本地数据和密钥。
- `Dockerfile` / `docker-compose.yml`：本地数据库和全栈 Docker 部署基础。

### 项目文档

- `AGENTS.md`：工作区规则。
- `docs/PRD.md`：产品需求。
- `docs/DATA-MODEL.md`：数据模型。
- `docs/UI-DESIGN.md`：UI 设计规范。
- `docs/PUBLIC_RELEASE_CHECKLIST.md`：公开发布检查清单。
- `docs/GITHUB_PUBLISHING_GUIDE.md`：第一次发布到 GitHub 的操作手册。
- `docs/PUBLISH_READINESS_REPORT.md`：本报告。

### GitHub 协作材料

- `CONTRIBUTING.md`：贡献说明。
- `SECURITY.md`：安全问题报告方式。
- `CHANGELOG.md`：版本变更记录。
- `CODE_OF_CONDUCT.md`：社区行为准则。
- `.github/PULL_REQUEST_TEMPLATE.md`：PR 模板。
- `.github/ISSUE_TEMPLATE/bug_report.md`：Bug 模板。
- `.github/ISSUE_TEMPLATE/feature_request.md`：功能建议模板。
- `.github/ISSUE_TEMPLATE/config.yml`：Issue 模板配置。
- `.github/AGENTS.md`：`.github` 目录约定。

### 发布辅助

- `scripts/create-public-archive.sh`：生成公开源码压缩包，便于推送前人工抽查。
- `dist/lawlink-public-source-20260607_000157.tar.gz`：本次验证生成的压缩包，位于被忽略的 `dist/`，不会进入 Git。

## 本次扫描结果

### 敏感文件

当前跟踪文件未发现以下内容进入版本库：

- 真实 `.env`。
- `storage/` 附件，除 `storage/.gitkeep`。
- 备份目录、数据库 dump、构建缓存、`node_modules`。

敏感字符串扫描命中主要是变量名、占位符和业务字段，例如 `NEXTAUTH_SECRET`、`DATABASE_URL`、`passwordHash`、`Bearer ${opts.apiKey}`，未发现真实密钥形态。

### Git 历史

历史记录中发现：

- `outputs/cause_taxonomy/build_cause_taxonomy.py`
- `outputs/cause_taxonomy/__pycache__/build_cause_taxonomy.cpython-312.pyc`
- `storage/.gitkeep`

其中 `storage/.gitkeep` 是正常占位文件。`outputs/cause_taxonomy` 不是案件数据或密钥，但如果希望公开仓库历史也很干净，需要单独做历史整理。历史整理可能涉及重写 Git 历史，必须先确认后再做。

### Seed 数据

`prisma/seed.ts` 当前只写入：

- 初始管理员账号。
- 案由样本。
- 阶段模板。
- 系统设置。
- 文书模板和用章配置。

demo 案件 seed 已跳过，避免公开仓库默认带拟真案件数据。

## 验证结果

已通过：

```bash
npm run lint
npm run typecheck
npm run prisma:validate
npm run build
npm run test:run
npm audit --omit=dev
./scripts/create-public-archive.sh
```

结果：

- `lint`：通过；有 60 个 warning，主要是既有未使用变量和 React Compiler 对 React Hook Form `watch()` 的提示。
- `typecheck`：通过。
- `prisma:validate`：通过。
- `build`：通过。
- `test:run`：17 个测试文件、135 个测试通过。
- `npm audit --omit=dev`：0 vulnerabilities。
- 本地登录页：`http://127.0.0.1:3000/login` 返回 `200 OK`，标题为 `登录 — LawLink`，监听进程 cwd 为 `/Users/yesen/Code/LawLink`。

## 发布阻塞项

### 已解决：生产依赖漏洞

历史检查中，`npm audit --omit=dev` 曾报出：

- `next@14.2.18`：critical。
- `postcss`：moderate。
- `uuid` 链路：moderate，涉及 `exceljs` / `next-auth`。

同大版本升级到 Next 14.2.35 后仍有 high 级别 Next 风险，因此已升级到 Next 16 / React 19 / ESLint 9，并通过 npm `overrides` 将嵌套 `postcss`、`uuid` 固定到安全版本。

当前状态：

- `next`: 16.2.7
- `react` / `react-dom`: 19.2.7
- `eslint`: 9.39.4
- `postcss`: 8.5.15
- `uuid`: 11.1.1
- `npm audit --omit=dev`: 0 vulnerabilities

### P0：确认当前未提交改动

当前工作树不是干净状态，包含功能代码、测试、发布材料、Docker/README 调整等。公开前需要逐项确认：

- 哪些改动是本次要公开的正式内容。
- 哪些改动是实验或本地工作，不应进入首发。

不要在没确认的情况下直接 `git add .`。

### P1：首发历史是否要整理

如果只看当前文件快照，可以发布；如果希望 GitHub 首发历史完全不含曾经的 `outputs/` 文件，需要另行做历史整理。该操作涉及 Git 历史，必须单独确认。

## 发布前下一步

建议按这个顺序处理：

1. 审当前工作树，把公开内容和本地实验分开。
2. 决定是否接受当前 Git 历史；如需“首发历史极简干净”，单独确认历史整理方案。
3. 公开前最后再跑：
   ```bash
   npm run lint
   npm run typecheck
   npm run prisma:validate
   npm run build
   npm run test:run
   npm audit --omit=dev
   ./scripts/create-public-archive.sh
   ```
4. 在 GitHub 创建空仓库，不勾选自动生成 README / LICENSE / `.gitignore`。
5. 由你确认后再添加 remote、提交、推送。

## 可选增强

以下内容有价值，但涉及自动化或仓库治理，建议另行确认后再加：

- GitHub Actions：自动跑 lint、typecheck、Prisma validate、build、test。
- Dependabot：自动提醒依赖升级。
- Branch protection：保护 `main` 分支。
- GitHub private vulnerability reporting：开启私密漏洞报告。
