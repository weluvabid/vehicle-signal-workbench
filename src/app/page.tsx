import { ComparisonWorkspace } from '@/components/comparison/comparison-workspace';

export default function HomePage() {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[1800px] flex-col overflow-hidden px-3 sm:px-5 lg:px-6">
      <ComparisonWorkspace />
    </main>
  );
}
