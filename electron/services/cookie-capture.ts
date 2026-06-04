import { session } from 'electron'

export interface CapturedAuth {
  cookie: string
  csrfToken: string
}

/**
 * 从 Electron session 中读取 Sugar BI 的 Cookie 和 CSRF Token
 */
export async function captureAuth(baseUrl: string): Promise<CapturedAuth | null> {
  const ses = session.defaultSession

  // 获取所有 cookie
  const cookies = await ses.cookies.get({ domain: new URL(baseUrl).hostname })

  // 查找 sugarbisid cookie（登录成功标志）
  const sugarCookie = cookies.find((c) => c.name === 'sugarbisid')
  if (!sugarCookie) return null

  // 拼接所有 cookie
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

  // 从 cookie 中提取 CSRF Token（Sugar BI 存储在 cookie 里）
  const csrfCookie = cookies.find((c) => c.name === 'csrf-token')
  const csrfToken = csrfCookie?.value || ''

  return {
    cookie: cookieStr,
    csrfToken,
  }
}

/**
 * 检查是否已登录（是否有 sugarbisid cookie）
 */
export async function isLoggedIn(baseUrl: string): Promise<boolean> {
  const ses = session.defaultSession
  const cookies = await ses.cookies.get({ domain: new URL(baseUrl).hostname })
  return cookies.some((c) => c.name === 'sugarbisid')
}

/**
 * 清除 Sugar BI 的 session cookies（登出）
 */
export async function clearSession(baseUrl: string): Promise<void> {
  const ses = session.defaultSession
  const url = new URL(baseUrl)
  const cookies = await ses.cookies.get({ domain: url.hostname })
  for (const cookie of cookies) {
    await ses.cookies.remove(`${url.protocol}//${url.hostname}`, cookie.name)
  }
}
