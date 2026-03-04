"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

// Credenciales desde variables de entorno (sin client secret — flujo PKCE)
const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const REDIRECT_URI =
  process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI ?? "http://localhost:3000/callback";

// Claves de localStorage usadas por Spotify (para borrar solo estas, nunca localStorage.clear())
const SPOTIFY_KEYS = [
  "spotify_access_token",
  "spotify_refresh_token",
  "spotify_token_expires",
] as const;

function clearSpotifyStorage() {
  SPOTIFY_KEYS.forEach((key) => localStorage.removeItem(key));
}

// --- PKCE helpers ---

function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function base64URLEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64URLEncode(digest);
}

function generateCodeVerifier(): string {
  const bytes = generateRandomBytes(64);
  return base64URLEncode(bytes);
}

// --- Interfaces ---

interface SpotifyContextType {
  isConnected: boolean;
  isLoading: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  accessToken: string | null;
  playlists: SpotifyPlaylist[];
  fetchPlaylists: () => Promise<void>;
  currentlyPlaying: SpotifyCurrentlyPlaying | null;
  fetchCurrentlyPlaying: () => Promise<void>;
  play: (
    deviceId: string,
    contextUri?: string,
    trackUri?: string,
  ) => Promise<void>;
  pause: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  images: { url: string }[];
  uri: string;
}

interface SpotifyCurrentlyPlaying {
  is_playing: boolean;
  item: {
    name: string;
    artists: { name: string }[];
    album: { name: string; images: { url: string }[] };
    uri: string;
  };
  device: {
    id: string;
    name: string;
  };
}

const SpotifyContext = createContext<SpotifyContextType | undefined>(undefined);

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [currentlyPlaying, setCurrentlyPlaying] =
    useState<SpotifyCurrentlyPlaying | null>(null);

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem("spotify_access_token");
      const expires = localStorage.getItem("spotify_token_expires");

      if (token && expires) {
        if (Date.now() < parseInt(expires, 10)) {
          setAccessToken(token);
          setIsConnected(true);
        } else {
          // Token expirado — intentar refresh
          const refreshToken = localStorage.getItem("spotify_refresh_token");
          if (refreshToken) {
            await refreshAccessToken(refreshToken);
          } else {
            clearSpotifyStorage();
          }
        }
      }
      setIsLoading(false);
    };

    checkToken();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAccessToken = async (refreshToken: string) => {
    try {
      // PKCE refresh: no necesita client_secret, solo client_id
      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: SPOTIFY_CLIENT_ID,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.access_token) {
        localStorage.setItem("spotify_access_token", data.access_token);
        localStorage.setItem(
          "spotify_token_expires",
          String(Date.now() + data.expires_in * 1000),
        );
        // El refresh token puede rotar en PKCE
        if (data.refresh_token) {
          localStorage.setItem("spotify_refresh_token", data.refresh_token);
        }
        setAccessToken(data.access_token);
        setIsConnected(true);
      } else {
        throw new Error("No access token in response");
      }
    } catch (error) {
      console.error("Error refreshing Spotify token:", error);
      clearSpotifyStorage();
      setIsConnected(false);
      setAccessToken(null);
    }
  };

  const connect = async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    // Guardar verifier en sessionStorage para recuperarlo en el callback
    sessionStorage.setItem("spotify_code_verifier", verifier);

    const scopes = [
      "user-read-private",
      "user-read-email",
      "user-read-playback-state",
      "user-modify-playback-state",
      "user-read-currently-playing",
      "playlist-read-private",
      "streaming",
      "app-remote-control",
    ].join(" ");

    const authUrl = new URL("https://accounts.spotify.com/authorize");
    authUrl.searchParams.append("client_id", SPOTIFY_CLIENT_ID);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.append("scope", scopes);
    authUrl.searchParams.append("code_challenge_method", "S256");
    authUrl.searchParams.append("code_challenge", challenge);
    authUrl.searchParams.append("show_dialog", "true");

    window.location.href = authUrl.toString();
  };

  const disconnect = () => {
    // Solo borrar claves de Spotify, nunca localStorage.clear()
    clearSpotifyStorage();
    setAccessToken(null);
    setIsConnected(false);
    setPlaylists([]);
    setCurrentlyPlaying(null);
  };

  const fetchPlaylists = async () => {
    if (!accessToken) return;

    try {
      const response = await fetch(
        "https://api.spotify.com/v1/me/playlists?limit=50",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        setPlaylists(data.items || []);
      } else if (response.status === 401) {
        // Token inválido — limpiar sesión
        clearSpotifyStorage();
        setIsConnected(false);
        setAccessToken(null);
      }
    } catch (error) {
      console.error("Error fetching playlists:", error);
    }
  };

  const fetchCurrentlyPlaying = async () => {
    if (!accessToken) return;

    try {
      const response = await fetch(
        "https://api.spotify.com/v1/me/player/currently-playing",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (response.status === 204) {
        // No hay nada reproduciéndose actualmente
        setCurrentlyPlaying(null);
        return;
      }

      if (response.ok) {
        const data = await response.json();
        if (data && data.item) {
          setCurrentlyPlaying(data);
        } else {
          setCurrentlyPlaying(null);
        }
      } else {
        setCurrentlyPlaying(null);
      }
    } catch (error) {
      console.error("Error fetching currently playing:", error);
    }
  };

  const play = async (
    deviceId: string,
    contextUri?: string,
    trackUri?: string,
  ) => {
    if (!accessToken) return;

    try {
      const body: Record<string, unknown> = {};
      if (contextUri) {
        body.context_uri = contextUri;
        if (trackUri) body.uris = [trackUri];
      } else if (trackUri) {
        body.uris = [trackUri];
      }

      await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
        },
      );
    } catch (error) {
      console.error("Error playing:", error);
    }
  };

  const pause = async () => {
    if (!accessToken) return;
    try {
      await fetch("https://api.spotify.com/v1/me/player/pause", {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      console.error("Error pausing:", error);
    }
  };

  const next = async () => {
    if (!accessToken) return;
    try {
      await fetch("https://api.spotify.com/v1/me/player/next", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      console.error("Error next track:", error);
    }
  };

  const previous = async () => {
    if (!accessToken) return;
    try {
      await fetch("https://api.spotify.com/v1/me/player/previous", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      console.error("Error previous track:", error);
    }
  };

  const setVolume = async (volume: number) => {
    if (!accessToken) return;
    try {
      await fetch(
        `https://api.spotify.com/v1/me/player/volume?volume_percent=${volume}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
    } catch (error) {
      console.error("Error setting volume:", error);
    }
  };

  return (
    <SpotifyContext.Provider
      value={{
        isConnected,
        isLoading,
        connect,
        disconnect,
        accessToken,
        playlists,
        fetchPlaylists,
        currentlyPlaying,
        fetchCurrentlyPlaying,
        play,
        pause,
        next,
        previous,
        setVolume,
      }}
    >
      {children}
    </SpotifyContext.Provider>
  );
}

export function useSpotify() {
  const context = useContext(SpotifyContext);
  if (context === undefined) {
    throw new Error("useSpotify must be used within a SpotifyProvider");
  }
  return context;
}
