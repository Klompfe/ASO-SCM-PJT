import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';

// Simple Error Boundary to catch render-time errors
class RootErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Root Rendering Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-red-50 text-red-700">
          <div className="bg-white p-8 rounded-xl shadow-lg border border-red-200 text-center">
            <h1 className="text-2xl font-bold mb-4">애플리케이션 오류</h1>
            <p className="mb-4 text-gray-700">문제가 발생했습니다: {this.state.error?.toString()}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-6 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            >
              재시작
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <App />
        <Toaster position="top-right" />
      </BrowserRouter>
    </RootErrorBoundary>
  </StrictMode>,
);
