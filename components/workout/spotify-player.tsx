"use client";

import { useState, useEffect } from "react";
import { useSpotify } from "@/components/spotify/spotify-context";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";

interface SpotifyPlayerProps {
  compact?: boolean;
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
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [volume, setVolumeState] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);

  // Fetch currently playing periodically
  useEffect(() => {
    if (isConnected && accessToken) {
      fetchCurrentlyPlaying();
      const interval = setInterval(fetchCurrentlyPlaying, 5000);
      return () => clearInterval(interval);
    }
  }, [isConnected, accessToken, fetchCurrentlyPlaying]);

  // Update playing state
  useEffect(() => {
    setIsPlaying(currentlyPlaying?.is_playing || false);
  }, [currentlyPlaying]);

  const handleConnect = () => {
    connect();
  };

  const handleDisconnect = () => {
    disconnect();
    setIsMinimized(true);
  };

  const handleOpenPlaylist = async (playlistUri: string) => {
    if (!currentDeviceId) {
      // Get available devices first
      try {
        const response = await fetch(
          "https://api.spotify.com/v1/me/player/devices",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        const data = await response.json();
        if (data.devices && data.devices.length > 0) {
          setCurrentDeviceId(data.devices[0].id);
          await play(data.devices[0].id, playlistUri);
          setShowPlaylistDialog(false);
        } else {
          alert(
            "No se encontró un dispositivo activo. Abre Spotify en tu dispositivo.",
          );
        }
      } catch (error) {
        console.error("Error getting devices:", error);
      }
    } else {
      await play(currentDeviceId, playlistUri);
      setShowPlaylistDialog(false);
    }
  };

  const handlePlayPause = async () => {
    if (isPlaying) {
      await pause();
    } else if (currentlyPlaying?.item?.uri) {
      await play(currentDeviceId!, undefined, currentlyPlaying.item.uri);
    }
  };

  const handleVolumeChange = async (value: number) => {
    setVolumeState(value);
    await setVolume(value);
  };

  const filteredPlaylists = playlists.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="fixed bottom-24 right-4 z-40">
        <Button
          variant="default"
          size="sm"
          className="h-10 rounded-full px-4 gap-2 bg-primary/90"
          disabled
        >
          <Loader2 className="h-4 w-4 animate-spin" />
        </Button>
      </div>
    );
  }

  // Not connected - show connect button
  if (!isConnected) {
    return (
      <div className="fixed bottom-24 right-4 z-40">
        <Button
          onClick={handleConnect}
          className="h-10 rounded-full px-4 gap-2 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold"
        >
          <Music2 className="h-4 w-4" />
          <span className="text-xs">Conectar Spotify</span>
        </Button>
      </div>
    );
  }

  // Minimized player
  if (isMinimized) {
    return (
      <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2">
        {currentlyPlaying?.is_playing && (
          <div className="flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1.5 pr-4 shadow-lg">
            <div className="relative w-8 h-8 rounded overflow-hidden">
              {currentlyPlaying.item.album.images[0]?.url ? (
                <img
                  src={currentlyPlaying.item.album.images[0].url}
                  alt={currentlyPlaying.item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                  <Music2 className="h-4 w-4 text-primary" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate max-w-[120px]">
                {currentlyPlaying.item.name}
              </p>
              <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                {currentlyPlaying.item.artists[0]?.name}
              </p>
            </div>
          </div>
        )}
        <Button
          onClick={() => setIsMinimized(false)}
          className="h-10 rounded-full px-4 gap-2 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold"
        >
          <Music2 className="h-4 w-4" />
          <span className="text-xs">Spotify</span>
          <ChevronUp className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Full player
  return (
    <div className="fixed bottom-24 right-4 z-40 w-80">
      <Card className="bg-card border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#1DB954]/10 border-b border-border">
          <div className="flex items-center gap-2">
            <Music2 className="h-4 w-4 text-[#1DB954]" />
            <span className="text-sm font-semibold text-foreground">
              Spotify
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                fetchPlaylists();
                setShowPlaylistDialog(true);
              }}
            >
              <ListMusic className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsMinimized(true)}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={handleDisconnect}
            >
              <LogOut className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Currently Playing */}
        {currentlyPlaying?.item ? (
          <CardContent className="p-3 space-y-3">
            {/* Album Art & Track Info */}
            <div className="flex gap-3">
              <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-muted">
                {currentlyPlaying.item.album.images[0]?.url ? (
                  <img
                    src={currentlyPlaying.item.album.images[0].url}
                    alt={currentlyPlaying.item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {currentlyPlaying.item.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {currentlyPlaying.item.artists.map((a) => a.name).join(", ")}
                </p>
                <p className="text-[10px] text-muted-foreground truncate mt-1">
                  {currentlyPlaying.item.album.name}
                </p>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={previous}
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button
                onClick={handlePlayPause}
                className="h-10 w-10 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={next}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleVolumeChange(volume === 0 ? 50 : 0)}
              >
                {volume === 0 ? (
                  <VolumeX className="h-3 w-3" />
                ) : (
                  <Volume2 className="h-3 w-3" />
                )}
              </Button>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                className="flex-1 h-1 accent-[#1DB954]"
              />
              <span className="text-xs text-muted-foreground w-6">
                {volume}%
              </span>
            </div>
          </CardContent>
        ) : (
          <CardContent className="p-4 text-center">
            <Music2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">
              No hay reproducción activa
            </p>
            <Button
              onClick={() => {
                fetchPlaylists();
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

      {/* Playlist Dialog */}
      <Dialog open={showPlaylistDialog} onOpenChange={setShowPlaylistDialog}>
        <DialogContent className="sm:max-w-md w-[90vw] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Music2 className="h-5 w-5 text-[#1DB954]" />
              Tus Playlists
            </DialogTitle>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar playlist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Playlist List */}
          <div className="flex-1 overflow-auto max-h-[400px] space-y-2">
            {filteredPlaylists.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {playlists.length === 0
                  ? "Cargando playlists..."
                  : "No se encontraron playlists"}
              </p>
            ) : (
              filteredPlaylists.map((playlist) => (
                <div
                  key={playlist.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => handleOpenPlaylist(playlist.uri)}
                >
                  <div className="w-12 h-12 rounded overflow-hidden shrink-0 bg-muted">
                    {playlist.images[0]?.url ? (
                      <img
                        src={playlist.images[0].url}
                        alt={playlist.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ListMusic className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {playlist.name}
                    </p>
                  </div>
                  <Play className="h-5 w-5 text-[#1DB954]" />
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPlaylistDialog(false)}
            >
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
    if (isConnected) {
      fetchCurrentlyPlaying();
    }
  }, [isConnected, fetchCurrentlyPlaying]);

  if (!isConnected) return null;

  return <SpotifyPlayer compact={isMinimized} />;
}
