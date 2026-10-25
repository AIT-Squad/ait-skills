# AIT 设计总览

AIT 把稳定 ID 的 Markdown chunk、显式规格关系和生成制品绑定在一起，使 PRD、FSD、TDD 到代码或其他文件的演进可追溯。当前支持的主线是：

```text
PRD → FSD 功能树 → TDD → codegen bundle → 制品 → 验收 → confirm → merge
```

旧 Python 项目可以由 Node 版单向接管历史数据，但这不表示旧 `prdv1 → impl → task` 流程仍可执行，也不保证 Python writer 能反向读取 Node 写入的新状态。

## 三方职责

| 一方 | 负责 | 不负责 |
|---|---|---|
| Skill 与宿主 | 组织讨论、调用项目 wrapper、完整校验 bundle、创建隔离生成 agent、限制单目标写入、展示结果并取得必要授权 | 不实现索引、图、合并算法；不伪造测试或宿主集成证据 |
| `ait-core` | 解析 chunk、维护版本/索引/SpecGraph、准备 codegen 交付、校验回执、运行门禁并提升基线 | 不创建或运行生成 agent，不从回执推断某个宿主真的在执行 |
| 项目制品与工具链 | 保存目标代码/文档/测试，提供真实构建与验收结果 | 不直接改写 `project-docs` 的受管状态 |

主入口与命令契约见 [../SKILL.md](../SKILL.md)，格式权威说明见 [new-model-format.md](new-model-format.md)。

## 规格与关系

PRD 表达用户问题与可观察验收；FSD 表达功能分解与黑盒能力契约；TDD 为唯一 `target_file` 提供白盒实现规格。chunk 边界见 [chunk-system.md](chunk-system.md) 与 [chunk-parser.md](chunk-parser.md)。

现行图有四种关系：PRD 根到 FSD 根以及 PRD 需求到 FSD 功能的 `derives`，FSD split 到子 FSD 根的 `decomposes`，叶 split 到 TDD 的 `details`，同父兄弟功能之间的 `depends_on`。索引与查询见 [index-system.md](index-system.md)。

## 生成闭环

CLI `codegen prepare <TDD> [--version <v>]` 只准备仓外 bundle 指针与 `generation_token`。宿主必须核对 bytes 与 SHA-256，并完整读取 bundle；随后让隔离生成 agent 只修改该 TDD 的唯一目标。生成完成后由主编排者登记 receipt、执行 `codegen verify --version`、项目验收、`version confirm` 与 `version merge`。

回执只证明某组制品字节与交付记录绑定，不证明 agent 身份、语义质量或测试正确性。core 不会自行派生 agent。

## 治理强度

没有工具拦截接入时，Skill 的“只写目标文件、不得直改受管目录”等规则属于约定性治理。`core.guard.evaluate({toolName,input})` 是可供宿主接入的同步 Node API；CLI 没有 guard 命令。只有宿主把真实 write/edit/shell 字段映射进去并执行 block，才形成实际拦截。目标文件独占仍需宿主单独落实。

因此不能仅凭文档或回执宣称所有基线、真实宿主 UI、流程接续和 LLM 语义质量已经验收。每项结论都应有对应的运行证据。

## 运行与迁移边界

运行时要求 Node.js >=22。首次初始化从目标项目根调用 Skill 自带入口；初始化后使用 `project-docs/.ait/ait-cli`。切换包或 Node 路径时用新入口执行 `init --refresh-wrapper`。

不要直接写 `project-docs/docs`、`versions`、`.meta`，不要并行运行 Node 与旧 Python writer。合并语义与单写者要求见 [merge-engine.md](merge-engine.md)，生命周期见 [version-manager.md](version-manager.md)。
