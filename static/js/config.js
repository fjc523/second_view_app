export const MA_PERIODS = [5, 100, 200];
export const MA_COLORS = {
  '5': '#22c55e',
  '100': '#f97316',
  '200': '#a855f7',
};

export const INTERACTION_ON = {
  handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  handleScale: { axisPressedMouseMove: { time: false, price: true } },
};

export const MARKET_STATE_COLORS = {
  trend_up:    'rgba(74, 222, 128, 0.18)',
  trend_down:  'rgba(74, 222, 128, 0.18)',
  oscillation: 'rgba(0, 0, 0, 0)',
  unknown:     'rgba(0, 0, 0, 0)',
};

export const INTERACTION_OFF = {
  handleScroll: { pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
  handleScale: { axisPressedMouseMove: { time: false, price: false } },
};
