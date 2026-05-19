# AI 开发操作指南

这份指南写给人看：你不需要记住每个 agent 的长 prompt，只要知道什么时候说什么、看哪些文件、怎样判断 Codex 是否正在按正确流程开发。

## 核心心智模型

Codex App 里的当前对话就是主编排 agent。你给它目标，它负责读取 `AGENTS.md`、加载 `.agents/skills/mirabilis-dev-runner/SKILL.md`，再按任务需要调度 `.codex/agents/` 里的 focused custom agents。

不要把每个 subagent 当成你要手动管理的小助手。正常使用时，你只需要给主 Codex 下命令：

```text
继续开发
开发下一个 task
按 docs 开发
实现 TASK-018
无人值守继续
```

如果你想显式触发完整工作流，可以写：

```text
$mirabilis-dev-runner 继续开发
```

## Codex 会自动读取什么

短命令触发后，Codex 必须读取这些长期上下文：

- `AGENTS.md`
- `.agents/skills/mirabilis-dev-runner/SKILL.md`
- `docs/implementation/task-index.md`
- `docs/implementation/progress.md`
- `docs/implementation/agent-workflow.md`
- `docs/testing/strategy.md`
- 当前 task 对应的 `docs/product`、`docs/architecture`、`docs/development` 文件

这些文件存在的目的就是防止你忘记长 prompt，也防止长对话压缩后 Codex 忘记项目流程。

## 什么时候走轻量流程

如果任务只改这些内容，可以跳过 TDD、实现 agent 和完整 review agent 队列：

- `AGENTS.md`
- `.codex/config.toml`
- `.codex/agents/*.toml`
- `.agents/skills/**`
- `.githooks/**`
- `docs/**`

轻量流程应该做：

1. 读取相关配置和文档。
2. 如果涉及 Codex 配置行为，查官方 Codex 文档。
3. 只改文档、配置或 hook。
4. 校验 TOML、shell 语法、Codex 配置。
5. 必要时跑 `bun run build`。
6. 用 `docs:` 或 `chore:` 提交。

换句话说，像“写一份 AI 开发操作指南”这种任务，不需要让 `test_writer`、`implementer`、`security_reviewer` 都完整跑一遍。

## 什么时候走完整开发流程

只要任务会修改软件行为，就走完整流程：

```text
任务选择
↓
文档/依赖研究
↓
TDD 红灯测试
↓
最小实现
↓
本地验证
↓
多 agent review
↓
修 P0/P1
↓
原子提交
↓
更新 progress.md
↓
合并 master
```

软件行为包括前端 UI、Rust/Tauri、IPC、SQLite、文件系统、插件 API、核心数据结构、测试工具链、打包脚本等。

## 一次 task 应该怎么跑

你可以直接说：

```text
实现 TASK-014
```

或者：

```text
继续开发
```

Codex 应该做这些事：

1. 从 `docs/implementation/progress.md` 找到 `[~]` 任务；如果没有，就选第一个依赖已满足的 `[ ]` 任务。
2. 把任务标记成 `[~]` 并写 Run Log。
3. 从 `master` 创建一个 focused branch 或 worktree。
4. 让 `docs_researcher` 和 `deprecation_auditor` 查最新官方文档。
5. 让 `test_writer` 先写 failing tests，不写生产代码。
6. 提交测试 commit。
7. 让 `implementer` 写最小实现。
8. 跑 focused tests，绿了再提交实现 commit。
9. 需要时单独做 refactor commit。
10. 并行跑 review agents。
11. 修 P0/P1，分别提交 fix/docs commit。
12. 跑本地 gate。
13. 把 `progress.md` 从 `[~]` 改成 `[x]`。
14. 合并回 `master`，push。

一个 task 可以有很多 commit，但每个 commit 只能表达一个清楚的行为变化。

## 进度在哪里看

主要看：

```text
docs/implementation/progress.md
```

状态含义：

- `[ ]` 还没开始。
- `[~]` 正在做，可以通过“继续开发”恢复。
- `[x]` 已完成并合并到 `master`。
- `[!]` 阻塞，需要人类决策或外部条件。

如果 Codex 中途停止、应用重启、上下文被压缩，下次直接说：

