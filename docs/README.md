# Mirabilis 开发文档

Mirabilis 是一个任务可以无限嵌套的 Markdown-first 本地时间管理系统。Core 保持极小，只维护 Markdown Page、Metadata、Event、Filter、View Registry、Command Registry 和 Plugin Host；任务、习惯、计时、日历、统计、机器学习、AI 等高级能力都通过插件接入。

## 拆分原则

- 产品文档先回答“系统是什么、用户怎么用、插件语义是什么”。
- 架构文档回答“代码如何组织、Core 与插件如何交互、Native 边界在哪里”。
- 开发文档回答“先做什么、怎样验收、哪些约束不能破”。

## 阅读路径

1. [产品愿景与 Core 边界](product/01-vision-and-core.md)
2. [Core 数据模型](product/02-core-data-model.md)
3. [插件平台设计](product/03-plugin-platform.md)
4. [Markdown 编辑器与用户流程](product/04-editor-and-workflows.md)
5. [总体架构与 Monorepo](architecture/01-overview-and-monorepo.md)
6. [Core Kernel 设计](architecture/02-core-kernel.md)
7. [Plugin API 与 Plugin Host](architecture/03-plugin-api-and-host.md)
8. [数据方向、开发顺序与 MVP](development/01-data-roadmap-and-mvp.md)
9. [实现路线与架构约束](development/02-implementation-roadmap-and-constraints.md)
10. [AI 开发操作指南](implementation/ai-development-guide.md)

## 文档目录

### Product

- [产品愿景与 Core 边界](product/01-vision-and-core.md)
- [Core 数据模型](product/02-core-data-model.md)
- [插件平台设计](product/03-plugin-platform.md)
- [Markdown 编辑器与用户流程](product/04-editor-and-workflows.md)
- [内置插件产品设计](product/05-built-in-plugins.md)
- [View Slot 系统](product/06-view-slots.md)

### Architecture

- [总体架构与 Monorepo](architecture/01-overview-and-monorepo.md)
- [Core Kernel 设计](architecture/02-core-kernel.md)
- [Plugin API 与 Plugin Host](architecture/03-plugin-api-and-host.md)
- [Slot、编辑器与 Task 插件架构](architecture/04-slots-editor-task.md)
- [核心插件实现架构](architecture/05-plugin-implementations.md)
- [Filter、Native 边界与 SQLite](architecture/06-filter-native-database.md)
- [启动流程与代码路径](architecture/07-runtime-flows.md)

### Development

- [数据方向、开发顺序与 MVP](development/01-data-roadmap-and-mvp.md)
- [实现路线与架构约束](development/02-implementation-roadmap-and-constraints.md)

### Implementation

- [Implementation 文档入口](implementation/README.md)
- [AI 开发操作指南](implementation/ai-development-guide.md)
- [Agent Workflow](implementation/agent-workflow.md)
- [Autonomous Development Runbook](implementation/autonomous-development.md)
- [Task Index](implementation/task-index.md)
- [Implementation Progress](implementation/progress.md)
