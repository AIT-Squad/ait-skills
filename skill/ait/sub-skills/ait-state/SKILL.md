---
name: ait-state
description: INVOKE THIS SKILL when the user asks to view AIT version state, refresh state.md, check version progress, or chunk three-state distribution.
---

# ait-state

从项目根使用 Node 项目 wrapper 读取版本状态；不要直接解析或修补 `.meta`。完整主流程见 [../../SKILL.md](../../SKILL.md)。

## 读取方式

- Windows：`project-docs/.ait/ait-cli.cmd state ...`
- POSIX：`project-docs/.ait/ait-cli state ...`
- 结构化面板：`state --version <v> --format json`
- Markdown 面板：`state --version <v>`，正文从外层成功结果的 `data.content` 读取。
- 仅在用户确实要求保存时使用 `state --version <v> --save`，保存路径从 `data.saved_to` 读取。
- `version status <v>` 可补充版本 phase 和 working/staged/committed；它不提供锁位，锁位事实从 `state` 读取。

stdout 通常是单个 `{ok:true,data}` 或 `{ok:false,code,error}` JSON，stderr 可有阶段进度 JSON 行；退出码只表示外层 `ok`，摘要前仍须读取业务字段。

## 工作流

1. 用户指定版本时读取该版本；未指定时只在唯一活动版本明确存在时读取它。
2. 无活动版本是事实，不等于项目为空、制品完整或应自动创建版本。可询问目标版本，或按用户意图显式查询历史版本。
3. 从结构化结果提炼版本、phase、层级锁位、merged、working/staged/committed 和 counts；用 committed/total 表达规格冻结进度。
4. 明确说明这些是规格状态，不是代码生成、回执登记或测试进度。代码是否完整须另查 `codegen verify` 与 acceptance。
5. 输出事实摘要与未完成项；不要原样倾倒 JSON。

## 只读边界

- 查询失败时保留稳定 `code`、`error` 和可用定位信息，不把坏索引降级为空状态。
- 不为“刷新状态”执行 `sync`、`reindex` 或 `state --save`；它们会写入。
- 不直接改 phase、索引、图或 state.md。
- `NO_VERSION` 时不要自动开版本；先澄清或显式选择历史版本。
- `CONFIG_UNREADABLE`、`INDEX_UNREADABLE`、`PROJECT_DOCS_MALFORMED` 等应报告原始位置，再交由 [../ait-resume/SKILL.md](../ait-resume/SKILL.md) 规划恢复。

