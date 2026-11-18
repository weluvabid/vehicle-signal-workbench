'use client';

import { useMemo, useState } from 'react';
import {
  createManualChannelMapping,
  suggestChannelMappings,
  type ChannelMapping,
} from '@/features/measurements/channel-mapping';
import type { DatasetDescriptor } from '@/features/measurements/model';
import { MAPPING_COMPATIBILITY, MAPPING_PRESENTATION } from '@/features/measurements/mapping-constants';

interface ChannelMappingPanelProps {
  readonly leftDataset: DatasetDescriptor;
  readonly rightDataset: DatasetDescriptor;
  readonly onChange?: (mappings: readonly ChannelMapping[]) => void;
}

export function ChannelMappingPanel({
  leftDataset,
  rightDataset,
  onChange,
}: ChannelMappingPanelProps) {
  const suggestions = useMemo(
    () => suggestChannelMappings(leftDataset, rightDataset),
    [leftDataset, rightDataset],
  );

  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      suggestions.map(({ left, right }) => [left.id, right?.id ?? '']),
    ),
  );

  const mappings = useMemo(
    () =>
      leftDataset.channels.map((left) => {
        const rightId = selected[left.id] ?? '';
        const right = rightDataset.channels.find((channel) => channel.id === rightId) ?? null;
        return createManualChannelMapping(left, right);
      }),
    [leftDataset.channels, rightDataset.channels, selected],
  );
  const mappingByLeftId = useMemo(
    () => new Map(mappings.map((mapping) => [mapping.leftChannelId, mapping])),
    [mappings],
  );
  const suggestionByLeftId = useMemo(
    () => new Map(suggestions.map((suggestion) => [suggestion.left.id, suggestion])),
    [suggestions],
  );

  const compatibleCount = mappings.filter(
    (mapping) => mapping.compatibility === MAPPING_COMPATIBILITY.COMPATIBLE,
  ).length;

  function updateSelection(leftChannelId: string, rightChannelId: string) {
    const next = { ...selected, [leftChannelId]: rightChannelId };
    setSelected(next);

    const nextMappings = leftDataset.channels.map((left) => {
      const selectedId = next[left.id] ?? '';
      const right = rightDataset.channels.find((channel) => channel.id === selectedId) ?? null;
      return createManualChannelMapping(left, right);
    });

    onChange?.(nextMappings);
  }

  return (
    <section className="mapping-panel" aria-labelledby="mapping-title">
      <header className="mapping-heading">
        <div>
          <p className="eyebrow">CHANNEL MAPPING</p>
          <h2 id="mapping-title">Match equivalent signals</h2>
          <p>
            {leftDataset.name} <span aria-hidden="true">↔</span> {rightDataset.name}
          </p>
        </div>
        <span className="mapping-count">
          {compatibleCount}/{mappings.length} compatible
        </span>
      </header>

      <div className="mapping-table" role="table" aria-label="Channel mappings">
        <div className="mapping-row mapping-header" role="row">
          <span role="columnheader">Reference run</span>
          <span role="columnheader">Comparison run</span>
          <span role="columnheader">Compatibility</span>
        </div>
        {leftDataset.channels.map((left) => {
          const mapping = mappingByLeftId.get(left.id);
          const suggestion = suggestionByLeftId.get(left.id);

          return (
            <div className="mapping-row" role="row" key={left.id}>
              <div role="cell">
                <strong>{left.label}</strong>
                <small>{left.unit ?? 'unit unspecified'}</small>
              </div>
              <div role="cell">
                <select
                  aria-label={`Map ${left.label} to comparison channel`}
                  value={selected[left.id] ?? ''}
                  onChange={(event) => updateSelection(left.id, event.target.value)}
                >
                  <option value="">Not mapped</option>
                  {rightDataset.channels.map((right) => (
                    <option key={right.id} value={right.id}>
                      {right.label} · {right.unit ?? 'unit unspecified'}
                    </option>
                  ))}
                </select>
                {suggestion?.right && (
                  <small className="mapping-reason">Suggested: {suggestion.reason}</small>
                )}
              </div>
              <div role="cell">
                <span className={`mapping-state mapping-${MAPPING_PRESENTATION[mapping?.compatibility ?? MAPPING_COMPATIBILITY.UNMATCHED].className}`}>
                  {MAPPING_PRESENTATION[mapping?.compatibility ?? MAPPING_COMPATIBILITY.UNMATCHED].label}
                </span>
                {mapping && mapping.compatibility !== MAPPING_COMPATIBILITY.COMPATIBLE && (
                  <small className="mapping-reason">{suggestion?.reason ?? mapping.reason}</small>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mapping-footnote">
        Automatic suggestions require exact normalized names and matching units. No unit conversion
        or fuzzy matching is performed.
      </p>
    </section>
  );
}
