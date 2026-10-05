import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies: CookieToSet[]) =>
          cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL('/auth', req.url));

  // Web has no onboarding of its own: a profile that hasn't finished mobile's onboarding steps
  // would reach a shell with nothing to show (the old blank /app). Send it to the "finish in the
  // app" page instead. Only an existing row with onboarded_at null is gated — a missing row is the
  // auth flow's create-account case, and a failed read lets the request through rather than lock
  // anyone out.
  if (req.nextUrl.pathname.startsWith('/app')) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('onboarded_at')
      .eq('id', user.id)
      .maybeSingle();
    if (!error && profile && profile.onboarded_at === null) {
      const redirect = NextResponse.redirect(new URL('/onboarding', req.url));
      res.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie)); // keep a refreshed session
      return redirect;
    }
  }
  return res;
}

export const config = {
  matcher: ['/app/:path*', '/onboarding', '/dashboard/:path*', '/super-admin/:path*'],
};
