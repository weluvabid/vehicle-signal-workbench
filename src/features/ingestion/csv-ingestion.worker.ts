import Papa from 'papaparse';
import type { DatasetDescriptor, TimestampEncoding } from '../measurements/model';
import type { ChannelEnvelopeIndex } from '../measurements/windowing';
import { calculateSignalDifferenceInTimeRange, calculateSignalDifferenceSeriesInTimeRange, downsampleDifferenceEnvelope } from '../measurements/difference';
import {
  buildChannelEnvelopeIndex,
  calculateChannelStatistics,
  queryChannelEnvelopeTimeWindow,
  queryChannelTimeWindow,
  queryChannelWindow,
  queryChannelTimeStatistics,
} from '../measurements/windowing';
import { MeasurementError } from '../measurements/errors';
import {
  createChannelId,
  parseColumnLabel,
  parseNumericSample,
  parseTimestamp,
} from './csv-normalization';
import type { IngestionRequest, IngestionResponse } from './worker-protocol';

interface ActiveImport {
  parser: Papa.Parser | null;
  cancelled: boolean;
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

interface StoredChannel {
  readonly values: Float64Array;
  readonly envelopeIndex: ChannelEnvelopeIndex;
}

const datasets = new Map<string, { timeSeconds: Float64Array; channels: Map<string, StoredChannel> }>();
const activeImports = new Map<number, ActiveImport>();
const INITIAL_CAPACITY = 4_096;

function grow(buffer: Float64Array, required: number): Float64Array {
  if (required <= buffer.length) {
    return buffer;
  }

  let capacity = buffer.length;

  while (capacity < required) {
    capacity *= 2;
  }

  const next = new Float64Array(capacity);
  next.set(buffer);
  return next;
}

function post(message: IngestionResponse): void {
  self.postMessage(message);
}

function importCsv(request: Extract<IngestionRequest, { type: 'import' }>): void {
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
            options.timestampEncoding as TimestampEncoding,
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
        for (const channel of validChannels) {
          const values = channel.values.slice(0, sampleCount);
          storedChannels.set(channel.id, { values, envelopeIndex: buildChannelEnvelopeIndex(values) });
        }

        datasets.set(id, {
          timeSeconds: timeValues.slice(0, sampleCount),
          channels: storedChannels,
        });

        activeImports.delete(requestId);
        terminal = true;
        post({ type: 'complete', requestId, dataset: descriptor });
      } catch (error) {
        fail(error);
      }
    },
    error(error) {
      fail(new MeasurementError('INVALID_CSV', error.message));
    },
  });

}

