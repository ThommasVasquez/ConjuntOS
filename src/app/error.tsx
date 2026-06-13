'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#0D041A] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-8 text-center">
        <h2 className="text-xl font-bold text-white mb-2">Algo salio mal</h2>
        <p className="text-white/60 text-sm mb-6">
          {error.message || 'Error inesperado. Por favor intenta de nuevo.'}
        </p>
        <button
          onClick={reset}
          className="bg-accent text-on-accent px-6 py-3 rounded-2xl font-bold text-sm hover:scale-105 transition-transform"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}
