import React from 'react'
import { useBatchStore } from '../../stores/batch-store'

/** 动态表格列定义 - 根据 dbTypeKey 变化 */
function getColumns(dbTypeKey: string) {
  const base = [
    { key: 'name', label: '数据源名称' },
  ]

  if (dbTypeKey === 'jdbc') {
    return [
      ...base,
      { key: 'url', label: 'JDBC URL' },
      { key: 'username', label: '用户名' },
      { key: 'desc', label: '描述' },
    ]
  }

  if (dbTypeKey === 'http') {
    return [
      ...base,
      { key: 'host', label: '服务地址' },
      { key: 'port', label: '端口' },
      { key: 'username', label: '用户名' },
      { key: 'desc', label: '描述' },
    ]
  }

  if (dbTypeKey === 'nosql') {
    return [
      ...base,
      { key: 'host', label: '数据库地址' },
      { key: 'port', label: '端口' },
      { key: 'database', label: '数据库名' },
      { key: 'username', label: '用户名' },
      { key: 'desc', label: '描述' },
    ]
  }

  // sql (默认)
  return [
    ...base,
    { key: 'host', label: '数据库地址' },
    { key: 'port', label: '端口' },
    { key: 'database', label: '数据库名' },
    { key: 'username', label: '用户名' },
    { key: 'desc', label: '描述' },
  ]
}

export default function DataPreview() {
  const { items, dbTypeKey } = useBatchStore()

  if (items.length === 0) return null

  const columns = getColumns(dbTypeKey)

  return (
    <div className="card">
      <div className="card-title">👁️ 数据预览</div>
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                {columns.map((col) => (
                  <td key={col.key}>
                    {(item as any)[col.key] || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
