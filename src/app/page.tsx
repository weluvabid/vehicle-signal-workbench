import Link from 'next/link';
import { ComparisonWorkspace } from '@/components/comparison/comparison-workspace';
import { Activity, HardDrive } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="workspace">
      <header className="topbar">
        <Link className="wordmark" href="/" aria-label="Vehicle Signal Workbench home">
          <span className="wordmark-mark" aria-hidden="true"><Activity size={15} /></span>
          <span>Vehicle Signal Workbench</span>
        </Link>
        <span className="topbar-meta"><HardDrive size={12} aria-hidden="true" /> LOCAL · IN-BROWSER</span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">MEASUREMENT ANALYSIS</p>
        <h1 id="page-title">Compare vehicle runs.</h1>
        <p className="intro-copy">
          Import a baseline and a candidate run, map equivalent channels, and establish their shared time interval before inspecting signal differences.
        </p>
      </section>

      <ComparisonWorkspace />

      <footer className="page-footer">
        <span>PHASE 9 · SIGNAL COMPARISON</span>
        <span>Data remains in this browser session</span>
      </footer>
    </main>
  );
}
