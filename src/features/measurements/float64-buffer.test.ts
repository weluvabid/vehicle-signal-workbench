import assert from 'node:assert/strict';
import test from 'node:test';
import { Float64BufferBuilder } from './float64-buffer.ts';

test('grows typed storage and returns a compact independent result', () => {
  const builder = new Float64BufferBuilder(1);
  builder.push(1);
  builder.push(2);
  builder.push(Number.NaN);

  const result = builder.finish();
  assert.ok(result instanceof Float64Array);
  assert.deepEqual([...result], [1, 2, Number.NaN]);
  assert.equal(result.byteLength, 3 * Float64Array.BYTES_PER_ELEMENT);

  result[0] = 99;
  assert.deepEqual([...builder.finish()], [1, 2, Number.NaN]);
});

test('rejects invalid initial capacities', () => {
  assert.throws(() => new Float64BufferBuilder(-1), RangeError);
  assert.throws(() => new Float64BufferBuilder(1.5), RangeError);
});
