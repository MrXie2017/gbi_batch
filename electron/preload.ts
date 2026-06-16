import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  auth: {
    openLogin: (baseUrl: string) => Promise<{ cookie: string; csrfToken: string }>
    onLoginSuccess: (callback: (data: { cookie: string; csrfToken: string }) => void) => () => void
    getWorkspaces: (baseUrl: string, cookie: string, csrfToken: string) => Promise<any[]>
    getSessionStatus: () => Promise<{ cookie: string; csrfToken: string } | null>
    logout: () => Promise<void>
  }
  file: {
    selectFile: () => Promise<string | null>
    parseFile: (filePath: string) => Promise<{ columns: string[]; rows: any[]; total: number; fieldConfig?: FieldConfigMap }>
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

export interface FieldConfig {
  alias?: string
  comment?: string
  role?: 'dimension' | 'measure'
  hidden?: boolean
  unit?: string
}
export type FieldConfigMap = Record<string, FieldConfig>

export interface BatchParams {
  baseUrl: string
  cookie: string
  csrfToken: string
  groupId: string
  sugarCompany: string
  items: DatasourceItem[]
  delay: number
  dbTypeName: string
  dbTypeKey: string
  fieldConfigMap?: FieldConfigMap
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
  url?: string
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

const electronAPI: ElectronAPI = {
  auth: {
    openLogin: (baseUrl) => ipcRenderer.invoke('auth:openLogin', baseUrl),
    onLoginSuccess: (callback) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('auth:loginSuccess', handler)
      return () => ipcRenderer.removeListener('auth:loginSuccess', handler)
    },
    getWorkspaces: (baseUrl, cookie, csrfToken) =>
      ipcRenderer.invoke('auth:getWorkspaces', baseUrl, cookie, csrfToken),
    getSessionStatus: () => ipcRenderer.invoke('auth:getSessionStatus'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  file: {
    selectFile: () => ipcRenderer.invoke('file:selectFile'),
    parseFile: (filePath) => ipcRenderer.invoke('file:parseFile', filePath),
    createTemplate: (savePath, dbTypeName, dbTypeKey) =>
      ipcRenderer.invoke('file:createTemplate', savePath, dbTypeName, dbTypeKey),
    exportReport: (data, savePath) => ipcRenderer.invoke('file:exportReport', data, savePath),
  },
  batch: {
    start: (params) => ipcRenderer.invoke('batch:start', params),
    stop: () => ipcRenderer.invoke('batch:stop'),
    onProgress: (callback) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('batch:progress', handler)
      return () => ipcRenderer.removeListener('batch:progress', handler)
    },
    onCompleted: (callback) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('batch:completed', handler)
      return () => ipcRenderer.removeListener('batch:completed', handler)
    },
    onItemResult: (callback) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('batch:itemResult', handler)
      return () => ipcRenderer.removeListener('batch:itemResult', handler)
    },
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