```text
继续开发
```

它应该从 `[~]` task 和 Run Log 继续，而不是重新猜。

## 无人值守怎么做

长期无人值守不要依赖一个巨大对话一直不断运行。推荐用 Codex App Automations，让它每隔一段时间跑一次可恢复的开发迭代。

推荐自动化目标：

```text
$mirabilis-dev-runner

Run one autonomous Mirabilis development iteration.
Read AGENTS.md, docs/implementation/progress.md, docs/implementation/task-index.md,
docs/implementation/agent-workflow.md, and docs/testing/strategy.md.
Resume [~] first, otherwise pick the next unblocked [ ] task.
Follow the full TDD workflow for software tasks.
Use the light path for docs/config-only tasks.
Mark [!] with a Run Log entry if blocked.
Report task, branch, commits, checks, progress update, blockers.
```

推荐设置：

- Execution environment: `worktree`
- Cadence: hourly or every few hours
- Model: repo default `gpt-5.5`
- Reasoning: `xhigh`
- Service tier: `fast`

每次自动化只需要完成一个可恢复迭代。这样即使某次失败，下次也能从 `progress.md` 继续。

## 人类每天怎么介入

你主要检查四件事：

```bash
git status --short --branch
git log --oneline --decorate --graph -20
sed -n '1,220p' docs/implementation/progress.md
```

如果想看最近一次 Codex 做了什么：

```bash
git show --stat
```

如果看到 `[!]`，先读 Run Log，再给 Codex 一个决策，例如：

```text
TASK-014 的路径校验先按本地目录必须存在处理，继续开发
```

如果看到 `[~]` 很久没动：

```text
继续开发，先恢复当前 [~] task
```

## 分支和提交

本仓库的集成分支是 `master`。如果 prompt 或外部文档写 `main`，在这个仓库里都按 `master` 处理。

功能开发分支示例：

```bash
git switch master
git pull
git worktree add ../mirabilis-task-014 -b feat/task-014-project-creation
cd ../mirabilis-task-014
codex
```

提交历史应该长这样：

```text
test: add task-014 project creation acceptance tests
feat: implement task-014 project creation
refactor: simplify project creation validation
docs: document project creation IPC contract
fix: address task-014 review findings
```

不要把测试、实现、重构、文档和 review 修复全部塞进一个 commit。

## 本地验证

当前基础 gate：

```bash
bun run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

等 `TASK-001` 建好脚本后，优先使用：

```bash
bun run check:quick
```

涉及 IPC、权限、文件系统、持久化、打包或 release 时使用：

```bash
bun run check:full
```

## 常见命令

开始下一个任务：

```text
继续开发
```

指定任务：

```text
实现 TASK-018
```

只让 Codex 更新文档：

```text
更新 TASK-018 的开发说明，不改实现代码
```

让 Codex 先重新拆计划：

```text
读取 docs/product、docs/architecture、docs/development，重新校验 docs/implementation/task-index.md，不写实现代码
```

让 Codex 做 release gate：

```text
Review this branch against master as a release gate. Do not change implementation code unless explicitly asked.
```

## 出问题时的处理

如果测试失败，Codex 应该先判断失败是不是当前 task 引入的。如果不是当前 task 相关问题，它应该在 Run Log 里记录，不要偷偷改无关模块。

如果遇到架构文档没决定的问题，Codex 应该标记 `[!]`，写清楚需要人类选择什么，而不是自己发明架构。

如果自动 push 失败，先看当前分支：

```bash
git branch --show-current
git remote -v
```

本仓库通过 `.githooks/post-commit` 自动 push。临时禁用自动 push：

```bash
MIRABILIS_AUTO_PUSH=0 git commit -m "..."
```

## 判断 Codex 是否跑偏

如果它准备做这些事，应该叫停：

- 在没有 task 的情况下大范围改代码。
- 为了让测试通过而删除、跳过、弱化测试。
- 把多个 task 混在一个分支里。
- 在没有查文档的情况下改版本敏感 API。
- 忽略 `progress.md`，只依赖聊天历史。
- 软件行为修改后不跑本地验证。

正确的工作方式是：文档定方向，task 定边界，测试定行为，review 定风险，`progress.md` 定恢复点。
