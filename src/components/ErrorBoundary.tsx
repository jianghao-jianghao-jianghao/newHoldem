import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : '应用程序发生意外错误',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-[#090B0C] p-6 text-[#F3F1EC]">
          <div className="w-full max-w-md border border-white/[0.12] bg-[#0F1214] p-6 rounded-md space-y-4">
            <h1 className="font-display text-2xl font-bold text-[#F5F2EB]">
              牌室连接异常
            </h1>
            <p className="text-xs leading-relaxed text-[#9DA7A2] break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-9 rounded bg-[#D4A853] px-4 text-xs font-bold text-[#0F1210] hover:bg-[#E1B968] transition-colors"
            >
              重新加载牌室
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
