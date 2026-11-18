import assert from 'node:assert/strict';
import test from 'node:test';
import {
  areUnitsCompatible,
  suggestChannelMappings,
} from './channel-mapping.ts';
import type { DatasetDescriptor } from './model.ts';

const left: DatasetDescriptor = {
  id: 'left',
  name: 'Reference',
  sourceFileName: 'reference.csv',
  importedAt: '2026-01-01T00:00:00.000Z',
  sampleCount: 10,
  durationSeconds: 9,
  timeOriginEpochSeconds: 1_767_225_600,
  timestampEncoding: 'unix-seconds',
  channels: [
    { id: 'rpm-left', sourceColumn: 'Engine RPM [rpm]', label: 'Engine RPM', unit: 'rpm', sampleCount: 10, missingSampleCount: 0 },
    { id: 'speed-left', sourceColumn: 'Vehicle Speed [km/h]', label: 'Vehicle Speed', unit: 'km/h', sampleCount: 10, missingSampleCount: 0 },
    { id: 'temp-left', sourceColumn: 'Coolant Temp [C]', label: 'Coolant Temp', unit: 'C', sampleCount: 10, missingSampleCount: 0 },
  ],
};

const right: DatasetDescriptor = {
  ...left,
  id: 'right',
  name: 'Comparison',
  sourceFileName: 'comparison.csv',
  channels: [
    { id: 'rpm-right', sourceColumn: 'engine_rpm [rpm]', label: 'engine_rpm', unit: 'rpm', sampleCount: 10, missingSampleCount: 0 },
    { id: 'speed-right', sourceColumn: 'Vehicle Speed [mph]', label: 'Vehicle Speed', unit: 'mph', sampleCount: 10, missingSampleCount: 0 },
  ],
};

test('suggests exact normalized label matches when units agree', () => {
  const suggestions = suggestChannelMappings(left, right);
  assert.equal(suggestions[0].right?.id, 'rpm-right');
  assert.equal(suggestions[0].compatibility, 'compatible');
});

test('flags matching labels with different units instead of converting them', () => {
  const suggestions = suggestChannelMappings(left, right);
  assert.equal(suggestions[1].right?.id, 'speed-right');
  assert.equal(suggestions[1].compatibility, 'unit-mismatch');
  assert.match(suggestions[1].reason, /km\/h vs mph/);
});

test('leaves channels unmatched when there is no exact normalized label', () => {
  const suggestions = suggestChannelMappings(left, right);
  assert.equal(suggestions[2].right, null);
  assert.equal(suggestions[2].compatibility, 'unmatched');
});

test('does not guess when the right side has duplicate normalized labels', () => {
  const duplicate = {
    ...right,
    channels: [
      ...right.channels,
      { ...right.channels[0], id: 'rpm-right-2' },
    ],
  };
  assert.equal(suggestChannelMappings(left, duplicate)[0].right, null);
});

test('unit compatibility is exact and case-insensitive only', () => {
  assert.equal(areUnitsCompatible('RPM', 'rpm'), true);
  assert.equal(areUnitsCompatible('km/h', 'mph'), false);
  assert.equal(areUnitsCompatible(null, null), true);
  assert.equal(areUnitsCompatible(null, 'rpm'), false);
});


test('does not map duplicate normalized labels from the reference side to one comparison channel', () => {
  const duplicateLeft = {
    ...left,
    channels: [
      { ...left.channels[1], id: 'speed-left-1' },
      { ...left.channels[1], id: 'speed-left-2', sourceColumn: 'Speed  [km/h]' },
    ],
  };
  const suggestions = suggestChannelMappings(duplicateLeft, { ...right, channels: [right.channels[1]] });
  assert.equal(suggestions.length, 2);
  assert.ok(suggestions.every((suggestion) => suggestion.right === null));
  assert.ok(suggestions.every((suggestion) => /Multiple channels/.test(suggestion.reason)));
});
