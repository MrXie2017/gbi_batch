import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import { registerAuthIpc } from './ipc/auth.ipc'
import { registerBatchIpc } from './ipc/batch.ipc'
import { registerFileIpc } from './ipc/file.ipc'

let mainWindow: BrowserWindow | null = null

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 650,
    title: 'Sugar BI 批量添加数据源',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 开发模式加载 Vite dev server，生产模式加载打包文件
  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // 注册所有 IPC 处理器
  registerAuthIpc(ipcMain, () => mainWindow)
  registerBatchIpc(ipcMain, () => mainWindow)
  registerFileIpc(ipcMain, () => mainWindow)

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
