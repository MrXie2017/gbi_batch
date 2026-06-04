import { resolveDbType } from './db-types'

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
  desc?: string
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
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.groupId = groupId
    this.apiPrefix = `${this.baseUrl}/api/manage/group/${groupId}/database`
    this.headers = {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'csrf-token': csrfToken,
      'sugar-company': sugarCompany,
      cookie,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      origin: this.baseUrl,
      referer: `${this.baseUrl}/group/${groupId}/manage/database`,
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
      return (await resp.json()) as ApiResult
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

  /** 从行数据构建 API 请求体 */
  static buildPayload(row: Record<string, any>): DatasourcePayload {
    const dbType = resolveDbType(String(row['类型'] || 'MySQL 5.X'))
    const payload: DatasourcePayload = {
      network: 'normal',
      region: 'gz',
      type: dbType,
      tunnelHash: 0,
      name: String(row['数据源名称'] || ''),
      host: String(row['数据库地址'] || ''),
      port: String(row['端口'] || '3306'),
      database: String(row['数据库名'] || ''),
      username: String(row['用户名'] || ''),
      password: String(row['密码'] || ''),
    }
    const desc = row['描述']
    if (desc && String(desc).trim()) {
      payload.desc = String(desc).trim()
    }
    return payload
  }
}
