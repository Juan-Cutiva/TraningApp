import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import CallbackContent from "./callback-content";

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Conectando con Spotify...</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CallbackContent />
    </Suspense>
  );
}
