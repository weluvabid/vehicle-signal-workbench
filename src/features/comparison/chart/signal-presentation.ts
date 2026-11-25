import type { DatasetDescriptor } from '@/features/measurements/model';

export const SIGNAL_COLORS = [
  '#a78bfa',
  '#60a5fa',
  '#d6a85f',
  '#34d399',
  '#c084fc',
  '#f472b6',
] as const;

export function createChannelLookup(channels: DatasetDescriptor['channels']) {
  return new Map(channels.map((channel) => [channel.id, channel]));
}

export function getSignalColor(index: number): string {
  return SIGNAL_COLORS[index % SIGNAL_COLORS.length];
}
