# SecondView

1 秒分辨率股票行情可视化工具。FastAPI 后端提供 CSV 数据的 JSON 接口，单页前端使用 TradingView lightweight-charts 渲染交互式图表。

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
| `GET /api/price/{date}/{symbol}` | 返回 K 线、成交量、VWAP、均线等完整图表数据 |

`/api/price` 查询参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `session` | `all` | 盘段筛选：`all` / `premarket` / `market` / `afterhours` |
| `resolution` | `1` | 时间聚合秒数：`1` / `5` / `10` / `60` |
| `use_clean` | `false` | 是否使用清洗后的调整价格 |