function lowerBound(values: Float64Array, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

self.onmessage = (event: MessageEvent<IngestionRequest>): void => {
  const request = event.data;

  if (request.type === 'release') {
    datasets.delete(request.datasetId);
    return;
  }

  if (request.type === 'query-difference-series') {
    const referenceDataset = datasets.get(request.referenceDatasetId);
    const comparisonDataset = datasets.get(request.comparisonDatasetId);
    const referenceChannel = referenceDataset?.channels.get(request.referenceChannelId);
    const comparisonChannel = comparisonDataset?.channels.get(request.comparisonChannelId);
    if (!referenceDataset || !comparisonDataset || !referenceChannel || !comparisonChannel) {
      post({ type: 'error', requestId: request.requestId, code: 'DIFFERENCE_INPUT_NOT_FOUND',
        message: 'One or both datasets or channels are unavailable in this worker session.' });
      return;
    }
    try {
      if (!Number.isInteger(request.pixelWidth) || request.pixelWidth < 0 || request.pixelWidth > 8_192) {
        throw new RangeError('Difference envelope pixel width must be zero (full export) or between 1 and 8192.');
      }
      if (request.pixelWidth === 0) {
        const exportSamples = lowerBound(referenceDataset.timeSeconds, request.endSeconds) -
          lowerBound(referenceDataset.timeSeconds, request.startSeconds);
        if (exportSamples > 2_000_000) {
          throw new RangeError('The visible interval exceeds the 2,000,000-sample export limit. Zoom into a smaller interval and retry.');
        }
      }
      const result = calculateSignalDifferenceSeriesInTimeRange(
        { datasetId: request.referenceDatasetId, channelId: request.referenceChannelId,
          timeSeconds: referenceDataset.timeSeconds, values: referenceChannel.values },
        { datasetId: request.comparisonDatasetId, channelId: request.comparisonChannelId,
          timeSeconds: comparisonDataset.timeSeconds, values: comparisonChannel.values },
        request.startSeconds, request.endSeconds, request.comparisonOffsetSeconds,
      );
      const bounded = request.pixelWidth > 0
        ? downsampleDifferenceEnvelope(result, Math.min(8_192, request.pixelWidth))
        : result;
      self.postMessage({ type: 'difference-series', requestId: request.requestId, result: bounded }, {
        transfer: [bounded.timeSeconds.buffer, bounded.referenceValues.buffer,
          bounded.comparisonValues.buffer, bounded.delta.buffer],
      });
    } catch (error) {
      post({ type: 'error', requestId: request.requestId, code: 'INVALID_DIFFERENCE_QUERY',
        message: error instanceof Error ? error.message : 'Unable to calculate difference series.' });
    }
    return;
  }

  if (request.type === 'query-difference-statistics') {
    const referenceDataset = datasets.get(request.referenceDatasetId);
    const comparisonDataset = datasets.get(request.comparisonDatasetId);
    const referenceChannel = referenceDataset?.channels.get(request.referenceChannelId);
    const comparisonChannel = comparisonDataset?.channels.get(request.comparisonChannelId);
    if (!referenceDataset || !comparisonDataset || !referenceChannel || !comparisonChannel) {
      post({
        type: 'error', requestId: request.requestId, code: 'DIFFERENCE_INPUT_NOT_FOUND',
        message: 'One or both datasets or channels are unavailable in this worker session.',
      });
      return;
    }
    try {
      const statistics = calculateSignalDifferenceInTimeRange(
        {
          datasetId: request.referenceDatasetId,
          channelId: request.referenceChannelId,
          timeSeconds: referenceDataset.timeSeconds,
          values: referenceChannel.values,
        },
        {
          datasetId: request.comparisonDatasetId,
          channelId: request.comparisonChannelId,
          timeSeconds: comparisonDataset.timeSeconds,
          values: comparisonChannel.values,
        },
        request.startSeconds,
        request.endSeconds,
        request.comparisonOffsetSeconds,
      );
      post({ type: 'difference-statistics', requestId: request.requestId, statistics });
    } catch (error) {
      post({
        type: 'error', requestId: request.requestId, code: 'INVALID_DIFFERENCE_QUERY',
        message: error instanceof Error ? error.message : 'Unable to calculate signal difference.',
      });
    }
    return;
  }

  if (request.type === 'query-window' || request.type === 'query-statistics' || request.type === 'query-time-window' || request.type === 'query-envelope-time-window' || request.type === 'query-time-statistics') {
    const dataset = datasets.get(request.datasetId);
    if (!dataset) {
      post({
        type: 'error',
        requestId: request.requestId,
        code: 'DATASET_NOT_FOUND',
        message: 'The requested dataset is no longer available in this worker session.',
      });
      return;
    }

    const channel = dataset.channels.get(request.channelId);
    if (!channel) {
      post({
        type: 'error',
        requestId: request.requestId,
        code: 'CHANNEL_NOT_FOUND',
        message: 'The requested channel does not exist in this dataset.',
      });
      return;
    }

    try {
      if (request.type === 'query-window' || request.type === 'query-time-window' || request.type === 'query-envelope-time-window') {
        const buffers = { timeSeconds: dataset.timeSeconds, values: channel.values };
        const window = request.type === 'query-envelope-time-window'
          ? queryChannelEnvelopeTimeWindow(
            request.datasetId, request.channelId, buffers, channel.envelopeIndex,
            request.startSeconds, request.endSeconds, request.pixelWidth,
          )
          : request.type === 'query-time-window'
            ? queryChannelTimeWindow(
              request.datasetId, request.channelId, buffers,
              request.startSeconds, request.endSeconds,
            )
            : queryChannelWindow(
              request.datasetId, request.channelId, buffers, request.startIndex, request.endIndex,
            );
        self.postMessage(
          { type: 'window', requestId: request.requestId, window },
          {
            transfer: [
              window.timeSeconds.buffer as ArrayBuffer,
              window.values.buffer as ArrayBuffer,
            ],
          },
        );
      } else {
        const statistics = request.type === 'query-time-statistics'
          ? queryChannelTimeStatistics(
            request.datasetId,
            request.channelId,
            { timeSeconds: dataset.timeSeconds, values: channel.values },
            channel.envelopeIndex,
            request.startSeconds,
            request.endSeconds,
          )
          : calculateChannelStatistics(
            request.datasetId,
            request.channelId,
            channel.values,
            request.startIndex,
            request.endIndex,
          );
        post({ type: 'statistics', requestId: request.requestId, statistics });
      }
    } catch (error) {
      post({
        type: 'error',
        requestId: request.requestId,
        code: 'INVALID_QUERY',
        message: error instanceof Error ? error.message : 'Invalid measurement query.',
      });
    }
    return;
  }

  if (request.type === 'cancel') {
    const active = activeImports.get(request.requestId);
    if (active) {
      active.cancelled = true;
      active.parser?.abort();
      if (active.parser) {
        activeImports.delete(request.requestId);
      }
    }
    return;
  }

  importCsv(request);
};
