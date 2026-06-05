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
  remark?: string
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
    return payload
  }
}
