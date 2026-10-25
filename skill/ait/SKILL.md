---
name: ait
description: INVOKE THIS SKILL when the user types /ait followed by a subcommand. AIT 以 Node ait-core 管理 chunk 级规格版本，并编排 prd→fsd→tdd→codegen→receipt→acceptance→merge。
---

# AIT — Node 版规格驱动文档版本控制

AIT 的主线是 `PRD → FSD → TDD → codegen → artifact → receipt → acceptance → confirm → merge`。Skill 负责讨论、写作纪律、路由、完整 bundle 校验、隔离生成与宿主边界；Node `ait-core` 负责受管规格、索引、SpecGraph、版本门禁、回执、验收和 Git 合入。

## 入口与运行契约

- 需要 Node.js >=22。首次入口必须从“当前加载的本 `SKILL.md` 的绝对目录”解析：Windows 调同目录 `bin/ait.cmd`，POSIX 调 `bin/ait`。保持 cwd 为目标项目根；不要切到 Skill 目录执行用户项目初始化，也不要依赖占位符或未定义环境变量。
- 初始化后从包含 `project-docs/` 的项目根优先使用 `project-docs/.ait/ait-cli.cmd`（Windows）或 `project-docs/.ait/ait-cli`（POSIX）。包或 Node 路径变化时，用新的 Skill 绝对入口执行 `init --refresh-wrapper`；它只刷新 wrapper，不清理历史 `config.local.yaml` 字段。
- `AIT_CORE_BIN` 可显式覆盖 core 入口。Skill 自带 wrapper 默认寻找自身 `node_modules/ait-core/dist/src/bin.js`。
- 不直接写 `project-docs/docs`、`project-docs/versions` 或 `project-docs/.meta`。仓外草稿通过正式 create 输入。
- stdout 通常是单个 `{ok:true,data}` / `{ok:false,code,error}` JSON；stderr 可输出阶段 progress JSON 行；exit 0/1 只反映外层 `ok`。例外：`baseline-summary` 默认成功输出 YAML 数组，`--format json` 才返回 JSON。
- 开发中的常规写入、提交和合入延续用户已授权的目标，不逐条重复询问。回滚、删除或外部发布须匹配具体授权；仅查询状态的请求不会触发这些写操作。

首次初始化示意（`<skill-dir>` 必须由宿主从实际加载文件位置解析）：

```text
Windows: <skill-dir>\bin\ait.cmd init --name <project_name>
POSIX:   <skill-dir>/bin/ait init --name <project_name>
```

`init --check` 的内层 `{ok,missing}` 只检查骨架、索引/图、根文档和入口，不替代图与元数据完整性验证。CLI `--version` 是文档版本信息，不是 npm 包版本；包版本用 `node <skill-dir>/install.mjs --check` 或读取已安装 package.json。

## 需求演进与写作纪律

- 新诉求先比较既有 PRD 需求：角色与业务价值可共用同一句用户故事时，默认 `modify` 原 chunk 并增加/调整验收标准；确实不能共用才 `add`，并说明理由。
- PRD 根 chunk 写概述、范围、目标/度量与反向要求，不写验收标准。每个 PRD 需求 chunk 必须有 `**用户故事:** 作为…我希望…以便…` 和 `#### 验收标准` 下的编号 EARS 条目。
- 一个需求约超过 10 条验收标准或跨越 3 个以上功能域才考虑显式拆分；取代关系双向标注，`derives` 随承载范围维护，稳定 id 不因标题演进而改名。
- PRD 只描述用户级可观察行为；FSD 定义黑盒能力与文件级集成验收（`:TEST`）；TDD 定义唯一 target_file 的文件级白盒实现与单测要求。
- `--content` / `--content-file` 互斥。正文只放请求所需根 chunk 自身和本次新增或变化的完整 chunk；省略既有 chunk 不等于删除。已存在 ID 默认 modify，不要用 add 重传。

## 分层流程

```text
version create <v>
prd create <id>                         # 无正文取背景/context_token
prd create <id> --content-file <f> --context-token <token>
prd confirm
fsd create <id> --parent <prd-root> ...
fsd decompose <parent-split> <child-root> ...
fsd confirm
tdd create <id> --parent <leaf-split> ...
tdd confirm
codegen prepare <tdd-root> [--version <v>]
隔离 agent 生成唯一 target_file
codegen receipt --generation-token <token>
codegen verify --version <v>
acceptance run
version confirm <v>
version merge <v>
```

三层 create 在写正文前先无正文获取讨论背景与 token，再以同一意图、目标、父锚点、文件、action 和 overrides 写入。显式跳过讨论时才用 `--skip-context`。layer create/confirm/revert 与 `fsd decompose` 不接受 `--version`；先完成本层写入再 confirm，按 PRD→FSD→TDD 逐层推进。逐层 confirm 通常已提交变更，额外 `version commit` 可能返回 `COMMIT_EMPTY`。

`version confirm <v>` 会运行验收、重检、保存确认计划，并可能提交宿主 Git，绝非只读查询。merge 依赖有效确认计划并提升基线。`version revert <v> --confirm` 才执行回滚；不带 `--confirm` 只报用法错误，不提供预览。`backfill-tags` 无位置参数。

