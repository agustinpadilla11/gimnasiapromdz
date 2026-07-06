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
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('olympo_score_theme') || 'dark';
  });

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('olympo_score_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

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
  const renderView = () => {
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
  };

  return (
    <>
      {renderView()}
      <button 
        className="theme-toggle-btn" 
        onClick={toggleTheme} 
        aria-label="Alternar tema claro/oscuro"
        title="Alternar tema claro/oscuro"
      >
        {theme === 'dark' ? (
          <svg viewBox="0 0 24 24">
            <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.01c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M12.3 22h-.1c-5.5 0-10-4.5-10-10 0-4.8 3.5-8.9 8.3-9.7.5-.1 1 .3.9.8-.1.4-.4.8-.8 1-3.6 1.5-6 5-6 9 0 4.4 3.6 8 8 8 4.1 0 7.6-2.5 9-6.1.2-.4.6-.7 1-.6.5 0 .9.5.8 1-.9 4.7-5 8.2-9.7 8.3z"/>
          </svg>
        )}
      </button>
    </>
  );
}
