"use client"

import { useState, type MouseEvent } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type ConfirmationDialogProps = {
  ariaLabel?: string
  cancelLabel?: string
  confirmLabel?: string
  description: string
  onCancel: () => void
  onConfirm?: (event: MouseEvent<HTMLButtonElement>) => void
  open: boolean
  title: string
}

export function ConfirmationDialog({
  ariaLabel,
  cancelLabel = "Cancel",
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  open,
  title,
}: ConfirmationDialogProps) {
  const presentation = { ariaLabel, cancelLabel, confirmLabel, description, hasConfirm: Boolean(onConfirm), title }
  const [lastOpenPresentation, setLastOpenPresentation] = useState(presentation)
  if (open && (
    lastOpenPresentation.ariaLabel !== ariaLabel ||
    lastOpenPresentation.cancelLabel !== cancelLabel ||
    lastOpenPresentation.confirmLabel !== confirmLabel ||
    lastOpenPresentation.description !== description ||
    lastOpenPresentation.hasConfirm !== presentation.hasConfirm ||
    lastOpenPresentation.title !== title
  )) {
    setLastOpenPresentation(presentation)
  }
  // Radix keeps closed content mounted during its exit animation. Keep the
  // actual confirmation visible instead of showing the caller's cleared state.
  const displayed = open ? presentation : lastOpenPresentation

  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
      open={open}
    >
      <AlertDialogContent aria-label={displayed.ariaLabel}>
        <AlertDialogHeader>
          <AlertDialogTitle>{displayed.title}</AlertDialogTitle>
          <AlertDialogDescription>{displayed.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{displayed.cancelLabel}</AlertDialogCancel>
          {displayed.confirmLabel && displayed.hasConfirm ? (
            <AlertDialogAction onClick={open ? onConfirm : undefined} variant="destructive">
              {displayed.confirmLabel}
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
