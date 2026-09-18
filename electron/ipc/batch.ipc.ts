import { ipcMain, BrowserWindow } from 'electron'
import { SugarApiClient } from '../services/sugar-api'
import { resolveDbType } from '../services/db-types'
import type { FieldConfigMap, ModelNameMap, TableConfigMap } from '../services/field-config'
import { matchModelName, filterTablesByConfig, listConfiguredFields } from '../services/field-config'

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
  fieldConfigMap?: FieldConfigMap
  modelNameMap?: ModelNameMap
  tableConfigMap?: TableConfigMap
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
        await createModelsForDatasource(client, databaseHash, dbType, item.name, item.database, itemResult, mainWindow, params.fieldConfigMap, params.modelNameMap, params.tableConfigMap)
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
 * 为一个数据源的表创建数据模型（sheet2 配置了表清单时只建配置过的表）
 */
async function createModelsForDatasource(
  client: SugarApiClient,
  databaseHash: string,
  dbType: number,
  datasourceName: string,
  databaseName: string,
  itemResult: any,
  mainWindow: BrowserWindow | null,
  fieldConfigMap: FieldConfigMap = {},
  modelNameMap: ModelNameMap = {},
  tableConfigMap: TableConfigMap = {},
): Promise<void> {
  // 获取表列表
  const tableListResult = await client.getTableList(databaseHash)
  if (tableListResult.status !== 0) {
    itemResult.modelStatus = 'failed'
    itemResult.modelMsg = `获取表列表失败: ${tableListResult.msg}`
    itemResult.modelTotal = 0
    itemResult.modelCreated = 0
    return
  }

  let tables: { value: string; label: string }[] = tableListResult.data || []

  // 按 sheet2 配置过滤：只建配置清单里的表（value 做空值防护，防服务端脏数据炸掉整库）
  const allTableNames = tables.map((t) => String(t.value ?? ''))
  const filterResult = filterTablesByConfig(allTableNames, tableConfigMap, databaseName)
  let filterMsg = ''
  if (filterResult?.note === 'db-miss') {
    // sheet2 有配置但没配当前库名（多为库名笔误）：不过滤，但显式提示而非静默全量建模
    console.warn(
      `[model] sheet2 已配置 ${Object.keys(tableConfigMap).length} 个库，但未配置库名「${databaseName}」，未按 sheet2 过滤（全量建模）`,
    )
    filterMsg = '（sheet2 未配置该库名，未过滤）'
  } else if (filterResult) {
    if (filterResult.missing.length) {
      console.warn(
        `[model] sheet2 配置的表在数据源中不存在: ${filterResult.missing.slice(0, 10).join(', ')}` +
        `${filterResult.missing.length > 10 ? ` 等 ${filterResult.missing.length} 张` : ''}`,
      )
    }
    const keptSet = new Set(filterResult.kept)
    const matched = tables.filter((t) => keptSet.has(String(t.value ?? '')))
    filterMsg = filterResult.missing.length
      ? `（按 sheet2 过滤 ${matched.length}/${tables.length}，库中缺: ${filterResult.missing.slice(0, 5).join(', ')}${filterResult.missing.length > 5 ? '…' : ''}）`
      : `（按 sheet2 过滤 ${matched.length}/${tables.length}）`
    tables = matched
  }
  const unmatchedFieldNotes: string[] = []

  if (tables.length === 0) {
    itemResult.modelStatus = 'success'
    itemResult.modelMsg = filter
      ? `sheet2 配置的表均不在该数据源中，未创建模型${filterMsg}`
      : '数据源中无表'
    itemResult.modelTotal = 0
    itemResult.modelCreated = 0
    return
  }

  itemResult.modelTotal = tables.length
  itemResult.modelStatus = 'running'
  itemResult.modelMsg = `正在创建模型 (0/${tables.length})`
  mainWindow?.webContents.send('batch:itemResult', itemResult)

  let modelCreated = 0

  for (let t = 0; t < tables.length; t++) {
    if (stopFlag) break

    const table = tables[t]
    const tableName = table.value
    // 模型名 = 数据源名 + (sheet2「中文名(问数模型名称)」 || 表名)
    // 中文名取自 sheet2 第 3 列（按「数据库名|表名」匹配）；未配置则用表名
    const modelName = `${datasourceName}_${matchModelName(modelNameMap, databaseName, tableName) || tableName}`

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

      // 诊断：sheet2 配置了但表中不存在的字段（多为拼写/大小写笔误），告警并记入结果消息
      const schemaFields = new Set(schemaResult.data.map((f) => (f.name || '').trim().toLowerCase()))
      const unmatchedFields = listConfiguredFields(fieldConfigMap, databaseName, tableName)
        .filter((f) => !schemaFields.has(f))
      if (unmatchedFields.length) {
        console.warn(`[model] sheet2 配置的字段在表 "${tableName}" 中不存在: ${unmatchedFields.join(', ')}`)
        unmatchedFieldNotes.push(
          `${tableName}(${unmatchedFields.slice(0, 3).join(',')}${unmatchedFields.length > 3 ? `等${unmatchedFields.length}个` : ''})`,
        )
      }

      // 3.4 构建模型配置并保存
      const savePayload = SugarApiClient.buildModelSavePayload(
        modelHash,
        modelName,
        databaseHash,
        dbType,
        schemaResult.data,
        tableName,
        databaseName,
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

  // 最终状态（sheet2 相关提示统一拼在消息尾部，让打包后无终端的用户也能看到）
  const fieldMissMsg = unmatchedFieldNotes.length
    ? `；sheet2 字段未命中: ${unmatchedFieldNotes.slice(0, 5).join('、')}${unmatchedFieldNotes.length > 5 ? '…' : ''}`
    : ''
  const noteMsg = `${filterMsg}${fieldMissMsg}`
  if (modelCreated === tables.length) {
    itemResult.modelStatus = 'success'
    itemResult.modelMsg = `已创建 ${modelCreated} 个模型${noteMsg}`
  } else if (modelCreated > 0) {
    itemResult.modelStatus = 'partial'
    itemResult.modelMsg = `${modelCreated}/${tables.length} 个模型创建成功${noteMsg}`
  } else {
    itemResult.modelStatus = 'failed'
    itemResult.modelMsg = `模型创建失败 (0/${tables.length})${noteMsg}`
  }
  itemResult.modelCreated = modelCreated
}
