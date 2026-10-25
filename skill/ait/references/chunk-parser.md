# Chunk 解析规则

本文面向规格作者说明 Node 版 AIT 的 Markdown 解析边界。解析器负责识别 chunk 语法；内容契约、关系合法性和全局图不变式由后续门禁负责。

## 有效的 `@id`

有效标记必须独占一行：

```markdown
<!-- @id:[FSD]-catalog:search -->
## 搜索能力

正文……
```

从该标记起，到下一个有效标记之前的所有文本都属于同一 chunk。第一个标记前是文件头。标题级别不会建立嵌套边界，因此 `##`、`###` 只影响展示，不改变 chunk 切分。

## 围栏屏蔽

代码围栏中的 `@id` 只是示例，不能被识别。需要展示包含三反引号围栏的 Markdown 时，用四反引号包住外层示例：

````markdown
<!-- @id:[FSD]-app:store -->
## 存储

```yaml
depends_on: [config]
```
````

解析器需要正确跟踪围栏开闭，不能把围栏内部的注释当作真实标记。

## 错误与分层门禁

- 非法 ID 或同一输入中的重复 ID 会被拒绝，不能依赖后续合并消歧。
- 缺少标题属于内容质量问题；标题本身不是解析边界。
- PRD 用户故事与 EARS 验收、TDD `target_file` 等属于内容门禁。
- 幽灵端点、多父、重复制品路径、环和孤儿属于 SpecGraph 或版本确认门禁。

语法解析成功不代表内容或关系已经合法。完整格式见 [new-model-format.md](new-model-format.md)。

## `@summary` 与关系声明

`@summary` 是可选摘要。它可用于检索，但不得据此省略 chunk 的完整正文，也不能把摘要当作合并内容。

正文不使用旧 `@ref`、`@extract` 创建现行关系。FSD split 中允许临时 YAML 键 `derives`、`depends_on`，写入时由入口消费并移入 SpecGraph；省略某键保留已有对应边，显式 `[]` 清除该声明所拥有的边。

## 内容输入

CLI create 命令可接收 `--content` 或 `--content-file`，两者互斥。`--content-file` 必须是 UTF-8 文本；Node API 接收完整的 `content` 字符串。修改单个 split 时只需传请求修改的完整 chunk，不要求重传同文件根或其他未改 chunk。

大文本经文件或工具传输时，磁盘 SHA-256 与字节数匹配只证明源文件完整。调用方仍须完整读取，或按不重叠、无缺口的分段拼接，确认模型输入没有被工具输出上限截断。

本文不承诺内部 TypeScript API 名称为公共接口，也不提供旧 Python 类或函数的调用方式。
