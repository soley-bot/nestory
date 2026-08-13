"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { OverlayPortalContainerProvider } from "@/components/ui/overlay-portal-container"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function Modal({
  children,
  description,
  onClose,
  open,
  title,
}: {
  children: React.ReactNode
  description?: string
  onClose: () => void
  open: boolean
  title: string
}) {
  const [portalContainer, setPortalContainer] = React.useState<HTMLDivElement | null>(null)

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
      open={open}
    >
      <OverlayPortalContainerProvider value={portalContainer}>
        <DialogContent
          className="max-h-[min(82vh,680px)] max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl"
          showCloseButton={false}
        >
          <DialogHeader className="relative gap-1 border-b p-4 pr-12 text-left">
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
            <DialogClose asChild>
              <Button
                aria-label="Close modal"
                className="absolute right-3 top-3"
                size="icon-sm"
                variant="ghost"
              >
                <XIcon />
              </Button>
            </DialogClose>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          <div
            className="contents"
            data-slot="modal-portals"
            ref={setPortalContainer}
          />
        </DialogContent>
      </OverlayPortalContainerProvider>
    </Dialog>
  )
}
