#!/usr/bin/env node

/**
 * Deterministic CSV fixture generator for Vehicle Signal Workbench.
 * Uses only Node.js built-ins; no application dependencies are required.
 *
 * Usage:
 *   node scripts/generate-measurement-fixtures.mjs
 *   node scripts/generate-measurement-fixtures.mjs --scenario 1,5,17
 *   node scripts/generate-measurement-fixtures.mjs --include-performance
 *   node scripts/generate-measurement-fixtures.mjs --performance-only
 *   node scripts/generate-measurement-fixtures.mjs --output /tmp/vsw-fixtures
 *   node scripts/generate-measurement-fixtures.mjs --force
 */

import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(ROOT, 'tests', 'fixtures');
const EPOCH_SECONDS = 1_700_000_000;
const FUNCTIONAL_SCENARIOS = 18;
const PERFORMANCE_SCENARIOS = [
  {
    id: 19,
    name: '19-large-run-1m',
    title: 'Large measurement run (1 million samples)',
    samples: 1_000_000,
    channels: 4,
    sampleRateHz: 100,
    seed: 0x19a11,
  },
  {
    id: 20,
    name: '20-high-density-run-10m',
    title: 'High-density measurement run (10 million samples)',
    samples: 10_000_000,
    channels: 3,
    sampleRateHz: 1_000,
    seed: 0x20a11,
  },
];

const args = parseArgs(process.argv.slice(2));
const outputRoot = path.resolve(args.output ?? DEFAULT_OUTPUT);

