import { session, Session } from 'electron'

export interface CapturedAuth {
  cookie: string
  csrfToken: string
}

/**
 * 从指定 session 中读取 Sugar BI 的 Cookie 和 CSRF Token
 * @param ses Electron session（默认 session 或 partition session）
 * @param baseUrl 服务器地址
 */
export async function captureAuthFromSession(
  ses: Session,
  baseUrl: string,
): Promise<CapturedAuth | null> {
  const url = new URL(baseUrl)
  const domain = url.hostname

  // 获取该域名下所有 cookie
  const cookies = await ses.cookies.get({ domain })

  if (cookies.length === 0) return null

  // 拼接所有 cookie
  const cookieStr = cookies
    .filter((c) => !c.httpOnly || c.name === 'sugarbisid' || c.name === 'csrf-token')
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')

  if (!cookieStr) return null

  // 尝试从 cookie 中提取 CSRF Token
  const csrfCookie = cookies.find((c) => c.name === 'csrf-token')
  const csrfToken = csrfCookie?.value || ''

  return { cookie: cookieStr, csrfToken }
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
