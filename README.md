# Vehicle Signal Workbench

Vehicle Signal Workbench (VSW) is an in-browser engineering prototype for exploring and comparing vehicle measurement recordings. It generates deterministic reference and comparison drives, ingests them in workers, and presents synchronized signal charts and channel analysis.

The prototype is intended for HR and engineering reviewers to exercise a realistic measurement workflow without needing to provide their own vehicle data.

## What it demonstrates

- **Generated workloads:** deterministic reference/comparison recordings with a shared 10 ms sampling cadence and a 35 ms comparison phase offset.
- **Five correlated signals:** Vehicle Speed, Engine RPM, Throttle Position, Brake Pressure, and Steering Angle.
- **Worker-based ingestion and querying:** CSV parsing, normalization, indexing, and viewport queries run outside the UI thread.
- **Signal comparison:** synchronized time axes, zoom and pan, channel visibility, and channel-level analysis.
- **Scale testing:** selectable generated workloads up to 10 million samples per recording.

The generated comparison drive includes deterministic sensor bias, noise, and speed-sensor dropouts. The signals share one timestamp row so their relationships can be explored together.

## Architecture

The application is a Next.js/React frontend with ECharts for chart rendering. The UI communicates with dedicated workers through typed request/response protocols. Ingestion and measurement data structures are kept in feature modules; the UI does not own the full measurement registry.

The CSV parser and normalization code are internal ingestion infrastructure. The prototype does not expose a CSV upload workflow, but generated recordings still pass through the CSV ingestion pipeline.

## Requirements

- Node.js `>=26.13.0`
- pnpm `>=12.0.0`

Install dependencies:

```sh
pnpm install
```

Start the development server:

```sh
pnpm dev
```

Build and run the production app:

```sh
pnpm build
pnpm start
```

## Development checks

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

Run the complete browser E2E suite:

```sh
pnpm test:e2e
```

Run the generated-workload performance scenarios:

```sh
pnpm test:e2e:performance
pnpm test:e2e:performance:10m
```

The performance scenarios exercise two generated recordings at 1M and 10M samples per recording respectively. They are opt-in because they are intentionally heavier than the normal E2E suite.

## Measurement regression fixtures

`tests/fixtures/` contains 18 functional CSV regression scenarios, including sampling differences, partial/no overlap, irregular and duplicate timestamps, missing values, extreme values, ambiguous channel names, incompatible units, malformed CSV, timestamp encodings, and mixed metadata/columns.

These fixtures are retained as an ingestion QA corpus; they are not the current browser workflow. The fixture generator can recreate them:

```sh
pnpm fixtures:generate
```

The fixture corpus has a structural integrity test included in `pnpm test`. It checks that every leaf scenario has its expected metadata and reference/comparison CSV pair. Scenario expectations in `expected.json` document the intended behavior for future ingestion-level regression tests.

## Standalone sample generation

To generate downloadable sample CSVs outside the application:

```sh
pnpm samples:generate -- --rows 100000
```

By default, the generator writes reference and comparison files under `data/samples/generated/`. Use `--output-dir` to select another destination.

The offline generator is checked against the in-app generator to prevent the two implementations from drifting.

## Repository tooling profiles

The `profiles/` directory retains the generic Node/pnpm and TypeScript profiles used by the OSS repository baseline. They are repository tooling references, not part of the VSW runtime or build. The application itself is configured by the root package, TypeScript, ESLint, Prettier, and Next.js configuration.

## Performance notes

Record performance claims against the optimized production build and document the hardware/browser, workload size, and measurement procedure alongside any published numbers. Development-server timings are not production benchmark results.
