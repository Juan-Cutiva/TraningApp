"use client";

// this page uses next/navigation hooks which require dynamic rendering
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const REDIRECT_URI =
  process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI ??
  "http://localhost:3000/callback";

export default function CallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError("Error de autorización: " + errorParam);
      return;
    }

    if (!code) {
      setError("No se recibió código de autorización");
      return;
    }

    // Recuperar code_verifier guardado durante connect()
    const codeVerifier = sessionStorage.getItem("spotify_code_verifier");
    if (!codeVerifier) {
      setError("Sesión de autorización expirada. Intenta conectar de nuevo.");
      return;
    }

    // Intercambiar code por token usando PKCE (sin client_secret)
    fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        code_verifier: codeVerifier,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data.access_token) {
          localStorage.setItem("spotify_access_token", data.access_token);
          localStorage.setItem(
            "spotify_refresh_token",
            data.refresh_token || "",
          );
          localStorage.setItem(
            "spotify_token_expires",
            String(Date.now() + data.expires_in * 1000),
          );
          // Limpiar verifier de sesión
          sessionStorage.removeItem("spotify_code_verifier");
          router.push("/settings?spotify=connected");
        } else {
          setError("Error al obtener token: respuesta inválida");
        }
      })
      .catch((err) => {
        console.error("Spotify callback error:", err);
        setError("Error de conexión con Spotify");
      });
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <a href="/settings" className="text-primary underline">
            Volver a Ajustes
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Conectando con Spotify...</p>
      </div>
    </div>
  );
}
