import * as xlsx from 'xlsx'
import * as path from 'path'
import type { TemplateField } from './db-types'
import { buildSheet2Config } from './field-config'
import type { FieldConfigMap, ModelNameMap, TableConfigMap } from './field-config'

export interface ParseResult {
  columns: string[]
  rows: Record<string, any>[]
  total: number
  fieldConfig?: FieldConfigMap
  modelNameMap?: ModelNameMap
  /** sheet2 已配置的建模表清单（数据库名 → [表名]） */
  tableConfigMap?: TableConfigMap
}

/** 定位 sheet2「字段配置」：优先按 sheet 名匹配（兼容「字段配置」「字段配置表」等命名），回退第 2 个 sheet */
function findConfigSheet(wb: xlsx.WorkBook): xlsx.WorkSheet | null {
  const name = wb.SheetNames.find((n) => n.includes('字段') && n.includes('配置'))
  if (name) return wb.Sheets[name]
  const fallback = wb.SheetNames[1]
  return fallback ? wb.Sheets[fallback] : null
}

/** 定位 sheet1「数据源」：优先按 sheet 名匹配（用户可能调序/增删 sheet），回退第 1 个 sheet */
function findDatasourceSheet(wb: xlsx.WorkBook): xlsx.WorkSheet {
  const name = wb.SheetNames.find((n) => n.includes('数据源'))
  return wb.Sheets[name || wb.SheetNames[0]]
}

/**
 * 解析 Excel/CSV 文件
 */
export function parseExcel(filePath: string): ParseResult {
  const wb = xlsx.readFile(filePath, { type: 'file' })
  const ws = findDatasourceSheet(wb)
  const jsonData = xlsx.utils.sheet_to_json<Record<string, any>>(ws)

  // 解析 sheet2（字段配置表）；不存在或为空 → 空 map
  let fieldConfig: FieldConfigMap = {}
  let modelNameMap: ModelNameMap = {}
  let tableConfigMap: TableConfigMap = {}
  const ws2 = findConfigSheet(wb)
  if (ws2) {
    // header:1 → 返回二维数组（含表头行）；defval 让空单元格为空串而非跳过
    const matrix = xlsx.utils.sheet_to_json<string[]>(ws2, { header: 1, defval: '' })
    if (matrix.length > 1) {
      // 表头识别列索引 + 库名/表名/中文名向下填充（兼容合并单元格/按组填写），再构建三个映射
      const parsed = buildSheet2Config(matrix.map((r) => r.map((c) => String(c ?? ''))))
      fieldConfig = parsed.fieldConfig
      modelNameMap = parsed.modelNameMap
      tableConfigMap = parsed.tableConfigMap
    }
  }

  if (jsonData.length === 0) {
    return { columns: [], rows: [], total: 0, fieldConfig, modelNameMap, tableConfigMap }
  }

  const columns = Object.keys(jsonData[0])
  return {
    columns,
    rows: jsonData,
    total: jsonData.length,
    fieldConfig,
    modelNameMap,
    tableConfigMap,
  }
}

/**
 * 生成模板文件 - 根据字段分组动态生成不同列
 */
export function createTemplate(
  savePath: string,
  fields: TemplateField[],
  dbTypeName: string,
): string {
  const columns = fields.map((f) => f.label)

  // 生成示例数据行
  const sampleRow: string[] = fields.map((f) => {
    if (f.defaultVal) return f.defaultVal
    switch (f.key) {
      case 'name': return `测试${dbTypeName}`
      case 'host': return fields.some((ff) => ff.key === 'url') ? '192.168.1.100' : '192.168.1.100'
      case 'port': return '3306'
      case 'database': return 'test_db'
      case 'username': return 'root'
      case 'password': return 'password'
      case 'url': return `jdbc:mysql://192.168.1.100:3306/test_db`
      case 'desc': return '测试数据源'
      default: return ''
    }
  })

  const ws = xlsx.utils.aoa_to_sheet([columns, sampleRow])
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, '数据源')

  // 设置列宽
  ws['!cols'] = fields.map((f) => {
    if (f.key === 'url') return { wch: 50 }
    if (f.key === 'desc') return { wch: 20 }
    if (f.key === 'name') return { wch: 15 }
    if (f.key === 'port') return { wch: 8 }
    return { wch: 18 }
  })

  // sheet2：字段配置模板（与 sheet1 配合使用；解析按列索引匹配）
  appendFieldConfigTemplate(wb)

  xlsx.writeFile(wb, savePath)
  return savePath
}

/**
 * 向工作簿追加 sheet2「字段配置」模板。
 * 固定 10 列 + 3 行示例。注意「数据库名」需与 sheet1 的数据库名一致才能匹配（忽略大小写）。
 * 第 3 列「中文名(问数模型名称)」：按「数据库名|表名」匹配，作为创建数据模型的名称；
 *   为空则回退为「数据源名_表名」。
 * 第 10 列「标记地理信息」对应 dimension.convert.label：地名/区域=geo, 经度=lng, 纬度=lat，仅维度生效。
 * 解析按表头文字识别列（resolveSheet2Columns），插入/调整列序均兼容；表头缺失时回退模板列序。
 * 「数据库名/表名/中文名」支持合并单元格或按组只填一次（解析时自动向下填充）。
 * sheet2 中出现过的表才会被批量建模（buildTableConfigMap 过滤）；sheet2 缺失时保持全量建模。
 */
function appendFieldConfigTemplate(wb: xlsx.WorkBook): void {
  const headers = [
    '数据库名', '表名', '中文名(问数模型名称)', '字段名', '别名', '字段备注',
    '维度或度量', '在分析中隐藏', '字段单位', '标记地理信息',
  ]
  const examples: string[][] = [
    ['your_db', 'your_table', '示例问数模型', 'region', '行政区', '', '维度', '', '', '地名/区域'],
    ['your_db', 'your_table', '示例问数模型', 'lng', '经度', '', '维度', '', '', '经度'],
    ['your_db', 'your_table', '示例问数模型', 'amount', '金额', '订单金额', '度量', '是', '元', ''],
  ]
  const ws2 = xlsx.utils.aoa_to_sheet([headers, ...examples])
  ws2['!cols'] = [
    { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 18 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
  ]
  xlsx.utils.book_append_sheet(wb, ws2, '字段配置')
}

/**
 * 导出执行报告
 */
export function exportReport(data: Record<string, any>[], savePath: string): string {
  const ws = xlsx.utils.json_to_sheet(data)
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, '执行报告')

  if (savePath.endsWith('.xlsx')) {
    xlsx.writeFile(wb, savePath)
  } else {
    const csv = xlsx.utils.sheet_to_csv(ws)
    const fs = require('fs')
    fs.writeFileSync(savePath, '﻿' + csv, 'utf-8') // BOM for Excel
  }
  return savePath
}
