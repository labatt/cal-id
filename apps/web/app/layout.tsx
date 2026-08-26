import { getLocale } from "@calcom/features/auth/lib/getLocale";
import { loadTranslations } from "@calcom/i18n/server";
import { IconSprites } from "@calcom/ui/components/icon";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { dir } from "i18next";
import { Inter, Inter_Tight, Source_Serif_4 } from "next/font/google";
import localFont from "next/font/local";
import { cookies, headers } from "next/headers";
import Script from "next/script";
import type React from "react";

import "../styles/globals.css";
import { AppRouterI18nProvider } from "./AppRouterI18nProvider";
import { Providers } from "./providers";
import { SpeculationRules } from "./SpeculationRules";

const interFont = Inter({ subsets: ["latin"], variable: "--font-sans", preload: true, display: "swap" });
// BROADSHEET: the serif is the DISPLAY face — headline, month name, lead line.
// next/font self-hosts this at build time, so no external font request is made at
// runtime. Italic is included because the booking-page lead line is set in italic.
const serifFont = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  preload: true,
  display: "swap",
});
// BROADSHEET: the grotesk is the CHROME face — kickers, weekday heads, day and
// time numerals, buttons, the duration control. Pairing a display serif against a
// tight grotesk is what stops the booking surface reading as uniformly bookish;
// the serif alone made buttons and numerals look like body copy. Tight is chosen
// over plain Inter for its narrower fit and stronger heavy weights, which matter
// at the large numerals used in the calendar and the duration segments.
const uiFont = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-ui",
  weight: ["400", "500", "600", "700"],
  preload: true,
  display: "swap",
});
const calFont = localFont({
  src: "../fonts/CalSans-SemiBold.woff2",
  variable: "--font-cal",
  preload: true,
  display: "block",
  weight: "600",
});

export const viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 1.0,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: "#f9fafb",
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: "#1C1C1C",
    },
  ],
};

export const metadata = {
  icons: {
    icon: "/api/logo?type=favicon-32",
    apple: "/api/logo?type=apple-touch-icon",
    other: [
      {
        rel: "icon-mask",
        url: "/safari-pinned-tab.svg",
        color: "#000000",
      },
      {
        url: "/api/logo?type=favicon-16",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/api/logo?type=favicon-32",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  },
  manifest: "/site.webmanifest",
  other: {
    "application-TileColor": "#ff0000",
  },
  twitter: {
    site: "@calcom",
    creator: "@calcom",
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const getInitialProps = async () => {
  const h = await headers();
  const isEmbed = h.get("x-isEmbed") === "true";
  const embedColorScheme = h.get("x-embedColorScheme");
  const newLocale = (await getLocale(buildLegacyRequest(await headers(), await cookies()))) ?? "en";
  const direction = dir(newLocale) ?? "ltr";

  return {
    isEmbed,
    embedColorScheme,
    locale: newLocale,
    direction,
  };
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const nonce = h.get("x-csp-nonce") ?? "";

  const country = h.get("cf-ipcountry") || h.get("x-vercel-ip-country") || "Unknown";

  const { locale, direction, isEmbed, embedColorScheme } = await getInitialProps();

  const ns = "common";
  const translations = await loadTranslations(locale, ns);

  return (
    <html
      className="notranslate"
      translate="no"
      lang={locale}
      dir={direction}
      style={embedColorScheme ? { colorScheme: embedColorScheme as string } : undefined}
      suppressHydrationWarning
      data-nextjs-router="app">
      <head nonce={nonce}>
        {/* next/font emits ALREADY-QUOTED family names, e.g. 'Source Serif 4'.
            Those quotes are load-bearing: an unquoted CSS font family must be a
            sequence of identifiers, and 4 is not a valid identifier, so the
            unquoted form makes the whole font-family declaration invalid at
            computed-value time and the browser silently falls back to its
            default serif. Inter Tight survives unquoted only because it happens
            to contain no digits — which is exactly why this failed silently.

            dangerouslySetInnerHTML, not a text child: React HTML-escapes text
            children, which would turn each ' into &#x27; and break the CSS. The
            content is a build-time constant derived from next/font, with no
            user input anywhere in it. */}
        <style
          // biome-ignore lint/security/noDangerouslySetInnerHtml: build-time constant, see above
          dangerouslySetInnerHTML={{
            __html: `
          :root {
            --font-serif: ${serifFont.style.fontFamily}, Georgia, serif;
            /* BROADSHEET: the chrome face. Deliberately NOT wired into
               --font-sans, so this stays opt-in via broadsheet.css and the
               dashboard is untouched by the booking-page type pairing. */
            --font-ui: ${uiFont.style.fontFamily}, ui-sans-serif, system-ui, sans-serif;
            /* BROADSHEET: --font-sans and --font-cal are deliberately pointed at
               the serif so every surface (headings and chrome alike) inherits it
               without touching each component. Inter/Cal Sans remain as fallbacks
               only, so nothing breaks if the serif fails to load. */
            --font-sans: ${serifFont.style.fontFamily}, ${interFont.style.fontFamily}, Georgia, serif;
            --font-cal: ${serifFont.style.fontFamily}, ${calFont.style.fontFamily}, Georgia, serif;
          }
        `,
          }}
        />
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
            data-options='{"activationKey":"Meta+c"}'
          />
        )}
      </head>
      <body
        className="dark:bg-default bg-subtle antialiased"
        style={
          isEmbed
            ? {
                background: "transparent",
                // Keep the embed hidden till parent initializes and
                // - gives it the appropriate styles if UI instruction is there.
                // - gives iframe the appropriate height(equal to document height) which can only be known after loading the page once in browser.
                // - Tells iframe which mode it should be in (dark/light) - if there is a a UI instruction for that
                visibility: "hidden",
                // This in addition to visibility: hidden is to ensure that elements with specific opacity set are not visible
                opacity: 0,
              }
            : {
                visibility: "visible",
                opacity: 1,
              }
        }>
        <IconSprites />
        <SpeculationRules
          // URLs In Navigation
          prerenderPathsOnHover={[
            "/event-types",
            "/availability",
            "/bookings/upcoming",
            "/teams",
            "/apps",
          ]}
        />

        <Providers isEmbed={isEmbed} nonce={nonce} country={country}>
          <AppRouterI18nProvider translations={translations} locale={locale} ns={ns}>
            {children}
          </AppRouterI18nProvider>
        </Providers>
      </body>
    </html>
  );
}
