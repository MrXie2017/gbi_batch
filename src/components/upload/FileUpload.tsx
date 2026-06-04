import React from 'react'
import { useBatchStore } from '../../stores/batch-store'
import { useIpc } from '../../hooks/useIpc'

export default function FileUpload() {
  const api = useIpc()
  const { filePath, setFilePath, setItems, items } = useBatchStore()

  const handleSelectFile = async () => {
    try {
      const selected = await api.file.selectFile()
      if (!selected) return

      setFilePath(selected)
      const result = await api.file.parseFile(selected)

      // 转换行数据为 DatasourceItem 格式
      const parsedItems = result.rows.map((row) => ({
        name: String(row['数据源名称'] || ''),
        type: String(row['类型'] || 'MySQL 5.X'),
        host: String(row['数据库地址'] || ''),
        port: String(row['端口'] || '3306'),
        database: String(row['数据库名'] || ''),
        username: String(row['用户名'] || ''),
        password: String(row['密码'] || ''),
        desc: row['描述'] ? String(row['描述']) : undefined,
      }))

      setItems(parsedItems, result.columns)
    } catch (err: any) {
      alert('文件解析失败: ' + err.message)
    }
  }

  const handleCreateTemplate = async () => {
    try {
      const path = await api.file.createTemplate('datasource_template.xlsx')
      if (path) {
        alert('模板已生成: ' + path)
      }
    } catch (err: any) {
      alert('生成模板失败: ' + err.message)
    }
  }

  return (
    <div className="card">
      <div className="card-title">📁 数据文件</div>

      <div className="upload-zone" onClick={handleSelectFile}>
        <div className="upload-icon">📂</div>
        <div className="upload-text">
          {filePath ? filePath.split(/[\\/]/).pop() : '点击选择 Excel 或 CSV 文件'}
        </div>
        <div className="upload-hint">
          支持 .xlsx / .xls / .csv 格式
        </div>
      </div>

      <div className="flex-row mt-4" style={{ justifyContent: 'center' }}>
        <button className="btn btn-outline" onClick={handleCreateTemplate}>
          📄 生成模板
        </button>
      </div>

      {items.length > 0 && (
        <div className="text-muted mt-2" style={{ textAlign: 'center' }}>
          已加载 {items.length} 条数据源记录
        </div>
      )}
    </div>
  )
}
