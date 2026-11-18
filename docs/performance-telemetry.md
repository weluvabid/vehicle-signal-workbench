# Performance telemetry contract

The dashboard reports separate quantities and does not substitute one for another.

- **Timestamp rows / run**: `DatasetDescriptor.sampleCount` for each imported CSV. Total rows are the sum of the two recordings.
- **Valid channel samples**: sum of each channel's `sampleCount - missingSampleCount` across both recordings. Missing numeric cells are excluded.
- **CSV ingestion**: concurrent two-file wall-clock duration captured by the import workflow. Input MiB is the sum of source file sizes. Throughput reports both total timestamp rows/s and valid channel samples/s using that same wall-clock duration.
- **Retained typed-array memory**: exact `byteLength` sum of worker-owned canonical arrays: timestamp axes, channel value arrays, and all six typed arrays in each channel's envelope index. This excludes CSV source bytes, temporary/geometrically grown import buffers, JS object overhead, worker/runtime overhead, and browser heap.
- **Initial viewport preparation**: elapsed main-thread time from initial query dispatch until the single batched worker response and plot-series preparation complete. It is not ingestion duration or paint time.
- **Viewport interaction**: elapsed main-thread time for each accepted zoom/pan query, including debounce, worker round trip and plot-series preparation. Latest, rolling median and p95 are calculated from the last 100 completed interactions. Superseded requests are ignored.
- **UI FPS**: observed `requestAnimationFrame` cadence as reported by the chart component. It is not a direct measurement of GPU/canvas paint time.

## Viewport query scheduling

- ECharts remains interactive; viewport data queries are debounced by 120 ms.
- One worker request contains every selected reference/comparison channel pair. The worker returns one ordered batch, and the UI commits all panels together.
- Only one batch can be in flight. A new viewport invalidates and cancels the active batch, replacing the pending viewport rather than queueing intermediate states.
- Cancellation uses a `SharedArrayBuffer` flag when cross-origin isolation is available. The worker checks it inside the sample-processing loops, so a stale difference scan can stop without waiting for its full scan to finish. A `cancel` message provides the worker-event-loop fallback at cooperative yield points.
- Cancellation is an expected outcome: it does not surface as a user error and never commits partial panel results.
- `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` are enabled to make shared-memory cancellation available. Any future cross-origin assets must satisfy the embedder policy.

All memory values use MiB (1,048,576 bytes). Throughput values use decimal millions (1,000,000 samples or rows).
