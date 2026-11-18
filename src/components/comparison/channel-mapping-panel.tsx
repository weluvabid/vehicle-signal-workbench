'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import {
  createManualChannelMapping,
  suggestChannelMappings,
  type ChannelMapping,
} from '@/features/measurements/channel-mapping';
import type { DatasetDescriptor } from '@/features/measurements/model';
import { MAPPING_COMPATIBILITY, MAPPING_PRESENTATION } from '@/features/measurements/mapping-constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ChannelMappingPanelProps {
  readonly leftDataset: DatasetDescriptor;
  readonly rightDataset: DatasetDescriptor;
  readonly onChange?: (mappings: readonly ChannelMapping[]) => void;
}

export function ChannelMappingPanel({ leftDataset, rightDataset, onChange }: ChannelMappingPanelProps) {
  const suggestions = useMemo(() => suggestChannelMappings(leftDataset, rightDataset), [leftDataset, rightDataset]);
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(suggestions.map(({ left, right }) => [left.id, right?.id ?? 'unmapped'])),
  );
  const mappings = useMemo(() => leftDataset.channels.map((left) => {
    const rightId = selected[left.id] ?? 'unmapped';
    const right = rightId === 'unmapped' ? null : rightDataset.channels.find((channel) => channel.id === rightId) ?? null;
    return createManualChannelMapping(left, right);
  }), [leftDataset.channels, rightDataset.channels, selected]);
  const mappingByLeftId = useMemo(() => new Map(mappings.map((mapping) => [mapping.leftChannelId, mapping])), [mappings]);
  const suggestionByLeftId = useMemo(() => new Map(suggestions.map((suggestion) => [suggestion.left.id, suggestion])), [suggestions]);

  function updateSelection(leftChannelId: string, rightChannelId: string | null) {
    const next = { ...selected, [leftChannelId]: rightChannelId ?? 'unmapped' };
    setSelected(next);
    onChange?.(leftDataset.channels.map((left) => {
      const selectedId = next[left.id] ?? 'unmapped';
      const right = selectedId === 'unmapped' ? null : rightDataset.channels.find((channel) => channel.id === selectedId) ?? null;
      return createManualChannelMapping(left, right);
    }));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardDescription className="font-medium uppercase tracking-wider">Channel mapping</CardDescription>
          <CardTitle className="text-base">Match equivalent signals</CardTitle>
          <CardDescription className="flex items-center gap-2"><span className="max-w-48 truncate">{leftDataset.name}</span><ArrowLeftRight className="size-3.5 shrink-0" /><span className="max-w-48 truncate">{rightDataset.name}</span></CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Reference channel</TableHead><TableHead>Comparison channel</TableHead><TableHead className="w-36">Compatibility</TableHead></TableRow></TableHeader>
            <TableBody>
              {leftDataset.channels.map((left) => {
                const mapping = mappingByLeftId.get(left.id);
                const suggestion = suggestionByLeftId.get(left.id);
                const presentation = MAPPING_PRESENTATION[mapping?.compatibility ?? MAPPING_COMPATIBILITY.UNMATCHED];
                return (
                  <TableRow key={left.id}>
                    <TableCell className="min-w-40"><div className="font-medium">{left.label}</div><div className="text-xs text-muted-foreground">{left.unit ?? 'Unit unspecified'}</div></TableCell>
                    <TableCell className="min-w-56">
                      <Select value={selected[left.id] ?? 'unmapped'} onValueChange={(value) => updateSelection(left.id, value === 'unmapped' ? null : value)}>
                        <SelectTrigger aria-label={`Map ${left.label} to comparison channel`}><SelectValue placeholder="Not mapped" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unmapped">Not mapped</SelectItem>
                          {rightDataset.channels.map((right) => <SelectItem key={right.id} value={right.id}>{right.label} · {right.unit ?? 'unit unspecified'}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {suggestion?.right && <p className="mt-1 text-xs text-muted-foreground">Suggested: {suggestion.reason}</p>}
                    </TableCell>
                    <TableCell><Badge variant={mapping?.compatibility === MAPPING_COMPATIBILITY.COMPATIBLE ? 'default' : mapping?.compatibility === MAPPING_COMPATIBILITY.UNIT_MISMATCH ? 'outline' : 'secondary'}>{presentation.label}</Badge>{mapping && mapping.compatibility !== MAPPING_COMPATIBILITY.COMPATIBLE && <p className="mt-1 text-xs text-muted-foreground">{suggestion?.reason ?? mapping.reason}</p>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Automatic suggestions require exact normalized names and matching units. No unit conversion or fuzzy matching is performed.</p>
      </CardContent>
    </Card>
  );
}
