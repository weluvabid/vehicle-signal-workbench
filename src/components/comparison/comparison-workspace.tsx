'use client';

import { useState } from 'react';
import { Activity, ArrowLeftRight, Check, ChevronUp, Settings2, SlidersHorizontal } from 'lucide-react';
import { CsvImportPanel } from '@/components/ingestion/csv-import-panel';
import { ChannelMappingPanel } from '@/components/comparison/channel-mapping-panel';
import { SignalComparisonPlot } from '@/components/comparison/signal-comparison-plot';
import { useComparisonWorkspace } from '@/features/comparison/use-comparison-workspace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ComparisonWorkspace() {
  const [controlsOpen, setControlsOpen] = useState(false);
  const {
    client, reference, comparison, offset, offsetInput, setOffsetInput, validOffset, overlap,
    suggestedMappings, compatibleCount, compatibleMappings, effectiveSelectedChannelIds,
    selectedSignals, setMappings, setRun, toggleSelectedChannel,
  } = useComparisonWorkspace();
  const ready = Boolean(reference && comparison);
  const canPlot = Boolean(overlap && overlap.durationSeconds > 0 && compatibleMappings.length > 0);

  return (
    <div className="flex min-h-[min(72vh,900px)] flex-1 flex-col gap-5 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="size-4" />
          {ready ? <><span>{reference?.name}</span><ArrowLeftRight className="size-3.5" /><span>{comparison?.name}</span></> : 'Import two measurement runs to begin'}
        </div>
        <div className="flex items-center gap-2">
          {ready && <Badge variant={canPlot ? 'default' : 'secondary'}>{compatibleCount}/{suggestedMappings.length} compatible · {canPlot ? `${selectedSignals.length} signals selected` : 'Setup required'}</Badge>}
          <Sheet open={controlsOpen} onOpenChange={setControlsOpen}>
            <SheetTrigger render={<Button variant="outline" size="sm"><SlidersHorizontal className="size-4" /> Workspace controls</Button>} />
            <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto">
              <SheetHeader className="mx-auto w-full max-w-6xl px-0 text-left">
                <SheetTitle>Workspace controls</SheetTitle>
                <SheetDescription>Manage measurement runs, timeline alignment, channel mapping and visible signals.</SheetDescription>
              </SheetHeader>
              <div className="mx-auto w-full max-w-6xl pb-8">
                <Tabs defaultValue="runs" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 sm:w-[420px]">
                    <TabsTrigger value="runs">Runs</TabsTrigger>
                    <TabsTrigger value="alignment" disabled={!ready}>Alignment</TabsTrigger>
                    <TabsTrigger value="channels" disabled={!ready}>Channels</TabsTrigger>
                  </TabsList>
                  <TabsContent value="runs" className="mt-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <CsvImportPanel title="Reference run" role="reference" client={client} dataset={reference} onDataset={(dataset) => setRun('reference', dataset)} />
                      <CsvImportPanel title="Comparison run" role="comparison" client={client} dataset={comparison} onDataset={(dataset) => setRun('comparison', dataset)} />
                    </div>
                  </TabsContent>
                  {reference && comparison && <>
                    <TabsContent value="alignment" className="mt-5">
                      <Card><CardHeader><CardTitle className="text-base">Timeline alignment</CardTitle><CardDescription>Set the comparison offset in the workspace summary above the visualization. Samples remain on their native time axes.</CardDescription></CardHeader></Card>
                    </TabsContent>
                    <TabsContent value="channels" className="mt-5 space-y-5">
                      <ChannelMappingPanel key={`${reference.id}:${comparison.id}`} leftDataset={reference} rightDataset={comparison} onChange={setMappings} />
                      <Card>
                        <CardHeader><CardTitle className="text-base">Visible signals</CardTitle><CardDescription>{compatibleCount} of {suggestedMappings.length} channels have conservative exact-name and unit matches. Select up to six.</CardDescription></CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {compatibleMappings.map((mapping) => {
                            const channel = reference.channels.find((item) => item.id === mapping.leftChannelId);
                            const checked = effectiveSelectedChannelIds.includes(mapping.leftChannelId);
                            return <Label key={mapping.leftChannelId} className="flex min-w-0 items-center gap-3 rounded-md border p-3 font-normal">
                              <Checkbox checked={checked} disabled={!checked && effectiveSelectedChannelIds.length >= 6} onCheckedChange={(value) => toggleSelectedChannel(mapping.leftChannelId, value === true)} />
                              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{channel?.label ?? mapping.leftChannelId}</span><span className="text-xs text-muted-foreground">{channel?.unit ?? 'No unit'}</span></span>
                              {checked && <Check className="size-4 text-primary" />}
                            </Label>;
                          })}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </>}
                </Tabs>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {ready && overlap && <Card className="shrink-0" data-testid="overlap-summary" aria-live="polite">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div><p className="text-xs text-muted-foreground">Shared interval</p><p className="text-sm font-medium tabular-nums">{overlap.startSeconds.toFixed(3)}–{overlap.endSeconds.toFixed(3)} s</p></div>
            <div><p className="text-xs text-muted-foreground">Overlap duration</p><p className="text-sm font-medium tabular-nums">{overlap.durationSeconds.toFixed(3)} s</p></div>
            <Badge variant={overlap.durationSeconds > 0 ? 'default' : 'destructive'}>{overlap.durationSeconds > 0 ? 'Timeline overlap available' : 'No timeline overlap'}</Badge>
            <p className="w-full text-xs text-muted-foreground">{overlap.durationSeconds > 0 ? 'Both runs cover this interval. Samples remain on their native time axes; no interpolation has been applied.' : 'These runs do not share a time interval at the current offset.'}</p>
          </div>
          <div className="w-full space-y-1 sm:w-52"><Label htmlFor="comparison-offset">Comparison offset (seconds)</Label><Input id="comparison-offset" data-testid="comparison-offset" type="number" step="any" value={offsetInput} onChange={(event) => setOffsetInput(event.target.value)} aria-invalid={!validOffset} /></div>
          {!validOffset && <p className="w-full text-sm text-destructive" role="alert">Enter a finite offset in seconds.</p>}
        </CardContent>
      </Card>}

      {canPlot && reference && comparison && overlap ? (
        <section className="min-w-0 flex-1 space-y-3" aria-labelledby="plot-workspace-title" data-testid="plot-workspace">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Comparison view</p><h2 id="plot-workspace-title" className="text-lg font-semibold tracking-tight">Synchronized signal analysis</h2><p className="text-sm text-muted-foreground">Linked zoom, pan, timeline and crosshair across {selectedSignals.length} selected channels.</p></div>
            <Button variant="ghost" size="sm" onClick={() => setControlsOpen(true)}><Settings2 className="size-4" /> Configure signals</Button>
          </div>
          {selectedSignals.length > 0 ? <SignalComparisonPlot key={`${reference.id}:${comparison.id}:${selectedSignals.map((item) => item.referenceChannelId).join(',')}`} client={client} reference={reference} comparison={comparison} selections={selectedSignals} offsetSeconds={offset} startSeconds={overlap.startSeconds} endSeconds={overlap.endSeconds} /> : <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Select at least one mapped channel in workspace controls.</CardContent></Card>}
        </section>
      ) : (
        <Card className="flex min-h-[360px] flex-1 items-center justify-center border-dashed">
          <CardContent className="max-w-md space-y-3 py-12 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-xl border bg-muted"><Activity className="size-5 text-muted-foreground" /></div>
            <h2 className="text-lg font-semibold">Your comparison workspace</h2>
            <p className="text-sm leading-6 text-muted-foreground">Import a reference run and a comparison run. Once compatible channels and a shared time interval are available, synchronized signal plots will appear here.</p>
            <Button onClick={() => setControlsOpen(true)}><SlidersHorizontal className="size-4" /> Configure measurement runs</Button>
          </CardContent>
        </Card>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">{reference ? <Check className="size-3.5 text-primary" /> : <span className="size-2 rounded-full bg-muted-foreground" />} Reference</span>
            <Separator orientation="vertical" className="h-4" />
            <span className="flex items-center gap-1.5">{comparison ? <Check className="size-3.5 text-primary" /> : <span className="size-2 rounded-full bg-muted-foreground" />} Comparison</span>
            {ready && <><Separator orientation="vertical" className="hidden h-4 sm:block" /><span className="hidden sm:inline">{compatibleCount} compatible channels</span></>}
          </div>
          <Button size="sm" onClick={() => setControlsOpen(true)}><Settings2 className="size-4" /> Manage workspace <ChevronUp className="size-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}
