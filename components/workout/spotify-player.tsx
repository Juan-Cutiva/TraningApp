"use client";

import { useState, useEffect, useRef } from "react";
import { useSpotify } from "@/components/spotify/spotify-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Music2,
  X,
  ChevronUp,
  ChevronDown,
  ListMusic,
  Search,
  LogOut,
  Loader2,
  ArrowLeft,
  GripHorizontal,
  Clock,
} from "lucide-react";

interface SpotifyPlayerProps {
  compact?: boolean;
}

interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
}

function fmsDuration(ms: number) {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SpotifyPlayer({ compact = false }: SpotifyPlayerProps) {
  const {
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
  } = useSpotify();

  const [isMinimized, setIsMinimized] = useState(compact);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [viewingPlaylistId, setViewingPlaylistId] = useState<string | null>(null);
  const [viewingPlaylistName, setViewingPlaylistName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [volume, setVolumeState] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);

  // --- Drag logic (ref-based transform avoids JSX inline style) ---
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragOriginRef = useRef({ x: 0, y: 0 });

  function applyTransform(x: number, y: number) {
    if (containerRef.current) {
      containerRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  const handleDragStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    isDraggingRef.current = true;
    dragOriginRef.current = {
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const x = e.clientX - dragOriginRef.current.x;
    const y = e.clientY - dragOriginRef.current.y;
    dragOffsetRef.current = { x, y };
    applyTransform(x, y);
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
  };
  // --- End drag ---

  useEffect(() => {
    if (isConnected && accessToken) {
      fetchCurrentlyPlaying();
      const interval = setInterval(fetchCurrentlyPlaying, 5000);
      return () => clearInterval(interval);
    }
  }, [isConnected, accessToken, fetchCurrentlyPlaying]);

  useEffect(() => {
    setIsPlaying(currentlyPlaying?.is_playing || false);
  }, [currentlyPlaying]);

  const handleConnect = () => connect();
  const handleDisconnect = () => {
    disconnect();
    setIsMinimized(true);
  };

  async function getOrFetchDeviceId(): Promise<string | null> {
    if (currentDeviceId) return currentDeviceId;
    try {
      const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data.devices?.length > 0) {
        const id = data.devices[0].id;
        setCurrentDeviceId(id);
        return id;
      }
      toast.warning("No se encontró un dispositivo activo. Abre Spotify en tu dispositivo.");
      return null;
    } catch {
      return null;
    }
  }

  async function handleOpenPlaylist(playlistUri: string) {
    const deviceId = await getOrFetchDeviceId();
    if (!deviceId) return;
    await play(deviceId, playlistUri);
    setShowPlaylistDialog(false);
  }

  async function handlePlayTrack(trackUri: string) {
    const deviceId = await getOrFetchDeviceId();
    if (!deviceId) return;
    const ctx = viewingPlaylistId ? `spotify:playlist:${viewingPlaylistId}` : undefined;
    await play(deviceId, ctx, trackUri);
    setShowPlaylistDialog(false);
  }

  async function fetchTracks(playlistId: string, playlistName: string) {
    setViewingPlaylistId(playlistId);
    setViewingPlaylistName(playlistName);
    setLoadingTracks(true);
    setPlaylistTracks([]);
    try {
      const res = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(track(id,name,uri,duration_ms,artists,album))`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return;
      const data = await res.json();
      const tracks: SpotifyTrack[] = (data.items ?? [])
        .map((item: { track: SpotifyTrack | null }) => item.track)
        .filter(Boolean);
      setPlaylistTracks(tracks);
    } catch {
      // ignore
    } finally {
      setLoadingTracks(false);
    }
  }

  const handlePlayPause = async () => {
    if (isPlaying) {
      await pause();
    } else if (currentlyPlaying?.item?.uri) {
      const deviceId = await getOrFetchDeviceId();
      if (deviceId) await play(deviceId, undefined, currentlyPlaying.item.uri);
    }
  };

  const handleVolumeChange = async (value: number) => {
    setVolumeState(value);
    await setVolume(value);
  };

  const filteredPlaylists = playlists.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Single outer wrapper — drag transform applied directly via ref, no JSX style prop
  return (
    <div ref={containerRef} className="fixed bottom-24 right-4 z-50">
      {/* Loading */}
      {isLoading && (
        <Button variant="default" size="sm" className="h-10 rounded-full px-4 gap-2 bg-primary/90" disabled>
          <Loader2 className="h-4 w-4 animate-spin" />
        </Button>
      )}

      {/* Not connected */}
      {!isLoading && !isConnected && (
        <Button
          type="button"
          onClick={handleConnect}
          className="h-10 rounded-full px-4 gap-2 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold"
        >
          <Music2 className="h-4 w-4" />
          <span className="text-xs">Conectar Spotify</span>
        </Button>
      )}

      {/* Minimized player */}
      {!isLoading && isConnected && isMinimized && (
        <div
          className="flex flex-col items-end gap-2"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
        >
          {currentlyPlaying?.is_playing && (
            <div className="flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1.5 pr-4 shadow-lg cursor-grab active:cursor-grabbing select-none">
              <div className="relative w-8 h-8 rounded overflow-hidden shrink-0">
                {currentlyPlaying.item.album.images[0]?.url ? (
                  <img src={currentlyPlaying.item.album.images[0].url} alt={currentlyPlaying.item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                    <Music2 className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate max-w-30">{currentlyPlaying.item.name}</p>
                <p className="text-[10px] text-muted-foreground truncate max-w-30">{currentlyPlaying.item.artists[0]?.name}</p>
              </div>
            </div>
          )}
          <Button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="h-10 rounded-full px-4 gap-2 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold"
          >
            <Music2 className="h-4 w-4" />
            <span className="text-xs">Spotify</span>
            <ChevronUp className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Full player */}
      {!isLoading && isConnected && !isMinimized && (
        <div className="w-72">
          <Card className="bg-card border-border shadow-2xl overflow-hidden">
            {/* Drag handle header */}
            <div
              className="flex items-center justify-between px-3 py-2 bg-[#1DB954]/10 border-b border-border cursor-grab active:cursor-grabbing select-none"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
            >
              <div className="flex items-center gap-2">
                <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                <Music2 className="h-4 w-4 text-[#1DB954]" />
                <span className="text-sm font-semibold text-foreground">Spotify</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Ver playlists"
                  onClick={() => {
                    fetchPlaylists();
                    setViewingPlaylistId(null);
                    setPlaylistTracks([]);
                    setSearchQuery("");
                    setShowPlaylistDialog(true);
                  }}
                >
                  <ListMusic className="h-3 w-3" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Minimizar" onClick={() => setIsMinimized(true)}>
                  <ChevronDown className="h-3 w-3" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Desconectar Spotify" onClick={handleDisconnect}>
                  <LogOut className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {currentlyPlaying?.item ? (
              <CardContent className="p-3 space-y-3">
                <div className="flex gap-3">
                  <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-muted">
                    {currentlyPlaying.item.album.images[0]?.url ? (
                      <img src={currentlyPlaying.item.album.images[0].url} alt={currentlyPlaying.item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music2 className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{currentlyPlaying.item.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{currentlyPlaying.item.artists.map((a) => a.name).join(", ")}</p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{currentlyPlaying.item.album.name}</p>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Anterior" onClick={previous}>
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePlayPause}
                    title={isPlaying ? "Pausar" : "Reproducir"}
                    className="h-10 w-10 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black"
                  >
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Siguiente" onClick={next}>
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    title={volume === 0 ? "Activar sonido" : "Silenciar"}
                    onClick={() => handleVolumeChange(volume === 0 ? 50 : 0)}
                  >
                    {volume === 0 ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                  </Button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    aria-label="Volumen"
                    title="Volumen"
                    onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                    className="flex-1 h-1 accent-[#1DB954]"
                  />
                  <span className="text-xs text-muted-foreground w-7 shrink-0">{volume}%</span>
                </div>
              </CardContent>
            ) : (
              <CardContent className="p-4 text-center">
                <Music2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-3">No hay reproducción activa</p>
                <Button
                  type="button"
                  onClick={() => {
                    fetchPlaylists();
                    setViewingPlaylistId(null);
                    setPlaylistTracks([]);
                    setSearchQuery("");
                    setShowPlaylistDialog(true);
                  }}
                  className="bg-[#1DB954] hover:bg-[#1ed760] text-black text-sm"
                  size="sm"
                >
                  <ListMusic className="h-4 w-4 mr-2" />
                  Elegir Playlist
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* Playlist / Tracks Dialog */}
      <Dialog open={showPlaylistDialog} onOpenChange={setShowPlaylistDialog}>
        <DialogContent className="sm:max-w-md w-[90vw] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingPlaylistId ? (
                <>
                  <button
                    type="button"
                    title="Volver a playlists"
                    aria-label="Volver a playlists"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setViewingPlaylistId(null); setPlaylistTracks([]); }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <Music2 className="h-5 w-5 text-[#1DB954]" />
                  <span className="truncate text-base">{viewingPlaylistName}</span>
                </>
              ) : (
                <>
                  <Music2 className="h-5 w-5 text-[#1DB954]" />
                  Tus Playlists
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Playlist list view */}
          {!viewingPlaylistId && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar playlist..."
                  title="Buscar playlist"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex-1 overflow-auto max-h-[50vh] space-y-1">
                {filteredPlaylists.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {playlists.length === 0 ? "Cargando playlists..." : "No se encontraron playlists"}
                  </p>
                ) : (
                  filteredPlaylists.map((playlist) => (
                    <div key={playlist.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                      <div className="w-10 h-10 rounded overflow-hidden shrink-0 bg-muted">
                        {playlist.images[0]?.url ? (
                          <img src={playlist.images[0].url} alt={playlist.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ListMusic className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <p className="font-medium text-sm flex-1 truncate">{playlist.name}</p>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Ver canciones"
                          onClick={() => fetchTracks(playlist.id, playlist.name)}
                        >
                          <ListMusic className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Reproducir playlist"
                          onClick={() => handleOpenPlaylist(playlist.uri)}
                        >
                          <Play className="h-4 w-4 text-[#1DB954]" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* Track list view */}
          {viewingPlaylistId && (
            <div className="flex-1 overflow-auto max-h-[50vh] space-y-1">
              {loadingTracks ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Cargando canciones...</span>
                </div>
              ) : playlistTracks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">Sin canciones</p>
              ) : (
                <>
                  <button
                    type="button"
                    title="Reproducir toda la playlist"
                    className="w-full flex items-center gap-3 p-2 rounded-lg bg-[#1DB954]/10 hover:bg-[#1DB954]/20 transition-colors mb-2"
                    onClick={() => {
                      const pl = playlists.find((p) => p.id === viewingPlaylistId);
                      if (pl) handleOpenPlaylist(pl.uri);
                    }}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1DB954] shrink-0">
                      <Play className="h-4 w-4 text-black ml-0.5" />
                    </div>
                    <span className="text-sm font-semibold text-[#1DB954]">Reproducir toda la playlist</span>
                  </button>

                  {playlistTracks.map((track, i) => (
                    <button
                      type="button"
                      key={track.id ?? i}
                      title={`Reproducir ${track.name}`}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left"
                      onClick={() => handlePlayTrack(track.uri)}
                    >
                      <div className="w-9 h-9 rounded overflow-hidden shrink-0 bg-muted">
                        {track.album.images[0]?.url ? (
                          <img src={track.album.images[0].url} alt={track.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music2 className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{track.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{track.artists.map((a) => a.name).join(", ")}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {fmsDuration(track.duration_ms)}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowPlaylistDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Mini version for bottom nav
export function SpotifyPlayerMini() {
  const { isConnected, currentlyPlaying, fetchCurrentlyPlaying } = useSpotify();
  const [isMinimized, setIsMinimized] = useState(true);

  useEffect(() => {
    if (isConnected) fetchCurrentlyPlaying();
  }, [isConnected, fetchCurrentlyPlaying]);

  if (!isConnected) return null;
  return <SpotifyPlayer compact={isMinimized} />;
}
