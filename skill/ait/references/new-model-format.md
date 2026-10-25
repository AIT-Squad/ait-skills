# PRD / FSD / TDD 格式规范

本文是 AIT Node 0.2.0 规格写作与结构约定。代码门禁只强制明确列出的契约；模板中的“反向要求”等章节属于写作约定，不能泛称为 core 对所有章节的强制验证。

直接使用模板：[PRD](../templates/TEMPLATE-PRD-AIT-DRAFT.md)、[FSD](../templates/TEMPLATE-FSD-AIT-DRAFT.md)、[TDD](../templates/TEMPLATE-TDD-AIT-DRAFT.md)。

## 模型与六项不变式

```text
[PRD] 根 ──derives──▶ [FSD] 根
[PRD] 需求 ──derives──▶ [FSD] 功能 split（多对多）
[FSD] split ──decomposes──▶ 子 [FSD] 根
叶 [FSD] split ──details──▶ [TDD] 根 ──target_file──▶ 唯一制品
同父 [FSD] split ──depends_on──▶ 兄弟 split
```

门禁维护以下完整性：

1. 每个 PRD 根恰好派生一个 FSD 根；这不限制 PRD 需求到 FSD 功能 split 的多对多 `derives`。
2. 每个 TDD 恰有一个 `details` 父，并声明一个制品路径。
3. 每个归一化制品路径只由一个 TDD 持有。
4. 所有关系端点都是真实存在的 chunk。
5. 除允许的规格树根外没有孤儿 chunk。
6. 每个制品都能沿 TDD、FSD 树追溯到 PRD，树关系不能成环。

## ID、文件与安全路径

- 根 ID：`[PRD]-<name>`、`[FSD]-<name>`、`[TDD]-<name>`。
- split ID：`<根 ID>:<split_name>`；普通 split 使用小写字母、数字和下划线，FSD `:TEST` 是保留标记。
- 根文件名默认与根 ID 对应；显式 `--file` 可在当前层合法范围内覆盖默认位置。`--file` 只接受当前层允许的相对前缀及可选 `.md`，拒绝绝对路径、越界和跨 kind 写入。
- split 默认写回父根所在文件。同文件修改 split 时只提交被请求修改的完整 chunk，不必重传根；未出现的 chunk 保留。
- 内部 split ID 稳定，不支持改名；根 ID 才能通过 `--overrides` 受控重命名。

## Chunk 与输入语义

`<!-- @id:... -->` 必须独立成行。标题不是边界，代码围栏中的示例标记不生效。`--content` 与 `--content-file` 互斥；有正文的 create 必须携带此前讨论背景返回、且与当前意图一致的 `context_token`，明确跳过讨论时才使用允许的 skip 选项。

默认 action 根据基线是否已有 ID 选择 modify 或 add。`modify` 是整个 chunk 的完整替换；`add` 遇到既有 ID 会拒绝。省略其他既有 chunk 会保留它们。

## 四种关系及其出生地

| 关系 | 合法端点 | 维护入口 |
|---|---|---|
| `derives` | PRD 根→FSD 根；PRD 需求→FSD 功能 split | 根边由 `fsd create --parent` 建立；需求边由 FSD split 临时 YAML 声明 |
| `decomposes` | FSD split→子 FSD 根 | `fsd decompose <parent> <child>` |
| `details` | 叶 FSD split→TDD 根 | `tdd create <id> --parent <split>` |
| `depends_on` | 同一 FSD 根下的兄弟功能 split | FSD split 临时 YAML 声明 |

一个 FSD split 不能同时拥有 `decomposes` 子和 `details` 子。`:TEST` 不是 `derives` 目标，但测试 TDD 可以 `details` 到 `:TEST`。

关系 YAML 是写入指令，合法键被消费后移入 SpecGraph。每个 chunk、每种关系分别对账：省略键保留已有边，显式 `[]` 清除该声明所拥有的边；空数组不清除由 create/decompose 命令建立的结构边。`depends_on` 可用兄弟短名，`derives` 使用完整 PRD ID。

展示含 YAML 围栏的完整 Markdown 时，外层使用四反引号：

````markdown
<!-- @id:[FSD]-checkout:submit -->
## 提交订单

### 功能描述

提交已校验的订单。

```yaml
derives: ["[PRD]-shop:place_order"]
depends_on: [validate, store]
```
````

旧 `@ref`、`@extract` 与 `links-index.yaml` 不建立现行关系。

## PRD 写作

PRD 根写问题、范围、目标与度量，可按模板写“不包含”。每个 PRD 需求 chunk 必须包含：

```markdown
**用户故事:** 作为 <角色>，我希望 <能力>，以便 <价值>。

#### 验收标准

1. WHEN <触发> THEN 系统 SHALL <可观察行为>。
2. IF <异常> THEN 系统 SHALL <可观察处理>。
```

