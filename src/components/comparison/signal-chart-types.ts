import type { SignalPoint } from '@/features/measurements/plot-data';

export interface SignalChartPanel {
  readonly id: string;
  readonly label: string;
  readonly unit: string | null;
  readonly reference: SignalPoint[];
  readonly comparison: SignalPoint[];
  readonly delta: SignalPoint[];
}
