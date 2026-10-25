# Chunk 合并与基线提升

AIT 按 chunk 更新规格文件。调用方只声明实际新增或变化的 chunk；未出现在版本增量中的基线 chunk 必须保留。本文描述可观察语义，不暴露旧 Python dataclass 或内部实现 API。

## `modify` 与 `add`

- `modify` 替换目标 chunk 的完整正文。要保留的标题、用户故事、验收标准和说明必须包含在新正文中。
- `add` 只用于基线不存在的 chunk；命中既有 ID 时以 `DUPLICATE_BASELINE_CHUNK` 拒绝。
- 未在本次输入中出现的同文件 chunk 原样保留，省略不等于删除。
- modify 指向尚不存在的目标时可按新增处理，但不得造成 ID 或目标文件归属冲突。

内部 split 的 ID 是稳定锚点，不支持用 `overrides` 改名。`overrides` 只用于根 chunk 重命名；若新名称撞上既有 ID，报 `MODIFY_RENAME_COLLISION`，多个记录指向同一目标则报 `DUPLICATE_OVERRIDES_TARGET`。

## 从确认计划到合并

`version confirm <v>` 不是只读查询。它执行验收与全局重检，核对 codegen 回执，生成并保存确认计划，并可能提交宿主仓库。计划绑定确认时的规格、制品和宿主状态；任何相关输入变化都会使计划过期。

`version merge <v>` 只接受有效确认计划，然后把版本增量提升到基线并写入相应文档、索引、SpecGraph 和版本元数据。merge 不会自动替用户补做 confirm；计划缺失或过期时应重新确认。

## 失败与回退边界

合并前后的具体失败以返回的 `code`、`error` 与内层 detail 为准。core 会在其受控写入阶段失败时恢复受管文档和元数据，避免留下部分基线提升；宿主 Git 提交失败会作为合并失败处理。

不要把这一保证扩大为“所有外部副作用均已撤销”：验收命令、外部服务、远端仓库或宿主工具可能有自身副作用，必须按它们的真实结果处理。只有拿到成功结果并核对业务字段，才能认为合并完成。

## 只读诊断

合并前可使用：

- `version status <v>` 查看阶段与记录状态；
- `state` 查看活动版本进度；
- `specgraph validate-new-model [--version <v>]` 检查组合视图；
- `codegen verify --version <v>` 检查制品回执 findings；
- `acceptance show` 查看验收配置。

这些检查不会替代 confirm。`sync`、`reindex` 是写操作，不应作为无风险诊断。

## 单写者原则

同一受管项目应只有 Node core 作为 writer。不要直接编辑 `project-docs/docs`、`versions`、`.meta`，也不要让旧 Python writer 与 Node writer 并行修改历史。旧项目迁移只承诺 Node 单向接管。

发布或 push 是合并后的独立动作。合并成功不等于远端已发布；检查 push 结果时分别核对 host 与 docs 的内层状态，不强推，也不擅自创建远端。
