import React, { useState, useEffect } from 'react';
import { Trophy, Lock, Users, ShieldAlert, Award, Plus, FolderSync, User, Key, ShieldCheck } from 'lucide-react';

export default function Login({ apiBase, onLoginSuccess }) {
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Estados para federación y control de pestañas
  const [activeTab, setActiveTab] = useState('juez'); // 'juez' | 'federacion'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Cargar torneos al iniciar
  const fetchTournaments = async () => {
    try {
      const res = await fetch(`${apiBase}/tournaments`);
      if (res.ok) {
        const data = await res.json();
        setTournaments(data);
        if (data.length > 0) {
          setSelectedTournamentId(data[0].id);
        }
      }
    } catch (err) {
      setError('No se pudo conectar con el servidor local. Asegúrate de que el backend esté ejecutándose.');
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, [apiBase]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!selectedTournamentId) {
      setError('Por favor, selecciona un torneo.');
      return;
    }
    if (!pin) {
      setError('Por favor, ingresa el PIN de acceso.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/tournaments/${selectedTournamentId}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onLoginSuccess({
          tournamentId: selectedTournamentId,
          role: data.role,
          nombre: data.nombre,
          modalidad: data.modalidad,
          pin: pin
        });
      } else {
        setError(data.error || 'PIN de acceso incorrecto.');
      }
    } catch (err) {
      setError('Error de conexión al autenticar.');
    } finally {
      setLoading(false);
    }
  };

  const handleFederationLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Por favor, ingresa el usuario y la contraseña.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/auth/federacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onLoginSuccess({
          role: 'federacion',
          username: data.username,
          name: data.name,
          federativeRole: data.role
        });
      } else {
        setError(data.error || 'Usuario o contraseña incorrectos.');
      }
    } catch (err) {
      setError('Error de conexión al autenticar.');
    } finally {
      setLoading(false);
    }
  };

  const handlePublicAccess = () => {
    if (!selectedTournamentId) {
      setError('Selecciona un torneo primero.');
      return;
    }
    const selected = tournaments.find(t => t.id === selectedTournamentId);
    onLoginSuccess({
      tournamentId: selectedTournamentId,
      role: 'publico',
      nombre: selected?.nombre || 'Torneo',
      modalidad: selected?.modalidad || 'GAF',
      pin: ''
    });
  };

  return (
    <div style={{
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '90vh',
      padding: '20px'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '460px',
        padding: '35px 30px',
        boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Encabezado */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <img 
            src="/logo.png" 
            alt="Gimnasia Pro MDZ Logo" 
            style={{
              height: '70px',
              objectFit: 'contain',
              marginBottom: '15px',
              filter: 'drop-shadow(0 0 10px rgba(14, 165, 233, 0.2))'
            }}
          />
          <h1 style={{ fontSize: '1.8rem', letterSpacing: '-0.02em', marginBottom: '5px' }}>
            Gimnasia Pro MDZ
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Sistema de Cómputos para Gimnasia Artística
          </p>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--accent-danger)',
            padding: '12px',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '0.85rem',
            marginBottom: '20px'
          }}>
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}



        {/* PESTAÑAS DE ACCESO */}
        <div className="tabs" style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button
            type="button"
            onClick={() => {
              setActiveTab('juez');
              setError('');
            }}
            className={`tab-btn ${activeTab === 'juez' ? 'active' : ''}`}
            style={{ flex: 1, textAlign: 'center', padding: '10px 0', fontSize: '0.85rem' }}
          >
            <Users size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
            Juez / Público
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('federacion');
              setError('');
            }}
            className={`tab-btn ${activeTab === 'federacion' ? 'active' : ''}`}
            style={{ flex: 1, textAlign: 'center', padding: '10px 0', fontSize: '0.85rem' }}
          >
            <ShieldCheck size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
            Federación
          </button>
        </div>

        {activeTab === 'juez' ? (
          // ACCESO JUEZ / PÚBLICO
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="tournament-select">Selecciona el Torneo</label>
              {tournaments.length > 0 ? (
                <select
                  id="tournament-select"
                  className="input-field"
                  value={selectedTournamentId}
                  onChange={(e) => setSelectedTournamentId(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  {tournaments.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} ({t.modalidad})
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '10px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '0.9rem'
                }}>
                  No hay torneos registrados
                </div>
              )}
            </div>

            {tournaments.length > 0 && (
              <div className="form-group">
                <label htmlFor="pin-input">PIN de Acceso</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="pin-input"
                    type="password"
                    maxLength={10}
                    placeholder="Introduce PIN (ej. 1111 o 5555)"
                    className="input-field"
                    style={{ paddingLeft: '40px' }}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                  />
                  <Lock size={18} color="var(--text-muted)" style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)'
                  }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '30px' }}>
              {tournaments.length > 0 && (
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px' }}
                >
                  {loading ? 'Ingresando...' : 'Acceder al Sistema'}
                </button>
              )}


            </div>
          </form>
        ) : (
          // ACCESO PERSONAL DE FEDERACIÓN
          <form onSubmit={handleFederationLogin}>
            <div className="form-group">
              <label htmlFor="username-input">Usuario Federativo</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="username-input"
                  type="text"
                  placeholder="Introduce tu usuario"
                  className="input-field"
                  style={{ paddingLeft: '40px' }}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <User size={18} color="var(--text-muted)" style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)'
                }} />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password-input">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password-input"
                  type="password"
                  placeholder="Introduce tu contraseña"
                  className="input-field"
                  style={{ paddingLeft: '40px' }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Key size={18} color="var(--text-muted)" style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)'
                }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '30px' }}>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, var(--accent-primary), #1e40af)' }}
              >
                {loading ? 'Ingresando...' : 'Iniciar Sesión Federativa'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
