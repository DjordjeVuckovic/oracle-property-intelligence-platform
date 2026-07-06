"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";

type PendingSubmitProps = ButtonProps & {
  pendingLabel?: string;
};

function PendingSubmit({
  children,
  pendingLabel = "Searching",
  disabled,
  ...props
}: PendingSubmitProps) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} aria-busy={pending} {...props}>
      {pending ? (
        <>
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export { PendingSubmit };
