# SecondView

1 秒分辨率股票行情可视化工具。FastAPI 后端读取本地 parquet 数据并提供 JSON 接口，单页前端使用本地固定版本的 TradingView lightweight-charts 渲染交互式图表。

## Setup（首次配置）

### 0) 前置条件

- **uv**：建议使用 `uv` 管理虚拟环境与依赖（更快、更可复现）。安装方式见 `uv` 官方文档。
- **数据目录结构**：本地可访问 1s_parquet 数据，保持目录内数据原状


### 1) 安装依赖（uv）

```bash
uv sync
```

### 2) 配置 1s parquet 路径（每台机器各配各的）

项目通过 `PARQUET_DIR` 指定 parquet 根目录，推荐用本地 `.env`（不会提交到仓库）。

```bash
cp .env.example .env
# 然后编辑 .env，把 PARQUET_DIR 改成你机器上的真实路径
```

`.env` 最少需要这一行：

```bash
PARQUET_DIR="/path/to/1s_parquet"
```

### 3) 启动服务（默认端口 8787）

```bash
uv run python server.py
```

打开浏览器访问：

- `http://127.0.0.1:8787`

默认只监听 `127.0.0.1`。如确实需要让局域网设备访问，可显式设置：

```bash
HOST=0.0.0.0 uv run python server.py
```

### 3.1)（推荐）后台常驻运行 / 重启

```bash
./scripts/serverctl start
./scripts/serverctl status
./scripts/serverctl logs

# 重启
./scripts/serverctl restart

# 停止
./scripts/serverctl stop
```

后台脚本同样默认只监听 `127.0.0.1`。如确实需要让局域网设备访问，可显式设置：

```bash
HOST=0.0.0.0 ./scripts/serverctl start
```

### 4) 常见问题

- **报错 `PARQUET_DIR is not set`**：说明你没有配置 `.env` 或没有导出环境变量 `PARQUET_DIR`。
- **报错 `PARQUET_DIR does not exist...`**：路径写错/磁盘没挂载/没有权限。
- **报错缺少 `orjson` 等依赖**：请确认你已执行 `uv sync`，并用 `uv run ...` 启动。

也可以临时用环境变量覆盖（不修改 `.env`）：

```bash
PARQUET_DIR="/your/parquet/root" uv run python server.py
```

## 核心功能

- **多分辨率 K 线** — 支持 1s / 5s / 10s / 1min 聚合
- **盘前/盘中/盘后筛选** — All / Pre / Mkt / Ext 一键切换
- **VWAP / 均线叠加** — 累计 VWAP、MA5 / MA100 / MA200
- **Clean Price 模式** — 切换原始价格与清洗后的调整价格
- **蜡烛图 / 折线图切换** — 按 `C`(蜡烛) / `L`(折线) 快捷切换
- **日期 & 标的导航** — 日期按钮 + 标的条带，显示涨跌幅
- **时间轴区间选取** — 鼠标拖选时间范围查看区间统计
- **键盘快捷键** — `←` `→` 切换标的，`F` 适配全屏，`V` VWAP，`M` 均线

## 项目结构

```
server.py                 # 启动入口（兼容：uvicorn server:app）
backend/server.py         # FastAPI 后端实现
backend/paths.py          # 本地 parquet 路径解析（.env / PARQUET_DIR）
static/index.html         # 页面骨架
static/css/app.css        # 样式
static/js/app.js          # 前端入口
static/js/*.js            # 模块化逻辑
行情数据根目录/{SYMBOL}/{YYYY}.parquet
```

## API

| 端点 | 说明 |
|------|------|
| `GET /api/dates` | 返回所有可用日期；默认不计算摘要，避免首次加载过慢 |
| `GET /api/search?q=A` | 按前缀搜索标的 |
| `GET /api/event-lists` | 返回可用事件列表 |
| `GET /api/event-lists/{name}` | 返回某个事件列表的事件行 |
| `GET /api/price/{date}/{symbol}` | 返回 K 线、成交量、VWAP、均线等完整图表数据 |

`/api/dates` 查询参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `include_summary` | `false` | 是否计算日期内标的摘要 |
| `symbols` | 空 | 逗号分隔的标的列表；仅在 `include_summary=true` 时使用，最多 25 个；为空时默认返回 AAPL（如果存在） |

说明：摘要会读取对应 symbol 的年度 parquet，首次请求可能较慢；前端默认不启用。

`/api/price` 查询参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `session` | `all` | 盘段筛选：`all` / `premarket` / `market` / `afterhours` |
| `resolution` | `1` | 时间聚合秒数：`1` / `5` / `10` / `60` |
| `use_clean` | `false` | 是否使用清洗后的调整价格 |
