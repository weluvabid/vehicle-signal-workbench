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
  const rows = (await recording.text()).trim().split('\n').slice(1).map((line) => line.split(',').map(Number));
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
