import * as xlsx from 'xlsx'
import * as path from 'path'
import type { TemplateField } from './db-types'

export interface ParseResult {
  columns: string[]
  rows: Record<string, any>[]
  total: number
}

/**
 * 解析 Excel/CSV 文件
 */
export function parseExcel(filePath: string): ParseResult {
  const wb = xlsx.readFile(filePath, { type: 'file' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const jsonData = xlsx.utils.sheet_to_json<Record<string, any>>(ws)

  if (jsonData.length === 0) {
    return { columns: [], rows: [], total: 0 }
  }

  const columns = Object.keys(jsonData[0])
  return {
    columns,
    rows: jsonData,
    total: jsonData.length,
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

  xlsx.writeFile(wb, savePath)
  return savePath
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
