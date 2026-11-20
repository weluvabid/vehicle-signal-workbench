/** First index whose value is greater than or equal to target in a sorted Float64Array. */
export function lowerBoundFloat64(values: Float64Array, target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);

    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }

  return low;
}
