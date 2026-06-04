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
    createTemplate: (savePath: string) => Promise<string>
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

export interface ParseResult {
  columns: string[]
  rows: Record<string, any>[]
  total: number
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
}

export interface BatchParams {
  baseUrl: string
  cookie: string
  csrfToken: string
  groupId: string
  sugarCompany: string
  items: DatasourceItem[]
  skipTest: boolean
  delay: number
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
