import Papa from 'papaparse';
import type { DatasetDescriptor } from '../measurements/model';
import type { ChannelEnvelopeIndex } from '../measurements/windowing';
import { buildChannelEnvelopeIndex } from '../measurements/windowing';
import { medianSampleIntervalFromTimes } from '../measurements/difference';
import { MeasurementError } from '../measurements/errors';
import {
  createChannelId,
  parseColumnLabel,
  parseNumericSample,
  parseTimestamp,
} from './csv-normalization';
import type { IngestionRequest, IngestionResponse } from './worker-protocol';

export interface ActiveImport {
  parser: Papa.Parser | null;
  cancelled: boolean;
}

export interface StoredChannel {
  readonly values: Float64Array;
  readonly envelopeIndex: ChannelEnvelopeIndex;
}

export interface StoredDataset {
  readonly timeSeconds: Float64Array;
  readonly nominalSampleIntervalSeconds: number | null;
  readonly channels: Map<string, StoredChannel>;
}

interface ChannelBuffer {
  readonly id: string;
  readonly sourceColumn: string;
  readonly label: string;
  readonly unit: string | null;
  readonly columnIndex: number;
  values: Float64Array;
  missingSampleCount: number;
}

const INITIAL_CAPACITY = 4_096;

function grow(buffer: Float64Array, required: number): Float64Array {
  if (required <= buffer.length) return buffer;

  let capacity = buffer.length;
  while (capacity < required) capacity *= 2;

  const next = new Float64Array(capacity);
  next.set(buffer);
  return next;
}

