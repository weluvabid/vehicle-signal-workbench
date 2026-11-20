import { ComparisonWorkspace } from '@/components/comparison/comparison-workspace';

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-[1800px] flex-col overflow-x-clip px-3 sm:px-5 lg:px-6">
      <ComparisonWorkspace />
    </div>
  );
}
