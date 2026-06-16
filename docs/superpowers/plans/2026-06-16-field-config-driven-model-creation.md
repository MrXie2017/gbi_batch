# sheet2 字段配置驱动数据模型创建 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 批量创建数据模型时，依据 Excel 第 2 个 sheet 的字段配置表，按「数据源名|表名|字段名」匹配并覆盖字段归类/别名/备注/隐藏/单位；无 sheet2 或未匹配时保持现有自动行为。

**Architecture:** 容错解析 + 索引构建 + 匹配逻辑抽到零依赖纯函数模块 `electron/services/field-config.ts`（可单测）；xlsx 读取留在 `excel-parser.ts`；覆盖应用融入 `sugar-api.ts` 的 `buildModelSavePayload`（方案 A，构造时决定归类）；配置经 `batch.ipc` 从前端透传到主进程。

**Tech Stack:** Electron 28 · React 18 · TypeScript 5.6 · Vite 5 · zustand 4 · xlsx 0.18 · vitest（本计划新增 devDep，纯函数 TDD）

---

## 测试策略（必读）

项目当前**无测试框架**。本计划引入 **vitest**（vite 原生测试框架，零配置），**只为纯函数**（`field-config.ts` + `buildModelSavePayload` 的覆盖逻辑）写单测——这是字符串容错 + 索引匹配 + 字段归类，是最易出错的区域，单测 ROI 最高。

- IPC 编排、前端 UI、网络调用 → 不写单测，靠 `npm run typecheck` + 端到端手动验证（Task 8）。
- `field-config.ts` 刻意保持**零运行时依赖**（不 import xlsx/electron），以便测试环境与主进程都能安全引入。
- 如不愿引入 vitest：删除 Task 1 的安装步骤与所有 `*.test.ts`，改用 Task 8 的手动验证兜底（覆盖面下降，但功能可用）。

## 文件结构

| 文件 | 职责 | 操作 |
|---|---|---|
| `electron/services/field-config.ts` | 纯函数：容错解析 `parseRole`/`parseHidden`、`buildFieldConfigMap`、`matchField`；类型 `FieldConfig`/`FieldConfigMap` | 新建 |
| `electron/services/field-config.test.ts` | field-config 的单测 | 新建 |
| `electron/services/excel-parser.ts` | `parseExcel` 增读 sheet2 → 调 `buildFieldConfigMap` | 修改 |
| `electron/services/sugar-api.test.ts` | `buildModelSavePayload` 覆盖逻辑单测 | 新建 |
| `electron/services/sugar-api.ts` | `buildModelSavePayload` 加 `datasourceName`+`fieldConfigMap` 参数，循环内应用覆盖 | 修改 |
| `electron/ipc/batch.ipc.ts` | `BatchParams` 读 `fieldConfigMap`；`createModelsForDatasource` 透传 | 修改 |
| `electron/ipc/file.ipc.ts` | 无需改（`parseFile` 直接透传 `parseExcel` 返回） | — |
| `electron/preload.ts` | `parseFile` 返回类型 + `BatchParams` 加 `fieldConfigMap`；加 `FieldConfig` 类型 | 修改 |
| `src/types/index.ts` | 同步 `FieldConfig`/`FieldConfigMap`；`ParseResult`/`BatchParams` 扩展 | 修改 |
| `src/stores/batch-store.ts` | 加 `fieldConfigMap` 状态 + setter | 修改 |
| `src/components/upload/FileUpload.tsx` | 解析后存 `fieldConfigMap` 到 store | 修改 |
| `src/components/upload/DataPreview.tsx` | 提示「已加载 N 条字段配置」 | 修改 |
| `src/components/batch/BatchControls.tsx` | `handleStart` 透传 `fieldConfigMap` | 修改 |
| `package.json` | 加 vitest devDep + `test`/`test:run` script | 修改 |

**类型重复约定**：项目 `preload.ts` 与 `src/types/index.ts` 各持一份类型（主进程/渲染进程双编译目标，无法共享 import）。`FieldConfig`/`FieldConfigMap` 在两处各定义一份，字段保持一致。

---

## Task 1: 引入 vitest + 容错解析纯函数

**Files:**
- Modify: `package.json`
- Create: `electron/services/field-config.ts`
- Create: `electron/services/field-config.test.ts`

- [ ] **Step 1: 安装 vitest**

Run:
```bash
yarn add -D vitest@^1
```
Expected: `package.json` 的 `devDependencies` 出现 `vitest`。

- [ ] **Step 2: 加 test scripts**

编辑 `package.json`，在 `scripts` 里 `typecheck` 后追加两行：

