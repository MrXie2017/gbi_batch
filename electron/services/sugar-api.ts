import { resolveDbType } from './db-types'
import { matchField } from './field-config'
import type { FieldConfigMap } from './field-config'

/** 表结构中的字段信息 */
export interface TableFieldSchema {
  name: string
  type: string
  typeInDB: string
  comment: string
  nullable: boolean
  id: string
}

/** 数据模型保存配置 */
interface DataModelSavePayload {
  hash: string
  name: string
  remark: string
  config: {
    dbHashes: string[]
    homologous: any[]
    predicts: any[]
    tables: any[]
    dimensions: Record<string, any>
    measures: Record<string, any>
    dimensionMenu: any[]
    measureMenu: any[]
    filters: any[]
    limits: Record<string, any>
    fuzzy: Record<string, any>
    synTable: boolean
    removeDimOrMeaIds: string[]
    dimensionStatisticsValueKVHash: string
  }
  llmconfig: Record<string, any>
  sugQuestion: any[]
  sugQuestionLLM: any[]
  nlpOpen: number
  nlpState: number
  canUse: boolean
  updatedAt: string
  currentUserCanEdit: boolean
  dbType: number
}

interface DatasourcePayload {
  network: string
  region: string
  type: number
  tunnelHash: number
  name: string
  host: string
  port: string
  database: string
  username: string
  password: string
  remark?: string
  config?: Record<string, any>
}

interface ApiResult {
  status: number
  msg: string
  data?: any
}

export class SugarApiClient {
  private baseUrl: string
  private groupId: string
  private apiPrefix: string
  private headers: Record<string, string>

  constructor(
    baseUrl: string,
    cookie: string,
    csrfToken: string,
    groupId: string,
    sugarCompany: string,
  ) {
    this.baseUrl = new URL(baseUrl).origin
    this.groupId = groupId
    this.apiPrefix = `${this.baseUrl}/api/manage/group/${groupId}/database`

    // 从 cookie 中提取 sugar-company（如果参数为空或是掩码）
    let companyValue = sugarCompany
    if (!companyValue || companyValue === '***' || companyValue === '') {
      const match = cookie.match(/sugar-company=([^;]+)/)
      if (match) {
        companyValue = match[1]
        console.log('[api] sugar-company extracted from cookie:', companyValue)
      }
    }

    this.headers = {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'csrf-token': csrfToken,
      'sugar-company': companyValue,
      cookie,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      origin: this.baseUrl,
      referer: `${this.baseUrl}/group/${groupId}/manage/database`,
    }
  }

  /** 通过隐藏窗口加载页面获取 CSRF Token */
  async refreshCsrfToken(): Promise<string> {
    try {
      console.log('[api] refreshing CSRF token via hidden window...')
      const { BrowserWindow } = require('electron')

      const token = await new Promise<string>((resolve) => {
        let capturedToken = ''

        const win = new BrowserWindow({
          width: 800,
          height: 600,
          show: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        })

        // 拦截响应头捕获 CSRF Token
        win.webContents.session.webRequest.onHeadersReceived((details: any, callback: any) => {
          const h = details.responseHeaders || {}
          const csrf = h['csrf-token']?.[0] || h['Csrf-Token']?.[0] || h['CSRF-TOKEN']?.[0]
          if (csrf) {
            capturedToken = csrf
            console.log('[api] CSRF token from response header:', csrf)
          }
          callback({ responseHeaders: details.responseHeaders })
        })

        win.webContents.on('did-finish-load', async () => {
          try {
            const jsToken = await win.webContents.executeJavaScript(`
              (function() {
                var meta = document.querySelector('meta[name="csrf-token"]');
                if (meta) return meta.getAttribute('content');
                meta = document.querySelector('meta[name="Csrf-Token"]');
                if (meta) return meta.getAttribute('content');
                if (window.csrfToken) return window.csrfToken;
                if (window.__CSRF__) return window.__CSRF__;
                if (window.CSRF_TOKEN) return window.CSRF_TOKEN;
                var cookies = document.cookie.split(';');
                for (var i = 0; i < cookies.length; i++) {
                  var parts = cookies[i].trim().split('=');
                  if (parts[0] === 'csrf-token') return parts[1];
                }
                return '';
              })()
            `)
            if (jsToken) {
              capturedToken = jsToken
              console.log('[api] CSRF token from page JS:', jsToken)
            }
          } catch (e: any) {
            console.log('[api] executeJavaScript failed:', e.message)
          }

          setTimeout(() => {
            if (!win.isDestroyed()) win.close()
            resolve(capturedToken)
          }, 1500)
        })

        win.loadURL(`${this.baseUrl}/group/${this.groupId}/manage/database`)

        setTimeout(() => {
          if (!win.isDestroyed()) win.close()
          resolve(capturedToken)
        }, 20000)
      })

      if (token) {
        this.headers['csrf-token'] = token
        console.log('[api] CSRF token refreshed:', token)
      } else {
        console.log('[api] WARNING: failed to get CSRF token from hidden window')
      }
      return token || this.headers['csrf-token']
    } catch (err: any) {
      console.log('[api] refreshCsrfToken error:', err.message)
      return this.headers['csrf-token']
    }
  }

