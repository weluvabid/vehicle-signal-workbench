'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ComparisonWizard } from '@/components/ingestion/comparison-wizard';
import { SignalComparisonPlot } from '@/components/comparison/signal-comparison-plot';
import { useComparisonWorkspace } from '@/features/comparison/use-comparison-workspace';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ImportMetrics {
  readonly durationMs: number;
  readonly totalBytes: number;
}

export function ComparisonWorkspace() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [importMetrics, setImportMetrics] = useState<ImportMetrics | null>(null);
  const {
    client, reference, comparison, offset, overlap,
    compatibleMappings, selectedSignals, setRun,
  } = useComparisonWorkspace();
  const canPlot = Boolean(reference && comparison && overlap && overlap.durationSeconds > 0 && compatibleMappings.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-3">
      <div className="flex shrink-0 justify-end">
        <Button size="icon" variant="outline" aria-label="Add comparison" title="Add comparison" onClick={() => setWizardOpen(true)}><Plus className="size-4" /></Button>
      </div>

      {canPlot && reference && comparison && overlap ? (
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="comparison-results">
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
              ingestionMetrics={importMetrics}
            />
          ) : <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No compatible channels were found between these runs.</CardContent></Card>}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="max-w-md text-center">
            <p className="text-sm text-muted-foreground">Add two measurement runs to see how quickly VSW can ingest, compare and visualize them.</p>
          </div>
        </div>
      )}

      <ComparisonWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        client={client}
        onComplete={(referenceDataset, comparisonDataset, metrics) => {
          setRun('reference', referenceDataset);
          setRun('comparison', comparisonDataset);
          setImportMetrics(metrics);
        }}
      />
    </div>
  );
}
