import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <h1 className="text-6xl font-bold text-white mb-4">404</h1>
        <p className="text-white text-lg mb-8">Pagina no encontrada</p>
        <Link
          href="/inicio"
          className="bg-accent text-on-accent px-6 py-3 rounded-2xl font-bold text-sm hover:scale-105 transition-transform inline-block"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
