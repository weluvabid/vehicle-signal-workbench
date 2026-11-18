import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeCsvCell, formatDifferenceCsvRow } from './csv-format.ts';

test('escapes quotes and delimiters in CSV text cells', () => {
  assert.equal(escapeCsvCell('Speed, "actual"'), '"Speed, ""actual"""');
});

test('formats missing numeric values as empty CSV cells', () => {
  assert.equal(
    formatDifferenceCsvRow('Speed', 'km/h', 1.25, 10, Number.NaN, Number.NaN),
    '"Speed","km/h","1.25","10","","","false"',
  );
});
