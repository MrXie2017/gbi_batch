"""
Sugar BI 批量添加数据源工具 - GUI 版本
提供图形界面，适合非技术人员使用。
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import threading
import json
import os
import sys
import time
from datetime import datetime

import requests
import pandas as pd

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
    "GaussDB(DWS)-华为数仓": 63,
    "GBase (JDBC URL)": 32,
    "GBase 8a-南大通用": 43,
    "Graphite": 15,
    "Greenplum": 3,
    "HGDB-瀚高安全版数据库": 66,
    "HGDB-瀚高数据库": 65,
    "Hologres(阿里云)": 50,
    "IBM DB2": 24,
    "InfluxDB 1.X": 11,
    "InfluxDB 2.X": 19,
    "KingbaseES-人大金仓": 61,
    "MariaDB": 36,
    "MaxCompute(阿里云)": 48,
    "Mongodb": 38,
    "MySQL 5.X": 0,
    "MySQL 8": 20,
    "OceanBase(阿里云)": 49,
    "openGauss-华为GaussDB": 62,
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

DB_TYPE_ALIAS = {
    "mysql": 0, "mysql5": 0, "mysql8": 20,
    "pg": 2, "postgres": 2, "postgresql": 2,
    "oracle": 5, "sqlserver": 4, "mssql": 4,
    "clickhouse": 21, "ck": 21, "doris": 1,
    "mongo": 38, "mongodb": 38, "redis": 16,
    "dm": 42, "达梦": 42, "greenplum": 3, "gp": 3,
    "tidb": 18, "hive": 23, "impala": 47,
    "kylin": 29, "druid": 46, "es": 10,
    "elasticsearch": 10, "kingbase": 61, "金仓": 61,
    "opengauss": 62, "gaussdb": 63, "瀚高": 65,
    "gbase": 43, "vertica": 26, "db2": 24,
    "hana": 6, "snowflake": 25, "teradata": 31,
    "presto": 22, "trino": 22, "prometheus": 14,
    "graphite": 15, "opentsdb": 13, "influxdb": 11,
    "cassandra": 17, "cockroachdb": 7, "maria": 36,
    "mariadb": 36, "spark": 37, "athena": 51,
}

# 默认配置
DEFAULT_CONFIG = {
    "base_url": "http://200.1.1.97:8001",
    "group_id": "g_ada15-51pdsy9b-1kedmy",
    "sugar_company": "scp_ada15-9nwcmp6z-p284kv",
    "cookie": "",
    "csrf_token": "",
    "skip_test": False,
    "delay": 1.0,
}

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def resolve_db_type(type_str: str) -> int:
    """解析数据库类型编码"""
    if not type_str:
        return 0
    if type_str in DB_TYPE_MAP:
        return DB_TYPE_MAP[type_str]
    lower = str(type_str).strip().lower()
    for key, code in DB_TYPE_MAP.items():
        if key.lower() == lower:
            return code
    for alias, code in DB_TYPE_ALIAS.items():
        if alias in lower:
            return code
    try:
        return int(type_str)
    except ValueError:
        return 0


class SugarBIClient:
    """Sugar BI API 客户端"""

    def __init__(self, base_url, cookie, csrf_token, group_id, sugar_company):
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
        }

    def test_connection(self, ds_info):
        url = f"{self.api_prefix}/connectTest"
        try:
            resp = requests.post(url, json=ds_info, headers=self.headers, timeout=30)
            return resp.json()
        except requests.exceptions.Timeout:
            return {"status": 500, "msg": "连接超时"}
        except Exception as e:
            return {"status": 500, "msg": f"请求异常: {e}"}

    def add_datasource(self, ds_info):
        url = self.api_prefix
        try:
            resp = requests.post(url, json=ds_info, headers=self.headers, timeout=30)
            return resp.json()
        except Exception as e:
            return {"status": 500, "msg": f"请求异常: {e}"}

    def build_payload(self, row):
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
        desc = row.get("描述", "")
        if pd.notna(desc) and str(desc).strip():
            payload["desc"] = str(desc).strip()
        return payload


class Application(tk.Tk):
    """主应用窗口"""

    def __init__(self):
        super().__init__()
        self.title("Sugar BI 批量添加数据源工具")
        self.geometry("960x720")
        self.minsize(800, 600)
        self.configure(bg="#f5f5f5")

        # 状态变量
        self.is_running = False
        self.stop_flag = False
        self.df = None  # 当前加载的数据
        self.results = []

        # 配置
        self.config = self._load_config()

        # 样式
        self._setup_styles()

        # 构建 UI
        self._build_ui()

        # 加载配置到 UI
        self._fill_config()

    def _setup_styles(self):
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("Title.TLabel", font=("Microsoft YaHei UI", 16, "bold"), background="#f5f5f5")
        style.configure("Subtitle.TLabel", font=("Microsoft YaHei UI", 10), background="#f5f5f5", foreground="#666")
        style.configure("Card.TFrame", background="white", relief="solid", borderwidth=1)
        style.configure("Card.TLabel", font=("Microsoft YaHei UI", 10), background="white")
        style.configure("Header.TLabel", font=("Microsoft YaHei UI", 11, "bold"), background="white", foreground="#333")
        style.configure("Success.TLabel", foreground="#27ae60", background="white")
        style.configure("Fail.TLabel", foreground="#e74c3c", background="white")
        style.configure("Primary.TButton", font=("Microsoft YaHei UI", 10))
        style.configure("Big.TButton", font=("Microsoft YaHei UI", 12, "bold"), padding=8)

    def _build_ui(self):
        # 主容器
        main = ttk.Frame(self, padding=15)
        main.pack(fill=tk.BOTH, expand=True)
        main.configure(style="TFrame")

        # 标题
        title_frame = tk.Frame(main, bg="#f5f5f5")
        title_frame.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(title_frame, text="📊 Sugar BI 批量添加数据源", style="Title.TLabel").pack(side=tk.LEFT)
        ttk.Label(title_frame, text="从 Excel/CSV 文件批量导入数据源到工作空间", style="Subtitle.TLabel").pack(side=tk.LEFT, padx=(15, 0), pady=(8, 0))

        # 内容区（左右布局）
        content = ttk.Frame(main)
        content.pack(fill=tk.BOTH, expand=True)
        content.columnconfigure(0, weight=1)
        content.columnconfigure(1, weight=0)
        content.rowconfigure(0, weight=1)

        # 左侧面板
        left = ttk.Frame(content)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        left.rowconfigure(2, weight=1)

        self._build_settings(left)
        self._build_file_section(left)
        self._build_data_preview(left)

        # 右侧面板
        right = ttk.Frame(content)
        right.grid(row=0, column=1, sticky="nsew")
        right.rowconfigure(1, weight=1)
        right.columnconfigure(0, weight=1)

        self._build_controls(right)
        self._build_log(right)

    # ---------- 设置面板 ----------
    def _build_settings(self, parent):
        frame = ttk.LabelFrame(parent, text=" 🔧 连接设置 ", padding=10)
        frame.pack(fill=tk.X, pady=(0, 8))

        fields = [
            ("服务器地址:", "base_url"),
            ("工作空间 ID:", "group_id"),
            ("公司标识:", "sugar_company"),
            ("Cookie:", "cookie"),
            ("CSRF Token:", "csrf_token"),
        ]

        self.config_vars = {}
        for i, (label, key) in enumerate(fields):
            ttk.Label(frame, text=label, font=("Microsoft YaHei UI", 9)).grid(row=i, column=0, sticky="w", pady=2)
            var = tk.StringVar()
            self.config_vars[key] = var
            entry = ttk.Entry(frame, textvariable=var, width=60 if key == "cookie" else 40)
            entry.grid(row=i, column=1, sticky="ew", pady=2, padx=(8, 0))
            if key == "cookie":
                entry.configure(show="•")

        frame.columnconfigure(1, weight=1)

        # 折叠/展开按钮
        btn_frame = tk.Frame(frame)
        btn_frame.grid(row=len(fields), column=0, columnspan=2, pady=(8, 0), sticky="e")
        ttk.Button(btn_frame, text="💾 保存配置", command=self._save_config).pack(side=tk.RIGHT)
        ttk.Button(btn_frame, text="🔄 从浏览器抓取", command=self._grab_from_browser).pack(side=tk.RIGHT, padx=(0, 5))

    # ---------- 文件选择 ----------
    def _build_file_section(self, parent):
        frame = ttk.LabelFrame(parent, text=" 📁 数据文件 ", padding=10)
        frame.pack(fill=tk.X, pady=(0, 8))

        row1 = ttk.Frame(frame)
        row1.pack(fill=tk.X)

        self.file_var = tk.StringVar()
        ttk.Entry(row1, textvariable=self.file_var, state="readonly").pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 8))
        ttk.Button(row1, text="📂 选择文件", command=self._select_file).pack(side=tk.LEFT)
        ttk.Button(row1, text="📄 生成模板", command=self._create_template).pack(side=tk.LEFT, padx=(5, 0))

        self.file_info_var = tk.StringVar(value="请选择 Excel 或 CSV 文件")
        ttk.Label(frame, textvariable=self.file_info_var, foreground="#888",
                  font=("Microsoft YaHei UI", 9)).pack(anchor="w", pady=(5, 0))

    # ---------- 数据预览 ----------
    def _build_data_preview(self, parent):
        frame = ttk.LabelFrame(parent, text=" 👁️ 数据预览 ", padding=5)
        frame.pack(fill=tk.BOTH, expand=True)
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)

        # Treeview
        columns = ("序号", "数据源名称", "类型", "数据库地址", "端口", "数据库名", "用户名", "描述")
        self.tree = ttk.Treeview(frame, columns=columns, show="headings", height=6)

        col_widths = [40, 120, 90, 110, 50, 100, 80, 150]
        for col, w in zip(columns, col_widths):
            self.tree.heading(col, text=col)
            self.tree.column(col, width=w, minwidth=40)

        scrollbar_y = ttk.Scrollbar(frame, orient=tk.VERTICAL, command=self.tree.yview)
        scrollbar_x = ttk.Scrollbar(frame, orient=tk.HORIZONTAL, command=self.tree.xview)
        self.tree.configure(yscrollcommand=scrollbar_y.set, xscrollcommand=scrollbar_x.set)

        self.tree.grid(row=0, column=0, sticky="nsew")
        scrollbar_y.grid(row=0, column=1, sticky="ns")
        scrollbar_x.grid(row=1, column=0, sticky="ew")

    # ---------- 控制面板 ----------
    def _build_controls(self, parent):
        frame = ttk.LabelFrame(parent, text=" ⚙️ 操作控制 ", padding=10)
        frame.pack(fill=tk.X, pady=(0, 8))

        # 跳过测试
        self.skip_test_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(frame, text="跳过测试连接，直接添加", variable=self.skip_test_var).pack(anchor="w", pady=2)

        # 延迟设置
        delay_frame = ttk.Frame(frame)
        delay_frame.pack(fill=tk.X, pady=2)
        ttk.Label(delay_frame, text="请求间隔(秒):").pack(side=tk.LEFT)
        self.delay_var = tk.DoubleVar(value=1.0)
        ttk.Spinbox(delay_frame, from_=0, to=10, increment=0.5,
                     textvariable=self.delay_var, width=6).pack(side=tk.LEFT, padx=(5, 0))

        # 进度条
        self.progress_var = tk.DoubleVar(value=0)
        self.progress = ttk.Progressbar(frame, variable=self.progress_var, maximum=100)
        self.progress.pack(fill=tk.X, pady=(10, 5))

        # 状态标签
        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(frame, textvariable=self.status_var,
                  font=("Microsoft YaHei UI", 9)).pack(anchor="w")

        # 操作按钮
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill=tk.X, pady=(10, 0))

        self.btn_start = ttk.Button(btn_frame, text="▶ 开始执行", style="Big.TButton",
                                     command=self._start_batch)
        self.btn_start.pack(fill=tk.X, pady=(0, 5))

        self.btn_stop = ttk.Button(btn_frame, text="⏹ 停止", state=tk.DISABLED,
                                    command=self._stop_batch)
        self.btn_stop.pack(fill=tk.X)

        # 统计信息
        stats_frame = ttk.LabelFrame(frame, text=" 📊 执行统计 ", padding=8)
        stats_frame.pack(fill=tk.X, pady=(10, 0))

        self.stats_total = tk.StringVar(value="总计: 0")
        self.stats_success = tk.StringVar(value="✅ 成功: 0")
        self.stats_fail = tk.StringVar(value="❌ 失败: 0")
        self.stats_skip = tk.StringVar(value="⏭️ 跳过: 0")

        ttk.Label(stats_frame, textvariable=self.stats_total, style="Card.TLabel").pack(anchor="w")
        ttk.Label(stats_frame, textvariable=self.stats_success, foreground="#27ae60",
                  font=("Microsoft YaHei UI", 10, "bold"), background="white").pack(anchor="w")
        ttk.Label(stats_frame, textvariable=self.stats_fail, foreground="#e74c3c",
                  font=("Microsoft YaHei UI", 10, "bold"), background="white").pack(anchor="w")
        ttk.Label(stats_frame, textvariable=self.stats_skip, foreground="#f39c12",
                  font=("Microsoft YaHei UI", 10, "bold"), background="white").pack(anchor="w")

    # ---------- 日志面板 ----------
    def _build_log(self, parent):
        frame = ttk.LabelFrame(parent, text=" 📋 执行日志 ", padding=5)
        frame.pack(fill=tk.BOTH, expand=True)
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)

        self.log_text = scrolledtext.ScrolledText(frame, height=15, wrap=tk.WORD,
                                                    font=("Consolas", 9), bg="#1e1e1e", fg="#d4d4d4",
                                                    insertbackground="white")
        self.log_text.grid(row=0, column=0, sticky="nsew")
        self.log_text.tag_configure("success", foreground="#4ec9b0")
        self.log_text.tag_configure("fail", foreground="#f44747")
        self.log_text.tag_configure("warn", foreground="#dcdcaa")
        self.log_text.tag_configure("info", foreground="#569cd6")
        self.log_text.tag_configure("header", foreground="#c586c0", font=("Consolas", 10, "bold"))

        btn_frame = ttk.Frame(frame)
        btn_frame.grid(row=1, column=0, sticky="ew", pady=(5, 0))
        ttk.Button(btn_frame, text="清除日志", command=lambda: self.log_text.delete("1.0", tk.END)).pack(side=tk.LEFT)
        ttk.Button(btn_frame, text="导出报告", command=self._export_report).pack(side=tk.RIGHT)

    # ---------- 日志方法 ----------
    def log(self, msg, tag="info"):
        self.log_text.insert(tk.END, msg + "\n", tag)
        self.log_text.see(tk.END)

    # ---------- 配置管理 ----------
    def _load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                    config = {**DEFAULT_CONFIG, **saved}
                    return config
            except Exception:
                pass
        return DEFAULT_CONFIG.copy()

    def _fill_config(self):
        for key, var in self.config_vars.items():
            if key in self.config:
                var.set(self.config[key])

    def _save_config(self):
        for key, var in self.config_vars.items():
            self.config[key] = var.get()
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(self.config, f, ensure_ascii=False, indent=2)
            messagebox.showinfo("保存成功", "配置已保存到 config.json")
        except Exception as e:
            messagebox.showerror("保存失败", str(e))

    def _grab_from_browser(self):
        """提示用户从浏览器开发者工具中获取 Cookie 和 CSRF Token"""
        instructions = (
            "请按以下步骤从浏览器获取认证信息：\n\n"
            "1. 在浏览器中打开 Sugar BI 并登录\n"
            "2. 按 F12 打开开发者工具\n"
            "3. 切换到「网络」(Network) 标签\n"
            "4. 在页面中进行任意操作（如刷新页面）\n"
            "5. 点击一个 API 请求，在请求头中找到：\n"
            "   - Cookie: 复制完整值\n"
            "   - csrf-token: 复制完整值\n"
            "6. 粘贴到左侧对应的输入框中\n\n"
            "⚠️ 注意：Cookie 和 Token 会过期，过期后需要重新获取。"
        )
        messagebox.showinfo("获取认证信息", instructions)

    # ---------- 文件操作 ----------
    def _select_file(self):
        file_path = filedialog.askopenfilename(
            title="选择数据源文件",
            filetypes=[
                ("Excel 文件", "*.xlsx;*.xls"),
                ("CSV 文件", "*.csv"),
                ("所有文件", "*.*"),
            ]
        )
        if file_path:
            self.file_var.set(file_path)
            self._load_data(file_path)

    def _load_data(self, file_path):
        try:
            ext = os.path.splitext(file_path)[1].lower()
            if ext in (".xlsx", ".xls"):
                self.df = pd.read_excel(file_path)
            elif ext == ".csv":
                self.df = pd.read_csv(file_path)
            else:
                messagebox.showerror("错误", f"不支持的文件格式: {ext}")
                return

            # 更新文件信息
            self.file_info_var.set(f"已加载 {len(self.df)} 条记录 | 文件: {os.path.basename(file_path)}")

            # 更新预览表格
            self._update_preview()

            self.log(f"📂 已加载文件: {os.path.basename(file_path)}", "info")
            self.log(f"   共 {len(self.df)} 条数据源记录", "info")

        except Exception as e:
            messagebox.showerror("文件读取失败", str(e))
            self.log(f"❌ 文件读取失败: {e}", "fail")

    def _update_preview(self):
        # 清空现有数据
        for item in self.tree.get_children():
            self.tree.delete(item)

        if self.df is None:
            return

        for idx, row in self.df.iterrows():
            values = (
                idx + 1,
                str(row.get("数据源名称", "")),
                str(row.get("类型", "MySQL 5.X")),
                str(row.get("数据库地址", "")),
                str(row.get("端口", "3306")),
                str(row.get("数据库名", "")),
                str(row.get("用户名", "")),
                str(row.get("描述", "")),
            )
            self.tree.insert("", tk.END, values=values)

    def _create_template(self):
        file_path = filedialog.asksaveasfilename(
            title="保存模板文件",
            defaultextension=".xlsx",
            filetypes=[("Excel 文件", "*.xlsx")],
            initialfile="datasource_template.xlsx",
        )
        if not file_path:
            return

        columns = ["数据源名称", "类型", "数据库地址", "端口", "数据库名", "用户名", "密码", "描述"]
        sample_data = [
            ["测试MySQL", "MySQL 5.X", "192.168.1.100", "3306", "test_db", "root", "password", "测试数据库"],
            ["生产PG", "PostgreSQL", "192.168.1.200", "5432", "prod_db", "postgres", "password", "生产PG"],
            ["数据仓库CH", "Clickhouse", "192.168.1.300", "8123", "dw_db", "default", "password", "Clickhouse"],
        ]
        df = pd.DataFrame(sample_data, columns=columns)
        df.to_excel(file_path, index=False)
        messagebox.showinfo("模板已生成", f"模板文件已保存到:\n{file_path}\n\n"
                            "请在模板中填写数据源信息后再导入。")
        self.log(f"📄 模板文件已生成: {file_path}", "info")

    # ---------- 批量执行 ----------
    def _start_batch(self):
        if self.is_running:
            return

        # 验证
        if self.df is None or len(self.df) == 0:
            messagebox.showwarning("提示", "请先加载数据文件！")
            return

        cookie = self.config_vars["cookie"].get().strip()
        csrf = self.config_vars["csrf_token"].get().strip()
        if not cookie or not csrf:
            messagebox.showwarning("提示", "请先填写 Cookie 和 CSRF Token！\n\n点击「从浏览器抓取」查看获取方法。")
            return

        # 确认
        total = len(self.df)
        skip_test = self.skip_test_var.get()
        mode_text = "跳过测试直接添加" if skip_test else "先测试连接再添加"
        confirm = messagebox.askyesno("确认执行",
                                       f"即将处理 {total} 条数据源记录\n"
                                       f"模式: {mode_text}\n\n"
                                       f"确认开始执行？")
        if not confirm:
            return

        # 初始化
        self.is_running = True
        self.stop_flag = False
        self.results = []
        self.progress_var.set(0)
        self.btn_start.configure(state=tk.DISABLED)
        self.btn_stop.configure(state=tk.NORMAL)
        self.stats_total.set(f"总计: {total}")
        self.stats_success.set("✅ 成功: 0")
        self.stats_fail.set("❌ 失败: 0")
        self.stats_skip.set("⏭️ 跳过: 0")

        # 在线程中执行
        thread = threading.Thread(target=self._batch_worker, daemon=True)
        thread.start()

    def _stop_batch(self):
        self.stop_flag = True
        self.status_var.set("⏹ 正在停止...")
        self.log("\n⏹ 用户请求停止，等待当前操作完成...", "warn")

    def _batch_worker(self):
        try:
            client = SugarBIClient(
                base_url=self.config_vars["base_url"].get(),
                cookie=self.config_vars["cookie"].get(),
                csrf_token=self.config_vars["csrf_token"].get(),
                group_id=self.config_vars["group_id"].get(),
                sugar_company=self.config_vars["sugar_company"].get(),
            )

            total = len(self.df)
            skip_test = self.skip_test_var.get()
            delay = self.delay_var.get()

            success = 0
            fail = 0
            skip = 0

            self.after(0, self.log, "=" * 50, "header")
            self.after(0, self.log, f"🚀 开始批量添加数据源 | 共 {total} 条", "header")
            self.after(0, self.log, "=" * 50, "header")

            for idx, row in self.df.iterrows():
                if self.stop_flag:
                    self.after(0, self.log, "\n⏹ 已停止执行", "warn")
                    break

                row_dict = row.to_dict()
                payload = client.build_payload(row_dict)
                name = payload["name"]
                host = payload["host"]
                num = idx + 1

                self.after(0, self.status_var.set, f"处理中 [{num}/{total}] {name}")
                self.after(0, self.log, f"\n[{num}/{total}] {name} ({host}:{payload['port']})", "info")

                result = {
                    "index": num, "name": name, "host": host,
                    "type": payload["type"],
                    "test_status": "skipped", "test_msg": "",
                    "add_status": "pending", "add_msg": "",
                }

                # 测试连接
                if not skip_test:
                    self.after(0, self.log, "  🔄 测试连接...", "info")
                    test_result = client.test_connection(payload)
                    result["test_status"] = "success" if test_result.get("status") == 0 else "failed"
                    result["test_msg"] = test_result.get("msg", "")

                    if test_result.get("status") == 0:
                        self.after(0, self.log, "  ✅ 测试连接成功", "success")
                    else:
                        self.after(0, self.log, f"  ❌ 测试连接失败: {result['test_msg']}", "fail")
                        result["add_status"] = "skipped"
                        result["add_msg"] = f"测试失败: {result['test_msg']}"
                        skip += 1
                        self.results.append(result)
                        self._update_stats(total, success, fail, skip)
                        self.after(0, self.progress_var.set, num / total * 100)
                        if delay > 0:
                            time.sleep(delay)
                        continue
                else:
                    self.after(0, self.log, "  ⏭️ 跳过测试连接", "warn")

                # 添加数据源
                self.after(0, self.log, "  🔄 添加数据源...", "info")
                add_result = client.add_datasource(payload)

                if add_result.get("status") == 0:
                    result["add_status"] = "success"
                    result["add_msg"] = add_result.get("msg", "添加成功")
                    self.after(0, self.log, "  ✅ 添加成功", "success")
                    success += 1
                else:
                    result["add_status"] = "failed"
                    result["add_msg"] = add_result.get("msg", "添加失败")
                    self.after(0, self.log, f"  ❌ 添加失败: {result['add_msg']}", "fail")
                    fail += 1

                self.results.append(result)
                self._update_stats(total, success, fail, skip)
                self.after(0, self.progress_var.set, num / total * 100)

                if delay > 0:
                    time.sleep(delay)

            # 完成
            self.after(0, self.log, "\n" + "=" * 50, "header")
            self.after(0, self.log, f"📊 执行完成 | 成功:{success} 失败:{fail} 跳过:{skip}", "header")
            self.after(0, self.log, "=" * 50, "header")
            self.after(0, self.status_var.set, f"✅ 执行完成 | 成功:{success} 失败:{fail} 跳过:{skip}")

        except Exception as e:
            self.after(0, self.log, f"\n❌ 执行出错: {e}", "fail")
            self.after(0, self.status_var.set, f"❌ 执行出错: {e}")
        finally:
            self.is_running = False
            self.after(0, self._on_batch_done)

    def _update_stats(self, total, success, fail, skip):
        self.after(0, self.stats_total.set, f"总计: {total}")
        self.after(0, self.stats_success.set, f"✅ 成功: {success}")
        self.after(0, self.stats_fail.set, f"❌ 失败: {fail}")
        self.after(0, self.stats_skip.set, f"⏭️ 跳过: {skip}")

    def _on_batch_done(self):
        self.btn_start.configure(state=tk.NORMAL)
        self.btn_stop.configure(state=tk.DISABLED)
        self.progress_var.set(100)

        if self.results:
            report_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports")
            os.makedirs(report_dir, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            report_file = os.path.join(report_dir, f"batch_report_{timestamp}.csv")
            report_df = pd.DataFrame(self.results)
            report_df.to_csv(report_file, index=False, encoding="utf-8-sig")
            self.log(f"\n📄 报告已保存: {report_file}", "info")

    # ---------- 导出报告 ----------
    def _export_report(self):
        if not self.results:
            messagebox.showinfo("提示", "暂无执行结果，请先运行批量添加。")
            return

        file_path = filedialog.asksaveasfilename(
            title="导出报告",
            defaultextension=".csv",
            filetypes=[("CSV 文件", "*.csv"), ("Excel 文件", "*.xlsx")],
            initialfile=f"batch_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        )
        if not file_path:
            return

        try:
            report_df = pd.DataFrame(self.results)
            if file_path.endswith(".xlsx"):
                report_df.to_excel(file_path, index=False)
            else:
                report_df.to_csv(file_path, index=False, encoding="utf-8-sig")
            messagebox.showinfo("导出成功", f"报告已保存到:\n{file_path}")
            self.log(f"📄 报告已导出: {file_path}", "info")
        except Exception as e:
            messagebox.showerror("导出失败", str(e))


def main():
    app = Application()
    app.mainloop()


if __name__ == "__main__":
    main()
