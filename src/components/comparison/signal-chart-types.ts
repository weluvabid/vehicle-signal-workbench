import type { SignalPoint } from '@/features/measurements/plot-data';

export interface SignalChartPanel {
  readonly id: string;
  readonly label: string;
  readonly unit: string | null;
  readonly color: string;
  readonly reference: SignalPoint[];
  readonly comparison: SignalPoint[];
  readonly visible: boolean;
  readonly referenceVisible?: boolean;
  readonly comparisonVisible?: boolean;
}
