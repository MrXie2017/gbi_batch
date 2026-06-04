"""
Sugar BI 批量添加数据源工具
从 Excel/CSV 文件读取数据源信息，自动测试连接并批量添加到指定工作空间。
"""

import requests
import pandas as pd
import time
import sys
import os
from datetime import datetime

# ==================== 数据库类型映射表 ====================
DB_TYPE_MAP = {
    "Amazon Athena": 51,
    "Apache Doris": 1,
    "Apache Druid": 46,
    "Apache Druid (JDBC URL)": 39,
    "Apache Hive": 23,
    "Apache Hive (JDBC URL)": 41,
    "Apache Impala": 47,
    "Apache Impala (JDBC URL)": 35,
    "Apache Kylin": 29,
    "Apache Spark SQL": 37,
    "Baidu TSDB": 8,
    "Cassandra": 17,
    "Clickhouse": 21,
    "CockroachDB": 7,
    "DM-达梦": 42,
    "ElasticSearch 1.x+": 12,
    "ElasticSearch 6.3+": 10,
    "Exasol": 33,
    "GaiaDB": 64,
    "GaussDB(DWS)": 63,
    "GBase (JDBC URL)": 32,
    "GBase 8a": 43,
    "Graphite": 15,
    "Greenplum": 3,
    "HGDB-瀚高安全版": 66,
    "HGDB-瀚高": 65,
    "Hologres": 50,
    "IBM DB2": 24,
    "InfluxDB 1.X": 11,
    "InfluxDB 2.X": 19,
    "KingbaseES": 61,
    "MariaDB": 36,
    "MaxCompute": 48,
    "Mongodb": 38,
    "MySQL 5.X": 0,
    "MySQL 8": 20,
    "OceanBase": 49,
    "openGauss": 62,
    "OpenTSDB": 13,
    "Oracle": 5,
    "PostgreSQL": 2,
    "Presto/Trino": 22,
    "Prometheus": 14,
    "Redis": 16,
    "SAP HANA": 6,
    "Snowflake": 25,
    "SQL Server": 4,
    "Teradata": 31,
    "TiDB": 18,
    "Vertica": 26,
    "JDBC 通用数据库": 40,
}

# 反向映射：中文名 -> type code（模糊匹配用）
DB_TYPE_ALIAS = {
    "mysql": 0,
    "mysql5": 0,
    "mysql8": 20,
    "pg": 2,
    "postgres": 2,
    "postgresql": 2,
    "oracle": 5,
    "sqlserver": 4,
    "mssql": 4,
    "clickhouse": 21,
    "ck": 21,
    "doris": 1,
    "mongo": 38,
    "mongodb": 38,
    "redis": 16,
    "dm": 42,
    "达梦": 42,
    "greenplum": 3,
    "gp": 3,
    "tidb": 18,
    "hive": 23,
    "impala": 47,
    "kylin": 29,
    "druid": 46,
    "es": 10,
    "elasticsearch": 10,
    "kingbase": 61,
    "金仓": 61,
    "opengauss": 62,
    "gaussdb": 63,
    "瀚高": 65,
    "gbase": 43,
    "vertica": 26,
    "db2": 24,
    "hana": 6,
    "snowflake": 25,
    "teradata": 31,
    "presto": 22,
    "trino": 22,
    "prometheus": 14,
    "graphite": 15,
    "opentsdb": 13,
    "influxdb": 11,
    "cassandra": 17,
    "cockroachdb": 7,
    "maria": 36,
    "mariadb": 36,
    "spark": 37,
    "athena": 51,
}


def resolve_db_type(type_str: str) -> int:
    """根据类型名称字符串解析数据库类型编码"""
    if not type_str:
        return 0  # 默认 MySQL 5.X

    # 先精确匹配
    if type_str in DB_TYPE_MAP:
        return DB_TYPE_MAP[type_str]

    # 模糊匹配（小写）
    lower = type_str.strip().lower()
    for key, code in DB_TYPE_MAP.items():
        if key.lower() == lower:
            return code

    # 别名匹配
    for alias, code in DB_TYPE_ALIAS.items():
        if alias in lower:
            return code

    # 尝试数字
    try:
        val = int(type_str)
        return val
    except ValueError:
        pass

    print(f"  ⚠️  无法识别数据库类型 '{type_str}'，默认使用 MySQL 5.X (0)")
    return 0