export function importCsv(
  request: Extract<IngestionRequest, { type: 'import' }>,
  activeImports: Map<number, ActiveImport>,
  datasets: Map<string, StoredDataset>,
  post: (message: IngestionResponse) => void,
): void {
  const { requestId, file, options } = request;

  if (file.size === 0) {
    post({ type: 'error', requestId, code: 'EMPTY_FILE', message: 'The selected file is empty.' });
    return;
  }

  let headers: string[] | null = null;
  let timestampIndex = -1;
  let timeValues = new Float64Array(INITIAL_CAPACITY);
  let channels: ChannelBuffer[] = [];
  let sampleCount = 0;
  let firstEpochSeconds: number | null = null;
  let lastEpochSeconds = Number.NEGATIVE_INFINITY;
  let terminal = false;
  const active: ActiveImport = { parser: null, cancelled: false };
  activeImports.set(requestId, active);

  const fail = (error: unknown): void => {
    if (terminal) return;
    terminal = true;
    const measurementError =
      error instanceof MeasurementError
        ? error
        : new MeasurementError('INVALID_CSV', error instanceof Error ? error.message : 'CSV import failed.');
    activeImports.delete(requestId);
    post({
      type: 'error',
      requestId,
      code: measurementError.code,
      message:
        measurementError.rowNumber === undefined
          ? measurementError.message
          : `Row ${measurementError.rowNumber}: ${measurementError.message}`,
    });
  };

  Papa.parse<string[]>(file, {
    header: false,
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
    worker: false,
    chunkSize: 1024 * 1024,
    chunk(results, papaParser) {
      active.parser = papaParser;

      if (active.cancelled) {
        papaParser.abort();
        activeImports.delete(requestId);
        return;
      }

      try {
        if (results.errors.length > 0) {
          const firstError = results.errors[0];
          throw new MeasurementError(
            'INVALID_CSV',
            `CSV syntax error: ${firstError.message}`,
            firstError.row + 1,
          );
        }

        for (const row of results.data) {
          if (headers === null) {
            headers = row.map((header) => header.trim());

            if (headers.length < 2 || headers.some((header) => header.length === 0)) {
              throw new MeasurementError(
                'INVALID_CSV',
                'CSV must have a header row with at least two non-empty columns.',
              );
            }

            if (new Set(headers).size !== headers.length) {
              throw new MeasurementError(
                'INVALID_CSV',
                'CSV headers must be unique after trimming whitespace.',
              );
            }

            timestampIndex = headers.indexOf(options.timestampColumn);

            if (timestampIndex < 0) {
              throw new MeasurementError(
                'MISSING_TIMESTAMP_COLUMN',
                `Timestamp column "${options.timestampColumn}" was not found.`,
              );
            }

            channels = headers
              .map((sourceColumn, index) => ({ sourceColumn, index }))
              .filter(({ index }) => index !== timestampIndex)
              .map(({ sourceColumn, index }) => {
                const parsedLabel = parseColumnLabel(sourceColumn);
                return {
                  id: createChannelId(sourceColumn, index),
                  sourceColumn,
                  label: parsedLabel.label,
                  unit: parsedLabel.unit,
                  columnIndex: index,
                  values: new Float64Array(INITIAL_CAPACITY),
                  missingSampleCount: 0,
                };
              });
            continue;
          }

          if (row.length !== headers.length) {
            throw new MeasurementError(
              'INVALID_CSV',
              `Expected ${headers.length} columns but received ${row.length}.`,
              sampleCount + 2,
            );
          }

          const epochSeconds = parseTimestamp(
            row[timestampIndex] ?? '',
            options.timestampEncoding,
            sampleCount + 2,
          );

          if (epochSeconds <= lastEpochSeconds) {
            throw new MeasurementError(
              'NON_MONOTONIC_TIMESTAMP',
              'Timestamps must be strictly increasing; duplicate and out-of-order values are not accepted.',
              sampleCount + 2,
            );
          }

          firstEpochSeconds ??= epochSeconds;
          lastEpochSeconds = epochSeconds;
          timeValues = grow(timeValues, sampleCount + 1);
          timeValues[sampleCount] = epochSeconds - firstEpochSeconds;

          for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
            const channel = channels[channelIndex];
            channel.values = grow(channel.values, sampleCount + 1);
            const value = parseNumericSample(row[channel.columnIndex]);

            if (Number.isNaN(value)) {
              channel.missingSampleCount += 1;
            }

            channel.values[sampleCount] = value;
          }

          sampleCount += 1;
        }

        if (file.size > 0) {
          post({
            type: 'progress',
            requestId,
            fraction: Math.min(0.99, results.meta.cursor / file.size),
          });
        }

        if (active.cancelled) {
          papaParser.abort();
          activeImports.delete(requestId);
        }
      } catch (error) {
        // Mark the request terminal and notify the client before aborting.
        // Papa Parse may invoke `complete` as part of abort(); if abort runs
        // first, that callback can incorrectly publish a partial dataset.
        fail(error);
        papaParser.abort();
      }
    },
    complete() {
      if (terminal || active.cancelled) {
        activeImports.delete(requestId);
        return;
      }

      try {
        if (headers === null || sampleCount === 0 || firstEpochSeconds === null) {
          throw new MeasurementError('NO_VALID_SAMPLES', 'CSV contains no measurement samples.');
        }

        const validChannels = channels.filter(
          (channel) => channel.missingSampleCount < sampleCount,
        );

        if (validChannels.length === 0) {
          throw new MeasurementError(
            'NO_NUMERIC_CHANNELS',
            'No non-timestamp column contains a numeric measurement sample.',
          );
        }

        const id = crypto.randomUUID();
        const importedAt = new Date().toISOString();
        const descriptor: DatasetDescriptor = {
          id,
          name: file.name.replace(/\.csv$/i, ''),
          sourceFileName: file.name,
          importedAt,
          sampleCount,
          durationSeconds: lastEpochSeconds - firstEpochSeconds,
          timeOriginEpochSeconds: firstEpochSeconds,
          timestampEncoding: options.timestampEncoding,
          channels: validChannels.map((channel) => ({
            id: channel.id,
            sourceColumn: channel.sourceColumn,
            label: channel.label,
            unit: channel.unit,
            sampleCount,
            missingSampleCount: channel.missingSampleCount,
          })),
        };

        const storedChannels = new Map<string, StoredChannel>();
        let channelValueBytes = 0;
        let envelopeIndexBytes = 0;
        for (const channel of validChannels) {
          // Compact the geometrically grown import buffer. The copy is deliberate:
          // retaining a subarray would pin up to 2x capacity for the dataset lifetime.
          const values = channel.values.slice(0, sampleCount);
          const envelopeIndex = buildChannelEnvelopeIndex(values);
          channelValueBytes += values.byteLength;
          envelopeIndexBytes += envelopeIndex.minIndex.byteLength + envelopeIndex.maxIndex.byteLength +
            envelopeIndex.missingCount.byteLength + envelopeIndex.validCount.byteLength +
            envelopeIndex.mean.byteLength + envelopeIndex.sumSquaredDeviation.byteLength;
          storedChannels.set(channel.id, { values, envelopeIndex });
        }
        const timeAxis = timeValues.slice(0, sampleCount);
        // Cadence is dataset-wide metadata. Computing it during ingestion avoids
        // repeating a 4,096-sample sort for every channel on every viewport query.
        const nominalSampleIntervalSeconds = medianSampleIntervalFromTimes(timeAxis);
        const timeAxisBytes = timeAxis.byteLength;
        const retainedStorageBytes = timeAxisBytes + channelValueBytes + envelopeIndexBytes;

        datasets.set(id, {
          // Keep the retained time axis compact after chunked ingestion.
          timeSeconds: timeAxis,
          nominalSampleIntervalSeconds,
          channels: storedChannels,
        });
        const measuredDescriptor: DatasetDescriptor = {
          ...descriptor, retainedStorageBytes, timeAxisBytes, channelValueBytes, envelopeIndexBytes,
        };

        activeImports.delete(requestId);
        terminal = true;
        post({ type: 'complete', requestId, dataset: measuredDescriptor });
      } catch (error) {
        fail(error);
      }
    },
    error(error) {
      fail(new MeasurementError('INVALID_CSV', error.message));
    },
  });
}
