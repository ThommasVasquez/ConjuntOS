import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    // Match all request paths except for the ones starting with:
    // api, _next/static, _next/image, favicon.ico (and common static assets)
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*$).*)'
  ],
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // BYPASS BRANDING ASSETS - Stage 29
  if (pathname.endsWith('.svg') || pathname === '/energysoftmedia.svg') {
    return NextResponse.next();
  }

  // const url = request.nextUrl
  
  // Get hostname (e.g. 'conjunto1.conjuntoapp.co' or 'localhost:3000')
  const hostname = request.headers.get('host') || ''
  
  // Configured default domain 
  // TODO: Use env variable for production (e.g. 'conjuntoapp.co')
  const rootDomain = 'localhost:3000'

  // Extract subdomain if it exists
  const currentHost = hostname.replace(`.${rootDomain}`, '')
  
  // Si estamos en el dominio raíz, no hacemos nada especial o redirigimos a landing
  if (currentHost === rootDomain || currentHost === 'admin') {
    return NextResponse.next()
  }

  // Create response and set our custom header to be picked up by Server Components
  const response = NextResponse.next()
  
  // Guardamos el subdominio (tenant/conjuntoId) en el header para consumirlo
  // del lado del servidor usando headers()
  response.headers.set('x-tenant-id', currentHost)

  // Opcionalmente podemos reescribir la URL para tener rutas distintas por tenant
  // ej: return NextResponse.rewrite(new URL(`/${currentHost}${url.pathname}`, request.url))
  
  return response
}
