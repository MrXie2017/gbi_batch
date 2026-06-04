import { ipcMain, BrowserWindow } from 'electron'
import { SugarApiClient } from '../services/sugar-api'

interface BatchItem {
  name: string
  type: string
  host: string
  port: string
  database: string
  username: string
  password: string
  desc?: string
}

interface BatchParams {
  baseUrl: string
  cookie: string
  csrfToken: string
  groupId: string
  sugarCompany: string
  items: BatchItem[]
  skipTest: boolean
  delay: number
}

let stopFlag = false

export function registerBatchIpc(
  ipc: typeof ipcMain,
  getMainWindow: () => BrowserWindow | null,
): void {
  /** 开始批量执行 */
  ipc.handle('batch:start', async (_event, params: BatchParams) => {
    stopFlag = false
    const mainWindow = getMainWindow()
    const client = new SugarApiClient(
      params.baseUrl,
      params.cookie,
      params.csrfToken,
      params.groupId,
      params.sugarCompany,
    )

    const total = params.items.length
    let success = 0
    let failed = 0
    let skipped = 0

    for (let i = 0; i < total; i++) {
      if (stopFlag) break

      const item = params.items[i]
      const row = {
        数据源名称: item.name,
        类型: item.type,
        数据库地址: item.host,
        端口: item.port,
        数据库名: item.database,
        用户名: item.username,
        密码: item.password,
        描述: item.desc || '',
      }

      const payload = SugarApiClient.buildPayload(row)

      const itemResult: any = {
        index: i + 1,
        name: item.name,
        host: item.host,
        testStatus: 'skipped',
        testMsg: '',
        addStatus: 'pending',
        addMsg: '',
      }

      // 发送进度
      mainWindow?.webContents.send('batch:progress', {
        current: i + 1,
        total,
        status: 'running',
      })

      // 步骤1: 测试连接
      if (!params.skipTest) {
        const testResult = await client.testConnection(payload)
        itemResult.testStatus = testResult.status === 0 ? 'success' : 'failed'
        itemResult.testMsg = testResult.msg || ''

        if (testResult.status !== 0) {
          itemResult.addStatus = 'skipped'
          itemResult.addMsg = `测试失败: ${itemResult.testMsg}`
          skipped++
          mainWindow?.webContents.send('batch:itemResult', itemResult)
          continue
        }
      }

      // 步骤2: 添加数据源
      const addResult = await client.addDatasource(payload)
      if (addResult.status === 0) {
        itemResult.addStatus = 'success'
        itemResult.addMsg = addResult.msg || '添加成功'
        success++
      } else {
        itemResult.addStatus = 'failed'
        itemResult.addMsg = addResult.msg || '添加失败'
        failed++
      }

      mainWindow?.webContents.send('batch:itemResult', itemResult)

      // 延迟
      if (params.delay > 0 && i < total - 1) {
        await new Promise((resolve) => setTimeout(resolve, params.delay * 1000))
      }
    }

    // 发送完成事件
    const completedData = {
      total,
      success,
      failed,
      skipped,
      stopped: stopFlag,
    }
    mainWindow?.webContents.send('batch:completed', completedData)
    mainWindow?.webContents.send('batch:progress', {
      current: total,
      total,
      status: stopFlag ? 'stopped' : 'running',
    })
  })

  /** 停止批量执行 */
  ipc.handle('batch:stop', async () => {
    stopFlag = true
  })
}
