"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { type ReactElement, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ConfirmDangerDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  keyword: string;
  confirmLabel: string;
  pendingLabel?: string | null;
  inputPlaceholder?: string;
  value: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDangerDialog({
  open,
  title,
  description,
  keyword,
  confirmLabel,
  pendingLabel,
  inputPlaceholder,
  value,
  onValueChange,
  onConfirm,
  onCancel
}: ConfirmDangerDialogProps): ReactElement {
  const normalized = value.trim().toUpperCase();
  const required = keyword.trim().toUpperCase();
  const disabled = normalized !== required || Boolean(pendingLabel);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-xl focus:outline-none">
          <div className="space-y-4">
            <header className="space-y-1">
              <Dialog.Title className="text-lg font-semibold text-destructive">{title}</Dialog.Title>
              <Dialog.Description asChild>
                <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
              </Dialog.Description>
            </header>
            <div className="space-y-2 text-sm">
              <label className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Type {keyword.toUpperCase()} to confirm
                </span>
                <Input
                  autoFocus
                  value={value}
                  onChange={(event) => onValueChange(event.target.value)}
                  placeholder={inputPlaceholder ?? keyword.toUpperCase()}
                  className="border-destructive/40 focus-visible:ring-destructive"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onCancel} disabled={Boolean(pendingLabel)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={onConfirm} disabled={disabled}>
                {pendingLabel ?? confirmLabel}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
