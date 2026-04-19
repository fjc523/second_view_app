# 2 - 趋势计算逻辑

趋势底色的目标是用“均线排列”快速判断趋势方向，避免只看单根价格波动。核心逻辑在 `static/js/marketstate.js`。

## 1. 输入数据

- 来自后端的 `mas`：MA5 / MA100 / MA200
- 前端只要有 MA5 就可以开始计算；MA100/MA200 用于判定趋势层级

## 2. 判定规则

对每一个 MA5 的时间点，查找同时间点的 MA100 与 MA200：

- **trend_up**：MA5 > MA100 > MA200
- **trend_down**：MA5 < MA100 < MA200
- **oscillation**：其余情况（均线交错）
- **unknown**：MA100 或 MA200 缺失

> 这是一种“均线排列”法，强调中长期方向，不依赖瞬时价格波动。

## 3. 渲染方式

- 使用 histogram series 作为“背景色块”
- 每个时间点给一个固定极大值（1e12）以铺满区域
- 颜色来自 `MARKET_STATE_COLORS`：
  - trend_up / trend_down：半透明绿色
  - oscillation / unknown：透明

开关：控制栏“趋势”按钮可切换显示。

## 4. 设计取舍与注意点

- 仅基于 MA 排列，不做斜率或速度判断
- 走势判定是“回看型”指标：MA 值本身有滞后性
- 当数据不足以计算 MA100/MA200 时会显示为 unknown（无底色）
