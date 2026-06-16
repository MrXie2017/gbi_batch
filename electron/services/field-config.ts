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
