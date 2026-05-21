# Markdown 编辑器与用户流程

整理用户在 Markdown 页面中创建任务、进入任务页、移动端输入、编辑元数据以及完整计时闭环的产品流程。

## 11. 用户核心操作：Markdown 页面中写任务

### 11.1 基础页面输入

用户打开一个 Markdown Page，输入：

```markdown
# 产品设计

文本123

- [ ] 设计快速收集箱

文本456

- [ ] 设计 Timer Plugin
```

界面渲染：

```text
# 产品设计

文本123

☐ 设计快速收集箱

文本456

☐ 设计 Timer Plugin
```

Task Plugin 识别两个 task block。

系统自动创建两个 Markdown Page：

```text
设计快速收集箱
设计 Timer Plugin
```

这两个页面都带有 metadata：

```text
task.enabled = true
task.status = todo
task.source_page_id = 当前页面
task.source_block_id = 对应 block
```

---

### 11.2 点击任务文字进入对应页面

用户点击：

```text
设计 Timer Plugin
```

打开页面：

```markdown
# 设计 Timer Plugin

这里可以写任务说明、想法、资料。

- [ ] 定义 Time Segment
- [ ] 设计全局计时器
- [ ] 设计停止计时后的 Note
```

这些子任务也会自动生成对应页面。

---

### 11.3 任务无限嵌套

无限嵌套来自以下规则：

```text
任何 Markdown Page 中出现 - [ ] xxx
Task Plugin 都会创建一个对应 Markdown Page
这个对应页面仍然是 Markdown Page
因此它内部还可以继续出现 - [ ] yyy
```

示例：

```markdown
# A

- [ ] B
```

点击 B：

```markdown
# B

- [ ] C
```

点击 C：

```markdown
# C

- [ ] D
```

系统得到：

```text
Page A
  contains task block B
Page B
  contains task block C
Page C
  contains task block D
```

All Tasks Filter 显示：

```text
A 如果它本身是任务页
B
C
D
```

---

## 12. Markdown-first 编辑器

### 12.1 编辑器主体验

编辑器要让用户“像写 Markdown 一样”操作。

核心输入语法：

```markdown
# 标题

普通文本

- [ ] 任务

- [x] 已完成任务

#tag

[[页面链接]]
```

用户可以一直写，不需要切换到表单模式。

TASK-016 当前只交付 Markdown Editor Plugin shell：内置 `markdown` 插件注册页面编辑器 view、插入文本 command 和移动工具栏 slot；编辑器主体是受控 `<textarea>`，保存的是用户输入的 Markdown 文本。Task / Tag / Date / Page Link 等语义识别仍由后续插件接管。

### 12.2 UI 只辅助插入语法

UI 不负责“创建任务表单”。
UI 负责帮助用户快速插入语法。

长期目标工具栏：

```text
☐   #   @date   [[ ]]   /
```

对应：

```text
☐      插入 - [ ]
#      插入 # 并打开 tag autocomplete
@date  插入 date token
[[ ]]  插入页面链接
/      打开轻量 command menu
```

TASK-016 基线工具栏只包含已经实现的三个纯文本 snippet：

```text
☐      插入 - [ ] <space>
#      插入 #
[[ ]]  插入 [[ ]]
```

这些按钮通过 `markdown.insert-text` command bus 插入文本。`@date`、tag autocomplete、page autocomplete、slash menu、富文本/块级编辑器行为、稳定 block ID、Markdown import/export、以及 task/tag/page-link 的语义行为都延后到后续插件或编辑器任务。

用户点击 `☐`，编辑器插入 `- [ ] `（末尾有空格）：

```markdown
- [ ]
```

用户继续写：

```markdown
- [ ] 写统计图插件
```

Task Plugin 接管后续识别。

---

## 13. 移动端输入

移动端保持同样语义。

用户点击快速输入：

```text
自动弹出键盘
底部出现工具栏：☐ # [[ ]]
```

用户点击 `☐`：

```markdown
- [ ]
```

用户输入：

```markdown
- [ ] 晚上整理机器学习预测插件 #ml
```

保存后：

```text
进入 Inbox Page
后续 Task Plugin 创建任务页面
后续 Tag Plugin 识别 #ml
后续 Filter 自动更新
```

移动端不需要复杂任务创建表单。
所有输入仍然围绕 Markdown Page。

---

## 14. Metadata 图形化展示

任务页面顶部显示 metadata bar。

示例：

```text
todo · #product #timer · due Friday · scheduled Today · estimate 45m · tracked 2h10m · Start
```

这个 metadata bar 由多个插件共同贡献：

```text
Task Plugin: todo / due / scheduled / estimate
Tag Plugin: #product #timer
Timer Plugin: tracked 2h10m / Start
Habit Plugin: habit state
ML Plugin: predicted remaining time
Stats Plugin: estimate error
```

用户点击字段即可编辑：

```text
点击 todo         打开状态选择
点击 #product     打开 tag picker
点击 due Friday   打开日期选择器
点击 estimate     编辑预估时间
点击 tracked      打开 Time Segment 列表
点击 Start        开始计时
```

字段可以通过插件扩展。
新插件只要注册 metadata field + renderer + editor，就可以出现在 metadata bar 中。

---

## 26. 用户完整操作流

### 26.1 写一个普通页面

用户写：

```markdown
# 时间管理 App

这个系统的核心是 Markdown Page + Plugin。

- [ ] 设计 Core
- [ ] 设计 Plugin 系统
- [ ] 设计 Timer Plugin
```

系统：

```text
Markdown Page 保存正文
Task Plugin 识别三个任务
每个任务生成 Markdown Page
All Tasks Filter 更新
```

### 26.2 进入任务页

用户点击：

```text
设计 Plugin 系统
```

打开：

```markdown
# 设计 Plugin 系统

Plugin 是一等公民。所有能力都通过 Plugin 接入。

- [ ] 设计 Manifest
- [ ] 设计 Command Registry
- [ ] 设计 View Registry
- [ ] 设计 Algorithm Registry
```

### 26.3 编辑元数据

页面顶部：

```text
todo · #architecture · estimate empty · tracked 0m · Start
```

用户点击 `#architecture`，添加：

```text
#plugin
```

metadata 更新：

```text
tags = ["architecture", "plugin"]
```

### 26.4 计时

用户点击 Start。

全局计时器：

```text
设计 Plugin 系统 · 00:00:01
Pause · Stop · Note · Switch
```

计时中点击 Note：

```text
要参考 Obsidian：manifest、lifecycle、commands、views、settings 都是插件贡献点。
```

点击 Stop。

生成 Time Segment：

```text
10:00–10:47
Page: 设计 Plugin 系统
Note: 要参考 Obsidian...
```

Calendar 显示这段时间。
Stats 统计这段时间。
AI 周报可以总结这段 Note。
ML Plugin 可以用这段时间更新预测。

---
