import { ipcMain, BrowserWindow } from 'electron'
import { SugarApiClient } from '../services/sugar-api'
import { resolveDbType } from '../services/db-types'

interface BatchItem {
  name: string
  type: string
  host: string
  port: string
  database: string
  username: string
  password: string
  desc?: string
  url?: string
}

interface BatchParams {
  baseUrl: string
  cookie: string
  csrfToken: string
  groupId: string
  sugarCompany: string
  items: BatchItem[]
  delay: number
  dbTypeName: string
  dbTypeKey: string
  fieldConfigMap?: Record<string, any>
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

    // 执行前刷新 CSRF Token
    await client.refreshCsrfToken()

    const dbType = resolveDbType(params.dbTypeName)
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
        服务地址: item.host,
        端口: item.port,
        数据库名: item.database,
        用户名: item.username,
        密码: item.password,
        描述: item.desc || '',
        'JDBC URL': item.url || '',
      }

      const payload = SugarApiClient.buildPayload(row, params.dbTypeKey, params.dbTypeName)

      const itemResult: any = {
        index: i + 1,
        name: item.name,
        host: item.host,
        testStatus: 'skipped',
        testMsg: '',
        addStatus: 'pending',
        addMsg: '',
        modelStatus: 'pending' as string,
        modelMsg: '',
        modelTotal: 0,
        modelCreated: 0,
      }

      // 发送进度
      mainWindow?.webContents.send('batch:progress', {
        current: i + 1,
        total,
        status: 'running',
      })

      // 步骤1: 测试连接（必须通过）
      const testResult = await client.testConnection(payload)
      itemResult.testStatus = testResult.status === 0 ? 'success' : 'failed'
      itemResult.testMsg = testResult.msg || ''

      if (testResult.status !== 0) {
        itemResult.addStatus = 'skipped'
        itemResult.addMsg = `测试失败: ${itemResult.testMsg}`
        itemResult.modelStatus = 'skipped'
        itemResult.modelMsg = '跳过: 连接测试失败'
        skipped++
        mainWindow?.webContents.send('batch:itemResult', itemResult)
        continue
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
        itemResult.modelStatus = 'skipped'
        itemResult.modelMsg = '跳过: 添加数据源失败'
        failed++
        mainWindow?.webContents.send('batch:itemResult', itemResult)
        continue
      }

      // 步骤3: 自动创建数据模型
      // addDatasource 响应不含 hash，需从数据库列表按名称查找
      let databaseHash = addResult.data?.hash || null
      if (!databaseHash) {
        databaseHash = await client.getDatabaseHashByName(item.name)
      }
      if (!databaseHash) {
        itemResult.modelStatus = 'failed'
        itemResult.modelMsg = '无法获取数据源 hash'
        mainWindow?.webContents.send('batch:itemResult', itemResult)
        continue
      }

      try {
        await createModelsForDatasource(client, databaseHash, dbType, item.name, itemResult, mainWindow, params.fieldConfigMap)
      } catch (err: any) {
        itemResult.modelStatus = 'failed'
        itemResult.modelMsg = `模型创建异常: ${err.message}`
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

/**
 * 为一个数据源的所有表创建数据模型
 */
async function createModelsForDatasource(
  client: SugarApiClient,
  databaseHash: string,
  dbType: number,
  datasourceName: string,
  itemResult: any,
  mainWindow: BrowserWindow | null,
  fieldConfigMap: Record<string, any> = {},
): Promise<void> {
  // 获取表列表
  const tableListResult = await client.getTableList(databaseHash)
  if (tableListResult.status !== 0 || !tableListResult.data?.length) {
    itemResult.modelStatus = tableListResult.data?.length === 0 ? 'success' : 'failed'
    itemResult.modelMsg = tableListResult.data?.length === 0
      ? '数据源中无表'
      : `获取表列表失败: ${tableListResult.msg}`
    itemResult.modelTotal = 0
    itemResult.modelCreated = 0
    return
  }

  const tables: { value: string; label: string }[] = tableListResult.data
  itemResult.modelTotal = tables.length
  itemResult.modelStatus = 'running'
  itemResult.modelMsg = `正在创建模型 (0/${tables.length})`
  mainWindow?.webContents.send('batch:itemResult', itemResult)

  let modelCreated = 0

  for (let t = 0; t < tables.length; t++) {
    if (stopFlag) break

    const table = tables[t]
    const tableName = table.value
    // 用 "数据源名称_表名" 作为模型名，避免不同数据源的表名重复
    const modelName = `${datasourceName}_${tableName}`

    // 3.1 创建空模型
    const createResult = await client.createDataModel(databaseHash, modelName)
    if (createResult.status !== 0 || !createResult.data?.hash) {
      console.log(`[model] 创建模型失败 "${tableName}": ${createResult.msg}`)
      continue
    }

    const modelHash = createResult.data.hash

    // 3.2 加锁
    await client.lockModel(modelHash)

    try {
      // 3.3 获取表字段结构
      const schemaResult = await client.getTableSchema(databaseHash, tableName, modelHash)
      if (schemaResult.status !== 0 || !schemaResult.data?.length) {
        console.log(`[model] 获取表结构失败 "${tableName}": ${schemaResult.msg}`)
        continue
      }

      // 3.4 构建模型配置并保存
      const savePayload = SugarApiClient.buildModelSavePayload(
        modelHash,
        modelName,
        databaseHash,
        dbType,
        schemaResult.data,
        tableName,
        datasourceName,
        fieldConfigMap,
      )

      const saveResult = await client.saveDataModel(savePayload)
      if (saveResult.status === 0) {
        modelCreated++
      } else {
        console.log(`[model] 保存模型失败 "${tableName}": ${saveResult.msg}`)
      }
    } finally {
      // 3.5 解锁（无论成功失败都要解锁）
      await client.unlockModel(modelHash)
    }

    // 更新进度
    itemResult.modelCreated = modelCreated
    itemResult.modelMsg = `正在创建模型 (${t + 1}/${tables.length})`
    mainWindow?.webContents.send('batch:itemResult', itemResult)
  }

  // 最终状态
  if (modelCreated === tables.length) {
    itemResult.modelStatus = 'success'
    itemResult.modelMsg = `已创建 ${modelCreated} 个模型`
  } else if (modelCreated > 0) {
    itemResult.modelStatus = 'partial'
    itemResult.modelMsg = `${modelCreated}/${tables.length} 个模型创建成功`
  } else {
    itemResult.modelStatus = 'failed'
    itemResult.modelMsg = `模型创建失败 (0/${tables.length})`
  }
  itemResult.modelCreated = modelCreated
}
