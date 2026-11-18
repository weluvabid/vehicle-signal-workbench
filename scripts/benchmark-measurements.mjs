import { performance } from 'node:perf_hooks';
import {
  calculateSignalDifferenceSeriesInTimeRange,
  downsampleDifferenceEnvelope,
} from '../src/features/measurements/difference.ts';

const sampleCount = Number(process.env.VSW_BENCH_SAMPLES ?? 1_000_000);
const iterations = Number(process.env.VSW_BENCH_ITERATIONS ?? 7);
if (!Number.isSafeInteger(sampleCount) || sampleCount < 2 || sampleCount > 10_000_000) {
  throw new RangeError('VSW_BENCH_SAMPLES must be an integer between 2 and 10,000,000.');
}
if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 50) {
  throw new RangeError('VSW_BENCH_ITERATIONS must be an integer between 1 and 50.');
}

const times = new Float64Array(sampleCount);
const referenceValues = new Float64Array(sampleCount);
const comparisonValues = new Float64Array(sampleCount);
for (let index = 0; index < sampleCount; index += 1) {
  const time = index / 100;
  times[index] = time;
  referenceValues[index] = Math.sin(time * 2.3) * 1_500 + (index % 997 === 0 ? 350 : 0);
  comparisonValues[index] = Math.sin((time - 0.0005) * 2.3) * 1_500;
}
const reference = { datasetId: 'reference', channelId: 'rpm', timeSeconds: times, values: referenceValues };
const comparison = { datasetId: 'comparison', channelId: 'rpm', timeSeconds: times, values: comparisonValues };

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}
function measure(name, operation) {
  for (let warmup = 0; warmup < 2; warmup += 1) operation();
  const durations = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const start = performance.now();
    operation();
    durations.push(performance.now() - start);
  }
  return { name, medianMs: Number(median(durations).toFixed(3)), minMs: Number(Math.min(...durations).toFixed(3)), maxMs: Number(Math.max(...durations).toFixed(3)) };
}

const memoryBefore = process.memoryUsage();
const fullSeries = calculateSignalDifferenceSeriesInTimeRange(reference, comparison, 0, times.at(-1), 0);
const indexBuildAndQuery = measure('full difference series', () => calculateSignalDifferenceSeriesInTimeRange(reference, comparison, 0, times.at(-1), 0));
const envelope = measure('difference min/max envelope (viewport 1600px)', () => downsampleDifferenceEnvelope(fullSeries, 1_600));
const reduced = downsampleDifferenceEnvelope(fullSeries, 1_600);
const memoryAfter = process.memoryUsage();

process.stdout.write(`${JSON.stringify({
  benchmark: 'vsw-measurement-difference',
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  sampleCount,
  iterations,
  results: [indexBuildAndQuery, envelope],
  output: { fullSamples: fullSeries.delta.length, envelopeSamples: reduced.delta.length, matchedSamples: fullSeries.statistics.matchedCount },
  memory: { heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed, arrayBuffersBytes: memoryAfter.arrayBuffers },
}, null, 2)}\n`);
