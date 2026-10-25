# 索引与 SpecGraph

AIT 把 chunk 自身状态与 chunk 之间的关系分开保存：chunks index 描述“有哪些 chunk、位于哪里、处于什么状态”，SpecGraph 描述 `derives`、`decomposes`、`details`、`depends_on` 边。两者都由 Node core 管理，不应手工填写 YAML 来新增或修复数据。

## 基线与版本增量

- `.meta/chunks-index.yaml` 描述 `project-docs/docs/` 的基线 chunk。
- `.meta/chunks-index-<version>.yaml` 描述该版本工作区的增量记录与状态。
- `.meta/specgraph.yaml` 保存基线关系图；版本图保存该版本的关系增量。
- `docs/`、`versions/` 与 `.meta/` 都是受管目录，只能经项目 wrapper 写入。

版本视图不是另一份独立基线。查询通常把基线与指定版本或当前活动版本叠加，按 chunk ID 与关系操作形成组合视图。

## 存储图与组合查询

`specgraph query` 面向关系查询，可按 `--derives`、`--decomposes`、`--details`、`--depends-on` 与 `--version` 过滤。未显式指定版本时，活动版本存在则查询活动版本叠加基线的当前视图。

`specgraph export [--version]` 输出存储图 JSON：默认导出基线存储图，指定版本导出该版本自己的存储图；它不是组合查询结果，也不是 DOT 或 HTML 可视化。历史版本的 query 组合视图由相应基线与版本增量叠加得出，但不等于当时历史状态的不可变快照。

`deps <id> --direction in|out|both` 用于邻接查询。旧 `--deps` 选项无效。

## 事实读取入口

| 入口 | 范围与输出 |
|---|---|
| `search <q> --scope baseline|all` | 文本检索；默认只查基线，`all` 包含版本工作区 |
| `baseline-summary --scope prd|all` | 基线摘要；默认输出 YAML 数组，`--format json` 返回 JSON 包装 |
| `version status <v>` | 指定版本状态与阶段 |
| `state` | 当前活动版本面板；无活动版本返回 `NO_VERSION` |
| `specgraph validate-new-model [--version <v>]` | 图、唯一性及策略诊断；外层成功后仍需检查 `passed`、`violations`、`policy_violations`、`warnings` |

读取损坏或无法解析的索引/图时应 fail closed，不能把空结果当作“没有数据”。

## 写入与修复边界

`sync`、`reindex` 会修改受管元数据，不是只读诊断命令。执行前应确认目标与影响，并通过项目 wrapper 调用。不要通过文本编辑器直接修补索引或 SpecGraph；应回到对应的 create/decompose/confirm/revert 流程，或使用 core 提供的正式维护入口。

旧 `links-index.yaml` 与正文 `@ref` 不属于现行关系模型，不存在需要用户维护的 links-index 写入步骤。

## 原子性与权威性

core 负责将文档、索引、图与版本元数据作为一个受控变更处理。调用方应把 CLI 的结构化结果作为事实来源：stdout 通常是单个 JSON，stderr 是阶段进度 JSON 行；退出码只代表外层 `ok`，复杂命令还必须检查内层业务字段。