function parseArgs(argv) {
  const parsed = { scenarios: null, performanceScenarios: null, includePerformance: false, performanceOnly: false, force: false, output: null };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--include-performance') parsed.includePerformance = true;
    else if (argument === '--performance-only') parsed.performanceOnly = true;
    else if (argument === '--performance-scenario') {
      const value = argv[++index];
      if (!value) throw new Error('--performance-scenario requires 19 and/or 20.');
      parsed.performanceScenarios = value.split(',').map((item) => Number(item.trim()));
    }
    else if (argument === '--force') parsed.force = true;
    else if (argument === '--scenario') {
      const value = argv[++index];
      if (!value) throw new Error('--scenario requires a comma-separated list of scenario numbers.');
      parsed.scenarios = value.split(',').map((item) => Number(item.trim()));
    } else if (argument === '--output') {
      parsed.output = argv[++index];
      if (!parsed.output) throw new Error('--output requires a directory path.');
    } else if (argument === '--help' || argument === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (parsed.performanceOnly && (parsed.scenarios || parsed.performanceScenarios)) {
    throw new Error('--performance-only cannot be combined with scenario selectors.');
  }
  if (parsed.performanceScenarios?.some((scenario) => ![19, 20].includes(scenario))) {
    throw new Error('--performance-scenario accepts only 19 and 20.');
  }
  return parsed;
}

function printHelp() {
  console.log(`Vehicle Signal Workbench fixture generator

Usage:
  node scripts/generate-measurement-fixtures.mjs [options]

Options:
  --scenario 1,5,17       Generate selected functional scenarios (1-18).
  --include-performance   Also generate the large 1M and 10M sample fixtures.
  --performance-only      Generate both performance fixtures (19 and 20).
  --performance-scenario 19|20  Generate only the selected performance fixture(s).
  --output <directory>   Write fixtures to a different directory.
  --force                 Replace generated scenario directories if they exist.
  --help                  Show this help.

Default: generate functional scenarios 1-18 under tests/fixtures.
Performance fixtures are opt-in because they can consume hundreds of MB of disk space.`);
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function signalValue(kind, time, index, random) {
  switch (kind) {
    case 'step': return time < 4 ? 0 : time < 7 ? 35 : 12;
    case 'ramp': return Math.max(0, time) * 2.5;
    case 'impulse': return index === 250 || index === 251 ? 100 : Math.sin(time * 2) * 2;
    case 'plateau': return time < 2 ? 5 : time < 8 ? 42 : 5;
    case 'constant': return 42;
    case 'noisy': return Math.sin(time * 2 * Math.PI * 0.7) * 10 + (random() - 0.5) * 1.5;
    case 'extreme': return index % 4 === 0 ? 1e120 : index % 4 === 1 ? -1e120 : index % 4 === 2 ? 1e-120 : -1e-120;
    default: return Math.sin(time * 2 * Math.PI * 0.5) * 20 + Math.cos(time * 2 * Math.PI * 0.13) * 3;
  }
}

function formatTimestamp(epochSeconds, encoding) {
  if (encoding === 'iso-8601') return new Date(epochSeconds * 1_000).toISOString();
  if (encoding === 'unix-milliseconds') return String(Math.round(epochSeconds * 1_000));
  return String(Number(epochSeconds.toFixed(6)));
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeCsv(filePath, config) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const stream = createWriteStream(filePath, { encoding: 'utf8' });
  const random = seededRandom(config.seed ?? 0x51a1);
  const headers = ['Timestamp', ...config.channels.map((channel) => channel.header)];
  stream.write(`${headers.map(csvCell).join(',')}\n`);

  const batch = [];
  const batchSize = config.batchSize ?? 2_000;
  for (let index = 0; index < config.samples; index += 1) {
    const time = config.timeAt(index);
    const epoch = config.epochAt ? config.epochAt(time, index) : EPOCH_SECONDS + time;
    const cells = [formatTimestamp(epoch, config.encoding ?? 'unix-seconds')];

    for (let channelIndex = 0; channelIndex < config.channels.length; channelIndex += 1) {
      const channel = config.channels[channelIndex];
      let value = signalValue(channel.kind ?? 'sine', time, index, random);
      value += channel.offset ?? 0;
      value += channel.noise ? (random() - 0.5) * channel.noise : 0;

      if (channel.missing && channel.missing(index, time)) value = Number.NaN;
      if (channel.transform) value = channel.transform(value, index, time);
      cells.push(Number.isFinite(value) ? formatNumber(value) : '');
    }

    batch.push(cells.map(csvCell).join(','));
    if (batch.length >= batchSize) await flushBatch(stream, batch);
  }
  if (batch.length) await flushBatch(stream, batch);
  stream.end();
  await once(stream, 'finish');
}

async function flushBatch(stream, batch) {
  const payload = `${batch.join('\n')}\n`;
  batch.length = 0;
  if (!stream.write(payload)) await once(stream, 'drain');
}

function formatNumber(value) {
  if (Math.abs(value) >= 1e15 || (Math.abs(value) > 0 && Math.abs(value) < 1e-8)) return value.toExponential(8);
  return Number(value.toFixed(8)).toString();
}

function baseChannels() {
  return [
    { header: 'Vehicle Speed [km/h]', kind: 'sine' },
    { header: 'Engine RPM [rpm]', kind: 'step', offset: 800 },
    { header: 'Throttle Position [%]', kind: 'ramp' },
  ];
}

function regularPair({ samples = 1_001, rate = 100, comparisonRate = rate, start = 0, comparisonStart = start, duration = null, channels = baseChannels(), comparisonChannels = channels, encoding = 'unix-seconds', seed = 0x12345, comparisonSeed = 0x6789, referenceEpoch = EPOCH_SECONDS, comparisonEpoch = EPOCH_SECONDS } = {}) {
  const referenceDuration = duration ?? (samples - 1) / rate;
  const comparisonSamples = Math.max(2, Math.round(referenceDuration * comparisonRate) + 1);
  const reference = {
    samples,
    channels,
    encoding,
    seed,
    timeAt: (index) => start + index / rate,
    epochAt: (time) => referenceEpoch + time,
  };
  const comparison = {
    samples: comparisonSamples,
    channels: comparisonChannels,
    encoding,
    seed: comparisonSeed,
    timeAt: (index) => comparisonStart + index / comparisonRate,
    epochAt: (time) => comparisonEpoch + time,
  };
  return { reference, comparison };
}

function expected({ importStatus = 'accepted', encoding = 'unix-seconds', notes = [], ...extra } = {}) {
  return {
    schemaVersion: 1,
    import: { status: importStatus, timestampColumn: 'Timestamp', timestampEncoding: encoding },
    comparison: extra.comparison ?? null,
    assertions: extra.assertions ?? [],
    notes,
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => !['comparison', 'assertions'].includes(key))),
  };
}

