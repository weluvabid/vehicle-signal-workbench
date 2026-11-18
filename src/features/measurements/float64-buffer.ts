/** Append-only Float64 builder for bounded numeric query results. */
export class Float64BufferBuilder {
  private buffer: Float64Array;
  private length = 0;

  constructor(initialCapacity = 16) {
    if (!Number.isSafeInteger(initialCapacity) || initialCapacity < 0) {
      throw new RangeError('Initial capacity must be a non-negative safe integer.');
    }
    this.buffer = new Float64Array(Math.max(1, initialCapacity));
  }

  get size(): number {
    return this.length;
  }

  push(value: number): void {
    if (this.length === this.buffer.length) {
      const next = new Float64Array(this.buffer.length * 2);
      next.set(this.buffer);
      this.buffer = next;
    }
    this.buffer[this.length] = value;
    this.length += 1;
  }

  finish(): Float64Array {
    return this.buffer.slice(0, this.length);
  }
}
