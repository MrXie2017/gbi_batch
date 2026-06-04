import { ipcMain, dialog, BrowserWindow } from 'electron'
import { parseExcel, createTemplate, exportReport } from '../services/excel-parser'

export function registerFileIpc(
  ipc: typeof ipcMain,
  _getMainWindow: () => BrowserWindow | null,
): void {
  /** 打开文件选择对话框 */
  ipc.handle('file:selectFile', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择数据源文件',
      filters: [
        { name: 'Excel 文件', extensions: ['xlsx', 'xls'] },
        { name: 'CSV 文件', extensions: ['csv'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  /** 解析文件 */
  ipc.handle('file:parseFile', async (_event, filePath: string) => {
    return parseExcel(filePath)
  })

  /** 生成模板文件 */
  ipc.handle('file:createTemplate', async (_event, defaultPath: string) => {
    const result = await dialog.showSaveDialog({
      title: '保存模板文件',
      defaultPath: defaultPath || 'datasource_template.xlsx',
      filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
    })
    if (result.canceled || !result.filePath) return ''
    return createTemplate(result.filePath)
  })

  /** 导出报告 */
  ipc.handle('file:exportReport', async (_event, data: any[], defaultPath: string) => {
    const result = await dialog.showSaveDialog({
      title: '导出报告',
      defaultPath: defaultPath || `batch_report.csv`,
      filters: [
        { name: 'CSV 文件', extensions: ['csv'] },
        { name: 'Excel 文件', extensions: ['xlsx'] },
      ],
    })
    if (result.canceled || !result.filePath) return ''
    return exportReport(data, result.filePath)
  })
}
