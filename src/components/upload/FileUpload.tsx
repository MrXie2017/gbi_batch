import React from 'react'
import { useBatchStore } from '../../stores/batch-store'
import { useIpc } from '../../hooks/useIpc'

/**
 * 数据库类型分组定义 - 与后端 db-types.ts 保持一致
 * 前端需要这些数据来渲染类型选择器和动态字段
 */
interface FieldDef {
  key: string
  label: string
  required: boolean
  defaultVal?: string
}

interface DbTypeGroup {
  key: string
  label: string
  dbTypes: string[]
  fields: FieldDef[]
}

const DB_TYPE_GROUPS: DbTypeGroup[] = [
  {
    key: 'sql',
    label: '标准数据库',
    dbTypes: [
      'MySQL 5.X', 'MySQL 8', 'MariaDB', 'PostgreSQL', 'CockroachDB',
      'Oracle', 'SQL Server', 'DM-达梦', 'KingbaseES-人大金仓',
      'Greenplum', 'TiDB', 'Clickhouse', 'Apache Doris',
      'OceanBase(阿里云)', 'Hologres(阿里云)', 'GBase 8a-南大通用',
      'openGauss-华为GaussDB', 'GaussDB(DWS)-华为数仓',
      'HGDB-瀚高数据库', 'HGDB-瀚高安全版数据库',
      'Exasol', 'Vertica', 'Teradata', 'Snowflake',
      'IBM DB2', 'SAP HANA', 'Apache Spark SQL',
      'Presto/Trino', 'Apache Impala', 'Apache Kylin',
      'GaiaDB', 'MaxCompute(阿里云)', 'Amazon Athena',
      'Apache Hive',
    ],
    fields: [
      { key: 'name', label: '数据源名称', required: true },
      { key: 'host', label: '数据库地址', required: true },
      { key: 'port', label: '端口', required: true, defaultVal: '3306' },
      { key: 'database', label: '数据库名', required: true },
      { key: 'username', label: '用户名', required: true },
      { key: 'password', label: '密码', required: true },
      { key: 'desc', label: '描述', required: false },
    ],
  },
  {
    key: 'jdbc',
    label: 'JDBC 连接',
    dbTypes: [
      'Apache Hive (JDBC URL)', 'Apache Impala (JDBC URL)',
      'GBase (JDBC URL)', 'Apache Druid (JDBC URL)', 'JDBC 通用数据库',
    ],
    fields: [
      { key: 'name', label: '数据源名称', required: true },
      { key: 'url', label: 'JDBC URL', required: true },
      { key: 'username', label: '用户名', required: true },
      { key: 'password', label: '密码', required: false },
      { key: 'desc', label: '描述', required: false },
    ],
  },
  {
    key: 'http',
    label: 'HTTP/API 服务',
    dbTypes: [
      'Prometheus', 'Graphite', 'OpenTSDB', 'Baidu TSDB',
      'ElasticSearch 1.x+', 'ElasticSearch 6.3+',
      'InfluxDB 1.X', 'InfluxDB 2.X', 'Apache Druid',
    ],
    fields: [
      { key: 'name', label: '数据源名称', required: true },
      { key: 'host', label: '服务地址', required: true },
      { key: 'port', label: '端口', required: true, defaultVal: '9200' },
      { key: 'username', label: '用户名', required: false },
      { key: 'password', label: '密码', required: false },
      { key: 'desc', label: '描述', required: false },
    ],
  },
  {
    key: 'nosql',
    label: 'NoSQL 数据库',
    dbTypes: ['Mongodb', 'Redis', 'Cassandra'],
    fields: [
      { key: 'name', label: '数据源名称', required: true },
      { key: 'host', label: '数据库地址', required: true },
      { key: 'port', label: '端口', required: true, defaultVal: '27017' },
      { key: 'database', label: '数据库名', required: false },
      { key: 'username', label: '用户名', required: false },
      { key: 'password', label: '密码', required: false },
      { key: 'desc', label: '描述', required: false },
    ],
  },
]

/** 根据 DB 类型名找到对应分组 */
function findGroup(dbTypeName: string): DbTypeGroup {
  for (const g of DB_TYPE_GROUPS) {
    if (g.dbTypes.includes(dbTypeName)) return g
  }
  return DB_TYPE_GROUPS[0]
}

export default function FileUpload() {
  const api = useIpc()
  const {
    filePath, setFilePath, setItems, items,
    selectedDbType, dbTypeKey, setDbType,
    setFieldConfig, fieldConfigMap,
    setModelNameMap, setTableConfigMap, tableConfigMap,
  } = useBatchStore()

  const currentGroup = findGroup(selectedDbType)

  const handleDbTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const typeName = e.target.value
    const group = findGroup(typeName)
    setDbType(typeName, group.key)
  }

  const handleSelectFile = async () => {
    try {
      const selected = await api.file.selectFile()
      if (!selected) return

      setFilePath(selected)
      const result = await api.file.parseFile(selected)

      // 根据当前分组动态解析行数据
      const fields = currentGroup.fields
      const parsedItems = result.rows.map((row) => {
        const base: Record<string, string> = {
          name: '',
          type: selectedDbType,
          host: '',
          port: '',
          database: '',
          username: '',
          password: '',
          desc: '',
          url: '',
        }
        for (const f of fields) {
          const val = row[f.label]
          base[f.key] = val !== undefined ? String(val) : (f.defaultVal || '')
        }
        return base as any
      })

      setItems(parsedItems, result.columns)
      setFieldConfig(result.fieldConfig || null)
      setModelNameMap(result.modelNameMap || null)
      setTableConfigMap(result.tableConfigMap || null)
    } catch (err: any) {
      alert('文件解析失败: ' + err.message)
    }
  }

  const handleCreateTemplate = async () => {
    try {
      const path = await api.file.createTemplate(
        `${selectedDbType}_template.xlsx`,
        selectedDbType,
        dbTypeKey,
      )
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

      {/* 数据源类型选择 */}
      <div className="form-group">
        <label className="form-label">数据源类型</label>
        <div className="flex-row" style={{ gap: 8 }}>
          <select
            className="form-select"
            value={selectedDbType}
            onChange={handleDbTypeChange}
            style={{ flex: 1 }}
          >
            {DB_TYPE_GROUPS.map((g) => (
              <optgroup key={g.key} label={g.label}>
                {g.dbTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="text-muted mt-1" style={{ fontSize: '0.8em' }}>
          当前分组: {currentGroup.label} | 模板字段: {currentGroup.fields.map((f) => f.label).join(', ')}
        </div>
      </div>

      {/* 文件上传区 */}
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
          已加载 {items.length} 条 {selectedDbType} 数据源记录
        </div>
      )}
      {fieldConfigMap && Object.keys(fieldConfigMap).length > 0 && (
        <div className="text-muted mt-1" style={{ textAlign: 'center', fontSize: '0.8em' }}>
          📋 已加载 {Object.keys(fieldConfigMap).length} 条字段配置（sheet2）
        </div>
      )}
      {tableConfigMap && Object.keys(tableConfigMap).length > 0 && (
        <div className="text-muted mt-1" style={{ textAlign: 'center', fontSize: '0.8em' }}>
          🗂️ 已加载 sheet2 表配置：{Object.keys(tableConfigMap).length} 库 / {Object.values(tableConfigMap).reduce((n, ts) => n + ts.length, 0)} 表（各数据源按其库名取对应清单过滤）
        </div>
      )}
    </div>
  )
}
