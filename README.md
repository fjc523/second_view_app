# SecondView

1 秒分辨率股票行情可视化工具。FastAPI 后端提供 CSV 数据的 JSON 接口，单页前端使用 TradingView lightweight-charts 渲染交互式图表。

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
server.py                 # FastAPI 后端
static/index.html         # 页面骨架
static/css/app.css        # 样式
static/js/app.js          # 前端入口
static/js/*.js            # 模块化逻辑
../data/1s/{YYYYMMDD}/{SYMBOL}.csv   # 数据文件
```

## 快速启动

```bash
# 依赖
pip install fastapi uvicorn pandas numpy orjson

# 启动服务 (默认 http://127.0.0.1:8000)
python server.py
```

## API

| 端点 | 说明 |
|------|------|
| `GET /api/dates` | 返回所有日期及每个标的的摘要信息 |
| `GET /api/price/{date}/{symbol}` | 返回 K 线、成交量、VWAP、均线等完整图表数据；若带 `replay_run`，则叠加回放事件 |
| `GET /api/replay/{run_id}` | 返回某次 Qtrader 回测导出的 replay 索引和事件列表 |
| `GET /api/review/{run_id}` | 返回某个 replay run 当前已经保存的人工审核标记 |
| `POST /api/review/{run_id}` | 保存某个 replay run 的人工审核标记 |

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
