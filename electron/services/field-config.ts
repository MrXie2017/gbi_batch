/** sheet2 字段配置（全部可选；为空表示不覆盖该项，保留接口默认值） */
export interface FieldConfig {
  alias?: string
  comment?: string
  role?: 'dimension' | 'measure' // 维度/度量
  hidden?: boolean
  unit?: string // 仅度量生效
  geo?: 'geo' | 'lng' | 'lat' // 标记为地理信息（仅维度生效）：geo=地名/区域, lng=经度, lat=纬度
}

/** 匹配键 → 字段配置 */
export type FieldConfigMap = Record<string, FieldConfig>

/** sheet2 已配置的建模表清单：数据库名 → [表名]（用于「只建配置过的表」） */
export type TableConfigMap = Record<string, string[]>

/**
 * 归一化匹配段：trim + 小写。
 * 库名/表名/字段名在 sheet2 手填与数据库实际返回之间常有大小写漂移（如 Oracle 大写表名），
 * 构建与查找两侧统一走本函数，保证一致命中。
 */
function norm(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase()
}

/** 「数据库名|表名|字段名」匹配键（各段已归一化） */
export function fieldKey(databaseName: string, tableName: string, fieldName: string): string {
  return `${norm(databaseName)}|${norm(tableName)}|${norm(fieldName)}`
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

/**
 * 解析「标记地理信息」列。返回 'geo'/'lng'/'lat'；null 表示未配置或「不标记」，不覆盖。
 * 写入 dimension.convert.label（仅维度生效）：geo=地名/区域, lng=经度, lat=纬度。
 * 兼容中文与英文（trim + 大小写不敏感）。
 */
export function parseGeo(raw: string): 'geo' | 'lng' | 'lat' | null {
  const v = (raw || '').trim().toLowerCase()
  if (!v) return null
  if (['地名/区域', '地名', '区域', 'geo'].includes(v)) return 'geo'
  if (['经度', 'lng', 'longitude'].includes(v)) return 'lng'
  if (['纬度', 'lat', 'latitude'].includes(v)) return 'lat'
  return null // 含「不标记」「无」「none」及未知值
}

// ==================== sheet2 列定位 ====================

/** sheet2 逻辑列 → 实际列索引；-1 表示该列未在表头中出现（禁用，读取恒为空） */
export interface Sheet2Columns {
  db: number
  table: number
  modelName: number
  field: number
  alias: number
  comment: number
  role: number
  hidden: number
  unit: number
  geo: number
}

/** 模板固定列序（表头整体无法识别时的回退） */
export const DEFAULT_SHEET2_COLUMNS: Sheet2Columns = {
  db: 0, table: 1, modelName: 2, field: 3, alias: 4, comment: 5,
  role: 6, hidden: 7, unit: 8, geo: 9,
}

/** 单个表头单元格归类；无法识别返回 null（判断顺序敏感：更具体的词先判） */
function classifyHeader(text: string): keyof Sheet2Columns | null {
  const v = (text || '').trim()
  if (!v) return null
  if (v.includes('库名') || v.includes('数据库')) return 'db' // 数据库名/库名
  if (v.includes('模型') || v.includes('中文名')) return 'modelName' // 中文名(问数模型名称)/模型名称
  if (v.includes('表名') || v === '表') return 'table' // 表名/表名称/数据表名
  if (v.includes('字段名') || v === '字段' || v === '列名') return 'field'
  if (v.includes('别名')) return 'alias'
  if (v.includes('备注') || v.includes('注释') || v.includes('描述')) return 'comment'
  if (v.includes('维度') || v.includes('度量') || v.includes('角色')) return 'role'
  if (v.includes('隐藏')) return 'hidden'
  if (v.includes('单位')) return 'unit'
  if (v.includes('地理') || v.includes('标记')) return 'geo'
  return null
}

/**
 * 判断某行是否为「可识别的表头行」（库名/表名/字段名三个关键列都识别成功）。
 */
function isHeaderRow(cells: string[]): boolean {
  const kinds = new Set((cells || []).map((c) => classifyHeader(String(c ?? ''))))
  return kinds.has('db') && kinds.has('table') && kinds.has('field')
}

/**
 * 按表头行识别各逻辑列的实际索引（兼容用户增删/调序列，如插入「序号」列）。
 * - 库名/表名/字段名是匹配关键：任一识别失败 → 整体回退模板固定列序（兼容无表头/表头被改坏的文件）
 * - 其余可选列未识别 → 置 -1 禁用，绝不回退默认索引：
 *   否则旧 9 列等形态下 modelName 会默认指向第 2 列（字段名），模型名静默变成字段名
 */
export function resolveSheet2Columns(headerRow: string[]): Sheet2Columns {
  const recognized = new Map<keyof Sheet2Columns, number>()
  headerRow.forEach((cell, idx) => {
    const kind = classifyHeader(String(cell ?? ''))
    if (kind && !recognized.has(kind)) {
      recognized.set(kind, idx)
    }
  })
  if (!recognized.has('db') || !recognized.has('table') || !recognized.has('field')) {
    return { ...DEFAULT_SHEET2_COLUMNS }
  }
  const cols = {} as Sheet2Columns
  for (const key of Object.keys(DEFAULT_SHEET2_COLUMNS) as (keyof Sheet2Columns)[]) {
    cols[key] = recognized.has(key) ? recognized.get(key)! : -1
  }
  return cols
}

/**
 * 库名/表名/中文名三列向下填充：
 * 兼容合并单元格与「按组填写一次」的写法（xlsx 读取时合并单元格只有左上格有值）。
 * 组的边界以「表名列非空」判定：表名非空 = 新组首行（中文名以本行为准，留空 = 该表不命名，
 * 同时重置继承，避免上一组的中文名泄漏）；表名为空 = 组内延续行（继承库名/表名/中文名）。
 */
export function fillDownSheet2Rows(
  rows: string[][],
  columns: Sheet2Columns = DEFAULT_SHEET2_COLUMNS,
): string[][] {
  let lastDb = ''
  let lastTable = ''
  let lastModelName = ''
  return rows.map((cells) => {
    const row = [...cells]
    const isGroupFirst = !!(row[columns.table] || '').trim()

    // 库名：空则继承上一行（db 列合并单元格）
    if (columns.db >= 0) {
      const db = (row[columns.db] || '').trim()
      if (db) lastDb = db
      else row[columns.db] = lastDb
    }

    // 中文名：组首行以本行为准并重置继承；组内延续行空则继承
    if (columns.modelName >= 0) {
      const name = (row[columns.modelName] || '').trim()
      if (isGroupFirst) lastModelName = name
      else if (!name) row[columns.modelName] = lastModelName
    }

    // 表名：空则继承上一行（表名列合并单元格）
    if (isGroupFirst) {
      lastTable = (row[columns.table] || '').trim()
    } else {
      row[columns.table] = lastTable
    }
    return row
  })
}

// ==================== 字段级配置 ====================

/** 判断一行字段配置是否「全空」（无可覆盖项），用于跳过无意义行；禁用列（-1）视为空 */
function isEmptyConfig(cells: string[], columns: Sheet2Columns): boolean {
  const text = [columns.alias, columns.comment, columns.role, columns.hidden, columns.unit, columns.geo]
    .map((i) => (i >= 0 ? (cells[i] || '').trim() : ''))
    .join('')
  return text.length === 0
}

/**
 * 将 sheet2 的数据行构建为 FieldConfigMap。
 * - 库名/表名/字段名 任一为空（或列被禁用）→ 跳过该行
 * - 全部可配置项为空 → 跳过（无可覆盖项）
 * - 重复 key → 后者覆盖前者
 */
export function buildFieldConfigMap(
  rows: string[][],
  columns: Sheet2Columns = DEFAULT_SHEET2_COLUMNS,
): FieldConfigMap {
  const map: FieldConfigMap = {}
  for (const cells of rows) {
    const db = (cells[columns.db] || '').trim()
    const table = (cells[columns.table] || '').trim()
    const field = (cells[columns.field] || '').trim()
    if (!db || !table || !field) continue
    if (isEmptyConfig(cells, columns)) continue

    const cfg: FieldConfig = {}
    const alias = columns.alias >= 0 ? (cells[columns.alias] || '').trim() : ''
    const comment = columns.comment >= 0 ? (cells[columns.comment] || '').trim() : ''
    const role = parseRole(columns.role >= 0 ? cells[columns.role] || '' : '')
    const hidden = parseHidden(columns.hidden >= 0 ? cells[columns.hidden] || '' : '')
    const unit = columns.unit >= 0 ? (cells[columns.unit] || '').trim() : ''
    const geo = parseGeo(columns.geo >= 0 ? cells[columns.geo] || '' : '')

    if (alias) cfg.alias = alias
    if (comment) cfg.comment = comment
    if (role) cfg.role = role
    cfg.hidden = hidden // parseHidden 始终返回 boolean，无需守卫
    if (unit) cfg.unit = unit
    if (geo) cfg.geo = geo

    const key = fieldKey(db, table, field)
    if (map[key]) {
      console.warn(`[field-config] sheet2 重复字段配置，后者覆盖前者: ${key}`)
    }
    map[key] = cfg
  }
  return map
}

/** 按 key 后缀唯一命中查找（缺少库名时的兜底；多个候选 → 放弃，避免误配） */
function lookupUniqueBySuffix<T>(map: Record<string, T>, suffix: string): T | undefined {
  const hits = Object.keys(map).filter((k) => k.endsWith(suffix))
  return hits.length === 1 ? map[hits[0]] : undefined
}

/**
 * 按「数据库名|表名|字段名」查找配置；未命中返回 undefined。
 * 精确键未命中时（库名为空的 JDBC 类型，或 sheet1 物理库名与 sheet2 业务库名不一致），
 * 按「|表名|字段名」全局唯一命中兜底；多个候选 → 放弃，避免误配。
 */
export function matchField(
  map: FieldConfigMap,
  databaseName: string,
  tableName: string,
  fieldName: string,
): FieldConfig | undefined {
  const exact = map[fieldKey(databaseName, tableName, fieldName)]
  if (exact) return exact
  return lookupUniqueBySuffix(map, `|${norm(tableName)}|${norm(fieldName)}`)
}

/** 列出 sheet2 为某表配置过的字段名（已归一化；用于诊断「配置了但库里不存在」的拼写错误） */
export function listConfiguredFields(
  map: FieldConfigMap,
  databaseName: string,
  tableName: string,
): string[] {
  const keys = Object.keys(map)
  const direct = keys.filter((k) => k.startsWith(`${norm(databaseName)}|${norm(tableName)}|`))
  if (direct.length) return direct.map((k) => k.split('|').pop() || '')
  // 库名失配（JDBC 无库名列，或 sheet1/sheet2 库名语义不同）：与 matchField 兜底同口径，按「|表名|」中段收集
  const mid = `|${norm(tableName)}|`
  return keys.filter((k) => k.includes(mid)).map((k) => k.split(mid)[1] || '')
}

// ==================== 表级「问数模型名称」映射 ====================

/** 表级模型名映射：「数据库名|表名」→ 中文名（问数模型名称，取自第 3 列） */
export type ModelNameMap = Record<string, string>

/** 「数据库名|表名」匹配键（表级，各段已归一化） */
export function modelKey(databaseName: string, tableName: string): string {
  return `${norm(databaseName)}|${norm(tableName)}`
}

/**
 * 将 sheet2 的数据行构建为表级模型名映射（取「中文名(问数模型名称)」列）。
 * - 库名/表名任一为空，或中文名列被禁用（-1，如旧 9 列模板）→ 跳过该行
 * - 中文名为空 → 跳过（查找时由调用方回退到默认模型名）
 * - 同一表多行 → 第一个非空中文名胜出
 */
export function buildModelNameMap(
  rows: string[][],
  columns: Sheet2Columns = DEFAULT_SHEET2_COLUMNS,
): ModelNameMap {
  const map: ModelNameMap = {}
  if (columns.modelName < 0) return map // 列未配置（旧模板无中文名列）→ 全部回退默认模型名
  for (const cells of rows) {
    const db = (cells[columns.db] || '').trim()
    const table = (cells[columns.table] || '').trim()
    if (!db || !table) continue
    const name = (cells[columns.modelName] || '').trim()
    if (!name) continue
    const key = modelKey(db, table)
    if (!(key in map)) map[key] = name // 第一个非空胜出
  }
  return map
}

/**
 * 按「数据库名|表名」查找模型名；未命中返回 undefined（调用方回退默认名）。
 * 精确键未命中时（库名为空的 JDBC 类型，或 sheet1/sheet2 库名写法不一致），
 * 按「|表名」全局唯一命中兜底（与 matchField 同口径）；多个候选 → 放弃，避免误配。
 */
export function matchModelName(
  map: ModelNameMap,
  databaseName: string,
  tableName: string,
): string | undefined {
  const exact = map[modelKey(databaseName, tableName)]
  if (exact) return exact
  return lookupUniqueBySuffix(map, `|${norm(tableName)}`)
}

// ==================== 表级建模清单（只建 sheet2 配置过的表） ====================

/**
 * 将 sheet2 的数据行构建为「数据库名 → [表名]」清单（键已归一化为小写）。
 * 只要某表在 sheet2 出现过（无论是否配了中文名/字段），就算「配置过」。
 */
export function buildTableConfigMap(
  rows: string[][],
  columns: Sheet2Columns = DEFAULT_SHEET2_COLUMNS,
): TableConfigMap {
  const map: TableConfigMap = {}
  for (const cells of rows) {
    const db = norm(cells[columns.db])
    const table = (cells[columns.table] || '').trim()
    if (!db || !table) continue
    const list = map[db] || (map[db] = [])
    if (!list.some((t) => norm(t) === norm(table))) list.push(table)
  }
  return map
}

/** filterTablesByConfig 的结果 */
export interface TableFilterResult {
  /** 清单内且数据源中存在的表（保持输入顺序） */
  kept: string[]
  /** 清单内但数据源中不存在的表（原始写法，去重） */
  missing: string[]
  /**
   * ''：库名精确命中，按该库清单过滤
   * 'table-fallback'：库名未命中，按「配置表名 ∩ 数据源表名」兜底过滤
   *   （sheet1 常填物理库名而 sheet2 填业务库名，库名本就不保证同源）
   * 'db-miss'：库名与表名均无交集——配置的表不在此数据源，调用方应跳过建模并提示
   */
  note: '' | 'table-fallback' | 'db-miss'
}

/**
 * 按 sheet2 表清单过滤数据源中的表名。
 * - 返回 null：sheet2 无任何表配置 → 不过滤（全量，兼容无 sheet2 的旧文件）
 * - 库名精确命中：按该库清单过滤
 * - 库名未命中（含库名为空的 JDBC 类型）：按「全部配置表名 ∩ 数据源表名」兜底，
 *   与 matchModelName/matchField 的表名兜底同口径；无交集 → note='db-miss'
 */
export function filterTablesByConfig(
  tableNames: string[],
  tableConfigMap: TableConfigMap | undefined | null,
  databaseName: string,
): TableFilterResult | null {
  if (!tableConfigMap || Object.keys(tableConfigMap).length === 0) return null
  const db = norm(databaseName)
  let rawNames = tableConfigMap[db]
  if (!rawNames && !db) {
    rawNames = Object.values(tableConfigMap).flat()
  }
  if (rawNames) {
    const existing = new Set(tableNames.map((t) => norm(t)))
    const wanted = new Set(rawNames.map((t) => norm(t)))
    return {
      kept: tableNames.filter((t) => wanted.has(norm(t))),
      missing: [...new Set(rawNames.filter((t) => !existing.has(norm(t))))],
      note: '',
    }
  }
  // 库名失配：按配置表名兜底（表名是强标识；一个数据源一张物理库，同名冲突罕见，
  // 冲突时交集会同时含两张，属可接受的保守行为）
  const allConfigured = new Set(Object.values(tableConfigMap).flat().map((t) => norm(t)))
  const byTable = tableNames.filter((t) => allConfigured.has(norm(t)))
  if (byTable.length === 0) {
    return { kept: [], missing: [], note: 'db-miss' }
  }
  return { kept: byTable, missing: [], note: 'table-fallback' }
}

// ==================== sheet2 总入口 ====================

/** buildSheet2Config 的产出：字段配置 + 模型名映射 + 建模表清单 */
export interface Sheet2Config {
  fieldConfig: FieldConfigMap
  modelNameMap: ModelNameMap
  tableConfigMap: TableConfigMap
}

/**
 * 解析 sheet2 原始矩阵（含表头行，string[][]）：
 * 向下扫描定位表头（容错顶部标题/说明行）→ 识别列索引 → 库名/表名/中文名向下填充 → 构建三个映射。
 * 找不到可识别表头时按首行 + 模板默认列序解析（与旧版行为一致）。
 */
export function buildSheet2Config(matrix: string[][]): Sheet2Config {
  let headerIdx = 0
  const scanLimit = Math.min(matrix.length, 5)
  for (let i = 0; i < scanLimit; i++) {
    if (isHeaderRow(matrix[i] || [])) {
      headerIdx = i
      break
    }
  }
  const columns = resolveSheet2Columns((matrix[headerIdx] || []).map((c) => String(c ?? '')))
  const filled = fillDownSheet2Rows(matrix.slice(headerIdx + 1), columns)
  return {
    fieldConfig: buildFieldConfigMap(filled, columns),
    modelNameMap: buildModelNameMap(filled, columns),
    tableConfigMap: buildTableConfigMap(filled, columns),
  }
}
