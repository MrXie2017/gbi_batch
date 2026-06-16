import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as xlsx from 'xlsx'
import { createTemplate } from './excel-parser'
import { getFieldGroup } from './db-types'
import { buildFieldConfigMap, matchField } from './field-config'

const tmpFiles: string[] = []
function tmpPath(tag: string): string {
  const p = path.join(os.tmpdir(), `gbi_tpl_${tag}_${Date.now()}.xlsx`)
  tmpFiles.push(p)
  return p
}
afterEach(() => {
  for (const f of tmpFiles) {
    try { fs.unlinkSync(f) } catch { /* ignore */ }
  }
  tmpFiles.length = 0
})

describe('createTemplate', () => {
  // 用真实字段分组（sql → MySQL 5.X），避免手造 TemplateField 漂移
  const fields = getFieldGroup('MySQL 5.X').fields

  it('生成双 sheet：[数据源, 字段配置]', () => {
    const p = createTemplate(tmpPath('a'), fields, 'MySQL 5.X')
    const wb = xlsx.readFile(p)
    expect(wb.SheetNames).toEqual(['数据源', '字段配置'])
  })

  it('sheet2 含 9 列固定表头（含「标记地理信息」，与解析列索引一致）', () => {
    const p = createTemplate(tmpPath('b'), fields, 'MySQL 5.X')
    const wb = xlsx.readFile(p)
    const matrix = xlsx.utils.sheet_to_json<string[]>(wb.Sheets['字段配置'], { header: 1, defval: '' })
    expect(matrix[0]).toEqual([
      '数据库名', '表名', '字段名', '别名', '字段备注',
      '维度或度量', '在分析中隐藏', '字段单位', '标记地理信息',
    ])
  })

  it('sheet1（数据源）仍正常生成，不受追加 sheet2 影响', () => {
    const p = createTemplate(tmpPath('c'), fields, 'MySQL 5.X')
    const wb = xlsx.readFile(p)
    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['数据源'])
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(Object.keys(rows[0])).toContain('数据源名称')
  })

  it('模板的 sheet2 示例行能被 buildFieldConfigMap 正确解析（度量 amount → 单位元）', () => {
    const p = createTemplate(tmpPath('d'), fields, 'MySQL 5.X')
    const wb = xlsx.readFile(p)
    const matrix = xlsx.utils.sheet_to_json<string[]>(wb.Sheets['字段配置'], { header: 1, defval: '' })
    // 与 excel-parser.parseExcel 完全一致的转换方式
    const map = buildFieldConfigMap(matrix.slice(1).map((r) => r.map((c) => String(c ?? ''))))
    const cfg = matchField(map, 'your_db', 'your_table', 'amount')
    expect(cfg).toBeDefined()
    expect(cfg!.role).toBe('measure')
    expect(cfg!.unit).toBe('元')
    expect(cfg!.alias).toBe('金额')
    expect(cfg!.comment).toBe('订单金额')
  })

  it('模板 sheet2 示例行 region 标记为地名/区域（geo=geo），lng 标记经度', () => {
    const p = createTemplate(tmpPath('e'), fields, 'MySQL 5.X')
    const wb = xlsx.readFile(p)
    const matrix = xlsx.utils.sheet_to_json<string[]>(wb.Sheets['字段配置'], { header: 1, defval: '' })
    const map = buildFieldConfigMap(matrix.slice(1).map((r) => r.map((c) => String(c ?? ''))))
    const region = matchField(map, 'your_db', 'your_table', 'region')!
    expect(region.role).toBe('dimension')
    expect(region.geo).toBe('geo')
    expect(matchField(map, 'your_db', 'your_table', 'lng')!.geo).toBe('lng')
  })
})
