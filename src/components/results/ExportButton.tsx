import React from 'react'
import { useBatchStore } from '../../stores/batch-store'
import { useIpc } from '../../hooks/useIpc'

export default function ExportButton() {
  const api = useIpc()
  const { itemResults, result } = useBatchStore()

  if (!result || itemResults.length === 0) return null

  const handleExport = async () => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      await api.file.exportReport(itemResults, `batch_report_${timestamp}.csv`)
    } catch (err: any) {
      alert('导出失败: ' + err.message)
    }
  }

  return (
    <button className="btn btn-success" onClick={handleExport}>
      📄 导出报告
    </button>
  )
}
