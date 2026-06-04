import { create } from 'zustand'
import type { Workspace } from '../types'

interface AuthState {
  /** 是否已登录 */
  isLoggedIn: boolean
  /** Cookie */
  cookie: string
  /** CSRF Token */
  csrfToken: string
  /** 服务器地址 */
  baseUrl: string
  /** 工作空间列表 */
  workspaces: Workspace[]
  /** 当前选中的工作空间 */
  selectedWorkspace: Workspace | null
  /** 是否正在登录 */
  isLoggingIn: boolean
  /** 登录错误信息 */
  error: string | null

  setLoggedIn: (cookie: string, csrfToken: string) => void
  setBaseUrl: (url: string) => void
  setWorkspaces: (workspaces: Workspace[]) => void
  selectWorkspace: (workspace: Workspace) => void
  setLoggingIn: (loading: boolean) => void
  setError: (error: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: false,
  cookie: '',
  csrfToken: '',
  baseUrl: 'http://200.1.1.97:8001',
  workspaces: [],
  selectedWorkspace: null,
  isLoggingIn: false,
  error: null,

  setLoggedIn: (cookie, csrfToken) =>
    set({ isLoggedIn: true, cookie, csrfToken, isLoggingIn: false, error: null }),

  setBaseUrl: (url) => set({ baseUrl: url }),

  setWorkspaces: (workspaces) => set({ workspaces }),

  selectWorkspace: (workspace) => set({ selectedWorkspace: workspace }),

  setLoggingIn: (loading) => set({ isLoggingIn: loading }),

  setError: (error) => set({ error, isLoggingIn: false }),

  logout: () =>
    set({
      isLoggedIn: false,
      cookie: '',
      csrfToken: '',
      workspaces: [],
      selectedWorkspace: null,
    }),
}))
