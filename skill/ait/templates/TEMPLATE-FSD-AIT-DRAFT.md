<!-- @id:[FSD]-{semantic_name} -->
## {功能域名称}

<!-- @summary: 用一句话说明本功能域的职责边界 -->

<!-- 写作规约：
     1. FSD 描述功能行为和对外能力，不写内部实现。
     2. 内容须自包含，并明确反向要求。
     3. 派生根通过 fsd create --parent 从 PRD 根建立 derives；子 FSD 通过 fsd decompose 建立 decomposes。
     4. 叶功能 split 通过 tdd create --parent 建立 details；同父兄弟依赖在功能 split 的临时 YAML 中声明 depends_on。 -->

### 功能描述

{详细说明本功能域承接的上游需求、负责的行为与关键约束。}

### 反向要求

- {本域明确不实现的功能}
- {本域不涉及的职责及其归属}

### 分解视图

- {功能块名称}：{单一职责；说明其继续 decomposes 到子 FSD，或作为叶 split details 到 TDD}

---

<!-- @id:[FSD]-{semantic_name}:{split_name} -->
## {功能块名称}

<!-- @summary: 用一句话说明该功能块的单一职责 -->

```yaml
derives: ["[PRD]-{semantic_name}:{requirement_name}"]
depends_on: []
```

<!-- 上述 YAML 是创建或修改本功能 split 时的临时关系声明：
     derives 必须指向实际承接的完整 PRD 需求 ID；只有功能 split 才声明 derives。
     depends_on 只填写同父兄弟的短名。省略该键会保留已有边，显式 [] 会清除本次声明拥有的同类边。 -->

### 功能描述

{说明该块提供的行为、输入输出边界、关键约束和错误语义。}

### 反向要求

- {该块明确不实现或不负责的职责及其归属}

### 能力契约

- **提供方式**：{HTTP 端点 / 模块函数 / CLI 命令 / 事件 / 文档制品}
- **输入**：{输入字段、类型、校验与前置条件}
- **输出**：{成功结果、状态或制品}
- **错误边界**：{稳定错误语义、无部分结果保证与恢复入口}

---

<!-- @id:[FSD]-{semantic_name}:TEST -->
## TEST 集成验收

<!-- :TEST 只描述本 FSD 文件整体的集成级可验证行为，不声明 derives。
     测试制品由单独 TDD 通过 details 归属到 :TEST；功能 split 的实现 TDD 归属到对应功能 split。 -->

1. WHEN {本域跨块的正常端到端流程} THEN 系统 SHALL {可由集成测试验证的整体结果}。
2. IF {跨块异常或边界} THEN 系统 SHALL {稳定且可观察的处理结果}。
3. WHEN {重复执行或状态恢复场景} THEN 系统 SHALL {可验证的不变性或幂等结果}。
