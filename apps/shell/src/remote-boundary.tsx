import { Component, type ErrorInfo, type ReactNode } from "react";

interface RemoteBoundaryProps {
  name: string;
  fallback: ReactNode;
  children: ReactNode;
}

export class RemoteBoundary extends Component<
  RemoteBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[shell] remote "${this.props.name}" failed`, error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
