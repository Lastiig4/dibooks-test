import { NextResponse, type NextRequest } from "next/server";

const DEV_ACCESS_COOKIE = "dibooks-dev-access";

function getMaintenanceMode() {
  // Zet in Vercel Environment Variables:
  // DIBOOKS_MAINTENANCE_MODE=true  = offline/onderhoud
  // DIBOOKS_MAINTENANCE_MODE=false = online
  // Voor veiligheid staat maintenance standaard AAN als de variabele ontbreekt.
  const value =
    process.env.DIBOOKS_MAINTENANCE_MODE ??
    process.env.NEXT_PUBLIC_MAINTENANCE_MODE ??
    "true";

  return value.toLowerCase() !== "false";
}

function getDevAccessCode() {
  return (
    process.env.DIBOOKS_DEV_ACCESS_CODE ??
    process.env.NEXT_PUBLIC_DEV_ACCESS_CODE ??
    "lastiig"
  );
}

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots") ||
    pathname.startsWith("/sitemap") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|json|mp4|webm|mov|woff|woff2|ttf)$/i.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (isPublicAsset(pathname) || pathname === "/maintenance") {
    return NextResponse.next();
  }

  const devCode = getDevAccessCode();
  const devParam = searchParams.get("dev");
  const clearDev = searchParams.get("clear-dev") === "1";
  const devCookie = request.cookies.get(DEV_ACCESS_COOKIE)?.value;
  const hasDevAccess = devParam === devCode || devCookie === devCode;

  if (clearDev) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete("clear-dev");
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.delete(DEV_ACCESS_COOKIE);
    return response;
  }

  if (!getMaintenanceMode()) {
    const response = NextResponse.next();

    if (devParam === devCode) {
      response.cookies.set(DEV_ACCESS_COOKIE, devCode, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
      });
    }

    return response;
  }

  if (hasDevAccess) {
    const response = NextResponse.next();

    if (devParam === devCode) {
      response.cookies.set(DEV_ACCESS_COOKIE, devCode, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
      });
    }

    return response;
  }

  const maintenanceUrl = request.nextUrl.clone();
  maintenanceUrl.pathname = "/maintenance";
  maintenanceUrl.search = "";

  return NextResponse.rewrite(maintenanceUrl);
}

export const config = {
  matcher: ["/((?!api).*)"],
};
