# AIT Skill — Node 分发与安装

本目录是一套 AIT Skill 分发资产。运行时需要 Node.js >=22 与 `ait-core`；Skill 负责规格讨论、路由、隔离 codegen 编排和结果收口，core 负责受管文档、索引、图、版本、回执、验收与 Git 合入。

## 安装、升级与卸载

分发自带外层安装器。所有新式命令都要求显式 `--prefix`，该目录应是独立 Skill 安装目录，不能是用户主目录、卷根、源码目录或受管项目内部。安装器用 `.ait-install.json` 记录受管资产及 hash，不把开发机的缓存、临时 bundle 或路径写入分发文档。

```text
node <distribution>/skill/ait/install.mjs install --prefix <skill-dir> --core-tarball <ait-core-0.2.1.tgz>
node <distribution>/skill/ait/install.mjs check --prefix <skill-dir>
node <distribution>/skill/ait/install.mjs update --prefix <skill-dir> --core-tarball <ait-core-0.2.1.tgz>
node <distribution>/skill/ait/install.mjs uninstall --prefix <skill-dir>
```

`update` 与 `uninstall` 不直接递归删除旧目录，而是先把原安装整体移入备份目录。默认备份根为 `~/.ait-skills-backups`；可用 `--backup-dir <dir>` 指定同一文件系统上的其他位置。输出中的 `backup` 是恢复依据，确认新安装稳定前不要删除。

旧 Python AIT 安装不会被普通 update 自动覆盖。确认 prefix 是可识别的旧 AIT 安装且已安排备份后，使用：

```text
node <distribution>/skill/ait/install.mjs update --prefix <legacy-skill-dir> --replace-legacy --core-tarball <ait-core-0.2.1.tgz>
```

该操作保留旧目录的完整备份，但项目侧仍只承诺 Node 单向接管；不要继续混用 Python/Node writer。兼容入口 `node install.mjs --core-tarball <tgz>` 与 `node install.mjs --check` 仍保留，只管理安装器所在目录的 core 依赖，适合既有脚本迁移，不等同新的 prefix 生命周期。

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

## 安装器边界

从任意安全 cwd 用最终安装位置的绝对路径执行：

```text
node <absolute-skill-dir>/install.mjs --core-tarball <absolute-path>/ait-core-0.2.1.tgz
node <absolute-skill-dir>/install.mjs --check
```

兼容入口的 `--core-tarball` 只安装 core 依赖；新式 `install/update` 会复制受管 Skill 资产并安装 core。`check` 是只读检查。安装器不替换文档占位符，也不安装宿主钩子。即使 tarball 在本地，其传递依赖仍可能访问 npm 配置的 registry；完全离线须预先缓存依赖并设置 `npm_config_offline=true`。

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
- 宿主触发规则以宿主实际加载的 Skill 目录和 manifest 为准：Claude 插件读取 `.claude-plugin/plugin.json`，Codex 类宿主按其 Skill 搜索目录发现 `SKILL.md`。不要把某台机器的绝对安装路径写进分发资产。

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

在分发仓根执行 `npm test`（映射为 `node --test tests/*.test.mjs`）验证资产、真实 CLI 生命周期以及使用真实 core tarball 的离线安装、更新、回滚保护和可恢复卸载。宿主发现应另行检查：Claude 使用 `plugin validate`，Codex 使用 app-server `skills/list` 并核对实际加载路径；两者都不能替代真实模型生成验证。已安装版本以目标 prefix 的 `check` 结果为准，不能由源仓版本推断。

本轮自动化验证环境为 Windows；原生 macOS/Linux 的执行位和宿主集成尚需独立验证。未配置 acceptance 的 `{ran:false,passed:true}` 只是跳过；真实模型生成需要可用登录及执行许可。agent 语义质量、中断续跑、工具拦截和离线缓存充分性仍需各自环境验证。

## 恢复备份

卸载结果中的 `backup` 可恢复整个旧安装。恢复前确认目标 prefix 当前不存在，再把该备份目录移回原 prefix；不要从 metadata 猜测或删除其他路径。安装失败应区分 Node/PATH、npm 安装、`CORE_INSTALL_FAILED`、`NOT_MANAGED` 与切换失败，保留原始输出和 `backup` 路径。

