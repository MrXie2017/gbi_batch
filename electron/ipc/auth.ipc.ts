import { BrowserWindow, ipcMain, session, BrowserWindowConstructorOptions } from 'electron'
import * as path from 'path'
import { captureAuth, clearSession, isLoggedIn } from '../services/cookie-capture'
import { getConfig, setConfig } from '../services/config-store'

let loginWindow: BrowserWindow | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

export function registerAuthIpc(
  ipc: typeof ipcMain,
  getMainWindow: () => BrowserWindow | null,
): void {
  /** 打开登录窗口 */
  ipc.handle('auth:openLogin', async (_event, baseUrl: string) => {
    const auth = await captureAuth(baseUrl)
    if (auth && auth.csrfToken) {
      return auth // 已登录，直接返回
    }

    return new Promise((resolve, reject) => {
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.focus()
        reject(new Error('登录窗口已打开'))
        return
      }

      const mainWindow = getMainWindow()

      loginWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        parent: mainWindow || undefined,
        modal: true,
        title: '登录 Sugar BI',
        webPreferences: {
          // 登录窗口共享默认 session 以读取 cookie
          partition: 'persist:sugarbi',
        },
      })

      loginWindow.loadURL(baseUrl)

      // 轮询检测 cookie（检测 sugarbisid 标志登录成功）
      pollTimer = setInterval(async () => {
        const auth = await captureAuth(baseUrl)
        if (auth && auth.cookie) {
          if (pollTimer) clearInterval(pollTimer)
          pollTimer = null

          // 通知渲染进程登录成功
          mainWindow?.webContents.send('auth:loginSuccess', auth)

          // 关闭登录窗口
          if (loginWindow && !loginWindow.isDestroyed()) {
            loginWindow.close()
          }
          loginWindow = null

          resolve(auth)
        }
      }, 1500)

      loginWindow.on('closed', () => {
        if (pollTimer) clearInterval(pollTimer)
        pollTimer = null
        loginWindow = null
        resolve(null) // 用户关闭了登录窗口
      })
    })
  })

  /** 获取工作空间列表 */
  ipc.handle('auth:getWorkspaces', async (_event, baseUrl: string, cookie: string, csrfToken: string) => {
    try {
      const resp = await fetch(`${baseUrl}/api/group/my`, {
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json',
          'csrf-token': csrfToken,
          cookie,
        },
      })
      const data = (await resp.json()) as { status: number; data?: any[] }
      if (data.status === 0 && Array.isArray(data.data)) {
        return data.data
      }
      return []
    } catch {
      return []
    }
  })

  /** 获取当前 session 状态 */
  ipc.handle('auth:getSessionStatus', async () => {
    const config = getConfig()
    const baseUrl = config.baseUrl
    if (!baseUrl) return null
    return await captureAuth(baseUrl)
  })

  /** 登出 */
  ipc.handle('auth:logout', async () => {
    const config = getConfig()
    if (config.baseUrl) {
      await clearSession(config.baseUrl)
    }
  })
}
