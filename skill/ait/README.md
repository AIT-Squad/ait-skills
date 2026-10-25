# AIT Skill — Node 分发与安装

本目录是一套 AIT Skill 分发资产。运行时需要 Node.js >=22 与 `ait-core`；Skill 负责规格讨论、路由、隔离 codegen 编排和结果收口，core 负责受管文档、索引、图、版本、回执、验收与 Git 合入。

## 手工分发

当前没有外层自动复制或卸载器。把整个 `skill/ait/` 分发资产复制到用户选择的独立 Skill 安装目录，保持目录结构和文件名大小写；不要复制开发机的 `node_modules/`、运行缓存或临时 bundle。安装位置不要放进某个受管项目的 `project-docs`。

主要资产：

```text
ait/
├── SKILL.md
├── README.md
├── install.mjs
├── bin/ait
├── bin/ait.cmd
├── agents/codegen-generator.md
├── sub-skills/ait-state/SKILL.md
├── sub-skills/ait-resume/SKILL.md
├── references/
├── templates/
└── .claude-plugin/plugin.json
```

POSIX 复制后确保 `bin/ait` 有执行位。`.claude-plugin/plugin.json` 只提供本地插件描述；本仓测试不证明任意客户端已加载插件，也不证明宿主会自动发现嵌套 agent。

## 安装 core

从任意安全 cwd 用最终安装位置的绝对路径执行：

```text
node <absolute-skill-dir>/install.mjs --core-tarball <absolute-path>/ait-core-0.2.0.tgz
node <absolute-skill-dir>/install.mjs --check
```

`install.mjs --core-tarball` 只安装 Skill 的 core 依赖；`--check` 是只读检查。它不会复制 Skill、替换文档占位符或安装宿主钩子。即使 tarball 在本地，其 `yaml`、`zod` 等传递依赖仍可能访问 npm 配置的 registry；完全离线须预先缓存依赖并设置 `npm_config_offline=true`。

core 包版本以 `install.mjs --check` 或已安装 package.json 为准。AIT CLI 的 `--version` 返回当前项目的文档版本，不是 npm 包版本或数据格式版本。

## 初始化或接管项目

保持 cwd 为用户项目根，不要 `cd` 到 Skill 目录。首次初始化调用最终安装位置的绝对入口：

```text
Windows: C:\absolute\path\to\ait\bin\ait.cmd init --name demo
POSIX:   /absolute/path/to/ait/bin/ait init --name demo
```

初始化后使用项目本地 wrapper：

```text
Windows: project-docs/.ait/ait-cli.cmd <command>
POSIX:   project-docs/.ait/ait-cli <command>
```

安装位置、core 或 Node 路径改变后，在项目根用新的绝对入口执行 `init --refresh-wrapper`。已有旧运行时项目先执行 `init --check` 核对骨架、索引、图、根文档和入口，再刷新 wrapper。接管保留历史规格和 Git 记录，但只承诺 Node 单向接管；不要混用 Python/Node writer，也不保证旧运行时反向读取 Node 扩展数据。

## 宿主集成事实

- 主指令在 [SKILL.md](SKILL.md)。状态与恢复分别在 [sub-skills/ait-state/SKILL.md](sub-skills/ait-state/SKILL.md) 和 [sub-skills/ait-resume/SKILL.md](sub-skills/ait-resume/SKILL.md)。
- codegen agent 定义是 [agents/codegen-generator.md](agents/codegen-generator.md)。宿主需要明确加载或注入它；并非所有宿主都会自动发现嵌套 agent。
- Markdown 指令不等于工具钩子。`core.guard.evaluate` 只有宿主真实接入并执行 `block` 时才强制拦截；本文不宣称已安装 guard 或单文件权限沙箱。
- `AIT_CORE_BIN` 可覆盖 core 入口；默认 wrapper 使用 Skill 自身 `node_modules/ait-core/dist/src/bin.js`。

## 维护资产

7 个 references：

- [references/new-model-format.md](references/new-model-format.md)
- [references/chunk-system.md](references/chunk-system.md)
- [references/chunk-parser.md](references/chunk-parser.md)
- [references/index-system.md](references/index-system.md)
- [references/version-manager.md](references/version-manager.md)
- [references/merge-engine.md](references/merge-engine.md)
- [references/overview.md](references/overview.md)

3 个文档模板：

- [templates/TEMPLATE-PRD-AIT-DRAFT.md](templates/TEMPLATE-PRD-AIT-DRAFT.md)
- [templates/TEMPLATE-FSD-AIT-DRAFT.md](templates/TEMPLATE-FSD-AIT-DRAFT.md)
- [templates/TEMPLATE-TDD-AIT-DRAFT.md](templates/TEMPLATE-TDD-AIT-DRAFT.md)

其他元数据或测试 fixture 不是用户分发入口。

## 开发验证与限制

在分发仓根执行 `npm test`（或其实际映射的 `node --test tests/asset-contracts.test.mjs`）验证资产契约。只有真实命令成功才可声称通过；未配置 acceptance 的 `{ran:false,passed:true}` 只是跳过。真实宿主加载、agent 语义质量、中断续跑、插件客户端兼容和离线缓存充分性仍需各自环境验证。

## 手工卸载

确认路径是用户选择的独立 Skill 安装目录后，只删除该目录。不要删除任何项目代码或 `project-docs`；项目版本应通过 AIT 生命周期处理。`node_modules` 位于该安装目录内，可随目录一并移除，但此操作不可恢复，执行前应再次核对绝对路径。

