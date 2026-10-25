# 版本生命周期与门禁

Node 版 AIT 用严格的层级 phase 管理 PRD、FSD、TDD，并把规格锁定、制品验收、宿主提交和基线提升分成可核对的步骤。规格 committed 只表示规格层已锁定，不表示目标制品已经生成或验收通过。

## Phase 与层级确认

```text
empty
  → prd-creating → prd-confirm
  → fsd-creating → fsd-confirm
  → tdd-creating → tdd-confirm
  → confirmed plan → merged
```

- `prd confirm` 只从 `prd-creating` 推进，并提交本层写入。
- `fsd confirm` 只从 `fsd-creating` 推进；没有 FSD 写入时不能从 `prd-confirm` 空确认过去。
- `tdd confirm` 只从 `tdd-creating` 推进。
- 各层 `revert` 只把本层的 confirm 回退到对应 creating，并解锁本层；不能从后续 phase 任意跳回上层。

若已进入后续层却要返工上层，应先用 `version status <v>`、`state` 和双仓 Git 状态诊断，再规划新的受控迭代；不要手工修改 phase。

各层都已确认时通常无需再执行 `version commit`；没有可提交的 working 记录会返回 `COMMIT_EMPTY`。

## 版本命令

| 命令 | 语义 |
|---|---|
| `version create <v>` | 创建唯一活动版本；不接受 `based-on` |
| `version commit <v>` | 将剩余 working 规格锁定；无 `-m`/`--message` |
| `version status <v>` | 读取指定版本状态 |
| `version confirm <v>` | 运行验收、重检、回执核对，保存确认计划，并可能提交宿主 Git |
| `version merge <v>` | 要求有效确认计划，将版本提升为基线并写 docs 标签 |
| `version revert <v> --confirm` | 经明确授权回滚版本；未合入时清理工作区，已合入时按历史锚回滚双仓并清理后续版本 |

`confirm` 不是查询，也不是旧语义中的“纯门禁、零落盘”。相关制品或宿主输入变化会使确认计划失效，必须重新 confirm。`merge` 不会自动补做 confirm。

## Revert 与历史回退

`version revert` 必须带 `--confirm`；缺少时只返回 `USAGE_ERROR`，不会给出影响预览。执行前应明确用户真正想要的是：

- 放弃尚未合入的活动版本：核对状态后用 `version revert <v> --confirm` 清理该版本工作区；
- 回滚已合入版本：先核对宿主仓与 docs 仓的提交、分支和标签，再用 `version revert <merged-v> --confirm` 按该版本保存的双仓历史锚执行回滚，并清理它之后的版本历史。

已合入版本的 revert 不是清理临时工作区，而是由 Node core 执行双仓历史回滚；它会影响并清理目标之后的版本，不能包装成无副作用的“撤销”。CLI 没有 `version list/inspect` 命令；需要时可由只读 Node API 辅助，但不应伪造 CLI 用法。

## Acceptance 与回执

`acceptance set <command>` 把项目验收命令写入本地配置；`acceptance show` 查看，`acceptance run` 手动运行。未配置时返回 `{ran:false, passed:true}`，含义是跳过，不是测试通过。

codegen receipt 把制品字节绑定到一次交付。`codegen verify --version <v>` 的外层只有 `ok`；业务 `passed` 位于 `data` 内层，并且报告策略下 `data.passed:true` 仍可能携带非空 `findings`。主编排者必须检查 findings，而不是只看退出码、外层 `ok` 或内层 `passed`。回执不证明测试质量。

版本已 merged 后，回执按合入时记录进行历史只读比较；当时的 write token 后续过期，不会反向使历史记录无效。当前目标文件另算实时指纹，偏离历史合入字节时报告 current drift。处理漂移必须创建新版本并重新 prepare/receipt/acceptance/confirm/merge，不能复用旧 token 或改写历史记录。

## Confirm 与宿主 Git

版本 confirm 可能自动提交宿主 Git，并把该宿主状态纳入确认计划。调用前应确认工作树、当前分支和预期提交范围。任何后续制品修改都需要重新 prepare/receipt/verify，并重新 confirm。

merge 使用有效计划提升 docs 基线并创建相应 AIT 标签。失败边界与回退见 [merge-engine.md](merge-engine.md)。

## Push

push 是合并后的独立操作。结果中分别检查 `host.status` 与 `docs.status`，因为失败可能位于内层 detail。默认使用当前已配置分支与远端，不强推，也不擅自创建远端；docs 侧应核对 AIT 标签是否按预期发布。
