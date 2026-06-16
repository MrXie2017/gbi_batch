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
    cfg.hidden = hidden // parseHidden 始终返回 boolean，无需守卫
    if (unit) cfg.unit = unit

    const key = fieldKey(db, table, field)
    if (map[key]) {
      console.warn(`[field-config] sheet2 重复字段配置，后者覆盖前者: ${key}`)
    }
    map[key] = cfg
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
  // 与 buildFieldConfigMap 构建 key 时一致地 trim，避免查找参数带空格时静默 miss
  return map[fieldKey(
    (databaseName || '').trim(),
    (tableName || '').trim(),
    (fieldName || '').trim(),
  )]
}
