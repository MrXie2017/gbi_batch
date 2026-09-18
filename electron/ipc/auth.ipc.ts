import { BrowserWindow, ipcMain, session } from 'electron'
import { captureAuthFromSession, clearSession } from '../services/cookie-capture'
import { getConfig } from '../services/config-store'

let loginWindow: BrowserWindow | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
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
      const sugarDomain = new URL(baseUrl).hostname
      capturedCsrfToken = ''

      loginWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        parent: mainWindow || undefined,
        modal: true,
        title: '登录 Sugar BI',
        webPreferences: {},
      })

      const ses = loginWindow.webContents.session

      // 拦截响应头，捕获 CSRF Token
      ses.webRequest.onHeadersReceived((details, callback) => {
        const headers = details.responseHeaders || {}
        const csrfHeader = headers['csrf-token']?.[0]
          || headers['Csrf-Token']?.[0]
          || headers['CSRF-TOKEN']?.[0]
        if (csrfHeader) {
          capturedCsrfToken = csrfHeader
        }
        callback({ responseHeaders: details.responseHeaders })
      })

      // === 登录成功检测策略 ===
      // Sugar BI 使用外部认证系统：
      //   baseUrl(/groups) → 跳转到认证系统登录页 → 登录成功 → 跳回 Sugar BI 页面
      // 检测方式：URL 回到 Sugar BI 域名 + 有 sugarbisid cookie

      let initialCookieSnapshot: Set<string> = new Set()
      let snapshotReady = false
      let loginCompleted = false

      // 监听 URL 变化，检测是否跳回 Sugar BI
      loginWindow.webContents.on('did-navigate', async (_event, navUrl) => {
        await checkLoginSuccess(navUrl)
      })
      loginWindow.webContents.on('did-navigate-in-page', async (_event, navUrl) => {
        await checkLoginSuccess(navUrl)
      })

      // 页面加载完成时记录初始 cookie
      loginWindow.webContents.on('did-finish-load', async () => {
        const currentUrl = loginWindow?.webContents?.getURL()
        if (!currentUrl) return

        // 如果当前在 Sugar BI 域名上，检查是否已登录
        try {
          const navHost = new URL(currentUrl).hostname
          if (navHost === sugarDomain) {
            await checkLoginSuccess(currentUrl)
          }
        } catch { /* ignore */ }

        // 记录初始 cookie 快照（只在第一次加载时）
        if (!snapshotReady) {
          await new Promise((r) => setTimeout(r, 2000))
          if (!loginWindow || loginWindow.isDestroyed()) return
          try {
            const cookies = await ses.cookies.get({ domain: sugarDomain })
            initialCookieSnapshot = new Set(cookies.map((c) => `${c.name}=${c.value}`))
            snapshotReady = true
          } catch { /* ignore */ }
        }
      })

      async function checkLoginSuccess(currentUrl: string) {
        if (loginCompleted) return
        try {
          const navHost = new URL(currentUrl).hostname
          // 只在 Sugar BI 域名上检测
          if (navHost !== sugarDomain) return

          const cookies = await ses.cookies.get({ domain: sugarDomain })
          const hasSugarSession = cookies.some((c) => c.name === 'sugarbisid')

          if (!hasSugarSession) return

          // 如果快照还没准备好，说明是初始加载就有 cookie（可能是已登录状态）
          // 直接使用。如果快照已准备好，检查是否是新增 cookie
          if (snapshotReady) {
            const isNew = cookies.some(
              (c) => c.name === 'sugarbisid' && !initialCookieSnapshot.has(`${c.name}=${c.value}`),
            )
            if (!isNew) return
          }

          // 登录成功！
          loginCompleted = true
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null }

          const auth = await captureAuthFromSession(ses, baseUrl)
          const finalAuth = {
            cookie: auth?.cookie || cookies.map((c) => `${c.name}=${c.value}`).join('; '),
            csrfToken: capturedCsrfToken || auth?.csrfToken || '',
          }

          mainWindow?.webContents.send('auth:loginSuccess', finalAuth)

          // 短暂延迟后关闭登录窗口，确保 cookie 已完全同步
          setTimeout(() => {
            if (loginWindow && !loginWindow.isDestroyed()) {
              loginWindow.close()
            }
            loginWindow = null
          }, 500)

          resolve(finalAuth)
        } catch { /* ignore */ }
      }

      // 页面加载失败（服务器不可达/地址错误等）：窗口内显示中文错误页，避免静默白屏
      loginWindow.webContents.on(
        'did-fail-load',
        (_e, errorCode, errorDesc, failedUrl, isMainFrame) => {
          if (!isMainFrame || errorCode === -3) return // -3 = ABORTED（重定向中断等，非真错误）
          const detail = `${errorDesc || '未知错误'} (${errorCode})<br>${failedUrl}`
          const html =
            '<meta charset="utf-8"><body style="font-family:system-ui;padding:40px;color:#333">' +
            '<h2>无法打开登录页</h2><p>服务器地址无法访问，请检查后重试：</p>' +
            `<p style="color:#c00">${detail}</p></body>`
          loginWindow?.webContents
            .loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
            .catch(() => { /* 展示失败时维持现状，用户关闭窗口即可 */ })
        },
      )

      loginWindow.loadURL(baseUrl)

      // 备用轮询：每 2 秒检查一次（处理 SPA 内导航等场景）
      pollTimer = setInterval(async () => {
        if (loginCompleted || !snapshotReady) return
        try {
          const currentUrl = loginWindow?.webContents?.getURL()
          if (currentUrl) {
            await checkLoginSuccess(currentUrl)
          }
        } catch { /* ignore */ }
      }, 2000)

      loginWindow.on('closed', () => {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
        loginWindow = null
        resolve(null)
      })
    })
  })

  /** 获取工作空间列表 */
  ipc.handle('auth:getWorkspaces', async (_event, baseUrl: string, cookie: string, csrfToken: string) => {
    try {
      const origin = new URL(baseUrl).origin
      const resp = await fetch(`${origin}/api/group/my`, {
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json',
          'csrf-token': csrfToken,
          cookie,
        },
      })
      const data = (await resp.json()) as { status: number; data?: any[] }
      console.log('[auth] getWorkspaces raw response:', JSON.stringify(data).substring(0, 500))
      if (data.status === 0 && Array.isArray(data.data) && data.data.length > 0) {
        console.log('[auth] first workspace keys:', Object.keys(data.data[0]))
        return data.data.map((ws: any) => ({
          id: ws.hash || ws.id?.toString() || '',
          name: ws.name || ws.groupName || '',
          companyId: ws.token || ws.companyId || ws.sugarCompany || '',
        }))
      }
      return []
    } catch (err) {
      console.log('[auth] getWorkspaces error:', err)
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
