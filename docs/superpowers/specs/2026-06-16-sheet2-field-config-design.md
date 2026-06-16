# sheet2 字段配置驱动数据模型创建 — 设计文档

- 日期: 2026-06-16
- 范围: 在批量创建数据模型时，依据 Excel 第 2 个 sheet 的字段配置表，覆盖每张表字段的归类与属性设置
- 状态: 已与宿主确认方向，待 review

## 1. 背景与目标

当前批量工具在「为数据源创建数据模型」环节，对所有字段采用**纯自动规则**:
`string → 维度`，其余 → 度量（聚合默认 SUM），别名沿用真实字段名。

宿主希望支持按 Excel sheet2 预先维护一份「字段级配置表」，批量创建模型时按配置覆盖字段属性，做到字段归类、别名、备注、隐藏、单位可控。

目标: sheet2 可选，配了就按配置覆盖，没配（或文件无 sheet2）则保持现有自动行为不变。

## 2. 现状分析

涉及文件:
- `electron/services/excel-parser.ts` — `parseExcel` 仅读 `wb.SheetNames[0]`，不涉及 sheet2
- `electron/services/sugar-api.ts` — `getTableSchema` / `buildModelSavePayload` / `saveDataModel`，字段属性结构已逆向完整
- `electron/ipc/batch.ipc.ts` — `createModelsForDatasource` 编排创建流程
- `src/types/index.ts` — `ParseResult` / `BatchParams` 类型
- `electron/ipc/file.ipc.ts` — `file:parseFile` 暴露解析能力

关键结论: **Sugar BI 侧接口已完全够用**（`getTableSchema` 取结构、`saveDataModel` 存任意配置），字段维度/度量对象的属性结构（`alias`/`defaultAggregator`/`format`/`isHidden`/`convert` 等）已在 `buildModelSavePayload` 中定义。本次无需新增任何 HTTP 接口或抓包，**纯属代码层扩展**。

## 3. 设计决策

| # | 决策 | 结论 |
|---|---|---|
| D1 | 匹配粒度 | 「数据库名 + 表名 + 字段名」三者全匹配 |
| D2 | 「数据库名」语义 | = sheet1 数据源名称（`item.name`） |
| D3 | 取值写法 | 中文为主，实现做容错兼容 |
| D4 | 空值处理 | sheet2 单元格留空 = 不覆盖、保留接口默认值 |
| D5 | sheet2 可选 | 文件无 sheet2 或内容为空 → 全走默认 |
| D6 | 应用时机 | 构造模型时即应用（方案 A），非事后覆盖 |
| D7 | 单位归属 | 字段单位仅对度量生效（`format.unit`），维度忽略 |

### 3.1 sheet2 列顺序（固定，宿主给定）

| 列序 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| 字段 | 数据库名 | 表名 | 字段名 | 别名 | 字段备注 | 维度或度量 | 是否隐藏 | 字段单位 |

第一行为表头，数据从第二行起。

### 3.2 取值容错约定

- **维度/度量**（第 6 列）: `维度` / `维` / `dimension` → 维度；`度量` / `度` / `measure` → 度量；留空 → 走自动归类
- **是否隐藏**（第 7 列）: `是` / `Y` / `1` / `true` → 隐藏；其余（含留空） → 不隐藏
- **字段单位**（第 8 列）: 自由文本，如 `元` / `个` / `%`
- 别名/备注: 非空字符串即覆盖，空字符串 → 不覆盖

## 4. 数据流

```
前端 parseFile(filePath)
   └─ 解析 sheet1（现有）+ 解析 sheet2 → 构建 FieldConfigMap
      FieldConfigMap: { "数据源名|表名|字段名": FieldConfig }
      （sheet2 不存在/为空 → 空 map）
前端 batch.start({ ...现有, fieldConfigMap })
   └─ batch.ipc 透传 → createModelsForDatasource(..., fieldConfigMap)
       └─ 每张表:
            createDataModel → lockModel → getTableSchema
            → buildModelSavePayload(modelHash, name, dbHash, dbType, schema, tableName, datasourceName, fieldConfigMap)
                └─ 字段循环: 查 map，有配置则覆盖，无则默认
            → saveDataModel → unlockModel
```

匹配键: `${datasourceName}|${tableName}|${field.name}`

## 5. 匹配与覆盖逻辑

在 `buildModelSavePayload` 的字段循环内，对每个字段:

