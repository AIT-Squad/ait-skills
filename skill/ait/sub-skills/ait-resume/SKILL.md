---
name: ait-resume
description: INVOKE THIS SKILL when an AIT CLI command fails or the user asks how to resume an interrupted AIT workflow.
---

# ait-resume

根据 Node AIT CLI 的稳定 `code`、`error` 与内层业务字段诊断失败。先只读核对事实，再给最短恢复路径；完整生命周期见 [../../SKILL.md](../../SKILL.md)，版本语义见 [../../references/version-manager.md](../../references/version-manager.md)。

## 诊断顺序

1. 保留完整失败 JSON；stderr progress 只作阶段线索，退出码只反映外层 `ok`。
2. 从项目根用 Windows `.cmd` 或 POSIX wrapper 执行适合的只读查询：`version status <v>`、`state --version <v> --format json`、`specgraph validate-new-model [--version <v>]`、`deps`、`impact`、`search`、`acceptance show`、`codegen verify --version <v>`。
3. 分类为环境/cwd、配置或索引、版本/phase、内容/context token、生成回执、验收、确认计划、合入回滚或发布。
4. 报告已确认事实、未知项、恢复步骤和下一条命令。无对应 CLI 读取能力时不要编造命令；必要时说明只读 Node API `version.list/inspect` 与 CLI 的边界。

## 常见恢复

- `NO_ACTIVE_VERSION`：经用户目标确认后 `version create <v>`。
- `ACTIVE_VERSION_EXISTS` / `ACTIVE_VERSION_CONFLICT`：先查现有版本；合入或撤销属于有副作用决定，不任意猜选。
- `PRD_NOT_CONFIRMED` / `FSD_NOT_CONFIRMED` / `TDD_NOT_CONFIRMED`：按 PRD → FSD → TDD 写入并逐层 confirm。没有本层写入时，不能从前一 confirm phase 直接跳到下一层 confirm。
- `CONTEXT_TOKEN_INVALID` / `CONTEXT_TOKEN_STALE`：重新取得同一意图背景、重新讨论并使用新 token。
- `ROOT_CHUNK_REQUIRED`、`PRD_REQUIREMENT_CONTRACT_VIOLATION`、`TDD_TARGET_FILE_REQUIRED`、`DUPLICATE_TARGET_FILE`：修正文档后重试；不手改受管文件。
- `COMMIT_EMPTY`：逐层 confirm 已提交全部变更时可以是正常事实；不要反复 commit。
- `GENERATION_TOKEN_STALE` / `GENERATION_SPEC_CHANGED` / `GENERATION_ARTIFACT_CHANGED`：重新 prepare，完整核对 bundle，真实生成并验证目标，再登记 receipt 和 verify；不得补造回执。
- `ACCEPTANCE_FAILED`：修复制品并重跑 acceptance；`ran:false,passed:true` 只是未配置而跳过。
- `CONFIRMATION_STALE`：重新执行 `version confirm <v>`，读取其验收与计划结果。confirm 有写入/Git 副作用，不是查询。
- `MERGE_ROLLBACK` / `REVERT_PRECHECK_FAILED`：保留恢复详情，核对 state、version status 与双仓 Git 后再决定；不能笼统保证所有外部副作用已回滚。
- `PUSH_NO_REMOTE` / `PUSH_NO_UPSTREAM` / `PUSH_FAILED`：核对内层 host/docs 状态；用户仍授权发布时先 `push --dry-run`。

## 回滚与授权

`version revert <v> --confirm` 会撤销未合入版本；不带 `--confirm` 只会得到 `USAGE_ERROR`，没有影响预览。回滚前必须取得明确授权并先做只读核对。layer `revert` 只能从对应层 confirm 回到该层 creating，不能任意跨层向上跳；后续 phase 中要返工上层时，先诊断并规划新的受控迭代，绝不手改 phase 或元数据。

普通恢复和已授权开发中的提交、合入延续用户目标，不逐条重复询问。删除版本、回滚或外部发布须匹配具体授权；查询状态本身不会授权这些写操作。

