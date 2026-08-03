import { AtriumApp } from "@/components/demo/AtriumApp";

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>;
}) {
  const { runId } = await searchParams;
  return <AtriumApp initialRunId={runId} />;
}