class SugarBIDataSourceBatch:
    """Sugar BI 数据源批量添加工具"""

    def __init__(self, base_url: str, cookie: str, csrf_token: str,
                 group_id: str, sugar_company: str):
        self.base_url = base_url.rstrip("/")
        self.group_id = group_id
        self.api_prefix = f"{self.base_url}/api/manage/group/{group_id}/database"

        self.headers = {
            "accept": "application/json, text/plain, */*",
            "content-type": "application/json",
            "csrf-token": csrf_token,
            "sugar-company": sugar_company,
            "cookie": cookie,
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "origin": self.base_url,
            "referer": f"{self.base_url}/group/Refined_Soft_Computer/manage/database",
        }

        self.results = []  # 存储每条记录的处理结果

    def test_connection(self, ds_info: dict) -> dict:
        """测试数据源连接"""
        url = f"{self.api_prefix}/connectTest"
        try:
            resp = requests.post(url, json=ds_info, headers=self.headers, timeout=30)
            data = resp.json()
            return data
        except requests.exceptions.Timeout:
            return {"status": 500, "msg": "连接超时"}
        except Exception as e:
            return {"status": 500, "msg": f"请求异常: {str(e)}"}

    def add_datasource(self, ds_info: dict) -> dict:
        """添加数据源"""
        url = self.api_prefix
        try:
            resp = requests.post(url, json=ds_info, headers=self.headers, timeout=30)
            data = resp.json()
            return data
        except Exception as e:
            return {"status": 500, "msg": f"请求异常: {str(e)}"}

    def build_payload(self, row: dict) -> dict:
        """从 Excel 行数据构建 API 请求体"""
        db_type = resolve_db_type(str(row.get("类型", "MySQL 5.X")))

        payload = {
            "network": "normal",
            "region": "gz",
            "type": db_type,
            "tunnelHash": 0,
            "name": str(row.get("数据源名称", "")),
            "host": str(row.get("数据库地址", "")),
            "port": str(row.get("端口", "3306")),
            "database": str(row.get("数据库名", "")),
            "username": str(row.get("用户名", "")),
            "password": str(row.get("密码", "")),
        }

        # 可选字段
        desc = row.get("描述", "")
        if pd.notna(desc) and str(desc).strip():
            payload["desc"] = str(desc).strip()

        return payload

    def process_one(self, row: dict, index: int, skip_test: bool = False) -> dict:
        """处理单条数据源记录"""
        payload = self.build_payload(row)
        name = payload["name"]
        host = payload["host"]

        result = {
            "index": index,
            "name": name,
            "host": host,
            "type": payload["type"],
            "test_status": "skipped",
            "test_msg": "",
            "add_status": "pending",
            "add_msg": "",
        }

        print(f"\n[{index}] 处理: {name} ({host})")

        # 步骤1: 测试连接
        if not skip_test:
            print(f"  🔄 测试连接...")
            test_result = self.test_connection(payload)
            result["test_status"] = "success" if test_result.get("status") == 0 else "failed"
            result["test_msg"] = test_result.get("msg", "")

            if test_result.get("status") == 0:
                print(f"  ✅ 测试连接成功")
            else:
                print(f"  ❌ 测试连接失败: {result['test_msg']}")
                result["add_status"] = "skipped"
                result["add_msg"] = "测试连接失败，跳过添加"
                self.results.append(result)
                return result
        else:
            print(f"  ⏭️  跳过测试连接")

        # 步骤2: 添加数据源
        print(f"  🔄 添加数据源...")
        add_result = self.add_datasource(payload)
        if add_result.get("status") == 0:
            result["add_status"] = "success"
            result["add_msg"] = add_result.get("msg", "添加成功")
            print(f"  ✅ 添加成功")
        else:
            result["add_status"] = "failed"
            result["add_msg"] = add_result.get("msg", "添加失败")
            print(f"  ❌ 添加失败: {result['add_msg']}")

        self.results.append(result)
        return result

    def batch_process(self, file_path: str, skip_test: bool = False,
                      delay: float = 1.0, dry_run: bool = False):
        """批量处理数据源"""
        # 读取文件
        ext = os.path.splitext(file_path)[1].lower()
        if ext in (".xlsx", ".xls"):
            df = pd.read_excel(file_path)
        elif ext == ".csv":
            df = pd.read_csv(file_path)
        else:
            print(f"❌ 不支持的文件格式: {ext}，请使用 .xlsx / .xls / .csv")
            return

        total = len(df)
        print(f"{'='*60}")
        print(f"📋 读取到 {total} 条数据源记录")
        print(f"{'='*60}")

        if dry_run:
            print("\n🔍 【试运行模式】仅解析数据，不执行实际操作\n")
            for idx, row in df.iterrows():
                payload = self.build_payload(row)
                print(f"  [{idx+1}] {payload['name']} | {payload['host']}:{payload['port']} | "
                      f"数据库={payload['database']} | 类型={payload['type']}")
            return

        success_count = 0
        fail_count = 0
        skip_count = 0

        for idx, row in df.iterrows():
            result = self.process_one(row.to_dict(), idx + 1, skip_test=skip_test)

            if result["add_status"] == "success":
                success_count += 1
            elif result["add_status"] == "skipped":
                skip_count += 1
            else:
                fail_count += 1

            # 延迟，避免请求过快
            if delay > 0 and idx < total - 1:
                time.sleep(delay)

        # 打印汇总报告
        self.print_report(total, success_count, fail_count, skip_count)

    def print_report(self, total: int, success: int, fail: int, skip: int):
        """打印汇总报告"""
        print(f"\n{'='*60}")
        print(f"📊 批量添加数据源执行报告")
        print(f"{'='*60}")
        print(f"  总计: {total}")
        print(f"  ✅ 成功: {success}")
        print(f"  ❌ 失败: {fail}")
        print(f"  ⏭️  跳过: {skip}")
        print(f"{'='*60}")

        # 输出详细结果
        for r in self.results:
            status_icon = "✅" if r["add_status"] == "success" else (
                "⏭️" if r["add_status"] == "skipped" else "❌")
            print(f"  {status_icon} [{r['index']}] {r['name']} ({r['host']}) "
                  f"- {r['add_msg']}")

        # 保存报告到文件
        report_dir = os.path.join(os.path.dirname(__file__), "reports")
        os.makedirs(report_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = os.path.join(report_dir, f"batch_report_{timestamp}.csv")

        report_df = pd.DataFrame(self.results)
        report_df.to_csv(report_file, index=False, encoding="utf-8-sig")
        print(f"\n📄 详细报告已保存: {report_file}")


def create_template(output_path: str = None):
    """创建 Excel 模板文件"""
    if output_path is None:
        output_path = os.path.join(os.path.dirname(__file__), "datasource_template.xlsx")

    columns = ["数据源名称", "类型", "数据库地址", "端口", "数据库名", "用户名", "密码", "描述"]
    sample_data = [
        ["测试MySQL", "MySQL 5.X", "192.168.1.100", "3306", "test_db", "root", "password", "测试数据库"],
        ["生产PG", "PostgreSQL", "192.168.1.200", "5432", "prod_db", "postgres", "password", "生产PG数据库"],
        ["数据仓库CH", "Clickhouse", "192.168.1.300", "8123", "dw_db", "default", "password", "Clickhouse数据仓库"],
    ]

    df = pd.DataFrame(sample_data, columns=columns)
    df.to_excel(output_path, index=False)
    print(f"✅ 模板文件已创建: {output_path}")
    print(f"   列说明: {', '.join(columns)}")
    print(f"   类型列支持: MySQL 5.X, MySQL 8, PostgreSQL, Clickhouse, Oracle, SQL Server 等")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Sugar BI 批量添加数据源工具")
    parser.add_argument("--template", action="store_true", help="生成 Excel 模板文件")
    parser.add_argument("--file", "-f", type=str, help="数据源 Excel/CSV 文件路径")
    parser.add_argument("--skip-test", action="store_true", help="跳过测试连接，直接添加")
    parser.add_argument("--delay", type=float, default=1.0, help="每条记录之间的延迟（秒），默认1秒")
    parser.add_argument("--dry-run", action="store_true", help="试运行模式，仅解析不执行")

    args = parser.parse_args()

    # 生成模板
    if args.template:
        create_template()
        return

    # 必须指定文件
    if not args.file:
        print("❌ 请指定数据源文件: --file <path>")
        print("   使用 --template 生成模板文件")
        return

    if not os.path.exists(args.file):
        print(f"❌ 文件不存在: {args.file}")
        return

    # ==================== 连接配置 ====================
    # 从浏览器抓取的配置信息（请根据实际情况更新）
    BASE_URL = "http://200.1.1.97:8001"
    GROUP_ID = "g_ada15-51pdsy9b-1kedmy"
    SUGAR_COMPANY = "scp_ada15-9nwcmp6z-p284kv"

    # ⚠️ 注意：cookie 和 csrf-token 会过期，需要定期从浏览器中更新
    COOKIE = "_csrf=y-HrlwuoGO3Cohy--vRK93_K; sugar-company=scp_ada15-9nwcmp6z-p284kv; sugarbisid=s%3AgKYgw8cegahL0x4Vce6X_MyxLaFe8Ix9.H%2FNxMYuCFGHqiARviT2ifs2tqdAXGSGSx7ATUNgauP0"
    CSRF_TOKEN = "YumAYiYX-1t3wjydDSh35HxGyKlgUFaLoYkE"
    # ================================================

    client = SugarBIDataSourceBatch(
        base_url=BASE_URL,
        cookie=COOKIE,
        csrf_token=CSRF_TOKEN,
        group_id=GROUP_ID,
        sugar_company=SUGAR_COMPANY,
    )

    client.batch_process(
        file_path=args.file,
        skip_test=args.skip_test,
        delay=args.delay,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
