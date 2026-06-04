import React from 'react'
import { useAuthStore } from '../../stores/auth-store'

export default function Header() {
  const { isLoggedIn, selectedWorkspace, logout } = useAuthStore()

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
          <button className="btn btn-outline" onClick={logout} style={{ fontSize: 12 }}>
            退出登录
          </button>
        )}
      </div>
    </header>
  )
}
