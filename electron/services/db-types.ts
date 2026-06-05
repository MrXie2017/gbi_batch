/**
 * 数据库类型映射表 - 从 Python 版本移植
 */

/** 模板字段定义 */
export interface TemplateField {
  key: string         // DatasourceItem 中的字段名
  label: string       // Excel 列标题
  required: boolean
  defaultVal?: string
}

/** 数据库类型分组 - 不同分组对应不同的模板字段 */
export interface DbFieldGroup {
  key: 'sql' | 'jdbc' | 'http' | 'nosql'
  label: string
  dbTypes: string[]
  fields: TemplateField[]
}

/**
 * 数据库类型分组定义
 * - sql:  标准数据库 (host + port + database + user + pass)
 * - jdbc: JDBC URL 连接 (url + user + pass)
 * - http: HTTP/API 服务 (host + port + user + pass, 无 database)
 * - nosql: NoSQL 数据库 (host + port + database可选 + user + pass)
 */
export const DB_FIELD_GROUPS: DbFieldGroup[] = [
  {
    key: 'sql',
    label: '标准数据库连接',
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
    label: 'JDBC URL 连接',
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

/** 根据 DB 类型名称查找对应的字段分组 */
export function getFieldGroup(dbTypeName: string): DbFieldGroup {
  for (const group of DB_FIELD_GROUPS) {
    if (group.dbTypes.includes(dbTypeName)) return group
  }
  return DB_FIELD_GROUPS[0] // 默认 sql
}

/** 根据分组 key 查找字段分组 */
export function getFieldGroupByKey(key: string): DbFieldGroup {
  return DB_FIELD_GROUPS.find((g) => g.key === key) || DB_FIELD_GROUPS[0]
}

export const DB_TYPE_MAP: Record<string, number> = {
  'Amazon Athena': 51,
  'Apache Doris': 1,
  'Apache Druid': 46,
  'Apache Druid (JDBC URL)': 39,
  'Apache Hive': 23,
  'Apache Hive (JDBC URL)': 41,
  'Apache Impala': 47,
  'Apache Impala (JDBC URL)': 35,
  'Apache Kylin': 29,
  'Apache Spark SQL': 37,
  'Baidu TSDB': 8,
  'Cassandra': 17,
  'Clickhouse': 21,
  'CockroachDB': 7,
  'DM-达梦': 42,
  'ElasticSearch 1.x+': 12,
  'ElasticSearch 6.3+': 10,
  'Exasol': 33,
  'GaiaDB': 64,
  'GaussDB(DWS)-华为数仓': 63,
  'GBase (JDBC URL)': 32,
  'GBase 8a-南大通用': 43,
  'Graphite': 15,
  'Greenplum': 3,
  'HGDB-瀚高安全版数据库': 66,
  'HGDB-瀚高数据库': 65,
  'Hologres(阿里云)': 50,
  'IBM DB2': 24,
  'InfluxDB 1.X': 11,
  'InfluxDB 2.X': 19,
  'KingbaseES-人大金仓': 61,
  'MariaDB': 36,
  'MaxCompute(阿里云)': 48,
  'Mongodb': 38,
  'MySQL 5.X': 0,
  'MySQL 8': 20,
  'OceanBase(阿里云)': 49,
  'openGauss-华为GaussDB': 62,
  'OpenTSDB': 13,
  'Oracle': 5,
  'PostgreSQL': 2,
  'Presto/Trino': 22,
  'Prometheus': 14,
  'Redis': 16,
  'SAP HANA': 6,
  'Snowflake': 25,
  'SQL Server': 4,
  'Teradata': 31,
  'TiDB': 18,
  'Vertica': 26,
  'JDBC 通用数据库': 40,
}

export const DB_TYPE_ALIAS: Record<string, number> = {
  mysql: 0, mysql5: 0, mysql8: 20,
  pg: 2, postgres: 2, postgresql: 2,
  oracle: 5, sqlserver: 4, mssql: 4,
  clickhouse: 21, ck: 21, doris: 1,
  mongo: 38, mongodb: 38, redis: 16,
  dm: 42, '达梦': 42, greenplum: 3, gp: 3,
  tidb: 18, hive: 23, impala: 47,
  kylin: 29, druid: 46, es: 10,
  elasticsearch: 10, kingbase: 61, '金仓': 61,
  opengauss: 62, gaussdb: 63, '瀚高': 65,
  gbase: 43, vertica: 26, db2: 24,
  hana: 6, snowflake: 25, teradata: 31,
  presto: 22, trino: 22, prometheus: 14,
  graphite: 15, opentsdb: 13, influxdb: 11,
  cassandra: 17, cockroachdb: 7, maria: 36,
  mariadb: 36, spark: 37, athena: 51,
}

/** 获取所有数据库类型名称列表（用于下拉选择） */
export const DB_TYPE_NAMES = Object.keys(DB_TYPE_MAP)

/**
 * 解析数据库类型字符串为类型编码
 */
export function resolveDbType(typeStr: string): number {
  if (!typeStr) return 0

  // 精确匹配
  if (typeStr in DB_TYPE_MAP) return DB_TYPE_MAP[typeStr]

  // 忽略大小写匹配
  const lower = typeStr.trim().toLowerCase()
  for (const [key, code] of Object.entries(DB_TYPE_MAP)) {
    if (key.toLowerCase() === lower) return code
  }

  // 别名匹配
  for (const [alias, code] of Object.entries(DB_TYPE_ALIAS)) {
    if (lower.includes(alias)) return code
  }

  // 尝试数字
  const num = Number(typeStr)
  if (!isNaN(num)) return num

  return 0 // 默认 MySQL 5.X
}
