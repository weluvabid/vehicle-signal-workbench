import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createChannelId,
  detectTimestampColumn,
  parseColumnLabel,
  parseNumericSample,
  parseTimestamp,
} from './csv-normalization.ts';
import { MeasurementError } from '../measurements/errors.ts';

test('parses ISO timestamps into epoch seconds', () => {
  assert.equal(parseTimestamp('2026-01-01T00:00:01.500Z', 'iso-8601', 2), 1_767_225_601.5);
});

test('requires ISO timestamps to include an explicit timezone', () => {
  assert.throws(
    () => parseTimestamp('2026-01-01T00:00:00', 'iso-8601', 3),
    (error: unknown) => error instanceof MeasurementError && error.code === 'INVALID_TIMESTAMP',
  );
});

test('converts numeric timestamp encodings explicitly', () => {
  assert.equal(parseTimestamp('12.5', 'unix-seconds', 2), 12.5);
  assert.equal(parseTimestamp('12500', 'unix-milliseconds', 2), 12.5);
});

test('rejects invalid and empty timestamps', () => {
  assert.throws(
    () => parseTimestamp('', 'iso-8601', 4),
    (error: unknown) => error instanceof MeasurementError && error.code === 'INVALID_TIMESTAMP',
  );
  assert.throws(() => parseTimestamp('not-a-date', 'iso-8601', 4), MeasurementError);
});

test('preserves missing or invalid numeric samples as NaN', () => {
  assert.equal(parseNumericSample(''), Number.NaN);
  assert.equal(parseNumericSample('not numeric'), Number.NaN);
  assert.equal(parseNumericSample('0'), 0);
  assert.equal(parseNumericSample('-3.25'), -3.25);
});

test('extracts units from bracketed column names', () => {
  assert.deepEqual(parseColumnLabel('Vehicle Speed [km/h]'), {
    label: 'Vehicle Speed',
    unit: 'km/h',
  });
  assert.deepEqual(parseColumnLabel('Engine RPM'), {
    label: 'Engine RPM',
    unit: null,
  });
});

test('creates stable, index-disambiguated channel ids', () => {
  assert.equal(createChannelId('Vehicle Speed [km/h]', 1), 'vehicle-speed-km-h-1');
  assert.equal(createChannelId('!!!', 2), 'channel-2');
});

test('only auto-detects one unambiguous timestamp column', () => {
  assert.equal(detectTimestampColumn(['timestamp', 'RPM']), 'timestamp');
  assert.equal(detectTimestampColumn(['time_s', 'timestamp', 'RPM']), null);
  assert.equal(detectTimestampColumn(['RPM', 'Speed']), null);
});

test('normalises negative zero while preserving ordinary signed values', () => {
  const negativeZero = parseNumericSample('-0.00');
  assert.equal(negativeZero, 0);
  assert.equal(Object.is(negativeZero, -0), false);
  assert.equal(parseNumericSample('-3.25'), -3.25);
});
