import { BrowserWindow, ipcMain, session } from 'electron'
import { captureAuthFromSession, clearSession } from '../services/cookie-capture'
import { getConfig } from '../services/config-store'

let loginWindow: BrowserWindow | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

// 拦截到的 CSRF Token
let capturedCsrfToken = ''

export function registerAuthIpc(
  ipc: typeof ipcMain,
  getMainWindow: () => BrowserWindow | null,
): void {
  /** 打开登录窗口 */
  ipc.handle('auth:openLogin', async (_event, baseUrl: string) => {
    return new Promise((resolve, reject) => {
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.focus()
        reject(new Error('登录窗口已打开'))
        return
      }

      const mainWindow = getMainWindow()
      const url = new URL(baseUrl)
      capturedCsrfToken = ''

      // 使用 defaultSession（不设 partition）确保主进程可以读取 cookie
      loginWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        parent: mainWindow || undefined,
        modal: true,
        title: '登录 Sugar BI',
        webPreferences: {
          // 不设置 partition，使用 defaultSession
          // 这样 session.defaultSession 就能读到登录后的 cookie
        },
      })

      const ses = loginWindow.webContents.session

      // 拦截响应头，捕获 CSRF Token
      ses.webRequest.onHeadersReceived((details, callback) => {
        const csrfHeader = details.responseHeaders?.['csrf-token']?.[0]
          || details.responseHeaders?.['Csrf-Token']?.[0]
          || details.responseHeaders?.['CSRF-TOKEN']?.[0]
        if (csrfHeader) {
          capturedCsrfToken = csrfHeader
        }
        callback({ responseHeaders: details.responseHeaders })
      })

      loginWindow.loadURL(baseUrl)

      // 轮询检测 cookie（检测 sugarbisid 标志登录成功）
      pollTimer = setInterval(async () => {
        try {
          const auth = await captureAuthFromSession(ses, baseUrl)
          const hasSessionCookie = await ses.cookies.get({ domain: url.hostname })
            .then((cookies) => cookies.some((c) => c.name === 'sugarbisid'))

          if (hasSessionCookie && auth) {
            if (pollTimer) clearInterval(pollTimer)
            pollTimer = null

            // 组合最终认证信息
            const finalAuth = {
              cookie: auth.cookie,
              csrfToken: capturedCsrfToken || auth.csrfToken,
            }

            // 通知渲染进程登录成功
            mainWindow?.webContents.send('auth:loginSuccess', finalAuth)

            // 关闭登录窗口
            if (loginWindow && !loginWindow.isDestroyed()) {
              loginWindow.close()
            }
            loginWindow = null

            resolve(finalAuth)
          }
        } catch {
          // 轮询出错，继续下一轮
        }
      }, 1000)

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
    return await captureAuthFromSession(session.defaultSession, baseUrl)
  })

  /** 登出 */
  ipc.handle('auth:logout', async () => {
    const config = getConfig()
    if (config.baseUrl) {
      await clearSession(config.baseUrl)
    }
  })
}
