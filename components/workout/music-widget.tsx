"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  X,
  ChevronUp,
  ChevronDown,
  Music2,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface MusicWidgetProps {
  compact?: boolean;
}

export function MusicWidget({ compact = false }: MusicWidgetProps) {
  const settings = useLiveQuery(() => db.userSettings.toCollection().first());
  const [isMinimized, setIsMinimized] = useState(compact);
  const [isVisible, setIsVisible] = useState(true);

  // Wait for settings to load
  if (settings === undefined) {
    return (
      <div className="fixed bottom-20 right-4 z-40">
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

  // Check if music widget is enabled
  if (
    !settings?.showMusicWidget ||
    !settings?.musicService ||
    !settings?.musicEmbedUrl
  ) {
    return null;
  }

  const getEmbedUrl = () => {
    if (!settings.musicEmbedUrl) return null;

    if (settings.musicService === "spotify") {
      // Convert Spotify URL to embed URL
      let embedUrl = settings.musicEmbedUrl;
      if (embedUrl.includes("spotify.com/playlist/")) {
        const playlistId = embedUrl.split("playlist/")[1]?.split("?")[0];
        if (playlistId) {
          return `https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator&theme=0`;
        }
      } else if (embedUrl.includes("spotify.com/album/")) {
        const albumId = embedUrl.split("album/")[1]?.split("?")[0];
        if (albumId) {
          return `https://open.spotify.com/embed/album/${albumId}?utm_source=generator&theme=0`;
        }
      } else if (embedUrl.includes("spotify.com/track/")) {
        const trackId = embedUrl.split("track/")[1]?.split("?")[0];
        if (trackId) {
          return `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;
        }
      }
      return null;
    }

    if (settings.musicService === "youtube") {
      // Convert YouTube URL to embed URL
      let embedUrl = settings.musicEmbedUrl;
      if (embedUrl.includes("youtube.com/playlist")) {
        const listId = embedUrl.split("list=")[1]?.split("&")[0];
        if (listId) {
          return `https://www.youtube.com/embed/videoseries?list=${listId}&autoplay=0`;
        }
      } else if (embedUrl.includes("youtube.com/watch")) {
        const videoId = embedUrl.split("v=")[1]?.split("&")[0];
        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}?autoplay=0`;
        }
      } else if (embedUrl.includes("youtu.be/")) {
        const videoId = embedUrl.split("youtu.be/")[1]?.split("?")[0];
        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}?autoplay=0`;
        }
      }
      return null;
    }

    return null;
  };

  const embedUrl = getEmbedUrl();

  if (!embedUrl) {
    return (
      <div className="fixed bottom-20 right-4 z-40">
        <Button
          variant="default"
          size="sm"
          className="h-10 rounded-full px-4 gap-2 bg-green-600"
          onClick={() => window.open(settings.musicEmbedUrl, "_blank")}
        >
          <Music2 className="h-4 w-4" />
          <span className="text-xs font-medium">
            Abrir {settings.musicService}
          </span>
        </Button>
      </div>
    );
  }

  if (!isVisible) return null;

  // Minimized state - floating pill
  if (isMinimized) {
    return (
      <div className="fixed bottom-20 right-4 z-40">
        <Button
          variant="default"
          size="sm"
          className="h-10 rounded-full px-4 gap-2 bg-primary/90 hover:bg-primary shadow-lg"
          onClick={() => setIsMinimized(false)}
        >
          <Music2 className="h-4 w-4" />
          <span className="text-xs font-medium">
            {settings.musicService === "spotify" ? "Spotify" : "YouTube"}
          </span>
          <ChevronUp className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Full expanded state
  return (
    <div className="fixed bottom-20 right-4 z-40 w-80 rounded-xl bg-card border border-border shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-primary/10 border-b border-border">
        <div className="flex items-center gap-2">
          <Music2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {settings.musicService === "spotify" ? "Spotify" : "YouTube Music"}
          </span>
        </div>
        <div className="flex items-center gap-1">
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
            className="h-7 w-7"
            onClick={() => setIsVisible(false)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Embed */}
      <iframe
        src={embedUrl}
        width="100%"
        height="152"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        style={{ border: "none" }}
        allowTransparency
        className="bg-black/5"
      />

      {/* Footer with link */}
      <div className="px-2 py-1.5 bg-muted/30 border-t border-border">
        <a
          href={settings.musicEmbedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Abrir en {settings.musicService === "spotify" ? "Spotify" : "YouTube"}
        </a>
      </div>
    </div>
  );
}

// Mini version for compact mode
export function MusicWidgetMini() {
  const settings = useLiveQuery(() => db.userSettings.toCollection().first());

  if (!settings?.showMusicWidget || !settings?.musicService) {
    return null;
  }

  return <MusicWidget compact />;
}
