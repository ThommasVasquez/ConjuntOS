'use client';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-surface border border-border rounded-3xl p-8 text-center">
        <h2 className="text-xl font-bold text-text mb-2">Error</h2>
        <p className="text-text text-sm mb-6">
          {error.message || 'Ocurrio un error inesperado.'}
        </p>
        <button
          onClick={reset}
          className="bg-accent text-on-accent px-6 py-3 rounded-2xl font-bold text-sm"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
