"use client";

import { SideDrawer } from "@/components/ui/side-drawer";

type RecordPreviewDrawerProps = {
  children: React.ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function RecordPreviewDrawer({
  children,
  description,
  onClose,
  open,
  title,
}: RecordPreviewDrawerProps) {
  return (
    <SideDrawer
      description={description}
      onClose={onClose}
      open={open}
      size="preview"
      title={title}
    >
      {children}
    </SideDrawer>
  );
}
