# 1 - 图表渲染与交互

本节描述前端图表的整体结构与关键交互。主要代码在 `static/js/chart.js`、`static/js/controls.js`、`static/js/legend.js`。

## 1. 图表结构

- **主图**：蜡烛图或折线图二选一
  - 蜡烛：使用 `candles` 的 OHLC 数据
  - 折线：使用每根蜡烛的 `close` 作为折线点
- **成交额柱状图**：使用 `volume` 字段（后端用 amount 生成），颜色取决于当根上涨/下跌
- **成交额 MA20**：`volume_ma` 曲线叠加在成交额区域
- **均线 MA5/100/200**：从后端 `mas` 读取，支持开关显示
- **趋势底色**：当开启“趋势”时，用隐藏的 histogram 画背景色块（详见 2-趋势计算逻辑）

> 备注：后端还计算了 VWAP，但当前前端未渲染（可作为未来扩展）。

## 2. 交互与可视化细节

- **十字光标联动**：移动时读取 seriesData，更新
  - K 线 O/H/L/C 或折线价
  - MA 数值
  - 成交额与成交额 MA
- **标记**
  - 09:30 ET 标记（后端 `market_open_time`）
  - 当日最高点与最低点（stats 中的 high/low）
- **缩放与滚动配置**
  - 通过 `INTERACTION_ON/OFF` 控制图表交互（用于区间选择时禁用拖动缩放）
- **柱宽自适应**
  - 根据 `resolution` 动态调整 barSpacing/minBarSpacing，保持视觉密度一致

## 3. 控制栏与开关

- 图表类型：Line / Candle
- 分辨率：1s / 5s / 10s / 1m（后端按秒聚合）
- 盘段筛选：All / Pre / Mkt / Ext
- MA 开关：只影响前端显示，不影响后端数据
- Hampel 开关：控制是否在后端对 1s 数据做尖刺过滤
- 趋势开关：控制趋势底色显示

所有控制栏变化都会触发 `loadChart()`，重新请求后端并重绘图表。
