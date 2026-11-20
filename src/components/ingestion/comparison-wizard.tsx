'use client';

import { useState } from 'react';
import { useComparisonIngestion } from '@/features/ingestion/hooks/use-comparison-ingestion';
import { calculateWorkloadEstimates } from '@/features/ingestion/utils/workload-estimates';
import { INGESTION_LABELS, INGESTION_COPY } from '@/constants/comparison-labels';
import { Activity, ArrowRight, Cpu, Database, Zap } from 'lucide-react';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import { WORKLOAD_PRESETS } from '@/features/ingestion/synthetic-drive';
import type { DatasetDescriptor } from '@/features/measurements/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

interface ComparisonWizardProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly client: MeasurementWorkerClient;
  readonly onComplete: (
    reference: DatasetDescriptor,
    comparison: DatasetDescriptor,
    metrics: { ingestionDurationMs: number; totalBytes: number },
  ) => void;
}

const stages = [
  INGESTION_LABELS.generateReference,
  INGESTION_LABELS.ingestReference,
  INGESTION_LABELS.generateComparison,
  INGESTION_LABELS.ingestComparison,
] as const;

export function ComparisonWizard({
  open,
  onOpenChange,
  client,
  onComplete,
}: ComparisonWizardProps) {
  const [selected, setSelected] = useState('10');
  const { running, stage, progress, error, start, reset } = useComparisonIngestion({
    client,
    onComplete,
    onOpenChange,
  });
  const preset = WORKLOAD_PRESETS.find((item) => item.id === selected) ?? WORKLOAD_PRESETS[1];
  const estimates = calculateWorkloadEstimates(preset);

  function close(next: boolean) {
    if (running) return;

    onOpenChange(next);

    if (!next) reset();
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!running}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="hidden size-9 place-items-center rounded-lg border bg-muted/40 sm:grid">
              <Activity className="size-4" />
            </div>
            <div>
              <DialogTitle>{INGESTION_COPY.dialogTitle}</DialogTitle>
              <DialogDescription className="mt-1">
                {INGESTION_COPY.dialogDescription}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!running ? (
          <div className="space-y-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">{INGESTION_COPY.workloadSize}</h3>
                  <p className="text-xs text-muted-foreground">{INGESTION_COPY.perRecording}</p>
                </div>
                <Badge variant="secondary">{INGESTION_COPY.mixedDriveCycle}</Badge>
              </div>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={INGESTION_COPY.datasetSize}
              >
                {WORKLOAD_PRESETS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={selected === item.id ? 'default' : 'outline'}
                    aria-pressed={selected === item.id}
                    onClick={() => setSelected(item.id)}
                    className="rounded-full px-4"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{preset.label} × 2 recordings</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {estimates.totalRows.toLocaleString('en-US')} {INGESTION_COPY.totalRows}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {preset.description} · {preset.rows.toLocaleString('en-US')}{' '}
                  {INGESTION_COPY.rowsPerRecording}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {INGESTION_COPY.estimatedCsv}
                    </p>
                    <p className="mt-1 text-sm font-medium tabular-nums">
                      ~{estimates.csvMiB.toFixed(1)} MiB
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {INGESTION_COPY.typedArrayPayload}
                    </p>
                    <p className="mt-1 text-sm font-medium tabular-nums">
                      ~{estimates.arrayMiB.toFixed(1)} MiB
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <Separator />
            <section className="grid gap-3 sm:grid-cols-2">
              <Card size="sm" className="bg-muted/10">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-zinc-400" />
                    {INGESTION_LABELS.reference}
                  </CardDescription>
                  <CardTitle className="text-base">{INGESTION_COPY.referenceDrive}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {INGESTION_COPY.referenceDescription}
                </CardContent>
              </Card>
              <Card size="sm" className="bg-muted/10">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-blue-400" />
                    {INGESTION_LABELS.comparison}
                  </CardDescription>
                  <CardTitle className="text-base">{INGESTION_COPY.comparisonDrive}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {INGESTION_COPY.comparisonDescription}
                </CardContent>
              </Card>
            </section>
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Database className="size-3.5" />
                {INGESTION_COPY.generatedInBrowser}
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="size-3.5" />
                {INGESTION_COPY.workerBased}
              </div>
              <div className="flex items-center gap-2">
                <Zap className="size-3.5" />
                {INGESTION_COPY.noBackend}
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error.message}
              </p>
            )}
            <div className="flex justify-end">
              <Button onClick={() => void start(preset)}>
                {INGESTION_COPY.start} <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="space-y-1">
              <h3 className="font-medium">{INGESTION_COPY.preparing}</h3>
              <p className="text-sm text-muted-foreground">
                Generating and importing {preset.rows.toLocaleString('en-US')} samples per
                recording. {INGESTION_COPY.processing}
              </p>
            </div>
            <div className="space-y-3">
              {stages.map((label, index) => (
                <div key={label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className={index === stage ? 'font-medium' : 'text-muted-foreground'}>
                      {label}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {index < stage
                        ? INGESTION_COPY.complete
                        : index === stage
                          ? `${Math.round(progress * 100)}%`
                          : INGESTION_COPY.waiting}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error.message}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
