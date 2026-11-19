'use client';

import { useState } from 'react';
import { Activity, ArrowRight } from 'lucide-react';
import { ComparisonWizard } from '@/components/ingestion/comparison-wizard';
import { SignalComparisonPlot } from '@/components/comparison/signal-comparison-plot';
import { useComparisonWorkspace } from '@/features/comparison/use-comparison-workspace';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site/site-header';
import { Card, CardContent } from '@/components/ui/card';

interface ImportMetrics {
  readonly ingestionDurationMs: number;
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
      <SiteHeader onNewWorkload={() => setWizardOpen(true)} />

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
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <div className="w-full max-w-2xl space-y-6">
            <div className="space-y-2 text-center">
              <BadgeLine />
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Explore vehicle measurements at scale.</h1>
              <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">Generate a realistic pair of vehicle recordings and compare millions of timestamped samples entirely in your browser.</p>
            </div>
            <Card className="border-border/80 bg-card/60">
              <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:p-8">
                <div className="grid size-12 place-items-center rounded-xl border bg-muted/30"><Activity className="size-5" /></div>
                <div className="space-y-1"><p className="font-medium">Start with a generated drive cycle</p><p className="text-xs text-muted-foreground">Choose a workload from 1 MB to 400 MB per recording. No files to find or upload.</p></div>
                <Button onClick={() => setWizardOpen(true)}>Choose workload <ArrowRight className="size-4" /></Button>
                <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground"><span>Browser-generated data</span><span>Worker-based ingestion</span><span>Up to 10M rows per run</span></div>
              </CardContent>
            </Card>
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

function BadgeLine() {
  return <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">VSW · Vehicle measurement analysis</p>;
}
