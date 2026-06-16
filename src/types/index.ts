export interface ElectronAPI {
  auth: {
    openLogin: (baseUrl: string) => Promise<{ cookie: string; csrfToken: string } | null>
    onLoginSuccess: (callback: (data: { cookie: string; csrfToken: string }) => void) => () => void
    getWorkspaces: (baseUrl: string, cookie: string, csrfToken: string) => Promise<Workspace[]>
    getSessionStatus: () => Promise<{ cookie: string; csrfToken: string } | null>
    logout: () => Promise<void>
  }
  file: {
    selectFile: () => Promise<string | null>
    parseFile: (filePath: string) => Promise<ParseResult>
    createTemplate: (savePath: string, dbTypeName: string, dbTypeKey: string) => Promise<string>
    exportReport: (data: any[], savePath: string) => Promise<string>
  }
  batch: {
    start: (params: BatchParams) => Promise<void>
    stop: () => Promise<void>
    onProgress: (callback: (data: BatchProgress) => void) => () => void
    onCompleted: (callback: (data: BatchResult) => void) => () => void
    onItemResult: (callback: (data: ItemResult) => void) => () => void
  }
}

export interface Workspace {
  id: string
  name: string
  companyId?: string
}

/** sheet2 字段配置（与 electron/services/field-config.ts 保持一致） */
export interface FieldConfig {
  alias?: string
  comment?: string
  role?: 'dimension' | 'measure'
  hidden?: boolean
  unit?: string
  geo?: 'geo' | 'lng' | 'lat'
}
export type FieldConfigMap = Record<string, FieldConfig>

export interface ParseResult {
  columns: string[]
  rows: Record<string, any>[]
  total: number
  /** sheet2 字段配置（无 sheet2 时为空 map） */
  fieldConfig?: FieldConfigMap
}

export interface DatasourceItem {
  name: string
  type: string
  host: string
  port: string
  database: string
  username: string
  password: string
  desc?: string
  url?: string      // JDBC/HTTP 类型使用
}

export interface BatchParams {
  baseUrl: string
  cookie: string
  csrfToken: string
  groupId: string
  sugarCompany: string
  items: DatasourceItem[]
  delay: number
  dbTypeName: string   // 选中的数据源类型名称
  dbTypeKey: string    // 分组 key: sql | jdbc | http | nosql
  /** sheet2 字段配置（可选；未配置时走默认自动归类） */
  fieldConfigMap?: FieldConfigMap
}

export interface BatchProgress {
  current: number
  total: number
  status: 'running' | 'stopped'
}

export interface ItemResult {
  index: number
  name: string
  host: string
  testStatus: 'success' | 'failed' | 'skipped'
  testMsg: string
  addStatus: 'success' | 'failed' | 'skipped' | 'pending'
  addMsg: string
  // 数据模型创建状态
  modelStatus: 'pending' | 'running' | 'success' | 'partial' | 'failed' | 'skipped'
  modelMsg: string      // "3/5 个模型创建成功" 或 "跳过: 添加数据源失败"
  modelTotal: number    // 该数据源的表总数
  modelCreated: number  // 成功创建的模型数
}

export interface BatchResult {
  total: number
  success: number
  failed: number
  skipped: number
  stopped: boolean
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
