import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as xlsx from 'xlsx'
import { createTemplate, parseExcel } from './excel-parser'
import { getFieldGroup } from './db-types'
import { buildFieldConfigMap, matchField, buildModelNameMap, matchModelName } from './field-config'

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

  it('sheet2 含 10 列固定表头（含「中文名(问数模型名称)」，与解析列索引一致）', () => {
    const p = createTemplate(tmpPath('b'), fields, 'MySQL 5.X')
    const wb = xlsx.readFile(p)
    const matrix = xlsx.utils.sheet_to_json<string[]>(wb.Sheets['字段配置'], { header: 1, defval: '' })
    expect(matrix[0]).toEqual([
      '数据库名', '表名', '中文名(问数模型名称)', '字段名', '别名', '字段备注',
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

  it('模板示例 your_table 的中文名「示例问数模型」能被 buildModelNameMap 解析', () => {
    const p = createTemplate(tmpPath('f'), fields, 'MySQL 5.X')
    const wb = xlsx.readFile(p)
    const matrix = xlsx.utils.sheet_to_json<string[]>(wb.Sheets['字段配置'], { header: 1, defval: '' })
    const map = buildModelNameMap(matrix.slice(1).map((r) => r.map((c) => String(c ?? ''))))
    expect(matchModelName(map, 'your_db', 'your_table')).toBe('示例问数模型')
  })
})

describe('parseExcel（sheet2 中文名 → modelNameMap）', () => {
  it('解析含中文名列的 sheet2 → modelNameMap 命中「数据库名|表名」', () => {
    const wb = xlsx.utils.book_new()
    const ws1 = xlsx.utils.aoa_to_sheet([['数据源名称'], ['ds1']])
    xlsx.utils.book_append_sheet(wb, ws1, '数据源')
    const ws2 = xlsx.utils.aoa_to_sheet([
      ['数据库名', '表名', '中文名(问数模型名称)', '字段名'],
      ['dbA', 't_user', '用户表', 'name'],
    ])
    xlsx.utils.book_append_sheet(wb, ws2, '字段配置')
    const p = tmpPath('g')
    xlsx.writeFile(wb, p)
    const result = parseExcel(p)
    expect(result.modelNameMap).toBeDefined()
    expect(result.modelNameMap!['dba|t_user']).toBe('用户表') // key 已归一化为小写
  })
})

describe('parseExcel（sheet2 定位与容错）', () => {
  function writeBook(sheets: { name: string; aoa: any[][] }[]): string {
    const wb = xlsx.utils.book_new()
    for (const s of sheets) xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(s.aoa), s.name)
    const p = tmpPath('loc')
    xlsx.writeFile(wb, p)
    return p
  }

  it('「字段配置」不在第 2 个位置（前面插入了说明 sheet）仍能按 sheet 名解析', () => {
    const p = writeBook([
      { name: '数据源', aoa: [['数据源名称'], ['ds1']] },
      { name: '说明', aoa: [['随便写']] },
      { name: '字段配置', aoa: [
        ['数据库名', '表名', '中文名(问数模型名称)', '字段名', '别名'],
        ['dbA', 't_user', '用户表', 'name', '姓名'],
      ] },
    ])
    const result = parseExcel(p)
    expect(matchModelName(result.modelNameMap!, 'dbA', 't_user')).toBe('用户表')
  })

  it('合并单元格形态（库/表/中文名只在组首行填写）也能全量解析', () => {
    const p = writeBook([
      { name: '数据源', aoa: [['数据源名称'], ['ds1']] },
      { name: '字段配置', aoa: [
        ['数据库名', '表名', '中文名(问数模型名称)', '字段名', '别名', '字段备注', '维度或度量', '在分析中隐藏', '字段单位', '标记地理信息'],
        ['dbA', 't_user', '用户表', 'name', '姓名', '', '维度', '', '', ''],
        ['', '', '', 'amount', '金额', '订单金额', '度量', '否', '元', ''],
        ['', '', '', 'city', '城市', '', '维度', '', '', '地名/区域'],
      ] },
    ])
    const result = parseExcel(p)
    expect(matchField(result.fieldConfig!, 'dbA', 't_user', 'name')!.alias).toBe('姓名')
    expect(matchField(result.fieldConfig!, 'dbA', 't_user', 'amount')!.unit).toBe('元')
    expect(matchField(result.fieldConfig!, 'dbA', 't_user', 'city')!.geo).toBe('geo')
    expect(matchModelName(result.modelNameMap!, 'dbA', 't_user')).toBe('用户表')
    expect(result.tableConfigMap!['dba']).toEqual(['t_user'])
  })

  it('无 sheet2 → tableConfigMap 为空对象', () => {
    const p = writeBook([{ name: '数据源', aoa: [['数据源名称'], ['ds1']] }])
    const result = parseExcel(p)
    expect(result.tableConfigMap).toEqual({})
  })

  it('sheet 顺序调换（字段配置在前）时 sheet1 仍按名解析数据源行', () => {
    const p = writeBook([
      { name: '字段配置', aoa: [
        ['数据库名', '表名', '中文名(问数模型名称)', '字段名'],
        ['dbA', 't', '表A', 'f1'],
      ] },
      { name: '数据源', aoa: [['数据源名称'], ['ds1']] },
    ])
    const result = parseExcel(p)
    expect(result.rows.length).toBe(1)
    expect(result.rows[0]['数据源名称']).toBe('ds1')
    expect(matchModelName(result.modelNameMap!, 'dbA', 't')).toBe('表A')
  })
})
