import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, EmptyState } from "../ui";

export default function PageError({
  title = "Could not load this page.",
  description,
  onRetry,
  retryLabel = "Try again",
  action,
  className = "",
}) {
  const retryAction = onRetry ? (
    <Button type="button" variant="primary" onClick={onRetry}>
      <RefreshCw className="h-4 w-4" aria-hidden="true" />
      {retryLabel}
    </Button>
  ) : null;

  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description={description}
      action={action || retryAction}
      className={className}
    />
  );
}
