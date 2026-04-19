# 0 - 核心逻辑与启动

本项目是 1 秒级行情数据可视化工具：后端 FastAPI 读取 CSV 数据并输出 JSON，前端单页用 TradingView lightweight-charts 渲染。

## 1. 启动方式

1. 安装依赖

```
pip install fastapi uvicorn pandas numpy orjson
```

2. 启动服务（默认监听 http://127.0.0.1:8000）

```
python server.py
```

## 2. 目录约定

- 后端入口：`server.py`
- 前端静态资源：`static/`
- 数据目录：`../data/1s/{YYYYMMDD}/{SYMBOL}.csv`

说明：`server.py` 以当前目录为 APP_DIR，数据目录固定为 `APP_DIR/../data/1s`。

## 3. CSV 数据格式

后端按以下字段读取（大小写敏感）：

必需字段：
- `bob`：时间戳字符串，可被 pandas 解析；必须是 UTC（用于盘前/盘中/盘后切分）
- `open` `high` `low` `close`：OHLC
- `volume`：成交量（VWAP 与统计使用）
- `amount`：成交额（柱状图使用）
- `tick_count`：笔数（目前仅聚合保留，前端未显示）

可选字段：
- `clean_open` `clean_high` `clean_low` `clean_close`：清洗后的价格（配合 `use_clean=true`）

后端会：
- 将 `bob` 转为 UTC 时间，并生成 `time`（epoch 秒）供前端绘制
- 对 `bob` 为空的行做清理，保证时间升序

## 4. API 返回结构（核心字段）

### 4.1 `GET /api/dates`
返回所有日期和简要标的信息（用于左侧列表）：

```
{
  "dates": {
    "20250207": [
      {"symbol": "AAPL", "close": 187.23, "change_pct": 1.25, "volume": 0}
    ]
  }
}
```

说明：摘要通过读取 CSV 首末行计算涨跌幅，不做全量聚合。

### 4.2 `GET /api/price/{date}/{symbol}`
关键字段：
- `candles`：K 线数据（time/open/high/low/close）
- `volume`：成交额柱状图（time/value/color）
- `vwap`：累计 VWAP（time/value）
- `mas`：MA5/MA100/MA200（按时间对齐）
- `volume_ma`：成交额 MA20
- `stats`：开高低收、涨跌幅、首尾时间等统计
- `market_open_time`：09:30 ET 对应的 UTC 时间点（用于标记）

查询参数：
- `session`：`all` / `premarket` / `market` / `afterhours`
- `resolution`：聚合秒数（1~60）
- `use_clean`：是否使用 clean_* 价格
- `spike_filter=hampel` + `spike_window`：启用 Hampel 去尖刺过滤

## 5. 前后端数据流

1. 前端启动后请求 `/api/dates` 得到日期列表与标的摘要
2. 默认选择最新日期与第一只标的
3. 根据控制栏参数请求 `/api/price` 并渲染图表
4. 切换分辨率、盘段、过滤器会重新拉取数据并重绘

这些流程都在 `static/js/app.js` 与 `static/js/data.js` 中完成。
