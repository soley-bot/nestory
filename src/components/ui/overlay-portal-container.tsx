"use client";

import * as React from "react";

const OverlayPortalContainerContext = React.createContext<
  HTMLElement | null | undefined
>(undefined);

export function OverlayPortalContainerProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: HTMLElement | null;
}) {
  return (
    <OverlayPortalContainerContext.Provider value={value}>
      {children}
    </OverlayPortalContainerContext.Provider>
  );
}

export function useOverlayPortalContainer() {
  return React.useContext(OverlayPortalContainerContext);
}