  /** 测试数据源连接 */
  async testConnection(dsInfo: DatasourcePayload): Promise<ApiResult> {
    try {
      const resp = await fetch(`${this.apiPrefix}/connectTest`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(dsInfo),
        signal: AbortSignal.timeout(30_000),
      })
      const text = await resp.text()
      try {
        return JSON.parse(text) as ApiResult
      } catch {
        return { status: resp.status, msg: text.substring(0, 200) }
      }
    } catch (err: any) {
      if (err.name === 'TimeoutError') {
        return { status: 500, msg: '连接超时' }
      }
      return { status: 500, msg: `请求异常: ${err.message}` }
    }
  }

  /** 添加数据源 */
  async addDatasource(dsInfo: DatasourcePayload): Promise<ApiResult> {
    try {
      const resp = await fetch(this.apiPrefix, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(dsInfo),
        signal: AbortSignal.timeout(30_000),
      })
      return (await resp.json()) as ApiResult
    } catch (err: any) {
      return { status: 500, msg: `请求异常: ${err.message}` }
    }
  }

  /** 从行数据构建 API 请求体 - 根据 dbTypeKey 适配不同字段分组 */
  static buildPayload(row: Record<string, any>, dbTypeKey: string = 'sql', dbTypeName: string = 'MySQL 5.X'): DatasourcePayload {
    const dbType = resolveDbType(dbTypeName)
    const base = {
      network: 'normal',
      region: 'gz',
      type: dbType,
      tunnelHash: 0,
      name: String(row['数据源名称'] || ''),
    }

    let payload: DatasourcePayload

    if (dbTypeKey === 'jdbc') {
      payload = {
        ...base,
        host: String(row['JDBC URL'] || ''),
        port: '',
        database: '',
        username: String(row['用户名'] || ''),
        password: String(row['密码'] || ''),
      }
    } else if (dbTypeKey === 'http') {
      payload = {
        ...base,
        host: String(row['服务地址'] || ''),
        port: String(row['端口'] || '9200'),
        database: '',
        username: String(row['用户名'] || ''),
        password: String(row['密码'] || ''),
      }
    } else if (dbTypeKey === 'nosql') {
      payload = {
        ...base,
        host: String(row['数据库地址'] || ''),
        port: String(row['端口'] || '27017'),
        database: String(row['数据库名'] || ''),
        username: String(row['用户名'] || ''),
        password: String(row['密码'] || ''),
      }
    } else {
      payload = {
        ...base,
        host: String(row['数据库地址'] || ''),
        port: String(row['端口'] || '3306'),
        database: String(row['数据库名'] || ''),
        username: String(row['用户名'] || ''),
        password: String(row['密码'] || ''),
      }
    }

    const desc = row['描述']
    if (desc && String(desc).trim()) {
      payload.remark = String(desc).trim()
    }

    // PostgreSQL 默认开启「JDBC方式连接」，走 JDBC 驱动；
    // 原生 pg 驱动在私有部署等环境下进入工作空间后查询会失败
    if (dbType === 2) {
      payload.config = { usePostgresDriver: true }
    }

    return payload
  }

  // ==================== 数据模型相关 API ====================

  /** 通过数据源名称查找其 hash（添加数据源后 API 不返回 hash，需从列表查） */
  async getDatabaseHashByName(name: string): Promise<string | null> {
    try {
      const resp = await fetch(
        `${this.baseUrl}/api/group/${this.groupId}/database/simpleList`,
        { headers: this.headers, signal: AbortSignal.timeout(15_000) },
      )
      const result = (await resp.json()) as ApiResult
      if (result.status === 0 && Array.isArray(result.data)) {
        const found = result.data.find((db: any) => db.name === name)
        return found?.hash || null
      }
      return null
    } catch {
      return null
    }
  }

  /** 获取数据源的表列表 */
  async getTableList(databaseHash: string): Promise<ApiResult> {
    try {
      const resp = await fetch(
        `${this.baseUrl}/api/group/${this.groupId}/database/${databaseHash}/getTableList`,
        { headers: this.headers, signal: AbortSignal.timeout(30_000) },
      )
      return (await resp.json()) as ApiResult
    } catch (err: any) {
      return { status: 500, msg: `获取表列表异常: ${err.message}` }
    }
  }

  /** 获取表的字段结构 */
  async getTableSchema(
    databaseHash: string,
    tableName: string,
    modelHash: string,
  ): Promise<ApiResult & { data?: TableFieldSchema[] }> {
    try {
      const url = `${this.baseUrl}/api/group/${this.groupId}/database/${databaseHash}/getTableSchema?table=${encodeURIComponent(tableName)}&datamodelHash=${modelHash}`
      const resp = await fetch(url, {
        headers: this.headers,
        signal: AbortSignal.timeout(30_000),
      })
      return (await resp.json()) as ApiResult & { data?: TableFieldSchema[] }
    } catch (err: any) {
      return { status: 500, msg: `获取表结构异常: ${err.message}` }
    }
  }

  /** 创建空数据模型 */
  async createDataModel(databaseHash: string, name: string): Promise<ApiResult> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/manage/group/${this.groupId}/dataModel`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ type: 1, databaseHash, name, parentHash: '' }),
        signal: AbortSignal.timeout(30_000),
      })
      return (await resp.json()) as ApiResult
    } catch (err: any) {
      return { status: 500, msg: `创建数据模型异常: ${err.message}` }
    }
  }

  /** 加编辑锁 */
  async lockModel(modelHash: string): Promise<ApiResult> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/dataModel/${modelHash}/lock`, {
        method: 'POST',
        headers: this.headers,
        signal: AbortSignal.timeout(15_000),
      })
      return (await resp.json()) as ApiResult
    } catch (err: any) {
      return { status: 500, msg: `加锁异常: ${err.message}` }
    }
  }

  /** 解编辑锁 */
  async unlockModel(modelHash: string): Promise<ApiResult> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/dataModel/${modelHash}/unlock`, {
        method: 'POST',
        headers: this.headers,
        signal: AbortSignal.timeout(15_000),
      })
      return (await resp.json()) as ApiResult
    } catch (err: any) {
      return { status: 500, msg: `解锁异常: ${err.message}` }
    }
  }

  /** 保存数据模型配置 */
  async saveDataModel(payload: DataModelSavePayload): Promise<ApiResult> {
    try {
      const resp = await fetch(
        `${this.baseUrl}/api/group/${this.groupId}/dataModel/${payload.hash}`,
        {
          method: 'PUT',
          headers: this.headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30_000),
        },
      )
      return (await resp.json()) as ApiResult
    } catch (err: any) {
      return { status: 500, msg: `保存数据模型异常: ${err.message}` }
    }
  }

  // ==================== 辅助函数 ====================

  /** 生成 SG 前缀的随机 ID（模拟前端 ID 生成） */
  static generateSGId(length: number = 16): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let id = 'SG'
    for (let i = 0; i < length; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return id
  }

  /**
   * 从表字段构建完整的数据模型保存请求体
   * @param modelHash    模型 hash
   * @param name         模型名称（通常 = 表名）
   * @param databaseHash 数据源 hash
   * @param dbType       数据库类型编码
   * @param schema       表字段结构（来自 getTableSchema）
   * @param tableName    表名（参与字段配置匹配键）
   * @param databaseName 数据库名（= sheet1「数据库名」列 item.database；匹配 sheet2「数据库名」列。
   *                      默认 '' → matchField 保证 miss，保留旧自动归类行为，向后兼容）
   * @param fieldConfigMap sheet2 字段配置映射；默认 {} → 无覆盖
   */
  static buildModelSavePayload(
    modelHash: string,
    modelName: string,
    databaseHash: string,
    dbType: number,
    schema: TableFieldSchema[],
    tableName: string,
    databaseName: string = '', // sheet1「数据库名」列值；'' → 保证 matchField miss，保留旧行为（向后兼容）
    fieldConfigMap: FieldConfigMap = {}, // {} → 无覆盖
  ): DataModelSavePayload {
    const tableId = SugarApiClient.generateSGId(14)
    const dimMenuId = SugarApiClient.generateSGId(16)
    const meaMenuId = SugarApiClient.generateSGId(16)

    const dimensions: Record<string, any> = {}
    const measures: Record<string, any> = {}
    const dimNodes: string[] = []
    const meaNodes: string[] = []

    for (const field of schema) {
      const cfg = matchField(fieldConfigMap, databaseName, tableName, field.name)

      // 归类：显式 role > 有 geo(地理标记仅维度生效，源码会把度量转为维度) > 自动(string→维度, 其余→度量)
      const isDimension = cfg?.role
        ? cfg.role === 'dimension'
        : cfg?.geo ? true : field.type === 'string'

      // alias/comment 空串 = 不覆盖（用 ||）；hidden 是布尔，用 ?? 保留显式 false
      const alias = cfg?.alias || field.name
      const comment = cfg?.comment || field.comment || ''
      const isHidden = cfg?.hidden ?? false

      if (isDimension) {
        dimensions[field.id] = {
          type: 'dimension',
          tableId,
          field: field.name,
          calculated: false,
          predictType: '',
          noEnumerable: false,
          expression: '',
          isAggregated: false,
          alias,
          NLPAlias: [],
          dataType: field.type,
          dataTypeInDB: field.typeInDB,
          isHidden,
          renameHash: '',
          hierarchyId: '',
          pathIds: [],
          convert: { type: '', label: cfg?.geo || '', original: '', dataType: '' },
          comment,
          statistics: {},
          calculatedConfig: {},
          remark: '',
        }
        dimNodes.push(field.id)
      } else {
        measures[field.id] = {
          type: 'measure',
          tableId,
          field: field.name,
          calculated: false,
          predictType: '',
          expression: '',
          isAggregated: false,
          alias,
          NLPAlias: [],
          dataType: field.type,
          dataTypeInDB: field.typeInDB,
          isHidden,
          defaultAggregator: 'SUM',
          convert: { type: '' },
          format: { accuracy: -1, dataFormat: '', unit: cfg?.unit || '' },
          comment,
          calculatedConfig: {},
          remark: '',
        }
        meaNodes.push(field.id)
      }
    }

    return {
      hash: modelHash,
      name: modelName,
      remark: '',
      config: {
        dbHashes: [databaseHash],
        homologous: [],
        predicts: [],
        tables: [{
          tableId,
          tableName,
          customTableHash: '',
          level: 1,
          dbHash: databaseHash,
          homoId: '',
          join: {
            type: 'inner',
            ckGlobalJoin: false,
            leftTableId: '',
            on: [{ leftField: '', rightField: '' }],
          },
        }],
        dimensions,
        measures,
        dimensionMenu: [{
          type: 'menu',
          menuId: dimMenuId,
          predictType: '',
          name: tableName,
          nodes: dimNodes,
        }],
        measureMenu: [{
          type: 'menu',
          menuId: meaMenuId,
          predictType: '',
          name: tableName,
          nodes: meaNodes,
        }],
        filters: [],
        limits: {},
        fuzzy: {},
        synTable: false,
        removeDimOrMeaIds: [],
        dimensionStatisticsValueKVHash: '',
      },
      llmconfig: {},
      sugQuestion: [],
      sugQuestionLLM: [],
      nlpOpen: 0,
      nlpState: 0,
      canUse: true,
      updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      currentUserCanEdit: true,
      dbType,
    }
  }
}
