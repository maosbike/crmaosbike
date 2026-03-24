import { Component } from 'react';

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
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#F5F5F7',color:'#1a1a1a',fontFamily:"'Inter',system-ui,sans-serif",gap:16}}>
          <div style={{width:52,height:52,borderRadius:14,background:'rgba(239,68,68,0.15)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <span style={{fontSize:24}}>⚠</span>
          </div>
          <h2 style={{margin:0,fontSize:18,fontWeight:700}}>Algo salió mal</h2>
          <p style={{margin:0,color:'#6B6B6B',fontSize:13,textAlign:'center',maxWidth:320}}>
            {this.state.error?.message || 'Error inesperado en la aplicación.'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{background:'#F28100',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}
          >
            Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
