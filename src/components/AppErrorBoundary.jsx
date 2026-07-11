import React from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button } from "./ui";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught application error:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.assign("/");
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-bg px-4 text-content-primary">
        <section
          className="w-full max-w-lg rounded-2xl border border-surface-border bg-surface-card p-6 text-center shadow-xl"
          role="alert"
          aria-live="assertive"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-state-error/35 bg-state-error/10 text-state-error">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-content-primary">
            This page could not be displayed
          </h1>
          <p className="mt-2 text-sm leading-6 text-content-muted">
            An unexpected error occurred. Reload the page, or return to the
            backlog and try again.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
            <Button type="button" onClick={this.handleHome} variant="secondary">
              <Home className="h-4 w-4" aria-hidden="true" />
              Back to backlog
            </Button>
            <Button type="button" onClick={this.handleReload} variant="primary">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload page
            </Button>
          </div>
        </section>
      </main>
    );
  }
}
