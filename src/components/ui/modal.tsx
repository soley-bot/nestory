"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog"
import {
  OverlayDismissalContext,
  type OverlayDraftGuard,
} from "@/components/ui/overlay-dismissal-context"
import { OverlayPortalContainerProvider } from "@/components/ui/overlay-portal-container"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export function Modal({
  children,
  description,
  onClose,
  open,
  size = "default",
  title,
}: {
  children: React.ReactNode
  description?: string
  onClose: () => void
  open: boolean
  size?: "compact" | "default"
  title: string
}) {
  const draftGuardRef = React.useRef<OverlayDraftGuard | null>(null)
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const previouslyFocusedElementRef = React.useRef<HTMLElement | null>(null)
  const [dismissalDecision, setDismissalDecision] = React.useState<
    "dirty" | "saving" | null
  >(null)
  const [previousOpen, setPreviousOpen] = React.useState(open)

  if (previousOpen !== open) {
    setPreviousOpen(open)
    setDismissalDecision(null)
  }

  const registerDraftGuard = React.useCallback((guard: OverlayDraftGuard) => {
    draftGuardRef.current = guard
    return () => {
      if (draftGuardRef.current === guard) draftGuardRef.current = null
    }
  }, [])

  const requestClose = React.useCallback(() => {
    const status = draftGuardRef.current?.status

    if (status === "saving") {
      setDismissalDecision("saving")
      return
    }

    if (status === "dirty" || status === "error") {
      setDismissalDecision("dirty")
      return
    }

    setDismissalDecision(null)
    onClose()
  }, [onClose])

  const discardAndClose = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (draftGuardRef.current?.status === "saving") {
      event.preventDefault()
      setDismissalDecision("saving")
      return
    }

    const onDiscard = draftGuardRef.current?.onDiscard
    setDismissalDecision(null)
    if (onDiscard) onDiscard()
    else onClose()
  }, [onClose])

  const cancelDismissal = React.useCallback(() => {
    setDismissalDecision(null)
    window.setTimeout(() => closeButtonRef.current?.focus(), 0)
  }, [])

  const dismissalContext = React.useMemo(
    () => ({ portalContainer: null, registerDraftGuard, requestClose }),
    [registerDraftGuard, requestClose],
  )

  return (
    <OverlayDismissalContext.Provider value={dismissalContext}>
      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose()
        }}
        open={open}
      >
        <OverlayPortalContainerProvider value={null}>
          <DialogContent
            inert={dismissalDecision ? true : undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              const previouslyFocusedElement = previouslyFocusedElementRef.current
              previouslyFocusedElementRef.current = null
              window.setTimeout(() => {
                if (previouslyFocusedElement?.isConnected) {
                  previouslyFocusedElement.focus()
                }
              }, 0)
            }}
            onOpenAutoFocus={() => {
              previouslyFocusedElementRef.current =
                document.activeElement instanceof HTMLElement
                  ? document.activeElement
                  : null
            }}
            className={cn(
              "max-h-[min(82vh,680px)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0",
              size === "compact"
                ? "max-w-md sm:max-w-md"
                : "max-w-2xl sm:max-w-2xl",
            )}
            showCloseButton={false}
          >
            <DialogHeader className="relative gap-1 border-b p-4 pr-12 text-left">
              <DialogTitle className="min-w-0 leading-snug [overflow-wrap:anywhere]">{title}</DialogTitle>
              {description ? (
                <DialogDescription className="min-w-0 whitespace-pre-line [overflow-wrap:anywhere]">{description}</DialogDescription>
              ) : null}
              <Button
                aria-label="Close modal"
                className="absolute right-3 top-3"
                onClick={requestClose}
                ref={closeButtonRef}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <XIcon />
              </Button>
            </DialogHeader>
            <div
              className="min-h-0 overflow-y-auto overscroll-contain"
              data-slot="modal-content"
            >
              {children}
            </div>
          </DialogContent>
        </OverlayPortalContainerProvider>
      </Dialog>
      <ConfirmationDialog
        cancelLabel={dismissalDecision === "dirty" ? "Keep editing" : "Continue waiting"}
        confirmLabel={dismissalDecision === "dirty" ? "Discard changes" : undefined}
        description={
          dismissalDecision === "dirty"
            ? "Your changes will be lost and cannot be recovered."
            : "Stay in this modal until the save finishes."
        }
        onCancel={cancelDismissal}
        onConfirm={dismissalDecision === "dirty" ? discardAndClose : undefined}
        open={open && dismissalDecision !== null}
        title={
          dismissalDecision === "dirty"
            ? "Discard unsaved changes?"
            : "Saving is still in progress"
        }
      />
    </OverlayDismissalContext.Provider>
  )
}
