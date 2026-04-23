import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { GlobalErrorListener } from "@/components/global-error-listener";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f0f1f8" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a2e" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: {
    default: "Cuti Traning - Entrenamiento Personal",
    template: "%s | Cuti Traning",
  },
  description:
    "Tu entrenador personal avanzado. Registra entrenamientos, analiza progreso y alcanza tus objetivos. 100% offline.",
  keywords: [
    "entrenamiento",
    "fitness",
    "gym",
    "rutinas",
    "ejercicio",
    "peso corporal",
    "records personales",
    "app fitness offline",
  ],
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: false,
  },
  openGraph: {
    title: "Cuti Traning - Entrenamiento Personal",
    description:
      "Tu entrenador personal avanzado. Registra entrenamientos, analiza progreso y alcanza tus objetivos. 100% offline.",
    type: "website",
    locale: "es_ES",
    siteName: "Cuti Traning",
  },
  twitter: {
    card: "summary",
    title: "Cuti Traning - Entrenamiento Personal",
    description:
      "Tu entrenador personal avanzado. Registra entrenamientos, analiza progreso y alcanza tus objetivos. 100% offline.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cuti Traning",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/favicon.svg", sizes: "180x180", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ErrorBoundary resettable>
            <AuthProvider>
              <AppShell>{children}</AppShell>
            </AuthProvider>
          </ErrorBoundary>
          <Toaster position="top-center" richColors />
          <Analytics />
          <ServiceWorkerRegister />
          <GlobalErrorListener />
        </ThemeProvider>
      </body>
    </html>
  );
}
