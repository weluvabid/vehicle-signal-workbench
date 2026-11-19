import Image from 'next/image';
import Link from 'next/link';
import { Github, Plus } from 'lucide-react';
import ghostMark from '../../../brand/me/brand/mark.svg';
import { Button } from '@/components/ui/button';

interface SiteHeaderProps {
  onNewWorkload: () => void;
}

export function SiteHeader({ onNewWorkload }: SiteHeaderProps) {
  return (
    <header className="sticky top-3 z-50 isolate mx-auto mt-3 flex w-full shrink-0 items-center justify-between gap-3 rounded-full border border-foreground/15 bg-background/80 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur-[10px] sm:px-4">
      <Link
        href="/"
        aria-label="Vehicle Signal Workbench home"
        className="grid size-9 shrink-0 place-items-center rounded-full transition-opacity hover:opacity-80"
      >
        <Image src={ghostMark} alt="" priority className="size-8 object-contain" />
      </Link>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-9 rounded-full"
          onClick={onNewWorkload}
          aria-label="New workload"
          title="New workload"
        >
          <Plus className="size-[18px]" />
        </Button>
        <a
          href="https://github.com/weluvabid/vehicle-signal-workbench"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub repository"
          title="GitHub"
          className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Github className="size-[17px]" />
        </a>
      </div>
    </header>
  );
}
