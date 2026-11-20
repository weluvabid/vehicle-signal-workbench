import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKLOAD_PRESETS } from './synthetic-drive.ts';

test('workload presets increase monotonically and cap each recording at ten million rows', () => {
  assert.deepEqual(WORKLOAD_PRESETS.map((preset) => preset.rows), [25_000, 250_000, 625_000, 1_250_000, 2_500_000, 6_250_000, 10_000_000]);
  assert.ok(WORKLOAD_PRESETS.every((preset) => preset.rows <= 10_000_000));
  assert.ok(WORKLOAD_PRESETS.every((preset, index) => index === 0 || preset.rows > WORKLOAD_PRESETS[index - 1].rows));
});

test('generates a deterministic mixed-drive CSV with correctly labelled channels', async () => {
  const { generateDriveRecording } = await import('./synthetic-drive.ts');
  const reference = await generateDriveRecording(32, 'reference');
  const comparison = await generateDriveRecording(32, 'comparison');
  const referenceText = await reference.text();
  const comparisonText = await comparison.text();
  const lines = referenceText.trim().split('\n');

  assert.match(lines[0], /Timestamp,Vehicle Speed \[km\/h\],Engine RPM \[rpm\],Throttle Position \[%\],Brake Pressure \[bar\],Steering Angle \[deg\]/);
  assert.equal(lines.length, 33);
  assert.equal(lines[1].split(',').length, 6);
  assert.notEqual(lines[1], comparisonText.trim().split('\n')[1]);
  assert.equal(reference.size, new TextEncoder().encode(referenceText).byteLength);
});

test('comparison workload includes deterministic speed-sensor dropouts', async () => {
  const { generateDriveRecording } = await import('./synthetic-drive.ts');
  const reference = await generateDriveRecording(45_021, 'reference');
  const comparison = await generateDriveRecording(45_021, 'comparison');
  const referenceRow = (await reference.text()).split('\n')[45_001];
  const comparisonRow = (await comparison.text()).split('\n')[45_001];

  assert.ok(referenceRow.split(',')[1].length > 0);
  assert.equal(comparisonRow.split(',')[1], '');
});


test('mixed-drive signals follow a plausible speed, powertrain and braking envelope', async () => {
  const { generateDriveRecording } = await import('./synthetic-drive.ts');
  const recording = await generateDriveRecording(80_000, 'reference');
  const rows = (await recording.text()).trim().split('\n').slice(1).map((line) =>
    line.split(',').map((field) => field === '' ? Number.NaN : Number(field)),
  );
  const speed = rows.map((row) => row[1]);
  const rpm = rows.map((row) => row[2]);
  const throttle = rows.map((row) => row[3]);
  const brake = rows.map((row) => row[4]);

  assert.ok(Math.min(...speed) <= 0.1, 'the route includes stationary periods');
  assert.ok(Math.max(...speed) >= 80, 'the route reaches highway speeds');
  assert.ok(Math.max(...rpm) > 1_800, 'engine RPM responds to road speed and gearing');
  assert.ok(Math.max(...throttle) > 20, 'acceleration requests produce throttle demand');
  assert.ok(Math.max(...brake) > 1, 'deceleration events produce brake pressure');
  assert.ok(speed.every((value) => value >= 0 && value <= 130));
  assert.ok(throttle.every((value) => value >= 0 && value <= 100));
  assert.ok(brake.every((value) => value >= 0 && value <= 100));
});


test('inactive throttle and brake remain exactly zero in both recordings', async () => {
  const { generateDriveRecording } = await import('./synthetic-drive.ts');
  const [reference, comparison] = await Promise.all([
    generateDriveRecording(1_700, 'reference'),
    generateDriveRecording(1_700, 'comparison'),
  ]);

  for (const recording of [reference, comparison]) {
    const rows = (await recording.text()).trim().split('\n').slice(1);
    for (const row of rows) {
      const [, , , throttle, brake] = row.split(',');
      assert.equal(Number(throttle), 0);
      assert.equal(Number(brake), 0);
    }
  }
});

test('comparison dropouts remain empty CSV fields rather than numeric zero', async () => {
  const { generateDriveRecording } = await import('./synthetic-drive.ts');
  const recording = await generateDriveRecording(45_021, 'comparison');
  const rows = (await recording.text()).trim().split('\n').slice(1);
  const missing = rows.filter((row) => row.split(',')[1] === '');
  assert.ok(missing.length > 0);
  assert.ok(missing.every((row) => row.split(',')[1] === ''));
});

test('offline CSV generator stays byte-identical to the in-app generator', async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { generateDriveRecording } = await import('./synthetic-drive.ts');
  const outputDirectory = await mkdtemp(join(tmpdir(), 'vsw-samples-'));

  try {
    const result = spawnSync(process.execPath, [
      resolve('data/samples/generate.mjs'),
      '--rows', '64',
      '--output-dir', outputDirectory,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);

    for (const role of ['reference', 'comparison'] as const) {
      const generated = await generateDriveRecording(64, role);
      const offline = await readFile(join(outputDirectory, `mixed-drive-${role}-64-rows.csv`), 'utf8');
      assert.equal(offline, await generated.text());
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});


test('reference and comparison recordings share a 10ms sample cadence and stable 35ms timestamp offset', async () => {
  const { generateDriveRecording } = await import('./synthetic-drive.ts');
  const [reference, comparison] = await Promise.all([
    generateDriveRecording(128, 'reference'),
    generateDriveRecording(128, 'comparison'),
  ]);
  const parse = async (file: File) => (await file.text()).trim().split('\\n').slice(1).map((line) => {
    const fields = line.split(',');
    assert.equal(fields.length, 6, 'all five channels must share one timestamp row');
    return fields;
  });
  const [referenceRows, comparisonRows] = await Promise.all([parse(reference), parse(comparison)]);

  for (let index = 1; index < referenceRows.length; index += 1) {
    const previous = Number(referenceRows[index - 1][0]);
    const current = Number(referenceRows[index][0]);
    assert.ok(Math.abs((current - previous) - 0.01) < 0.00001, 'reference cadence is 10ms');
  }
  for (let index = 1; index < comparisonRows.length; index += 1) {
    const previous = Number(comparisonRows[index - 1][0]);
    const current = Number(comparisonRows[index][0]);
    assert.ok(Math.abs((current - previous) - 0.01) < 0.00001, 'comparison cadence is 10ms');
  }

  const phaseOffset = Number(comparisonRows[0][0]) - Number(referenceRows[0][0]);
  assert.ok(Math.abs(phaseOffset - 0.035) < 0.001, 'comparison recording retains its 35ms phase offset');
  assert.ok(referenceRows.every((row) => row.length === 6) && comparisonRows.every((row) => row.length === 6));
});
