export default function HealthFeature() {
  return (
    <div className="p-6 space-y-2">
      <h2 className="text-lg font-semibold">Module isolation OK</h2>
      <p className="text-sm text-neutral-400">
        This module loaded lazily, behind its own error boundary. If you crash it,
        the rest of the app keeps running. See ADR-0003.
      </p>
    </div>
  );
}
