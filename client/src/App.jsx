import React, { useState, useEffect } from 'react';
import Login from './views/Login';
import AdminDashboard from './views/AdminDashboard';
import JudgeInterface from './views/JudgeInterface';
import LiveLeaderboard from './views/LiveLeaderboard';
import FederationDashboard from './views/FederationDashboard';

// Configurar bases URL dinámicamente basadas en el host actual o variables de entorno
// Esto permite conectar tablets en red local usando la IP de la Mesa de Cómputos, o apuntar a la nube en producción
const hostname = window.location.hostname;
const PORT = 3000;
const API_BASE = import.meta.env.VITE_API_BASE || `http://${hostname}:${PORT}/api`;
const WS_BASE = import.meta.env.VITE_WS_BASE || `ws://${hostname}:${PORT}`;

export default function App() {
  const [auth, setAuth] = useState(null);
  const [activeView, setActiveView] = useState(null); // 'admin' | 'judge' | 'public'
  const [checkingLocal, setCheckingLocal] = useState(true);

  // Intentar cargar la sesión guardada desde localStorage al arrancar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'public') {
      const savedAuth = localStorage.getItem('olympo_score_auth');
      let parsed = null;
      if (savedAuth) {
        try { parsed = JSON.parse(savedAuth); } catch(e) {}
      }
      setAuth(parsed || { role: 'publico', tournamentId: params.get('tournamentId') || 'default', pin: '' });
      setActiveView('public');
      setCheckingLocal(false);
      return;
    }

    const savedAuth = localStorage.getItem('olympo_score_auth');
    if (savedAuth) {
      try {
        const parsed = JSON.parse(savedAuth);
        setAuth(parsed);
        // Establecer vista inicial según el rol guardado
        if (parsed.role === 'computos') setActiveView('admin');
        else if (parsed.role === 'jueces') setActiveView('judge');
        else if (parsed.role === 'publico') setActiveView('public');
        else if (parsed.role === 'federacion') setActiveView('federacion');
      } catch (e) {
        localStorage.removeItem('olympo_score_auth');
      }
    }
    setCheckingLocal(false);
  }, []);

  const handleLoginSuccess = (authData) => {
    setAuth(authData);
    localStorage.setItem('olympo_score_auth', JSON.stringify(authData));
    
    // Ruteo inicial según rol
    if (authData.role === 'computos') setActiveView('admin');
    else if (authData.role === 'jueces') setActiveView('judge');
    else if (authData.role === 'publico') setActiveView('public');
    else if (authData.role === 'federacion') setActiveView('federacion');
  };

  const handleLogout = () => {
    if (auth && auth.federationUser) {
      // Si era un usuario de federación administrando un torneo, volver al portal de federación
      const restoredAuth = {
        role: 'federacion',
        username: auth.federationUser.username,
        name: auth.federationUser.name,
        federativeRole: auth.federationUser.role
      };
      setAuth(restoredAuth);
      setActiveView('federacion');
      localStorage.setItem('olympo_score_auth', JSON.stringify(restoredAuth));
    } else {
      setAuth(null);
      setActiveView(null);
      localStorage.removeItem('olympo_score_auth');
    }
  };

  if (checkingLocal) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#080c16',
        color: '#fff'
      }}>
        <p>Iniciando Gimnasia Pro MDZ...</p>
      </div>
    );
  }

  // Enrutar vistas según el estado activeView
  if (!auth) {
    return <Login apiBase={API_BASE} onLoginSuccess={handleLoginSuccess} />;
  }

  if (activeView === 'admin') {
    return (
      <AdminDashboard
        apiBase={API_BASE}
        wsBase={WS_BASE}
        auth={auth}
        onLogout={handleLogout}
        onChangeView={setActiveView}
      />
    );
  }

  if (activeView === 'judge') {
    return (
      <JudgeInterface
        apiBase={API_BASE}
        wsBase={WS_BASE}
        auth={auth}
        onLogout={handleLogout}
        onChangeView={setActiveView}
      />
    );
  }

  if (activeView === 'public') {
    return (
      <LiveLeaderboard
        apiBase={API_BASE}
        wsBase={WS_BASE}
        auth={auth}
        onLogout={handleLogout}
        onChangeView={setActiveView}
      />
    );
  }

  if (activeView === 'federacion') {
    return (
      <FederationDashboard
        apiBase={API_BASE}
        auth={auth}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div style={{ padding: '20px', color: 'red' }}>
      Error: Rol de autenticación no reconocido.
      <button onClick={handleLogout}>Volver</button>
    </div>
  );
}
