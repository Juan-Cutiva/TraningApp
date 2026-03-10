"use client";

// this component uses next/navigation hooks which require dynamic rendering
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const REDIRECT_URI =
  process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI ??
  "http://localhost:3000/callback";

export default function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError("Autorización denegada por Spotify.");
      return;
    }

    if (!code) {
      setError("No se recibió código de autorización");
      return;
    }

    // Prevent double execution (React StrictMode or searchParams change)
    const alreadyProcessed = sessionStorage.getItem("spotify_code_used");
    if (alreadyProcessed === code) return;
    sessionStorage.setItem("spotify_code_used", code);

    // Validate CSRF state parameter
    const stateParam = searchParams.get("state");
    const savedState = sessionStorage.getItem("spotify_oauth_state");
    if (savedState && stateParam !== savedState) {
      setError("Error de seguridad: state inválido. Intenta conectar de nuevo.");
      sessionStorage.removeItem("spotify_oauth_state");
      return;
    }
    sessionStorage.removeItem("spotify_oauth_state");

    // Recuperar code_verifier guardado durante connect()
    const codeVerifier = sessionStorage.getItem("spotify_code_verifier");
    if (!codeVerifier) {
      setError("Sesión de autorización expirada. Intenta conectar de nuevo.");
      return;
    }

    // Intercambiar code por token usando PKCE (sin client_secret)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      signal: controller.signal,
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
            String(Date.now() + (data.expires_in ?? 3600) * 1000),
          );
          // Limpiar sesión y volver a donde estaba el usuario
          sessionStorage.removeItem("spotify_code_verifier");
          sessionStorage.removeItem("spotify_code_used");
          const returnPath = sessionStorage.getItem("spotify_return_path") || "/settings";
          sessionStorage.removeItem("spotify_return_path");
          router.push(returnPath);
        } else {
          setError("Error al obtener token: respuesta inválida");
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          setError("Tiempo de espera agotado. Intenta de nuevo.");
        } else {
          console.error("Spotify callback error:", err);
          setError("Error de conexión con Spotify");
        }
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
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
