# VSW sample data generator

Creates deterministic, correlated mixed-drive vehicle telemetry for manual inspection and external tooling. It is intentionally separate from `scripts/generate-measurement-fixtures.mjs`, which remains dedicated to automated test fixtures.

```sh
node data/samples/generate.mjs --rows 1000000 --output-dir data/samples/generated
```

The command writes Reference and Comparison CSV recordings sequentially in bounded chunks. Each recording uses a 10 ms sample interval and a one-hour mixed-drive cycle containing urban stops, acceleration, suburban driving, highway cruising and deceleration. The cycle varies slightly on each repetition so long workloads do not become identical copies of one hour.

Signals are derived from the same drive state rather than generated independently:

- Vehicle speed follows a deterministic route speed profile with smooth acceleration and deceleration transitions.
- Longitudinal acceleration is derived from the speed profile and drives throttle/brake demand.
- Engine RPM is derived from road speed, tyre circumference, final-drive ratio and a six-speed gear schedule.
- Throttle and brake pressure respond to acceleration, speed and a small road-grade model.
- Steering angle combines small lane corrections with bounded cornering manoeuvres.

Comparison represents the same drive cycle with a 35 ms timestamp offset, small deterministic sensor bias/noise and short, intentional vehicle-speed dropouts. The output remains reproducible for the same row count and role.

`--rows` accepts 1 through 10,000,000. Generated CSV files are ignored by Git and are not automated test fixtures.
