#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { once } from 'node:events';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (key.startsWith('--')) args.set(key.slice(2), process.argv[++index]);
}

const rows = Number(args.get('rows') ?? 100_000);
const outputDirectory = resolve(args.get('output-dir') ?? 'data/samples/generated');
if (!Number.isSafeInteger(rows) || rows < 1 || rows > 10_000_000) {
  throw new RangeError('--rows must be an integer between 1 and 10,000,000.');
}

const epochStart = 1_735_689_600;
const chunkRows = 12_000;
const header = 'Timestamp,Vehicle Speed [km/h],Engine RPM [rpm],Throttle Position [%],Brake Pressure [bar],Steering Angle [deg]\n';

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
const DRIVE_CYCLE_SECONDS = 3_600;
const SPEED_PROFILE = [
  [0, 0], [18, 0], [38, 32], [105, 32], [128, 0], [158, 0],
  [190, 48], [340, 48], [370, 22], [405, 22], [430, 0], [455, 0],
  [495, 58], [720, 58], [760, 82], [1_100, 82], [1_145, 96], [1_650, 96],
  [1_690, 72], [1_820, 72], [1_855, 0], [1_900, 0], [1_940, 45], [2_180, 45],
  [2_220, 65], [2_470, 65], [2_510, 35], [2_650, 35], [2_690, 0], [2_735, 0],
  [2_780, 52], [3_030, 52], [3_070, 88], [3_350, 88], [3_390, 0], [3_600, 0],
];
const GEAR_RATIOS = [3.6, 2.19, 1.41, 1.0, 0.83, 0.69];
const FINAL_DRIVE = 3.55;
const TYRE_CIRCUMFERENCE_METRES = 2.05;

function smoothStep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function profileSpeed(seconds) {
  const cycle = Math.floor(seconds / DRIVE_CYCLE_SECONDS);
  const local = ((seconds % DRIVE_CYCLE_SECONDS) + DRIVE_CYCLE_SECONDS) % DRIVE_CYCLE_SECONDS;
  let segment = 0;
  while (segment < SPEED_PROFILE.length - 2 && local > SPEED_PROFILE[segment + 1][0]) segment += 1;
  const [startTime, startSpeed] = SPEED_PROFILE[segment];
  const [endTime, endSpeed] = SPEED_PROFILE[segment + 1];
  const duration = endTime - startTime;
  const transition = duration <= 0 ? 1 : smoothStep((local - startTime) / duration);
  // Small deterministic cycle-to-cycle variation avoids a visibly repeated trace in long workloads.
  const cycleVariation = 1 + 0.012 * Math.sin(cycle * 1.731);
  return clamp((startSpeed + (endSpeed - startSpeed) * transition) * cycleVariation, 0, 130);
}

function driveState(seconds) {
  const speed = profileSpeed(seconds);
  const acceleration = (profileSpeed(seconds + 0.05) - profileSpeed(seconds - 0.05)) / 0.1;
  const grade = 0.35 * Math.sin(seconds / 173) + 0.18 * Math.sin(seconds / 47);
  const throttle = clamp(
    acceleration > 0.12 ? 7 + acceleration * 8.5 + grade : speed > 1 ? 7 + speed * 0.105 + Math.max(0, grade) * 4 : 0,
    0,
    100,
  );
  const brake = acceleration < -0.35
    ? clamp(((-acceleration / 3.6) - 0.1) * 18 + Math.max(0, -grade) * 2, 0, 85)
    : 0;

  const gear = speed < 1 ? 0
    : speed < 15 ? 0
      : speed < 29 ? 1
        : speed < 47 ? 2
          : speed < 67 ? 3
            : speed < 91 ? 4 : 5;
  const wheelRpm = (speed / 3.6 / TYRE_CIRCUMFERENCE_METRES) * 60;
  const rpm = speed < 1 ? 850 : Math.max(850, wheelRpm * GEAR_RATIOS[gear] * FINAL_DRIVE);
  return { speed, acceleration, throttle, brake, rpm, gear };
}

function deterministicNoise(index, salt) {
  let value = (Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt + 7, 0x119de1f3)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0xffff_ffff - 0.5;
}

function steeringAt(seconds) {
  const turn = (center, width, amplitude) => {
    const normalized = (seconds - center) / width;
    return Math.abs(normalized) >= 1 ? 0 : amplitude * Math.sin(Math.PI * normalized) ** 2;
  };
  return clamp(
    3.5 * Math.sin(seconds / 53) + 2.2 * Math.sin(seconds / 17)
      + turn(285, 34, 90) - turn(815, 48, 120) + turn(1_325, 42, 65)
      - turn(2_030, 38, 105) + turn(2_890, 55, 80),
    -540,
    540,
  );
}

function sampleAt(index, role) {
  const comparison = role === 'comparison';
  const seconds = index * 0.01 + (comparison ? 0.035 : 0);
  const state = driveState(seconds);
  const noise = (salt, amplitude) => deterministicNoise(index, salt + (comparison ? 101 : 0)) * amplitude;
  const speed = clamp(state.speed + (comparison && state.speed > 1 ? 0.18 : 0) + noise(1, 0.12), 0, 130);
  const rpm = clamp(state.rpm + (comparison ? 12 : 0) + noise(2, 7), 700, 6_500);
  // Keep sensor noise and comparison bias proportional to an active command.
  // An inactive actuator must remain at zero rather than acquiring a phantom demand.
  const throttle = state.throttle > 0
    ? clamp(state.throttle + (comparison ? 0.35 : 0) + noise(3, 0.45), 0, 100)
    : 0;
  const brake = state.brake > 0
    ? clamp(state.brake + (comparison ? 0.08 : 0) + noise(4, 0.08), 0, 100)
    : 0;
  const steering = clamp(steeringAt(seconds % DRIVE_CYCLE_SECONDS) + (comparison ? 0.6 : 0) + noise(5, 0.7), -540, 540);
  const cyclePosition = seconds % DRIVE_CYCLE_SECONDS;
  const dropout = comparison && ((cyclePosition >= 450 && cyclePosition < 450.2)
    || (cyclePosition >= 2_412 && cyclePosition < 2_412.15));
  return { seconds, speed, rpm, throttle, brake, steering, dropout };
}

function row(index, role) {
  const sample = sampleAt(index, role);
  const timestamp = (epochStart + sample.seconds).toFixed(3);
  const speed = sample.dropout ? '' : sample.speed.toFixed(2);
  return `${timestamp},${speed},${sample.rpm.toFixed(1)},${sample.throttle.toFixed(2)},${sample.brake.toFixed(2)},${sample.steering.toFixed(1)}\n`;
}

async function writeRecording(role) {
  const path = resolve(outputDirectory, `mixed-drive-${role}-${rows}-rows.csv`);
  await mkdir(dirname(path), { recursive: true });
  const output = createWriteStream(path, { encoding: 'utf8' });
  output.write(header);
  for (let start = 0; start < rows; start += chunkRows) {
    const end = Math.min(rows, start + chunkRows);
    const lines = new Array(end - start);
    for (let index = start; index < end; index += 1) lines[index - start] = row(index, role);
    if (!output.write(lines.join(''))) await once(output, 'drain');
    process.stdout.write(`\r${role}: ${((end / rows) * 100).toFixed(1)}%`);
  }
  output.end();
  await once(output, 'finish');
  process.stdout.write(`\r${role}: complete → ${path}\n`);
}

await writeRecording('reference');
await writeRecording('comparison');
