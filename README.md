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
- **VWAP / 均线叠加** — 累计 VWAP、MA5 / MA30 / MA60
- **Clean Price 模式** — 切换原始价格与清洗后的调整价格
- **蜡烛图 / 折线图切换** — 按 `C`(蜡烛) / `L`(折线) 快捷切换
- **日期 & 标的导航** — 日期按钮 + 标的条带，显示涨跌幅
- **回放事件筛选模式** — replay 模式下支持先选日期，再按 symbol 搜索，且候选首项为 `ALL`
- **跨日期连续浏览** — 在 replay 模式下，方向键可在当前日期末尾自动跳到下一天首条事件，反向同理
- **人工审核标记** — 支持用快捷键为事件打 `keep` / `exclude` 标记，并持久化保存到本地 review 文件
- **键盘快捷键** — `←` `→` / `↑` `↓` 上下切换 replay 事件，`K` 保留，`X` 排除，`U` 取消标记，`F` 适配全屏，`V` VWAP，`M` 均线

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
| `GET /api/dates` | 返回所有可用日期；可选返回每个标的的摘要信息 |
| `GET /api/search?q=A` | 按前缀搜索标的 |
| `GET /api/event-lists` | 返回可用事件列表 |
| `GET /api/event-lists/{name}` | 返回某个事件列表的事件行 |
| `GET /api/price/{date}/{symbol}` | 返回 K 线、成交量、VWAP、均线等完整图表数据；若带 `replay_run`，则叠加回放事件 |
| `GET /api/replay/{run_id}` | 返回某次 Qtrader 回测导出的 replay 索引和事件列表 |
| `GET /api/review/{run_id}` | 返回某个 replay run 当前已经保存的人工审核标记 |
| `POST /api/review/{run_id}` | 保存某个 replay run 的人工审核标记 |

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
| `replay_run` | 空 | 若提供 Qtrader 的 run_id，则按对应 replay 事件叠加买卖标记并限制搜索 symbol 范围 |

## Replay 审核工作流

### 1. 进入 replay 模式
直接通过：

```text
http://127.0.0.1:8000/?replay_run=<run_id>
```

### 2. 日期与 symbol 选择
- 先选日期
- symbol 搜索框在 replay 模式下会提供：
  - `ALL`
  - 当前日期下所有有 replay 事件的股票代码
- 选择 `ALL` 后，左侧列表显示该日期的全部事件；点击事件后右侧自动切到对应 symbol 图表

### 3. 连续浏览
在 replay 模式下：
- `→` / `↓`：下一条事件
- `←` / `↑`：上一条事件
- 如果当前已经是当天最后一条，再按 `→` / `↓` 会自动跳到**下一天第一条事件**
- 如果当前已经是当天第一条，再按 `←` / `↑` 会自动跳到**前一天最后一条事件**

### 4. 人工标记
- `K`：标记为 `keep`
- `X`：标记为 `exclude`
- `U`：取消当前标记

左侧面板顶部会显示：
- 当前日期已标记数量 / 总事件数
- 当前事件的标记状态

### 5. 标记保存位置
人工审核标记会通过后端接口保存到：

```text
reports/_review_marks/<run_id>.json
```

可用于后续汇总“保留样本 / 排除样本”，继续做标签筛选与逆向工程。
