import React from 'react'
import { useBatchStore } from '../../stores/batch-store'

export default function DataPreview() {
  const { items } = useBatchStore()

  if (items.length === 0) return null

  return (
    <div className="card">
      <div className="card-title">👁️ 数据预览</div>
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>数据源名称</th>
              <th>类型</th>
              <th>数据库地址</th>
              <th>端口</th>
              <th>数据库名</th>
              <th>用户名</th>
              <th>描述</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{item.name}</td>
                <td>{item.type}</td>
                <td>{item.host}</td>
                <td>{item.port}</td>
                <td>{item.database}</td>
                <td>{item.username}</td>
                <td>{item.desc || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