async function writeScenario(directoryName, pair, metadata, options = {}) {
  const directory = path.join(outputRoot, directoryName);
  await prepareDirectory(directory, options.force);
  if (pair.reference) await writeCsv(path.join(directory, 'reference.csv'), pair.reference);
  if (pair.comparison) await writeCsv(path.join(directory, 'comparison.csv'), pair.comparison);
  await writeFile(path.join(directory, 'expected.json'), `${JSON.stringify(metadata, null, 2)}\n`);
}

async function prepareDirectory(directory, force) {
  try {
    await readFile(path.join(directory, 'expected.json'));
    if (!force) throw new Error(`Fixture already exists: ${directory}. Use --force to replace it.`);
    await rm(directory, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(directory, { recursive: true });
}

async function scenario1(options) {
  const pair = regularPair({ samples: 1_001, rate: 100 });
  await writeScenario('01-basic-comparison', pair, expected({
    comparison: { expectedOverlapSeconds: [0, 10], expectedMatchedReferenceSamples: 1_001 },
    assertions: ['Both runs import successfully.', 'Three channels map by identical label and unit.', 'Identical signals produce zero delta within floating-point tolerance.'],
  }), options);
}

async function scenario2(options) {
  const pair = regularPair({ samples: 1_001, rate: 100, comparisonRate: 50 });
  await writeScenario('02-different-sampling-rates', pair, expected({
    comparison: { referenceRateHz: 100, comparisonRateHz: 50, expectedOverlapSeconds: [0, 10] },
    assertions: ['Both runs import successfully.', 'Comparison values are linearly interpolated only inside permitted sample gaps.'],
  }), options);
}

async function scenario3(options) {
  const pair = regularPair({ samples: 1_001, rate: 100, comparisonStart: 2, duration: 10 });
  await writeScenario('03-different-start-times', pair, expected({
    comparison: { referenceStartSeconds: 0, comparisonStartSeconds: 2, comparisonOffsetSeconds: 2, expectedOverlapSeconds: [2, 10] },
    assertions: ['Both runs import successfully.', 'Overlap excludes the first two seconds of the reference run.'],
  }), options);
}

async function scenario4(options) {
  const pair = regularPair({ samples: 1_201, rate: 100, comparisonStart: 2, duration: 12 });
  pair.comparison.samples = 701;
  pair.comparison.timeAt = (index) => 2 + index / 100;
  await writeScenario('04-partial-overlap', pair, expected({
    comparison: { referenceIntervalSeconds: [0, 12], comparisonIntervalSeconds: [2, 9], comparisonOffsetSeconds: 2, expectedOverlapSeconds: [2, 9] },
    assertions: ['Both runs import successfully.', 'Only the shared time interval is comparable.', 'No extrapolation occurs outside the comparison run.'],
  }), options);
}

async function scenario5(options) {
  const jitter = (index) => index === 0 ? 0 : index / 100 + Math.sin(index * 1.7) * 0.0015;
  const pair = regularPair({ samples: 1_001, rate: 100 });
  pair.reference.timeAt = jitter;
  pair.comparison.timeAt = (index) => jitter(index) + 0.0002;
  await writeScenario('05-irregular-sampling', pair, expected({
    comparison: { sampling: 'irregular', nominalRateHz: 100 },
    assertions: ['Strictly increasing irregular timestamps import successfully.', 'Median interval and interpolation-gap policy are exercised.'],
  }), options);
}

async function scenario6(options) {
  const pair = regularPair({ samples: 501, rate: 100, start: 0, comparisonStart: 10, duration: 5 });
  await writeScenario('06-no-timeline-overlap', pair, expected({
    comparison: { comparisonOffsetSeconds: 10, expectedOverlapSeconds: null, expectedMatchedReferenceSamples: 0 },
    assertions: ['Both runs import successfully.', 'The workspace reports no overlap and produces no comparable delta samples.'],
  }), options);
}

async function scenario7(options) {
  const pair = regularPair({ samples: 100, rate: 10 });
  pair.reference.timeAt = (index) => index === 50 ? 4.9 : index / 10;
  await writeScenario('07-duplicate-timestamps', pair, expected({
    importStatus: 'rejected',
    assertions: ['Reference import fails with NON_MONOTONIC_TIMESTAMP.', 'Duplicate timestamps are not silently sorted or deduplicated.'],
  }), options);
}

async function scenario8(options) {
  const pair = regularPair({ samples: 100, rate: 10 });
  pair.reference.timeAt = (index) => index === 50 ? 4.8 : index / 10;
  await writeScenario('08-out-of-order-timestamps', pair, expected({
    importStatus: 'rejected',
    assertions: ['Reference import fails with NON_MONOTONIC_TIMESTAMP.', 'Out-of-order timestamps are rejected.'],
  }), options);
}

async function scenario9(options) {
  const channels = [
    { header: 'Vehicle Speed [km/h]', kind: 'sine', missing: (index) => index % 37 === 0 },
    { header: 'Engine RPM [rpm]', kind: 'step', offset: 800, missing: (index) => index % 53 === 0 },
  ];
  const pair = regularPair({ samples: 1_001, rate: 100, channels });
  await writeScenario('09-missing-values', pair, expected({
    assertions: ['Empty numeric cells are imported as NaN/missing samples.', 'Missing values are not converted to zero.'],
  }), options);
}

async function scenario10(options) {
  const channels = [
    { header: 'Vehicle Speed [km/h]', kind: 'sine', missing: (_index, time) => time >= 3 && time <= 5 },
    { header: 'Engine RPM [rpm]', kind: 'step', offset: 800 },
  ];
  const pair = regularPair({ samples: 1_001, rate: 100, channels });
  await writeScenario('10-long-missing-interval', pair, expected({
    comparison: { missingIntervalSeconds: [3, 5] },
    assertions: ['Long NaN intervals remain gaps.', 'Interpolation must not bridge a missing run or exceed the maximum permitted source-sample gap.'],
  }), options);
}

async function scenario11(options) {
  const channels = [
    { header: 'Vehicle Speed [km/h]', kind: 'sine' },
    { header: 'Unpopulated Diagnostic [state]', kind: 'constant', missing: () => true },
  ];
  const pair = regularPair({ samples: 501, rate: 50, channels });
  await writeScenario('11-entirely-empty-channel', pair, expected({
    assertions: ['The run imports because at least one numeric channel has valid samples.', 'The entirely empty channel is excluded from the valid channel descriptor set.'],
  }), options);
}

async function scenario12(options) {
  const channels = [
    { header: 'Extreme Magnitude [unit]', kind: 'extreme' },
    { header: 'Vehicle Speed [km/h]', kind: 'sine' },
  ];
  const pair = regularPair({ samples: 400, rate: 40, channels });
  await writeScenario('12-extreme-values', pair, expected({
    assertions: ['Finite magnitudes from 1e-120 through 1e120 remain finite after parsing.', 'Statistics and difference calculations do not produce NaN from valid finite inputs.'],
    notes: ['This fixture targets numeric stability, not physical plausibility.'],
  }), options);
}

async function scenario13(options) {
  const referenceChannels = [
    { header: 'Vehicle Speed [km/h]', kind: 'sine' },
    { header: 'Engine RPM [rpm]', kind: 'step', offset: 800 },
    { header: 'Throttle Position [%]', kind: 'ramp' },
  ];
  const comparisonChannels = [...referenceChannels].reverse();
  const pair = regularPair({ samples: 501, rate: 50, channels: referenceChannels, comparisonChannels });
  await writeScenario('13-different-channel-order', pair, expected({
    assertions: ['Channels map by normalized label and compatible unit, not CSV column position.'],
  }), options);
}

async function scenario14(options) {
  const referenceChannels = [
    { header: 'Speed [km/h]', kind: 'sine' },
    { header: 'Speed  [km/h]', kind: 'ramp' },
  ];
  const comparisonChannels = [{ header: 'Speed [km/h]', kind: 'sine' }];
  const pair = regularPair({ samples: 501, rate: 50, channels: referenceChannels, comparisonChannels });
  await writeScenario('14-ambiguous-channel-names', pair, expected({
    assertions: ['Reference exposes two distinct source columns with the same normalized label and unit.', 'Automatic mapping must leave the ambiguous match unresolved.'],
  }), options);
}

async function scenario15(options) {
  const referenceChannels = [{ header: 'Vehicle Speed [km/h]', kind: 'sine' }];
  const comparisonChannels = [{ header: 'Vehicle Speed [mph]', kind: 'sine' }];
  const pair = regularPair({ samples: 501, rate: 50, channels: referenceChannels, comparisonChannels });
  await writeScenario('15-incompatible-units', pair, expected({
    assertions: ['Channel labels match but units differ.', 'No automatic conversion or compatible mapping is assumed.'],
    notes: ['The values are intentionally numerically similar; unit metadata is the incompatibility under test.'],
  }), options);
}

async function scenario16(options) {
  const directory = path.join(outputRoot, '16-malformed-csv');
  await prepareDirectory(directory, options.force);
  await writeFile(path.join(directory, 'reference.csv'), [
    'Timestamp,Vehicle Speed [km/h],Engine RPM [rpm]',
    `${EPOCH_SECONDS},10,900`,
    `${EPOCH_SECONDS + 1},11,910`,
    `${EPOCH_SECONDS + 2},12`,
    `${EPOCH_SECONDS + 3},13,930`,
  ].join('\n') + '\n');
  await writeFile(path.join(directory, 'comparison.csv'), [
    'Timestamp,Vehicle Speed [km/h]',
    `${EPOCH_SECONDS},"unterminated`,
    `${EPOCH_SECONDS + 1},12`,
  ].join('\n') + '\n');
  await writeFile(path.join(directory, 'expected.json'), `${JSON.stringify(expected({
    importStatus: 'rejected',
    assertions: ['Reference import rejects inconsistent row width.', 'Comparison import rejects malformed quoting/CSV syntax.'],
  }), null, 2)}\n`);
}

async function scenario17(options) {
  const directory = path.join(outputRoot, '17-timestamp-encoding-variations');
  await prepareDirectory(directory, options.force);
  const variants = ['iso-8601', 'unix-seconds', 'unix-milliseconds'];
  for (const encoding of variants) {
    const pair = regularPair({ samples: 101, rate: 10, encoding });
    const variantDirectory = path.join(directory, encoding);
    await mkdir(variantDirectory, { recursive: true });
    await writeCsv(path.join(variantDirectory, 'reference.csv'), pair.reference);
    await writeCsv(path.join(variantDirectory, 'comparison.csv'), pair.comparison);
    await writeFile(path.join(variantDirectory, 'expected.json'), `${JSON.stringify(expected({
      encoding,
      assertions: [`Both runs import with explicit ${encoding} selection.`, 'Elapsed time is normalized to seconds from each run origin.'],
    }), null, 2)}\n`);
  }
  await writeFile(path.join(directory, 'expected.json'), `${JSON.stringify({
    schemaVersion: 1,
    variants,
    notes: ['Each child directory is a separate pair and requires its own timestamp-encoding selection.'],
  }, null, 2)}\n`);
}

async function scenario18(options) {
  const directory = path.join(outputRoot, '18-metadata-and-mixed-columns');
  await prepareDirectory(directory, options.force);
  const headers = ['Timestamp', 'Vehicle Speed [km/h]', 'Engine RPM [rpm]', 'Operating Mode', 'ECU Label'];
  const lines = [headers.join(',')];
  for (let index = 0; index < 201; index += 1) {
    const time = index / 20;
    const random = seededRandom(index + 18)();
    lines.push([
      formatTimestamp(EPOCH_SECONDS + time, 'unix-seconds'),
      formatNumber(signalValue('sine', time, index, () => random)),
      formatNumber(signalValue('step', time, index, () => random) + 800),
      time < 5 ? 'IDLE' : 'LOAD',
      'ECU-A',
    ].map(csvCell).join(','));
  }
  await writeFile(path.join(directory, 'reference.csv'), `${lines.join('\n')}\n`);
  await writeCsv(path.join(directory, 'comparison.csv'), regularPair({ samples: 201, rate: 20 }).comparison);
  await writeFile(path.join(directory, 'expected.json'), `${JSON.stringify(expected({
    assertions: ['Numeric signal columns import normally.', 'Text-only metadata columns contain no valid numeric samples and are excluded from the valid channel set.'],
    notes: ['Current importer treats every non-timestamp column as a candidate measurement channel; text-only columns are not a separate metadata schema.'],
  }), null, 2)}\n`);
}

const functionalGenerators = new Map([
  [1, scenario1], [2, scenario2], [3, scenario3], [4, scenario4], [5, scenario5], [6, scenario6],
  [7, scenario7], [8, scenario8], [9, scenario9], [10, scenario10], [11, scenario11], [12, scenario12],
  [13, scenario13], [14, scenario14], [15, scenario15], [16, scenario16], [17, scenario17], [18, scenario18],
]);

async function generatePerformanceScenario(spec, options) {
  const directory = path.join(outputRoot, spec.name);
  await prepareDirectory(directory, options.force);
  const channels = Array.from({ length: spec.channels }, (_, index) => ({
    header: [`Vehicle Speed [km/h]`, `Engine RPM [rpm]`, `Throttle Position [%]`, `Brake Pressure [bar]`][index] ?? `Signal ${index + 1} [unit]`,
    kind: ['sine', 'step', 'ramp', 'noisy'][index % 4],
    noise: index === 3 ? 0.2 : 0,
  }));
  const duration = (spec.samples - 1) / spec.sampleRateHz;
  const config = {
    samples: spec.samples,
    channels,
    seed: spec.seed,
    batchSize: 1_000,
    timeAt: (index) => index / spec.sampleRateHz,
  };
  await writeCsv(path.join(directory, 'reference.csv'), config);
  await writeCsv(path.join(directory, 'comparison.csv'), {
    ...config,
    seed: spec.seed + 1,
    channels: channels.map((channel, index) => ({ ...channel, offset: index === 0 ? 0.25 : 1.5 })),
  });
  await writeFile(path.join(directory, 'expected.json'), `${JSON.stringify({
    schemaVersion: 1,
    category: 'performance',
    title: spec.title,
    sampleCountPerRun: spec.samples,
    channelCountPerRun: spec.channels,
    sampleRateHz: spec.sampleRateHz,
    durationSeconds: duration,
    timestampColumn: 'Timestamp',
    timestampEncoding: 'unix-seconds',
    assertions: [
      'Both files import without exhausting browser memory.',
      'Viewport queries return bounded output independent of full run length.',
      'Chart interaction remains responsive while worker owns the full-resolution arrays.',
    ],
    notes: ['Generated on demand; do not commit these large CSV files.', 'Use the same Node version and machine when comparing benchmark runs.'],
  }, null, 2)}\n`);
}

async function main() {
  await mkdir(outputRoot, { recursive: true });
  const selected = args.performanceOnly
    ? []
    : args.scenarios ?? (args.performanceScenarios ? [] : Array.from({ length: FUNCTIONAL_SCENARIOS }, (_, index) => index + 1));

  for (const scenarioNumber of selected) {
    const generator = functionalGenerators.get(scenarioNumber);
    if (!generator) throw new Error(`Unknown functional scenario ${scenarioNumber}. Choose 1-${FUNCTIONAL_SCENARIOS}.`);
    await generator({ force: args.force });
    console.log(`Generated scenario ${String(scenarioNumber).padStart(2, '0')}.`);
  }

  if (args.includePerformance || args.performanceOnly || args.performanceScenarios) {
    const selectedPerformance = args.performanceOnly || args.includePerformance
      ? PERFORMANCE_SCENARIOS
      : PERFORMANCE_SCENARIOS.filter((spec) => args.performanceScenarios.includes(spec.id));
    for (const spec of selectedPerformance) {
      await generatePerformanceScenario(spec, { force: args.force });
      console.log(`Generated ${spec.name} (${spec.samples.toLocaleString('en-US')} samples per run).`);
    }
  }

  console.log(`\nFixtures written to: ${outputRoot}`);
  console.log('Review expected.json for the intended assertions; fixtures do not execute tests by themselves.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