```
cfg = fieldConfigMap[`${datasourceName}|${tableName}|${field.name}`]
归属 = cfg?.role ? parseRole(cfg.role) : (field.type === 'string' ? 'dimension' : 'measure')
alias = cfg?.alias || field.name
comment = cfg?.comment || field.comment || ''
isHidden = cfg ? parseHidden(cfg.hidden) : false
unit = cfg?.unit   // 仅 measure 生效
```

按 `归属` 决定进入 `dimensions` 还是 `measures`，并挂相应属性:

| 配置项 | 有值时 | 空/无匹配时 |
|---|---|---|
| 维度/度量 | 显式归类 | 自动（string→维度，else→度量） |
| 别名 | `alias = 配置值` | `alias = field.name` |
| 备注 | `comment = 配置值` | `comment = field.comment` |
| 是否隐藏 | `isHidden` 按容错解析 | `isHidden = false` |
| 字段单位 | 度量 `format.unit = 配置值`；维度忽略 | 度量 `format.unit = ''` |

> 注意: 度量与维度挂的属性集不同（度量有 `defaultAggregator`/`format`，维度有 `convert`/`statistics` 等）。沿用 `buildModelSavePayload` 现有结构，仅替换上述可配字段。

## 6. 改动清单

1. **`electron/services/excel-parser.ts`**
   - `parseExcel` 返回值增加 sheet2 解析结果，或新增 `parseSheet2(filePath) → FieldConfigMap`
   - 新增构建索引的逻辑：按列序读取，`"数据库名|表名|字段名"` 为 key

2. **`src/types/index.ts`**
   - 新增 `FieldConfig`（alias/comment/role/hidden/unit，全可选）
   - 新增 `FieldConfigMap = Record<string, FieldConfig>`
   - `ParseResult` 增加可选 `fieldConfig?: FieldConfigMap`
   - `BatchParams` 增加可选 `fieldConfigMap?: FieldConfigMap`

3. **`electron/services/sugar-api.ts`**
   - `buildModelSavePayload` 增加 `datasourceName` 与 `fieldConfigMap` 参数（均可选）
   - 循环内应用覆盖；新增私有 `parseRole` / `parseHidden` 容错辅助函数

4. **`electron/ipc/batch.ipc.ts`**
   - `BatchParams` 读取 `fieldConfigMap`
   - `createModelsForDatasource` 透传 map 与 `datasourceName` 给 `buildModelSavePayload`

5. **前端**
   - `DataPreview`/`FileUpload`: `parseFile` 调用拿到 sheet2 配置后持有
   - `batch.start` 调用透传 `fieldConfigMap`
   - （可选）预览面板提示「已加载 N 条字段配置」便于核对

## 7. 不变式与边界

- **向后兼容**: `fieldConfigMap` 为空（未传/无 sheet2）时，`buildModelSavePayload` 行为与现状完全一致。老用户零影响。
- **sheet2 缺失**: 文件只有一个 sheet → 返回空 map，不报错。
- **匹配不上**: 字段在 sheet2 无对应行 → 该字段走默认。
- **类型与配置冲突**: sheet2 将 string 字段配成「度量」，尊重配置（显式优先），归入 `measures` 并挂度量属性。
- **重复 key**: sheet2 中同 `库|表|字段` 多行 → 后者覆盖前者（解析时去重，记录 warning 日志）。
- **sheet 名**: 不强约束 sheet2 的 sheet 名（如「字段配置」），按工作簿第 2 个 sheet 读取；若未来需更稳，可改为按 sheet 名匹配。

## 8. 测试要点

- 无 sheet2 文件 → 全字段自动归类（回归现有）
- 有 sheet2、字段全匹配 → 别名/备注/隐藏/单位/归类全部生效
- 部分 sheet2 行匹配、部分不匹配 → 命中的覆盖、未命中的默认
- string 字段被配成度量 → 正确进入 measures、挂度量属性、不出现在 dimensions
- 取值容错: `维`/`dimension`/`度`/`measure`/`Y`/`1` 等多种写法
- 空值单元格 → 不覆盖默认
- 重复 key → 去重 + warning

## 9. 非目标（YAGNI）

- 不做 sheet2 的前端可视化编辑（只读预览即可）
- 不支持跨字段类型转换（`convert`）配置
- 不支持聚合方式（`defaultAggregator`）配置（仍默认 SUM）—— 如后续需要再扩展第 9 列
- 不做 sheet 名强校验
