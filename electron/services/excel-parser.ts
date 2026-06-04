import * as xlsx from 'xlsx'
import * as path from 'path'

export interface ParseResult {
  columns: string[]
  rows: Record<string, any>[]
  total: number
}

/**
 * 解析 Excel/CSV 文件
 */
export function parseExcel(filePath: string): ParseResult {
  const ext = path.extname(filePath).toLowerCase()
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
 * 生成模板文件
 */
export function createTemplate(savePath: string): string {
  const columns = ['数据源名称', '类型', '数据库地址', '端口', '数据库名', '用户名', '密码', '描述']
  const sampleData = [
    ['测试MySQL', 'MySQL 5.X', '192.168.1.100', '3306', 'test_db', 'root', 'password', '测试数据库'],
    ['生产PG', 'PostgreSQL', '192.168.1.200', '5432', 'prod_db', 'postgres', 'password', '生产PG'],
    ['数据仓库CH', 'Clickhouse', '192.168.1.300', '8123', 'dw_db', 'default', 'password', 'Clickhouse'],
  ]

  const ws = xlsx.utils.aoa_to_sheet([columns, ...sampleData])
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, '数据源')

  // 设置列宽
  ws['!cols'] = [
    { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 8 },
    { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 20 },
  ]

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
