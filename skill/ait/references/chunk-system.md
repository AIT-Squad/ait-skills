# Chunk 体系

Chunk 是 AIT 管理规格的最小单元。现行模型只处理 PRD、FSD、TDD 文档中的 `<!-- @id:... -->` chunk；关系存放在 SpecGraph，不再通过正文里的 `@ref`、`@extract` 或 `links-index.yaml` 建立。

## 标记与边界

每个 chunk 从独立一行的 `@id` 标记开始，到下一个有效 `@id` 标记之前结束；最后一个 chunk 延伸到文件末尾。第一个标记之前的文本是文件头。标题只是正文的一部分，不决定边界。

```markdown
<!-- @id:[PRD]-library:book_entry -->
## 图书录入

这里是完整正文。
```

- `@id` 标记属于 chunk 内容，更新和合并时保留。
- 代码围栏中的示例标记不产生 chunk。
- 同一文档不得出现重复 ID；非法或重复 ID 会在解析或写入检查中报错。
- `@summary` 可以提供检索摘要，但不是必需字段，也不能代替完整正文。

解析细节见 [chunk-parser.md](chunk-parser.md)。

## ID 与结构

- 根：`[PRD]-<name>`、`[FSD]-<name>`、`[TDD]-<name>`。
- split：`<根 id>:<split_name>`；普通 split 使用小写字母、数字与下划线。
- FSD 的 `:TEST` 是保留的大写 split，用于文件级集成验收。
- 根文件名默认与根 ID 对应，显式 `--file` 可在当前层的合法相对路径内覆盖默认位置；ID 是稳定锚点，标题可以随职责演进。

完整格式、安全的 `--file` 规则和关系基数见 [new-model-format.md](new-model-format.md)。

## 完整更新与省略保留

一次 `modify` 替换的是被修改 chunk 的完整正文，因此该 chunk 仍需保留的内容必须随本次输入一起提交。与此同时，`--content` 中没有出现的其他既有 chunk 会自然保留；无需复制整个文件。

`@summary` 或关系 YAML 的省略同样不表示删除：

- 省略 `@summary` 不删除 chunk 正文。
- 对某类关系不写声明，保留该 chunk 已有的对应边。
- 显式写空数组才清除本次声明所拥有的该类边；命令入口创建的结构边不由空数组清除。

合并语义见 [merge-engine.md](merge-engine.md)。

## 需求演进

PRD 需求优先复用既有 chunk。判断标准是新诉求能否与既有需求共用同一句用户故事，即角色与用户价值是否一致：一致时修改既有 chunk，补充或替换验收标准；不一致时才新增需求 chunk。

这样可以避免同义需求、重复 ID 和互相矛盾的约束。被新规则取代的验收标准应在新旧两侧写明管辖权移交；ID 保持稳定，由标题和正文表达范围变化。

## 关系不写在正文里

现行关系只有 `derives`、`decomposes`、`details`、`depends_on`，由各层 create/decompose 入口或 FSD split 中一次性 YAML 声明维护。合法声明被消费后写入 SpecGraph，不作为永久关系标记留在正文。

旧项目中的 `@ref`、`@extract` 和 `links-index.yaml` 只属于历史只读兼容数据。不要用它们创建、修复或推断现行关系，也不要直接编辑 `.meta` YAML。
