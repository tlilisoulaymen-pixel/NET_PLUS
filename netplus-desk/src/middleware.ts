import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextRequest, NextResponse } from 'next/server';

const intlMiddleware = createMiddleware(routing);

// Routes that do NOT require authentication
const PUBLIC_PATHS = ['/login', '/api'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.endsWith('/login'));
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let Next.js internals and static assets pass through
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // Check for Frappe session cookie
  const sid = request.cookies.get('sid')?.value;
  const isAuthenticated = sid && sid !== 'Guest';

  if (!isAuthenticated && !isPublic(pathname)) {
    // Redirect to login, preserving locale prefix
    const locale = pathname.split('/')[1];
    const validLocales = ['en', 'fr', 'ar', 'es', 'pt'];
    const localePrefix = validLocales.includes(locale) ? `/${locale}` : '/en';
    const loginUrl = new URL(`${localePrefix}/login`, request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If already authenticated and hitting /login, redirect to /desk
  if (isAuthenticated && isPublic(pathname)) {
    const locale = pathname.split('/')[1];
    const validLocales = ['en', 'fr', 'ar', 'es', 'pt'];
    const localePrefix = validLocales.includes(locale) ? `/${locale}` : '/en';
    return NextResponse.redirect(new URL(`${localePrefix}/desk`, request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  // Match all routes except static files
  matcher: ['/', '/(fr|en|pt|ar|es)/:path*', '/((?!_next|_vercel|.*\\..*).*)']
};
