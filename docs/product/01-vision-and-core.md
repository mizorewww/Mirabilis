# 产品愿景与 Core 边界

说明 Mirabilis 的产品目标、Markdown-first 交互、核心哲学，以及 Core 应该保持多小。

## 任务可无限嵌套的 Markdown-first 时间管理系统开发文档

### 1. 产品一句话

开发一个 **任务可以无限嵌套的 Markdown-first 本地时间管理 App**。

用户在任意 Markdown 页面中写普通文本、任务、标签、链接、日期、想法和笔记。系统通过插件识别这些内容，并把它们组织成任务页、习惯页、计时记录、日历、统计图、机器学习预测和 AI 复盘。

最核心的用户操作是：

```markdown
文本123

- [ ] 任务1

文本456

- [ ] 任务2
```

在界面中显示为：

```text
文本123

☐ 任务1   ← 点击 checkbox 完成；点击“任务1”进入任务1对应页面

文本456

☐ 任务2   ← 点击 checkbox 完成；点击“任务2”进入任务2对应页面
```

用户点击 `任务1` 后进入一个完整页面：

```markdown
# 任务1

这里可以继续写正文、想法、资料、链接。

- [ ] 子任务1
- [ ] 子任务2
```

`子任务1` 和 `子任务2` 也会自动拥有自己的对应页面。
因此任务天然可以无限嵌套。

---

## 2. 产品核心哲学

这个软件的中心不是传统任务列表，而是：

```text
Markdown Page + Metadata + Event + Filter + View + Plugin
```

用户主要感知：

```text
写 Markdown
输入 - [ ] 创建任务
点击任务进入对应页面
在页面顶部编辑图形化元数据
开始计时
给每段时间写 Note
用 Filter 看任务
用 Calendar 看时间
用 Stats 看行为
用 AI 辅助整理和复盘
```

系统内部坚持：

```text
Core 极小
Plugin 一等公民
所有高级能力都通过 Plugin 接入
```

---

## 3. Core 的唯一职责

Core 只负责以下六类东西：

```text
1. Markdown Page
2. Metadata
3. Event
4. Filter
5. View Registry
6. Command Registry
```

再加一个必要的运行时容器：

```text
7. Plugin Host / Plugin Registry
```

Plugin Host 只负责加载、启用、禁用、注册和卸载插件能力。
它本身不包含任务、习惯、计时、统计、机器学习或 AI 逻辑。

Core 不需要知道什么是任务。
Core 不需要知道什么是习惯。
Core 不需要知道什么是计时。
Core 不需要知道什么是热力图。
Core 不需要知道什么是预测算法。

这些全部由 Plugin 接入。

---
