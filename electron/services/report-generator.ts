import { writeFileSync, mkdirSync } from 'fs'
import * as path from 'path'

export interface ReportItem {
  index: number
  name: string
  host: string
  type: number
  testStatus: 'success' | 'failed' | 'skipped'
  testMsg: string
  addStatus: 'success' | 'failed' | 'skipped' | 'pending'
  addMsg: string
}

export interface ReportSummary {
  total: number
  success: number
  failed: number
  skipped: number
  stopped: boolean
  timestamp: string
}

export interface Report {
  summary: ReportSummary
  items: ReportItem[]
}

/**
 * 生成执行报告并保存
 */
export function generateReport(report: Report, saveDir: string): string {
  mkdirSync(saveDir, { recursive: true })
  const timestamp = report.summary.timestamp.replace(/[:.]/g, '-')
  const filePath = path.join(saveDir, `batch_report_${timestamp}.csv`)

  const headers = ['序号', '数据源名称', '地址', '类型编码', '测试状态', '测试信息', '添加状态', '添加信息']
  const statusMap: Record<string, string> = {
    success: '成功',
    failed: '失败',
    skipped: '跳过',
    pending: '未执行',
  }

  const lines = [
    headers.join(','),
    ...report.items.map((item) =>
      [
        item.index,
        `"${item.name}"`,
        item.host,
        item.type,
        statusMap[item.testStatus] || item.testStatus,
        `"${item.testMsg.replace(/"/g, '""')}"`,
        statusMap[item.addStatus] || item.addStatus,
        `"${item.addMsg.replace(/"/g, '""')}"`,
      ].join(','),
    ),
    '',
    `汇总,总计:${report.summary.total},成功:${report.summary.success},失败:${report.summary.failed},跳过:${report.summary.skipped}`,
  ]

  writeFileSync(filePath, '﻿' + lines.join('\n'), 'utf-8') // BOM for Excel
  return filePath
}