```json
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run"
```

- [ ] **Step 3: 写失败测试 — parseRole / parseHidden**

创建 `electron/services/field-config.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { parseRole, parseHidden } from './field-config'

describe('parseRole', () => {
  it('中文「维度」「维」→ dimension', () => {
    expect(parseRole('维度')).toBe('dimension')
    expect(parseRole('维')).toBe('dimension')
    expect(parseRole(' 维度 ')).toBe('dimension')
  })
  it('中文「度量」「度」→ measure', () => {
    expect(parseRole('度量')).toBe('measure')
    expect(parseRole('度')).toBe('measure')
  })
  it('英文 dimension/measure 不区分大小写', () => {
    expect(parseRole('dimension')).toBe('dimension')
    expect(parseRole('MEASURE')).toBe('measure')
    expect(parseRole('Dimension')).toBe('dimension')
  })
  it('空值/未知值 → null（表示不覆盖，走默认归类）', () => {
    expect(parseRole('')).toBeNull()
    expect(parseRole('   ')).toBeNull()
    expect(parseRole('未知')).toBeNull()
  })
})

describe('parseHidden', () => {
  it('是/Y/1/true → true', () => {
    expect(parseHidden('是')).toBe(true)
    expect(parseHidden('Y')).toBe(true)
    expect(parseHidden('1')).toBe(true)
    expect(parseHidden('true')).toBe(true)
    expect(parseHidden('TRUE')).toBe(true)
  })
  it('否/N/0/false/空 → false', () => {
    expect(parseHidden('否')).toBe(false)
    expect(parseHidden('N')).toBe(false)
    expect(parseHidden('0')).toBe(false)
    expect(parseHidden('')).toBe(false)
    expect(parseHidden('随便填的')).toBe(false)
  })
})
```

- [ ] **Step 4: 跑测试确认失败**

Run: `yarn test:run electron/services/field-config.test.ts`
Expected: FAIL — `Cannot find module './field-config'` 或导入错误。

- [ ] **Step 5: 实现 field-config.ts 的容错函数**

创建 `electron/services/field-config.ts`：

```ts
/** sheet2 字段配置（全部可选；为空表示不覆盖该项，保留接口默认值） */
export interface FieldConfig {
  alias?: string
  comment?: string
  role?: 'dimension' | 'measure' // 维度/度量
  hidden?: boolean
  unit?: string // 仅度量生效
}

/** 匹配键 → 字段配置 */
export type FieldConfigMap = Record<string, FieldConfig>

/** 「数据库名|表名|字段名」匹配键 */
export function fieldKey(databaseName: string, tableName: string, fieldName: string): string {
  return `${databaseName}|${tableName}|${fieldName}`
}

/**
 * 解析「维度/度量」列。返回 null 表示该单元格无效，应走默认归类。
 * 兼容：维度/维/dimension、度量/度/measure（trim + 大小写不敏感）。
 */
export function parseRole(raw: string): 'dimension' | 'measure' | null {
  const v = (raw || '').trim().toLowerCase()
  if (!v) return null
  if (['维度', '维', 'dimension'].includes(v)) return 'dimension'
  if (['度量', '度', 'measure'].includes(v)) return 'measure'
  return null
}

/**
 * 解析「是否隐藏」列。容错：是/Y/1/true（trim + 大小写不敏感）→ true；其余 → false。
 */
export function parseHidden(raw: string): boolean {
  const v = (raw || '').trim().toLowerCase()
  return ['是', 'y', '1', 'true'].includes(v)
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `yarn test:run electron/services/field-config.test.ts`
Expected: PASS（8 个 it 全绿）。

- [ ] **Step 7: typecheck**

Run: `yarn typecheck`
Expected: 无错误。

- [ ] **Step 8: Commit**

```bash
git add package.json yarn.lock electron/services/field-config.ts electron/services/field-config.test.ts
git commit -m "feat: 引入 vitest + 字段配置容错解析纯函数"
```

---

## Task 2: sheet2 行解析 → FieldConfigMap（TDD）

**Files:**
- Modify: `electron/services/field-config.ts`
- Modify: `electron/services/field-config.test.ts`

sheet2 列顺序固定（1 数据库名 / 2 表名 / 3 字段名 / 4 别名 / 5 备注 / 6 维度或度量 / 7 是否隐藏 / 8 字段单位），首行为表头。`buildFieldConfigMap` 接收的是 xlsx 解析出的「原始行数组」（`string[][]`，已跳过表头），输出 map；重复 key 后者覆盖前者。

- [ ] **Step 1: 写失败测试**

在 `field-config.test.ts` 末尾追加：

```ts
import { buildFieldConfigMap, matchField } from './field-config'