这是代码强制的写时契约；根 chunk 不受该要求。PRD 只写用户问题和可观察行为，不写函数、JSON 内部结构或回退算法。

需求演进默认 modify：若新诉求与既有需求的角色和用户价值相同，就复用同一句用户故事并更新验收标准。只有无法共用用户故事时才新增 chunk。约在验收条目超过 10 条或派生到超过 3 个功能域时再考虑显式拆分。被取代与取代方都要标注管辖权移交；需求范围扩展时维护多对多 `derives`，不要为了建边而复制需求。

## FSD 写作

每个 FSD 文件建议包含：一个 root、若干功能 split、一个 `:TEST`。

- root：功能域职责、反向要求和分解视图。
- 功能 split：功能描述、反向要求和黑盒能力契约；说明提供方式、参数、返回结构与错误语义，不写内部算法，也不在正文描述依赖。
- `:TEST`：覆盖本文件各功能组合后的文件级集成验收。功能 split 不重复写集成验收。

这是写作分层；除显式门禁外，不应宣称 core 强制每个文字章节。PRD 用户验收、FSD 文件集成验收和 TDD 单元测试互不替代。

## TDD 写作与唯一目标

TDD 根必须包含：

```yaml
target_file: path/to/artifact
```

路径归一化后全局唯一。TDD 说明该文件的技术栈、职责与不负责项、内部结构、核心算法、错误边界和单元测试要求；一个 TDD 只负责一个文件。AIT 本身使用 Node 不意味着目标制品不能是 Python 或其他技术栈。

## 层级生命周期

先 `version create <v>`，再严格自顶向下：

```text
empty → prd-creating → prd-confirm
      → fsd-creating → fsd-confirm
      → tdd-creating → tdd-confirm
      → version confirm 计划 → version merge → merged
```

每层 confirm 只从对应 creating 推进，且该层必须实际有写入。每层 revert 只回退同层 confirm，不能从后续阶段任意跳到上层。各层已经确认后通常不需额外 `version commit`。

`version confirm` 会执行验收与重检、保存确认计划，并可能提交宿主 Git；它不是只读查询。`version merge` 需要仍有效的确认计划，负责提升基线。`version revert <v> --confirm` 用于经授权放弃未合入版本；缺少 `--confirm` 只得到用法错误，不会生成影响预览。

## 查询与诊断

- `search <q> --scope baseline|all`：文本检索，默认基线。
- `baseline-summary --scope prd|all`：基线摘要。
- `deps <id> --direction in|out|both`：邻接关系。
- `specgraph query`：按四类关系及版本查询组合视图。
- `specgraph export [--version]`：存储图 JSON；默认基线，不是 DOT 或任意历史快照。
- `specgraph validate-new-model [--version]`：诊断图与策略；外层成功后仍检查 violations、policy violations 和 warnings。

`sync`、`reindex` 是写操作，不能当作只读诊断。读取损坏应停止，不把空结果当成功。

## Codegen 交付

CLI `codegen prepare <TDD> [--version]` 返回仓外 bundle 指针：`bundle_path`、`sha256`、`bytes`、`version`、`target_file`、`tdd_root`、`source_file`、`generation_token`。目标现状 `loaded`、`absent` 或 `unreadable` 写在 bundle 中；不可读时停止。

生成流程：

1. 核对磁盘 bundle 的字节数和 SHA-256。
2. 完整读取 bundle，或无缺口分段拼齐；校验文件不等于模型已经收到全文。
3. 让隔离生成 agent 仅以该 bundle 作为项目规格，且只改唯一目标文件。
4. 由主编排者登记 generation receipt，执行 `codegen verify --version` 并确认 findings 为空。
5. 运行真实项目验收，随后重新 `version confirm`，最后 merge。

重复 prepare 会使旧令牌与回执失效；制品后续变化也要求重新交付、核对和登记。回执证明字节绑定，不证明 agent 身份或测试正确性。core 不创建 agent。

## 运行与治理边界

运行时要求 Node.js >=22。首次引导必须从目标项目根调用 Skill 自带 `bin/ait.cmd` 或 `bin/ait`；初始化后使用 `project-docs/.ait/ait-cli`。`AIT_CORE_BIN` 可显式覆盖 core 入口；切换路径后用新入口执行 `init --refresh-wrapper`。

不要从 Skill 目录初始化用户项目，不要依赖未替换占位符或未定义宿主变量。不要直接写 `project-docs/docs`、`versions`、`.meta`。旧 Python 项目只支持 Node 单向接管，不能让两套 writer 并行。

guard 只有在宿主接入同步 Node API、映射真实 write/edit/shell 字段并执行 block 时才是强制拦截；CLI 没有 guard 命令。没有 hook 时，Skill 规则是约定性治理，不能宣称普通文档自动阻止越界写入。
