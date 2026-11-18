# Performance telemetry contract

The dashboard reports separate quantities and does not substitute one for another.

- **Timestamp rows / run**: `DatasetDescriptor.sampleCount` for each imported CSV. Total rows are the sum of the two recordings.
- **Valid channel samples**: sum of each channel's `sampleCount - missingSampleCount` across both recordings. Missing numeric cells are excluded.
- **CSV ingestion**: concurrent two-file wall-clock duration captured by the import workflow. Input MiB is the sum of source file sizes. Throughput reports both total timestamp rows/s and valid channel samples/s using that same wall-clock duration.
- **Retained typed-array memory**: exact `byteLength` sum of worker-owned canonical arrays: timestamp axes, channel value arrays, and all six typed arrays in each channel's envelope index. This excludes CSV source bytes, temporary/geometrically grown import buffers, JS object overhead, worker/runtime overhead, and browser heap.
- **Initial viewport preparation**: elapsed main-thread time from initial query dispatch until all selected panel responses and plot-series preparation complete. It is not ingestion duration or paint time.
- **Viewport interaction**: elapsed main-thread time for each accepted zoom/pan query, including worker round trips and plot-series preparation. Latest, rolling median and p95 are calculated from the last 100 completed interactions. Superseded requests are ignored.
- **UI FPS**: observed `requestAnimationFrame` cadence as reported by the chart component. It is not a direct measurement of GPU/canvas paint time.

All memory values use MiB (1,048,576 bytes). Throughput values use decimal millions (1,000,000 samples or rows).
