'use client';

import { CsvImportPanel } from '@/components/ingestion/csv-import-panel';
import { ChannelMappingPanel } from '@/components/comparison/channel-mapping-panel';
import { SignalComparisonPlot } from '@/components/comparison/signal-comparison-plot';
import { useComparisonWorkspace } from '@/features/comparison/use-comparison-workspace';

export function ComparisonWorkspace() {
  const {
    client, reference, comparison, offset, offsetInput, setOffsetInput, validOffset, overlap,
    suggestedMappings, compatibleCount, compatibleMappings, effectiveSelectedChannelIds,
    selectedSignals, setMappings, setRun, toggleSelectedChannel,
  } = useComparisonWorkspace();

  return (
    <>
      <div className="run-grid">
        <CsvImportPanel title="Reference run" role="reference" client={client} dataset={reference} onDataset={(dataset) => setRun('reference', dataset)} />
        <CsvImportPanel title="Comparison run" role="comparison" client={client} dataset={comparison} onDataset={(dataset) => setRun('comparison', dataset)} />
      </div>

      {reference && comparison && (
        <>
          <section className="alignment-panel" aria-labelledby="alignment-title">
            <div className="alignment-heading">
              <div>
                <p className="eyebrow">TIME ALIGNMENT</p>
                <h2 id="alignment-title">Align the run timelines</h2>
                <p>Offset is added to comparison-run elapsed time to place it on the reference timeline.</p>
              </div>
              <label className="offset-control">
                <span>Comparison offset (seconds)</span>
                <input aria-label="Comparison offset (seconds)" data-testid="comparison-offset" type="number" step="any" value={offsetInput} onChange={(event) => setOffsetInput(event.target.value)} />
              </label>
            </div>
            {overlap && (
              <div className="overlap-summary" aria-live="polite" data-testid="overlap-summary">
                <div><span>Shared interval</span><strong>{overlap.startSeconds.toFixed(3)}–{overlap.endSeconds.toFixed(3)} s</strong></div>
                <div><span>Overlap duration</span><strong>{overlap.durationSeconds.toFixed(3)} s</strong></div>
                <p>{overlap.durationSeconds > 0
                  ? 'Both runs cover this interval. Samples remain on their native time axes; no interpolation has been applied.'
                  : 'These runs do not share a time interval at the current offset.'}</p>
              </div>
            )}
            {!validOffset && <p className="import-error" role="alert">Enter a finite offset in seconds.</p>}
          </section>

          <ChannelMappingPanel
            key={`${reference.id}:${comparison.id}`}
            leftDataset={reference}
            rightDataset={comparison}
            onChange={setMappings}
          />
          <p className="mapping-footnote workspace-footnote">
            {compatibleCount} of {suggestedMappings.length} channels have conservative exact-name and unit matches. Confirm mappings before comparison; conversion and resampling are not part of this phase.
          </p>
          {overlap && overlap.durationSeconds > 0 && compatibleMappings.length > 0 && (
            <section className="plot-workspace" aria-labelledby="plot-workspace-title" data-testid="plot-workspace">
              <div className="plot-toolbar">
                <div><p className="eyebrow">COMPARISON VIEW</p><h2 id="plot-workspace-title">Inspect synchronized signals</h2><p className="plot-toolbar-copy">Select up to six channels. All panels share zoom, pan, timeline and crosshair.</p></div>
                <span className="selection-count">{selectedSignals.length} / 6 selected</span>
              </div>
              <fieldset className="signal-selection" aria-label="Signals to display">
                <legend>Mapped signals</legend>
                {compatibleMappings.map((mapping) => {
                  const channel = reference.channels.find((item) => item.id === mapping.leftChannelId);
                  const checked = effectiveSelectedChannelIds.includes(mapping.leftChannelId);
                  return (
                    <label className="signal-selection-option" key={mapping.leftChannelId}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && effectiveSelectedChannelIds.length >= 6}
                        onChange={(event) => toggleSelectedChannel(mapping.leftChannelId, event.target.checked)}
                      />
                      <span>{channel?.label ?? mapping.leftChannelId}</span>
                      <small>{channel?.unit ?? 'No unit'}</small>
                    </label>
                  );
                })}
              </fieldset>
              {selectedSignals.length > 0 ? (
                <SignalComparisonPlot
                  key={`${reference.id}:${comparison.id}:${selectedSignals.map((item) => item.referenceChannelId).join(',')}`}
                  client={client}
                  reference={reference}
                  comparison={comparison}
                  selections={selectedSignals}
                  offsetSeconds={offset}
                  startSeconds={overlap.startSeconds}
                  endSeconds={overlap.endSeconds}
                />
              ) : <p className="plot-empty">Select at least one mapped channel to inspect its signals.</p>}
            </section>
          )}
          {compatibleMappings.length === 0 && <p className="plot-empty">Import both runs and confirm at least one channel mapping with matching units to inspect signals.</p>}
        </>
      )}
    </>
  );
}