describe('buildFieldConfigMap', () => {
  const rows: string[][] = [
    ['库A', 't_user', 'name', '姓名', '用户名', '维度', '是', ''],
    ['库A', 't_user', 'amount', '金额', '订单金额', '度量', '否', '元'],
    ['库A', 't_user', 'name', '姓名2', '', '维度', '', ''], // 重复 key → 覆盖
    ['', '', 'orphan', '', '', '', '', ''],                  // 库/表空 → 跳过
    ['库B', 't_order', 'id', '', '', '', '', ''],            // 全空配置 → 跳过该行（无可覆盖项）
  ]

  it('按列序构建，重复 key 后者覆盖', () => {
    const map = buildFieldConfigMap(rows)
    const cfg = matchField(map, '库A', 't_user', 'name')
    expect(cfg).toBeDefined()
    expect(cfg!.alias).toBe('姓名2') // 被第 3 行覆盖
    expect(cfg!.role).toBe('dimension')
    expect(cfg!.hidden).toBe(false)
  })

  it('度量字段携带单位', () => {
    const map = buildFieldConfigMap(rows)
    const cfg = matchField(map, '库A', 't_user', 'amount')!
    expect(cfg.role).toBe('measure')
    expect(cfg.unit).toBe('元')
    expect(cfg.alias).toBe('金额')
    expect(cfg.comment).toBe('订单金额')
  })

  it('库/表为空的行被跳过', () => {
    const map = buildFieldConfigMap(rows)
    expect(matchField(map, '', '', 'orphan')).toBeUndefined()
  })

  it('全空配置行被跳过（不出现在 map）', () => {
    const map = buildFieldConfigMap(rows)
    expect(matchField(map, '库B', 't_order', 'id')).toBeUndefined()
  })

  it('未匹配返回 undefined', () => {
    const map = buildFieldConfigMap(rows)
    expect(matchField(map, '库A', 't_user', 'not_exist')).toBeUndefined()
  })

  it('空行数组 → 空 map', () => {
    expect(Object.keys(buildFieldConfigMap([]))).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn test:run electron/services/field-config.test.ts`
Expected: FAIL — `buildFieldConfigMap` 未导出。

- [ ] **Step 3: 实现 buildFieldConfigMap + matchField**

在 `field-config.ts` 末尾追加：

```ts
/** 列索引常量（sheet2 固定列顺序，0-based） */
const COL = {
  DB: 0, TABLE: 1, FIELD: 2, ALIAS: 3, COMMENT: 4,
  ROLE: 5, HIDDEN: 6, UNIT: 7,
} as const

/** 判断一行字段配置是否「全空」（无可覆盖项），用于跳过无意义行 */
function isEmptyConfig(cells: string[]): boolean {
  const text = [COL.ALIAS, COL.COMMENT, COL.ROLE, COL.HIDDEN, COL.UNIT]
    .map((i) => (cells[i] || '').trim())
    .join('')
  return text.length === 0
}

/**
 * 将 sheet2 的原始行（string[][]，不含表头）构建为 FieldConfigMap。
 * - 库名/表名/字段名 任一为空 → 跳过该行
 * - 全部可配置项为空 → 跳过（无可覆盖项）
 * - 重复 key → 后者覆盖前者
 */
export function buildFieldConfigMap(rows: string[][]): FieldConfigMap {
  const map: FieldConfigMap = {}
  for (const cells of rows) {
    const db = (cells[COL.DB] || '').trim()
    const table = (cells[COL.TABLE] || '').trim()
    const field = (cells[COL.FIELD] || '').trim()
    if (!db || !table || !field) continue
    if (isEmptyConfig(cells)) continue

    const cfg: FieldConfig = {}
    const alias = (cells[COL.ALIAS] || '').trim()
    const comment = (cells[COL.COMMENT] || '').trim()
    const role = parseRole(cells[COL.ROLE] || '')
    const hidden = parseHidden(cells[COL.HIDDEN] || '')
    const unit = (cells[COL.UNIT] || '').trim()

    if (alias) cfg.alias = alias
    if (comment) cfg.comment = comment
    if (role) cfg.role = role
    if (hidden) cfg.hidden = hidden
    if (unit) cfg.unit = unit

    map[fieldKey(db, table, field)] = cfg
  }
  return map
}

/** 按「数据库名|表名|字段名」查找配置；未命中返回 undefined */
export function matchField(
  map: FieldConfigMap,
  databaseName: string,
  tableName: string,
  fieldName: string,
): FieldConfig | undefined {
  return map[fieldKey(databaseName, tableName, fieldName)]
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `yarn test:run electron/services/field-config.test.ts`
Expected: PASS（全部 it 绿）。

- [ ] **Step 5: typecheck**

Run: `yarn typecheck`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add electron/services/field-config.ts electron/services/field-config.test.ts
git commit -m "feat: sheet2 行解析为 FieldConfigMap + 字段匹配"
```

---

## Task 3: 类型定义（前后端同步）

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: src/types/index.ts 扩展类型**

在 `src/types/index.ts` 的 `ParseResult` 定义前，新增字段配置类型；并扩展 `ParseResult` 与 `BatchParams`：

```ts
/** sheet2 字段配置（与 electron/services/field-config.ts 保持一致） */
export interface FieldConfig {
  alias?: string
  comment?: string
  role?: 'dimension' | 'measure'
  hidden?: boolean
  unit?: string
}
export type FieldConfigMap = Record<string, FieldConfig>
```

把现有 `ParseResult`：

```ts
export interface ParseResult {
  columns: string[]
  rows: Record<string, any>[]
  total: number
}
```

改为：

```ts
export interface ParseResult {
  columns: string[]
  rows: Record<string, any>[]
  total: number
  /** sheet2 字段配置（无 sheet2 时为空 map） */
  fieldConfig?: FieldConfigMap
}
```

把 `BatchParams` 末尾追加：

```ts
  dbTypeKey: string    // 分组 key: sql | jdbc | http | nosql
  /** sheet2 字段配置（可选；未配置时走默认自动归类） */
  fieldConfigMap?: FieldConfigMap
```

- [ ] **Step 2: preload.ts 同步类型 + parseFile 返回类型**

在 `electron/preload.ts` 顶部类型区，`DatasourceItem` 后新增：

```ts
export interface FieldConfig {
  alias?: string
  comment?: string
  role?: 'dimension' | 'measure'
  hidden?: boolean
  unit?: string
}
export type FieldConfigMap = Record<string, FieldConfig>
```

把 `file.parseFile` 的返回类型签名改为带 `fieldConfig`：

```ts
    parseFile: (filePath: string) => Promise<{ columns: string[]; rows: any[]; total: number; fieldConfig?: FieldConfigMap }>
```

把 `BatchParams` 接口末尾追加：

```ts
  dbTypeKey: string
  fieldConfigMap?: FieldConfigMap
```

- [ ] **Step 3: typecheck**

Run: `yarn typecheck`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts electron/preload.ts
git commit -m "feat: 新增 FieldConfig 类型，扩展 ParseResult/BatchParams"
```

---

## Task 4: excel-parser 读 sheet2

**Files:**
- Modify: `electron/services/excel-parser.ts`

`parseExcel` 当前只读 `SheetNames[0]`。扩展为：读第 2 个 sheet（若存在）→ 转成 `string[][]`（跳过表头）→ `buildFieldConfigMap` → 挂到返回值的 `fieldConfig`。sheet2 不存在或为空时 `fieldConfig` 为 `{}`。

- [ ] **Step 1: import buildFieldConfigMap**

在 `excel-parser.ts` 顶部 import 区追加（已有 `import * as xlsx from 'xlsx'` 与 `import * as path from 'path'`）：

```ts
import { buildFieldConfigMap } from './field-config'
import type { FieldConfigMap } from './field-config'
```

- [ ] **Step 2: 改造 parseExcel 返回 fieldConfig**

把 `parseExcel` 整体替换为：

```ts
export function parseExcel(filePath: string): ParseResult {
  const wb = xlsx.readFile(filePath, { type: 'file' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const jsonData = xlsx.utils.sheet_to_json<Record<string, any>>(ws)

  // 解析 sheet2（字段配置表）；不存在或为空 → 空 map
  let fieldConfig: FieldConfigMap = {}
  if (wb.SheetNames.length >= 2) {
    const ws2 = wb.Sheets[wb.SheetNames[1]]
    // header:1 → 返回二维数组（含表头行）；defval 让空单元格为空串而非跳过
    const matrix = xlsx.utils.sheet_to_json<string[]>(ws2, { header: 1, defval: '' })
    if (matrix.length > 1) {
      // 跳过首行表头
      fieldConfig = buildFieldConfigMap(matrix.slice(1).map((r) => r.map((c) => String(c ?? ''))))
    }
  }

  if (jsonData.length === 0) {
    return { columns: [], rows: [], total: 0, fieldConfig }
  }

  const columns = Object.keys(jsonData[0])
  return {
    columns,
    rows: jsonData,
    total: jsonData.length,
    fieldConfig,
  }
}
```

> 注：`ParseResult` 需含 `fieldConfig` 字段。`excel-parser.ts` 当前 import 的是 `./db-types` 的 `TemplateField`，`ParseResult` 是其本地定义的同名 interface（行 5-9）。把该本地 interface 同步加上 `fieldConfig?: FieldConfigMap`：

```ts
export interface ParseResult {
  columns: string[]
  rows: Record<string, any>[]
  total: number
  fieldConfig?: FieldConfigMap
}
```

- [ ] **Step 3: typecheck**

Run: `yarn typecheck`
Expected: 无错误。

- [ ] **Step 4: 单测验证 sheet2 解析（回归保护）**

在 `field-config.test.ts` 末尾追加一个集成性测试，直接用 `buildFieldConfigMap`（不依赖真实文件）已覆盖；此处补一个「xlsx 矩阵 → map」的形态断言：

```ts
import * as xlsx from 'xlsx'

describe('sheet2 矩阵解析（excel-parser 调用形态）', () => {
  it('xlsx sheet_to_json header:1 的矩阵经 buildFieldConfigMap 正确产出', () => {
    const wb = xlsx.utils.book_new()
    const ws = xlsx.utils.aoa_to_sheet([
      ['数据库名', '表名', '字段名', '别名', '字段备注', '维度或度量', '是否隐藏', '字段单位'],
      ['库A', 't', 'price', '价格', '', '度量', '否', '元'],
    ])
    xlsx.utils.book_append_sheet(wb, ws, '字段配置')
    const matrix = xlsx.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
    const map = buildFieldConfigMap(matrix.slice(1).map((r) => r.map((c) => String(c ?? ''))))
    const cfg = matchField(map, '库A', 't', 'price')!
    expect(cfg.alias).toBe('价格')
    expect(cfg.role).toBe('measure')
    expect(cfg.unit).toBe('元')
  })
})
```

Run: `yarn test:run electron/services/field-config.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add electron/services/excel-parser.ts electron/services/field-config.test.ts
git commit -m "feat: parseExcel 解析 sheet2 为字段配置"
```

---

## Task 5: buildModelSavePayload 集成覆盖逻辑（TDD）

**Files:**
- Modify: `electron/services/sugar-api.ts`
- Create: `electron/services/sugar-api.test.ts`

给 `buildModelSavePayload` 增加 `datasourceName` 与 `fieldConfigMap` 两个可选参数。字段循环内：先用匹配到的配置决定归类（无配置/无 role → 走原自动规则），再覆盖 alias/comment/hidden/unit。

- [ ] **Step 1: 写失败测试**

创建 `electron/services/sugar-api.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { SugarApiClient } from './sugar-api'
import type { TableFieldSchema } from './sugar-api'
import type { FieldConfigMap } from './field-config'

/** 造一个字段 schema */
function field(id: string, name: string, type: string, typeInDB = type, comment = ''): TableFieldSchema {
  return { id, name, type, typeInDB, comment, nullable: true }
}

const DB = 'prod_db'
const TABLE = 't_order'

describe('buildModelSavePayload 字段覆盖', () => {
  it('无 fieldConfigMap → 保持自动归类（string=维度, 数值=度量）', () => {
    const schema = [field('f1', 'name', 'string'), field('f2', 'amount', 'float')]
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB)
    expect(Object.keys(payload.config.dimensions)).toContain('f1')
    expect(Object.keys(payload.config.measures)).toContain('f2')
    expect(payload.config.dimensions.f1.alias).toBe('name')
  })

  it('alias / comment / hidden 覆盖生效', () => {
    const schema = [field('f1', 'name', 'string', 'string', '原备注')]
    const map: FieldConfigMap = {
      [`${DB}|${TABLE}|name`]: { alias: '客户名', comment: '新备注', hidden: true },
    }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    const dim = payload.config.dimensions.f1
    expect(dim.alias).toBe('客户名')
    expect(dim.comment).toBe('新备注')
    expect(dim.isHidden).toBe(true)
  })

  it('sheet2 把 string 字段配成「度量」→ 归入 measures 且挂度量属性', () => {
    const schema = [field('f1', 'code', 'string')]
    const map: FieldConfigMap = {
      [`${DB}|${TABLE}|code`]: { role: 'measure', unit: '个' },
    }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    expect(Object.keys(payload.config.dimensions)).not.toContain('f1')
    expect(Object.keys(payload.config.measures)).toContain('f1')
    expect(payload.config.measures.f1.format.unit).toBe('个')
  })

  it('数值字段被配成「维度」→ 归入 dimensions', () => {
    const schema = [field('f1', 'level', 'int')]
    const map: FieldConfigMap = {
      [`${DB}|${TABLE}|level`]: { role: 'dimension' },
    }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    expect(Object.keys(payload.config.dimensions)).toContain('f1')
    expect(Object.keys(payload.config.measures)).not.toContain('f1')
  })

  it('未匹配的字段走默认', () => {
    const schema = [field('f1', 'name', 'string')]
    const map: FieldConfigMap = { '其他库|其他表|name': { alias: '不应命中' } }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    expect(payload.config.dimensions.f1.alias).toBe('name')
  })

  it('菜单 nodes 与归类一致（维度菜单含维度字段，度量菜单含度量字段）', () => {
    const schema = [field('f1', 'name', 'string'), field('f2', 'amt', 'int')]
    const map: FieldConfigMap = {
      [`${DB}|${TABLE}|f2`]: { role: 'dimension' }, // 把 amt 也配成维度
    }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    const dimNodes = payload.config.dimensionMenu[0].nodes as string[]
    expect(dimNodes).toEqual(expect.arrayContaining(['f1', 'f2']))
    expect(payload.config.measureMenu[0].nodes).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn test:run electron/services/sugar-api.test.ts`
Expected: FAIL — `buildModelSavePayload` 第 7 参数签名不符 / 覆盖未生效。

- [ ] **Step 3: 改造 buildModelSavePayload 签名与循环**

在 `sugar-api.ts` 顶部 import 区追加：

```ts
import { matchField } from './field-config'
import type { FieldConfigMap } from './field-config'
```

把 `buildModelSavePayload` 方法签名改为（新增末两参，均可选）：

```ts
  static buildModelSavePayload(
    modelHash: string,
    modelName: string,
    databaseHash: string,
    dbType: number,
    schema: TableFieldSchema[],
    tableName: string,
    datasourceName: string,
    fieldConfigMap: FieldConfigMap = {},
  ): DataModelSavePayload {
```

把字段循环（原 `for (const field of schema) { if (field.type === 'string') {...} else {...} }`）替换为：

```ts
    for (const field of schema) {
      const cfg = matchField(fieldConfigMap, datasourceName, tableName, field.name)

      // 归类：显式 role 优先；否则沿用自动规则（string→维度, 其余→度量）
      const isDimension = cfg?.role ? cfg.role === 'dimension' : field.type === 'string'

      const alias = cfg?.alias || field.name
      const comment = cfg?.comment || field.comment || ''
      const isHidden = cfg?.hidden ?? false

      if (isDimension) {
        dimensions[field.id] = {
          type: 'dimension',
          tableId,
          field: field.name,
          calculated: false,
          predictType: '',
          noEnumerable: false,
          expression: '',
          isAggregated: false,
          alias,
          NLPAlias: [],
          dataType: field.type,
          dataTypeInDB: field.typeInDB,
          isHidden,
          renameHash: '',
          hierarchyId: '',
          pathIds: [],
          convert: { type: '', label: '', original: '', dataType: '' },
          comment,
          statistics: {},
          calculatedConfig: {},
          remark: '',
        }
        dimNodes.push(field.id)
      } else {
        measures[field.id] = {
          type: 'measure',
          tableId,
          field: field.name,
          calculated: false,
          predictType: '',
          expression: '',
          isAggregated: false,
          alias,
          NLPAlias: [],
          dataType: field.type,
          dataTypeInDB: field.typeInDB,
          isHidden,
          defaultAggregator: 'SUM',
          convert: { type: '' },
          format: { accuracy: -1, dataFormat: '', unit: cfg?.unit || '' },
          comment,
          calculatedConfig: {},
          remark: '',
        }
        meaNodes.push(field.id)
      }
    }
```

> 其余构造逻辑（tables / dimensionMenu / measureMenu / 外层字段）保持不变；`dimNodes`/`meaNodes` 已用于菜单 nodes，归类改判后菜单自动跟随。

- [ ] **Step 4: 跑测试确认通过**

Run: `yarn test:run electron/services/sugar-api.test.ts`
Expected: PASS（6 个 it 绿）。

- [ ] **Step 5: 全量测试 + typecheck**

Run: `yarn test:run && yarn typecheck`
Expected: 全部测试绿，typecheck 无错误。

- [ ] **Step 6: Commit**

```bash
git add electron/services/sugar-api.ts electron/services/sugar-api.test.ts
git commit -m "feat: buildModelSavePayload 按 sheet2 配置覆盖字段归类与属性"
```

---

## Task 6: batch.ipc 透传 fieldConfigMap

**Files:**
- Modify: `electron/ipc/batch.ipc.ts`

- [ ] **Step 1: BatchParams 接口加字段**

把 `batch.ipc.ts` 顶部 `interface BatchParams` 末尾追加：

```ts
  dbTypeKey: string
  fieldConfigMap?: Record<string, any>
```

- [ ] **Step 2: 调用处透传**

在 `batch:start` handler 内，`createModelsForDatasource(...)` 调用（约 141 行）改为带上 `params.fieldConfigMap`：

```ts
        await createModelsForDatasource(
          client, databaseHash, dbType, item.name, itemResult, mainWindow, params.fieldConfigMap,
        )
```

- [ ] **Step 3: createModelsForDatasource 签名 + 透传给 buildModelSavePayload**

把函数签名改为（新增末参）：

```ts
async function createModelsForDatasource(
  client: SugarApiClient,
  databaseHash: string,
  dbType: number,
  datasourceName: string,
  itemResult: any,
  mainWindow: BrowserWindow | null,
  fieldConfigMap: Record<string, any> = {},
): Promise<void> {
```

把 `buildModelSavePayload(...)` 调用（约 237 行）改为传入 `datasourceName` 与 `fieldConfigMap`：

```ts
      const savePayload = SugarApiClient.buildModelSavePayload(
        modelHash,
        modelName,
        databaseHash,
        dbType,
        schemaResult.data,
        tableName,
        datasourceName,
        fieldConfigMap,
      )
```

> `datasourceName` 在该函数内本就作为 `modelName` 前缀来源可用——这里直接复用入参 `datasourceName`（= `item.name`），与匹配键中的「数据库名」语义一致。

- [ ] **Step 4: typecheck**

Run: `yarn typecheck`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/batch.ipc.ts
git commit -m "feat: batch.ipc 透传 fieldConfigMap 到模型创建"
```

---

## Task 7: 前端串联（store + 组件）

**Files:**
- Modify: `src/stores/batch-store.ts`
- Modify: `src/components/upload/FileUpload.tsx`
- Modify: `src/components/upload/DataPreview.tsx`
- Modify: `src/components/batch/BatchControls.tsx`

- [ ] **Step 1: batch-store 加 fieldConfigMap 状态**

在 `batch-store.ts` 的 `BatchState` interface 里，`dbTypeKey` 后追加字段声明；并在 setter 区加 `setFieldConfig`：

interface 内：
```ts
  dbTypeKey: string
  /** sheet2 字段配置（可能为空） */
  fieldConfigMap: FieldConfigMap | null
  setFieldConfig: (cfg: FieldConfigMap | null) => void
```

`import` 行改为引入类型：
```ts
import type { DatasourceItem, ItemResult, BatchProgress, BatchResult, FieldConfigMap } from '../types'
```

`initialState` 加：
```ts
  selectedDbType: 'MySQL 5.X',
  dbTypeKey: 'sql',
  fieldConfigMap: null,
```

store 实现体内加（与 `setDbType` 同级）：
```ts
  setDbType: (typeName, typeKey) => set({ selectedDbType: typeName, dbTypeKey: typeKey }),

  setFieldConfig: (cfg) => set({ fieldConfigMap: cfg }),

  reset: () => set({ ...initialState }),
```

- [ ] **Step 2: FileUpload 解析后存 fieldConfigMap**

在 `FileUpload.tsx` 的 `useBatchStore()` 解构里加 `setFieldConfig, fieldConfigMap`：

```ts
  const {
    filePath, setFilePath, setItems, items,
    selectedDbType, dbTypeKey, setDbType, setFieldConfig,
  } = useBatchStore()
```

在 `handleSelectFile` 内，`setItems(parsedItems, result.columns)` 后追加：

```ts
      setItems(parsedItems, result.columns)
      setFieldConfig(result.fieldConfig || null)
```

并在文件底部「已加载 N 条」提示下方，追加 sheet2 提示（在 `{items.length > 0 && (...)}` 块之后）：

```tsx
      {fieldConfigMap && Object.keys(fieldConfigMap).length > 0 && (
        <div className="text-muted mt-1" style={{ textAlign: 'center', fontSize: '0.8em' }}>
          📋 已加载 {Object.keys(fieldConfigMap).length} 条字段配置（sheet2）
        </div>
      )}
```

> 解构里需带上 `fieldConfigMap`，把第 1 步的解构补全为：`..., setDbType, setFieldConfig, fieldConfigMap,`。

- [ ] **Step 3: DataPreview 不需改（仅展示数据源行）**

跳过——字段配置提示已在 FileUpload 展示。

- [ ] **Step 4: BatchControls handleStart 透传 fieldConfigMap**

在 `BatchControls.tsx` 的 `useBatchStore()` 解构里加 `fieldConfigMap`：

```ts
  const {
    items, delay, isRunning, isCompleted,
    selectedDbType, dbTypeKey,
    setDelay, setRunning, setStopped,
    addItemResult, setProgress, setResult,
    itemResults, fieldConfigMap,
  } = useBatchStore()
```

把 `handleStart` 内 `api.batch.start({...})` 调用末尾加一行：

```ts
      await api.batch.start({
        baseUrl,
        cookie,
        csrfToken,
        groupId: selectedWorkspace.id,
        sugarCompany: selectedWorkspace.companyId || '',
        items,
        delay,
        dbTypeName: selectedDbType,
        dbTypeKey,
        fieldConfigMap: fieldConfigMap || undefined,
      })
```

- [ ] **Step 5: typecheck**

Run: `yarn typecheck`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add src/stores/batch-store.ts src/components/upload/FileUpload.tsx src/components/batch/BatchControls.tsx
git commit -m "feat: 前端加载并透传 sheet2 字段配置"
```

---

## Task 8: 端到端验证

**Files:** 无（纯验证）

- [ ] **Step 1: 全量自动化测试**

Run: `yarn test:run && yarn typecheck`
Expected: 全部单测绿，typecheck 无错误。

- [ ] **Step 2: 造一个带 sheet2 的测试 Excel**

手动（或用脚本）生成 `test_with_sheet2.xlsx`：
- Sheet1「数据源」：1 条可连通的数据源行（真实可登录的 Sugar BI 测试库）
- Sheet2「字段配置」，表头 8 列：`数据库名 | 表名 | 字段名 | 别名 | 字段备注 | 维度或度量 | 是否隐藏 | 字段单位`
  - 至少覆盖：①一个 string 字段配成「度量」+单位；②一个数值字段配成「维度」；③一个字段配别名/备注/隐藏；④一个字段在 sheet2 不配（走默认）

- [ ] **Step 3: 跑应用**

Run: `yarn electron:dev`
操作：
1. 登录 Sugar BI，选 workspace
2. 数据源类型选对，上传 `test_with_sheet2.xlsx`
3. 确认 FileUpload 显示「📋 已加载 N 条字段配置（sheet2）」，N 与 sheet2 有效行数一致
4. 点「开始执行」

Expected: 数据源添加 + 模型创建流程正常推进，无报错。

- [ ] **Step 4: Sugar BI 后台核对**

到 Sugar BI 管理后台打开生成的数据模型，逐项核对：
- 配成「度量」的 string 字段 → 出现在度量区，单位正确
- 配成「维度」的数值字段 → 出现在维度区
- 配了别名的字段 → 显示别名
- 配了「是否隐藏=是」的字段 → 标记隐藏
- sheet2 未配的字段 → 按原自动规则（string=维度，数值=度量）

Expected: 全部与 sheet2 配置一致。

- [ ] **Step 5: 回归验证（无 sheet2 文件）**

用现有「生成模板」产出的单 sheet 文件跑一遍，确认行为与改造前一致（无字段配置提示，字段全走自动归类）。

Expected: 老流程零回归。

- [ ] **Step 6: 收尾**

确认无误后，测试 Excel 文件可删除。无需 commit（除非要保留样例）。

---

## Self-Review 记录

- **Spec 覆盖**: D1 三者全匹配→Task 2/5；D2 数据库名=item.name→Task 6 透传 `datasourceName`；D3 中文容错→Task 1；D4 空值不覆盖→Task 2 `isEmptyConfig`+条件赋值；D5 sheet2 可选→Task 4 空 map；D6 构造时应用→Task 5；D7 单位仅度量→Task 5 仅 measure 挂 `format.unit`。✅
- **占位符**: 无 TBD/TODO。✅
- **类型一致性**: `FieldConfig`/`FieldConfigMap` 在 field-config.ts（主进程权威源）、src/types、preload.ts 三处定义一致（alias/comment/role/hidden/unit）。`buildModelSavePayload` 7→9 参（末两参可选）在 Task 5 定义、Task 6 调用一致。`parseRole`/`parseHidden`/`buildFieldConfigMap`/`matchField`/`fieldKey` 命名前后一致。✅
- **已知取舍**: vitest 为本计划新增 devDep；如不接受见「测试策略」退化方案。
