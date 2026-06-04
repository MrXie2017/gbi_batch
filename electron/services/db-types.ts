/**
 * 数据库类型映射表 - 从 Python 版本移植
 */

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
