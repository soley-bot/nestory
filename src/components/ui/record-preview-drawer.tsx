"use client";

import { SideDrawer } from "@/components/ui/side-drawer";

type RecordPreviewDrawerProps = {
  children: React.ReactNode;
  description?: string;
  footer?: React.ReactNode;
  onClose: () => void;
  open: boolean;
  summary?: React.ReactNode;
  title: string;
};

export function RecordPreviewDrawer({
  children,
  description,
  footer,
  onClose,
  open,
  summary,
  title,
}: RecordPreviewDrawerProps) {
  return (
    <SideDrawer
      description={description}
      footer={footer}
      onClose={onClose}
      open={open}
      size="preview"
      summary={summary}
      title={title}
    >
      {children}
    </SideDrawer>
  );
}
