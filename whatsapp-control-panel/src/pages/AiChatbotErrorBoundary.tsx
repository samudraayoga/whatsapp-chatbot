import { Component, type ReactNode } from 'react';
import { navigate } from '../routing/navigation';

type AiChatbotErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type AiChatbotErrorBoundaryState = {
  hasError: boolean;
};

export class AiChatbotErrorBoundary extends Component<
  AiChatbotErrorBoundaryProps,
  AiChatbotErrorBoundaryState
> {
  state: AiChatbotErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AiChatbotErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: AiChatbotErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="page-state page-state--error" role="alert">
          <p className="eyebrow">Feature boundary</p>
          <h1>Modul Integrasi Chatbot AI mengalami kendala</h1>
          <p>Control room lainnya tetap dapat digunakan dengan aman.</p>
          <button type="button" onClick={() => navigate('/overview')}>
            Kembali ke beranda
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
