import { Component } from 'react';
import { S } from '../ui.jsx';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#F9FAFB',color:'#111827',fontFamily:"'Inter',system-ui,sans-serif",gap:16}}>
          <div style={{width:52,height:52,borderRadius:14,background:'rgba(239,68,68,0.15)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h2 style={{margin:0,fontSize:18,fontWeight:700}}>Algo salió mal</h2>
          <p style={{margin:0,color:'#6B7280',fontSize:13,textAlign:'center',maxWidth:320}}>
            {this.state.error?.message || 'Error inesperado en la aplicación.'}
          </p>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'center'}}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{...S.btn, padding:'9px 20px'}}
            >
              Reintentar
            </button>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); if (typeof window !== 'undefined' && window.history) window.history.replaceState(null, '', '/'); }}
              style={{...S.btn2, padding:'9px 20px'}}
            >
              Volver al inicio
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
