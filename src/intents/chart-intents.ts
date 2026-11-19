export const CHART_INTENTS = {
  RESET_ZOOM: 'vsw:reset-chart-zoom',
} as const;

export const CHART_DATA_ZOOM_IDS = {
  horizontalInside: 'viewport-inside',
  horizontalSlider: 'viewport-slider',
  verticalInsidePrefix: 'signal-y-inside-',
} as const;

export function getVerticalZoomId(panelIndex: number): string {
  return `${CHART_DATA_ZOOM_IDS.verticalInsidePrefix}${panelIndex}`;
}
