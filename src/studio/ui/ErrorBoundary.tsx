import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './primitives';

/**
 * Catches render errors so a bug in one screen shows a recoverable card
 * instead of a blank page. Keyed by route in App so navigating away resets it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[studio] render error', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h2 className="crash__title">This screen hit an error</h2>
        <p className="crash__hint">Your unsaved edits are kept as a local draft. Reload the screen, or go back to the dashboard.</p>
        <pre className="crash__err">{String(this.state.error?.message || this.state.error)}</pre>
        <div className="crash__actions">
          <Button variant="primary" onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}>Try again</Button>
          <Button variant="ghost" onClick={() => location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}
