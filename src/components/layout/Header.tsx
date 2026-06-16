import React from 'react'
import { useAuthStore } from '../../stores/auth-store'
import { useIpc } from '../../hooks/useIpc'

export default function Header() {
  const { isLoggedIn, selectedWorkspace, logout } = useAuthStore()
  const api = useIpc()

  const handleLogout = async () => {
    try {
      await api.auth.logout() // 清主进程 session（cookie）
    } catch {
      // 即使主进程清理失败，前端仍退出
    }
    logout() // 清前端状态 → 触发 App 回到登录步骤
  }

  return (
    <header className="header">
      <div className="header-title">
        <span className="icon">📊</span>
        <span>Sugar BI 批量添加数据源</span>
        <span className="header-subtitle">从 Excel/CSV 文件批量导入数据源到工作空间</span>
      </div>
      <div className="flex-row">
        {isLoggedIn && selectedWorkspace && (
          <span className="text-muted">
            工作空间: {selectedWorkspace.name}
          </span>
        )}
        {isLoggedIn && (
          <button className="btn btn-outline" onClick={handleLogout} style={{ fontSize: 12 }}>
            退出登录
          </button>
        )}
      </div>
    </header>
  )
}
