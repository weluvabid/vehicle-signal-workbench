'use client';

import { useState } from 'react';
import { Activity, ArrowRight, Cpu, Database, LoaderCircle, Zap } from 'lucide-react';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import { generateDriveRecording, WORKLOAD_PRESETS, type DriveRole } from '@/features/ingestion/synthetic-drive';
import type { DatasetDescriptor } from '@/features/measurements/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

interface ComparisonWizardProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly client: MeasurementWorkerClient;
  readonly onComplete: (reference: DatasetDescriptor, comparison: DatasetDescriptor, metrics: { ingestionDurationMs: number; totalBytes: number }) => void;
}

const stages = ['Generate reference', 'Ingest reference', 'Generate comparison', 'Ingest comparison'] as const;
type Stage = 0 | 1 | 2 | 3;

export function ComparisonWizard({ open, onOpenChange, client, onComplete }: ComparisonWizardProps) {
  const [selected, setSelected] = useState('10');
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<Stage>(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const preset = WORKLOAD_PRESETS.find((item) => item.id === selected) ?? WORKLOAD_PRESETS[1];
  const estimatedCsvMiB = (preset.rows * 40 * 2) / 1_048_576;
  const estimatedArrayMiB = (preset.rows * 48 * 2) / 1_048_576;

  function close(next: boolean) {
    if (running) return;
    onOpenChange(next);
    if (!next) {
      setError(null);
      setProgress(0);
      setStage(0);
    }
  }

  async function ingestRole(role: DriveRole, generationStage: Stage, importStage: Stage): Promise<{ dataset: DatasetDescriptor; bytes: number; ingestionDurationMs: number }> {
    setStage(generationStage);
    setProgress(0);
    const file = await generateDriveRecording(preset.rows, role, setProgress);
    setStage(importStage);
    setProgress(0);
    const ingestionStartedAt = performance.now();
    const dataset = await client.import(file, {
      timestampColumn: 'Timestamp',
      timestampEncoding: 'unix-seconds',
    }, setProgress);
    return { dataset, bytes: file.size, ingestionDurationMs: performance.now() - ingestionStartedAt };
  }

  async function start() {
    if (running) return;
    setRunning(true);
    setError(null);
    let reference: DatasetDescriptor | null = null;
    let comparison: DatasetDescriptor | null = null;
    try {
      // Import one recording at a time so the generated CSV can be released before
      // creating the second recording. The measurement worker remains the sole owner
      // of parsed arrays and indexes.
      const referenceResult = await ingestRole('reference', 0, 1);
      reference = referenceResult.dataset;
      const comparisonResult = await ingestRole('comparison', 2, 3);
      comparison = comparisonResult.dataset;
      onComplete(reference, comparison, {
        ingestionDurationMs: referenceResult.ingestionDurationMs + comparisonResult.ingestionDurationMs,
        totalBytes: referenceResult.bytes + comparisonResult.bytes,
      });
      onOpenChange(false);
    } catch (cause) {
      if (reference) client.releaseDataset(reference.id);
      if (comparison) client.releaseDataset(comparison.id);
      setError(cause instanceof Error ? cause.message : 'The generated measurement workload could not be imported.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!running}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-lg border bg-muted/40"><Activity className="size-4" /></div>
            <div>
              <DialogTitle>Choose a measurement workload</DialogTitle>
              <DialogDescription className="mt-1">Generate two correlated vehicle recordings locally, then ingest them through the measurement worker.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!running ? <div className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div><h3 className="text-sm font-medium">Workload size</h3><p className="text-xs text-muted-foreground">Per recording · Reference and Comparison</p></div>
              <Badge variant="secondary">Mixed drive cycle</Badge>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Dataset size">
              {WORKLOAD_PRESETS.map((item) => <Button
                key={item.id}
                type="button"
                size="sm"
                variant={selected === item.id ? 'default' : 'outline'}
                aria-pressed={selected === item.id}
                onClick={() => setSelected(item.id)}
                className="rounded-full px-4"
              >{item.label}</Button>)}
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{preset.label} × 2 recordings</span><span className="text-sm font-semibold tabular-nums">{(preset.rows * 2).toLocaleString('en-US')} total rows</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{preset.description} · {preset.rows.toLocaleString('en-US')} rows in each recording · up to 10 million per recording.</p>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3">
                <div><p className="text-[11px] text-muted-foreground">Estimated CSV input · both</p><p className="mt-1 text-sm font-medium tabular-nums">~{estimatedCsvMiB.toFixed(1)} MiB</p></div>
                <div><p className="text-[11px] text-muted-foreground">Base typed-array payload</p><p className="mt-1 text-sm font-medium tabular-nums">~{estimatedArrayMiB.toFixed(1)} MiB</p></div>
              </div>
            </div>
          </section>

          <Separator />
          <section className="grid gap-3 sm:grid-cols-2">
            <Card size="sm" className="bg-muted/10">
              <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><span className="size-2 rounded-full bg-zinc-400" />Reference</CardDescription><CardTitle className="text-base">Baseline drive</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">Nominal sensor readings with deterministic measurement noise.</CardContent>
            </Card>
            <Card size="sm" className="bg-muted/10">
              <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><span className="size-2 rounded-full bg-blue-400" />Comparison</CardDescription><CardTitle className="text-base">Candidate drive</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground">Same drive cycle with small sensor bias, response offset and independent noise.</CardContent>
            </Card>
          </section>
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <div className="flex items-center gap-2"><Database className="size-3.5" />Generated in browser</div>
            <div className="flex items-center gap-2"><Cpu className="size-3.5" />Worker-based ingestion</div>
            <div className="flex items-center gap-2"><Zap className="size-3.5" />No upload or backend</div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end"><Button onClick={() => void start()}>Generate &amp; ingest <ArrowRight className="size-4" /></Button></div>
        </div> : <div className="space-y-5 py-2">
          <div className="space-y-1"><h3 className="font-medium">Preparing measurement workspace</h3><p className="text-sm text-muted-foreground">Generating and importing {preset.rows.toLocaleString('en-US')} samples per recording. Processing stays in this browser.</p></div>
          <div className="space-y-3">
            {stages.map((label, index) => <div key={label} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm"><span className={index === stage ? 'font-medium' : 'text-muted-foreground'}>{label}</span><span className="text-xs tabular-nums text-muted-foreground">{index < stage ? 'Complete' : index === stage ? `${Math.round(progress * 100)}%` : 'Waiting'}</span></div>
              <Progress value={index < stage ? 100 : index === stage ? progress * 100 : 0} className="h-1.5" />
            </div>)}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />{stages[stage]}</div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>}
      </DialogContent>
    </Dialog>
  );
}