## 图与命令事实

- PRD 根→FSD 根 `derives` 一对一；PRD 需求→FSD 功能 split `derives` 多对多；FSD split→子 FSD 根 `decomposes`；叶 split→TDD `details`；同父兄弟 split 之间 `depends_on`。
- FSD split 临时 YAML 中 `derives` 用完整 PRD ID，`depends_on` 用兄弟短名；合法键写入后消费到图。省略某关系键保留现有边，显式 `[]` 清除该 chunk 声明的该类边，但不清除命令出生边。`:TEST` 不作 derives 目标，测试 TDD 可 details 到 `:TEST`。
- `search <q> --scope baseline|all`；`baseline-summary --scope prd|all`；`deps <id> --direction in|out|both`；`specgraph query` 使用 `--derives/--decomposes/--details/--depends-on/--version`；`specgraph export [--version]` 输出存储图 JSON，不是 DOT 或组合视图。
- 不存在通用 help、graph-html、signal/cancel 或 CLI guard 命令。`sync`、`reindex` 是写操作，不用于只读诊断。

## Codegen 隔离与收口

CLI `codegen prepare` 只返回仓外 bundle 指针：`bundle_path,sha256,bytes,version,target_file,tdd_root,source_file,generation_token`，并写交付元数据；它不写业务代码、不调用模型、不创建 agent。内存 `content/target_state` 仅属于 Node API delivery.prepare 的 memory 模式。

1. 核对磁盘 bytes/SHA-256，再完整读取 bundle；大文件分段拼齐。磁盘 hash 正确不能证明模型上下文未截断。缺失、损坏或目标 unreadable 时停止。
2. 按 [agents/codegen-generator.md](agents/codegen-generator.md) 派生隔离 agent；项目规格输入只能是该目标完整 bundle。agent 可最少读取接口代码/既有测试作技术参考，只能写唯一 target_file。
3. 目标稳定并完成适当测试后，主编排者用 generation_token 登记 receipt；agent 不自行 prepare/receipt/confirm/merge。
4. 运行 `codegen verify --version <v>`，不能只看外层 ok 或 report 的 passed；必须核对 enforcement 与 findings 为空。
5. 运行 `acceptance run` 并核对 `ran/passed/exitCode`。`ran:false,passed:true` 是跳过，不是测试通过。
6. 最后按授权 confirm，再 merge。重复 prepare 或后续制品变化会使旧 token/字节绑定失效，须重新交付、核对、验证与登记。

Node core 不创建 agent。同步 API `core.guard.evaluate({toolName,input})` 只有宿主真实接入、映射工具字段并执行 `block` 时才有拦截效果；普通 Markdown Skill 只能形成约定性治理，不能声称钩子已安装或单文件权限已强制。

## 结果判读与恢复

- 图诊断：外层成功后看 `passed`、`violations`、`policy_violations` 与 warnings。
- push：检查内层 host/docs 状态与 detail，不能只看 code/退出码。
- 配置或索引不可读时保留原始定位，不降级为空配置，不用 sync/reindex 掩盖。
- 状态面板、版本进度与 chunk 三态使用 [sub-skills/ait-state/SKILL.md](sub-skills/ait-state/SKILL.md)。
- CLI 失败与中断恢复使用 [sub-skills/ait-resume/SKILL.md](sub-skills/ait-resume/SKILL.md)。

## References：何时读取

- [references/new-model-format.md](references/new-model-format.md)：写 PRD/FSD/TDD、ID、章节、关系与 target_file 时必读。
- [references/chunk-system.md](references/chunk-system.md)：划分 chunk、维护稳定 ID 或识别旧引用残留时读；旧关系注释不作为当前建边入口。
- [references/chunk-parser.md](references/chunk-parser.md)：诊断 Markdown 解析边界、围栏与标题归属时读。
- [references/index-system.md](references/index-system.md)：分析 chunks-index、specgraph、关系所有权与元数据时读。
- [references/version-manager.md](references/version-manager.md)：版本三态、phase、confirm/merge/revert 与恢复时读。
- [references/merge-engine.md](references/merge-engine.md)：理解按 chunk 合并、省略保留和原子回滚时读。
- [references/overview.md](references/overview.md)：需要系统边界和整体心智模型时读。

模板：[templates/TEMPLATE-PRD-AIT-DRAFT.md](templates/TEMPLATE-PRD-AIT-DRAFT.md)、[templates/TEMPLATE-FSD-AIT-DRAFT.md](templates/TEMPLATE-FSD-AIT-DRAFT.md)、[templates/TEMPLATE-TDD-AIT-DRAFT.md](templates/TEMPLATE-TDD-AIT-DRAFT.md)。模板是骨架，不替代讨论和规格判断。

## 历史与范围边界

旧 Python 管理的项目只承诺由 Node 单向接管：先 `init --check`，再由新入口 `init --refresh-wrapper`；保留历史规格、索引、图与 Git 历史，不混用两套 writer，也不保证旧运行时反向读取 Node 扩展数据。中途流程接续、真实宿主 UI 加载、插件发现与 LLM 语义质量必须独立验证，不能仅凭文档宣称完成。

