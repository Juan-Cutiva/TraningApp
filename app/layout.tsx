import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { SpotifyProvider } from "@/components/spotify/spotify-context";
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
    default: "Juan Traning - Entrenamiento Personal",
    template: "%s | Juan Traning",
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
    title: "Juan Traning - Entrenamiento Personal",
    description:
      "Tu entrenador personal avanzado. Registra entrenamientos, analiza progreso y alcanza tus objetivos. 100% offline.",
    type: "website",
    locale: "es_ES",
    siteName: "Juan Traning",
  },
  twitter: {
    card: "summary",
    title: "Juan Traning - Entrenamiento Personal",
    description:
      "Tu entrenador personal avanzado. Registra entrenamientos, analiza progreso y alcanza tus objetivos. 100% offline.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Juan Traning",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
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
          <SpotifyProvider>
            <AppShell>{children}</AppShell>
          </SpotifyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
