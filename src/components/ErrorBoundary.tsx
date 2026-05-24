import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional fallback. When omitted, a built-in error card is rendered. */
  fallback?: (err: Error, reset: () => void) => ReactNode;
}

interface State {
  err: Error | null;
}

/**
 * Catches render-phase + lifecycle errors anywhere in the subtree and
 * shows a visible failure card instead of the blank-white "React died"
 * default. Wraps the routed `<main>` so a bug in any page surfaces with
 * its stack visible to the developer + a Reset button for the user.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', err, info.componentStack);
  }

  private reset = () => this.setState({ err: null });

  render(): ReactNode {
    if (!this.state.err) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.err, this.reset);
    return (
      <div className="mx-auto mt-6 max-w-xl">
        <div className="card border-l-4 border-l-blunder p-4 text-sm">
          <h2 className="text-base font-semibold text-blunder">Something broke</h2>
          <p className="mt-1 text-xs text-muted">
            The screen you were on raised an error. The rest of the app is fine - reset to retry,
            or use the tabs / browser back to leave.
          </p>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-surface-2 p-2 text-[11px] text-primary whitespace-pre-wrap break-words">
            {this.state.err.message}
            {'\n\n'}
            {this.state.err.stack ?? ''}
          </pre>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={this.reset} className="btn-secondary text-xs">
              Reset
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="btn-primary text-xs"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
