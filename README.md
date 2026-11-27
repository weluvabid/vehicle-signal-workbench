# Vehicle Signal Workbench

I started this with a pretty different idea.

The original plan was to build a backend service that could take vehicle measurement recordings, analyse them, and send back a report. The concern was that browsers would struggle once the recordings got large, so moving the heavy work to a server seemed like the obvious answer.

Then I started wondering: what if I didn't?

How far could I push the browser if I kept the whole thing local? Could it handle ingestion, parsing, normalization, indexing, comparison, and visualization without sending the measurement data anywhere? Not just load a CSV and draw a chart, but do the actual work.

That question became Vehicle Signal Workbench.

[Open the live workbench](https://vehicle-signal-workbench.vercel.app/)

## The experiments

A lot of the work has been about finding and removing bottlenecks rather than just adding features.

One of the more unexpected improvements came from watching Safari. During ingestion tests, Safari was generally faster than Chrome, but I noticed that its loading indicators weren't updating as regularly. The loader would sit for a while and then catch up.

That made me wonder whether keeping the progress animation active was doing unnecessary work in the middle of ingestion. I removed the animation updates from that path and measured again. Safari moved from roughly **13M to 14M samples/sec**. Across Safari and Chrome, the change saved around **400–800 ms** during ingestion.

That wasn't an optimization I had planned. It came from noticing something odd in a browser and following the question.

I also kept increasing the workload to see where the browser would give up. In one experiment, I ingested around **250 MB of data — roughly 62.5 million data points — on an iPhone SE (2020)**. It completed without crashing most of the time, though it wasn't reliable on every attempt. Some larger workloads failed. That was part of the point: I wanted to find the limits, not assume them.

## What is here

VSW is a browser-based workbench for exploring and comparing vehicle measurement recordings. The current app uses deterministic generated reference and comparison drives so the same workload can be reproduced.

- Five related signals: Vehicle Speed, Engine RPM, Throttle Position, Brake Pressure, and Steering Angle.
- A shared 10 ms sampling cadence, with a 35 ms phase offset in the comparison recording.
- Deterministic comparison differences, including sensor bias, noise, and speed-sensor dropouts.
- Worker-based CSV ingestion, normalization, indexing, and viewport queries.
- Synchronized signal charts, zooming and panning, channel visibility, and channel-level analysis.
- Generated workload scenarios up to 10 million samples per recording.

The generated recordings go through the CSV ingestion pipeline. The parser and normalization code are part of the ingestion infrastructure; the current app does not expose a user CSV-upload workflow.

## How it is put together

The frontend is built with Next.js and React, with uPlot rendering three synchronized signal charts. Dedicated workers handle ingestion and querying so that this work doesn't run on the UI thread. Measurement data is held in typed-array-backed structures, and the UI requests the data needed for the current viewport rather than owning the full measurement registry.

The project grew out of performance experiments with browser execution, memory, worker boundaries, and rendering. The implementation is still evolving as those experiments expose new limits.

## Run it

Requirements:

- Node.js `>=26.13.0`
- pnpm `>=12.0.0`

Install dependencies and start the development server:

```sh
pnpm install
pnpm dev
```

Build and run the production app:

```sh
pnpm build
pnpm start
```

## Checks and tests

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

Run the browser E2E suite:

```sh
pnpm test:e2e
```

The generated-workload performance scenarios are opt-in:

```sh
pnpm test:e2e:performance
pnpm test:e2e:performance:10m
```

These exercise two generated recordings at 1M and 10M samples per recording.

## Ingestion fixtures and sample generation

`tests/fixtures/` contains 18 CSV regression scenarios covering cases such as different sampling rates, partial or missing overlap, irregular and duplicate timestamps, missing and extreme values, ambiguous channel names, incompatible units, malformed CSV, timestamp encodings, and mixed metadata/columns.

Regenerate the fixture corpus with:

```sh
pnpm fixtures:generate
```

The fixture integrity test checks that each leaf scenario has its expected metadata and reference/comparison CSV files. The `expected.json` files describe the intended behaviour for future ingestion-level regression tests.

To generate standalone sample CSVs:

```sh
pnpm samples:generate -- --rows 100000
```

By default, the files are written to `data/samples/generated/`. Use `--output-dir` to choose another destination. The offline generator is checked against the in-app generator so the two don't drift apart.

## About the hosted demo

The hosted demo runs on Vercel and uses generated recordings rather than files uploaded by a user. Generating those recordings is part of the demo workflow before they are passed through ingestion and the rest of the workbench. Because this involves synthetic-data generation and communication between the page and its worker, the overall time shown in the hosted demo can occasionally be longer than the ingestion timings documented below.

That end-to-end time should not be read as ingestion time alone. The Performance popover reports worker-side ingestion time: it starts when the worker begins handling an import and stops after parsing, normalization, typed-array construction, index creation, and dataset registration finish. It excludes synthetic recording generation, worker startup, request dispatch, and completion-message delivery.

## A note on the numbers

The throughput and large-recording results above are observations from specific experiments with the Devices I own in Dev Mode.
