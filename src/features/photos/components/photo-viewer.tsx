"use client";

import { useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { ImageIcon, LoaderCircle, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AssetPhoto } from "@/features/photos/photo.types";

export function PhotoViewer({ children, photo }: { children: ReactNode; photo: AssetPhoto }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1200px)]"
        showCloseButton={false}
        style={{ height: "min(90dvh, 900px)" }}
      >
        <div className="flex min-w-0 items-center justify-between gap-3 border-b px-4 py-2">
          <DialogTitle className="truncate leading-normal" title={photo.caption || photo.fileName}>
            {photo.caption || photo.fileName}
          </DialogTitle>
          <DialogClose asChild>
            <Button aria-label="Close photo" className="size-11" size="icon" type="button" variant="ghost">
              <X aria-hidden="true" size={18} />
            </Button>
          </DialogClose>
        </div>
        <PhotoViewerImage key={photo.url} photo={photo} />
      </DialogContent>
    </Dialog>
  );
}

function PhotoViewerImage({ photo }: { photo: AssetPhoto }) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-end border-b px-4 py-2">
        <Button
          aria-pressed={zoomed}
          className="h-11"
          disabled={!dimensions || failed}
          onClick={() => {
            setZoomed(!zoomed);
            viewportRef.current?.scrollTo({ left: 0, top: 0 });
            if (!zoomed) viewportRef.current?.focus();
          }}
          type="button"
          variant="outline"
        >
          {zoomed ? <ZoomOut aria-hidden="true" size={16} /> : <ZoomIn aria-hidden="true" size={16} />}
          {zoomed ? "Fit photo" : "Full size"}
        </Button>
      </div>
      <div
        aria-label="Photo"
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]"
        ref={viewportRef}
        role="region"
        tabIndex={0}
      >
        {failed || !photo.url ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
            <ImageIcon aria-hidden="true" size={24} />
            <p className="text-center text-sm" role="alert">Photo unavailable. Refresh to try again.</p>
          </div>
        ) : (
          <>
            <div className="relative size-full" style={zoomed && dimensions ? dimensions : undefined}>
              <Image
                alt={photo.caption || photo.fileName}
                className="object-contain"
                fill
                loading="eager"
                onError={() => setFailed(true)}
                onLoad={(event) => setDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })}
                sizes="100vw"
                src={photo.url}
                unoptimized
              />
            </div>
            {!dimensions ? (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-muted text-muted-foreground" role="status">
                <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" size={18} />
                Loading photo...
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
