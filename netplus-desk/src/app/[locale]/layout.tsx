import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NetPlus", template: "%s · NetPlus" },
  description: "Modern ERP workspace powered by Frappe / ERPNext",
  manifest: "/manifest.json",
  icons: {
    icon:    [
      { url: "/logo-net-plus.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    shortcut: "/logo-net-plus.png",
    apple:    "/logo-net-plus.png",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ 
  children,
  params: paramsPromise
}: { 
  children: React.ReactNode,
  params: Promise<{ locale: string }>
}) {
  const { locale } = await paramsPromise;

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }
 
  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Inter — the design system font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Web App Manifest — Edge/Chrome app mode uses this for window icon */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0369a1" />
      </head>
      <body className="font-sans" suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
