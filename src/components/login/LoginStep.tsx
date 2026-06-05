import React, { useState } from 'react'
import { useAuthStore } from '../../stores/auth-store'
import { useIpc } from '../../hooks/useIpc'

export default function LoginStep() {
  const api = useIpc()
  const {
    baseUrl, setBaseUrl, isLoggingIn, error,
    setLoggedIn, setWorkspaces, selectWorkspace,
    setLoggingIn, setError, workspaces, selectedWorkspace,
  } = useAuthStore()

  const [localUrl, setLocalUrl] = useState(baseUrl)

  const handleLogin = async () => {
    try {
      setLoggingIn(true)
      setError(null)
      setBaseUrl(localUrl)

      const auth = await api.auth.openLogin(localUrl)
      if (!auth) {
        setError('登录窗口已关闭，未完成登录')
        return
      }

      setLoggedIn(auth.cookie, auth.csrfToken)

      // 获取工作空间列表
      const workspaces = await api.auth.getWorkspaces(localUrl, auth.cookie, auth.csrfToken)
      setWorkspaces(workspaces)

      if (workspaces.length === 1) {
        // 只有一个工作空间，自动选择
        selectWorkspace(workspaces[0])
      }
    } catch (err: any) {
      setError(err.message || '登录失败')
    }
  }

  const handleWorkspaceSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value
    console.log('[LoginStep] workspace selected:', selectedId)
    console.log('[LoginStep] available workspaces:', JSON.stringify(workspaces))
    const ws = workspaces.find((w) => w.id === selectedId)
    if (ws) {
      console.log('[LoginStep] found workspace:', JSON.stringify(ws))
      selectWorkspace(ws)
    } else {
      console.log('[LoginStep] workspace NOT found for id:', selectedId)
    }
  }

  return (
    <div className="login-step">
      <div className="card login-card">
        <div className="login-icon">🔐</div>
        <div className="login-title">登录 Sugar BI</div>
        <div className="login-desc">
          点击登录后，将在新窗口中打开 Sugar BI 页面。<br />
          请在窗口中完成登录，系统将自动获取认证信息。
        </div>

        <div className="form-group">
          <label className="form-label">服务器地址</label>
          <input
            className="form-input"
            type="text"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            placeholder="http://200.1.1.97:8001"
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        <button
          className="btn btn-primary btn-lg"
          onClick={handleLogin}
          disabled={isLoggingIn}
          style={{ width: '100%', marginTop: 8 }}
        >
          {isLoggingIn ? (
            <><span className="spinner" /> 正在登录...</>
          ) : (
            '🔑 打开登录窗口'
          )}
        </button>

        {workspaces.length > 0 && (
          <div className="workspace-section">
            <div className="card-title">📂 选择工作空间</div>
            <select
              className="form-select workspace-select"
              value={selectedWorkspace?.id || ''}
              onChange={handleWorkspaceSelect}
            >
              <option value="">-- 请选择工作空间 --</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
            {selectedWorkspace && (
              <div className="text-muted mt-2" style={{ textAlign: 'center' }}>
                ✓ 已选择: {selectedWorkspace.name}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
