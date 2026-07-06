import React, { useState, useEffect } from 'react';
import { Trophy, Plus, Trash2, LogOut, ShieldAlert, Award, ArrowRight, ShieldCheck } from 'lucide-react';

export default function FederationDashboard({ apiBase, auth, onLoginSuccess, onLogout }) {
  const [tournaments, setTournaments] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Formulario de creación
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newId, setNewId] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [newModalidad, setNewModalidad] = useState('GAF');
  const [newAdminPin, setNewAdminPin] = useState('1111');
  const [newJuezPin, setNewJuezPin] = useState('5555');

  const fetchTournaments = async () => {
    try {
      const res = await fetch(`${apiBase}/tournaments`, {
        headers: {
          'x-user-role': auth.federativeRole || auth.role
        }
      });
      if (res.ok) {
        const data = await res.json();
        setTournaments(data);
      } else {
        setError('No se pudo cargar la lista de torneos.');
      }
    } catch (err) {
      setError('Error de conexión al cargar torneos.');
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, []);

  const handleCreateTournament = async (e) => {
    e.preventDefault();
    if (!newId || !newNombre) {
      setError('Completa el ID y Nombre del torneo.');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    const sanitizedId = newId.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '-');

    try {
      const res = await fetch(`${apiBase}/tournaments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': auth.federativeRole || auth.role
        },
        body: JSON.stringify({
          id: sanitizedId,
          nombre: newNombre,
          modalidad: newModalidad,
          adminPin: newAdminPin,
          juezPin: newJuezPin
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`¡Torneo "${newNombre}" creado con éxito!`);
        setShowCreateForm(false);
        setNewId('');
        setNewNombre('');
        fetchTournaments();
      } else {
        setError(data.error || 'No se pudo crear el torneo.');
      }
    } catch (err) {
      setError('Error de conexión al crear torneo.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTournament = async (tournamentId, name) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el torneo "${name}"? Esta acción no se puede deshacer y borrará a todas las gimnastas y calificaciones.`)) {
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/tournaments/${tournamentId}`, {
        method: 'DELETE',
        headers: {
          'x-user-role': auth.federativeRole || auth.role
        }
      });

      if (res.ok) {
        setSuccess('Torneo eliminado correctamente.');
        fetchTournaments();
      } else {
        const data = await res.json();
        setError(data.error || 'No se pudo eliminar el torneo.');
      }
    } catch (err) {
      setError('Error de conexión al eliminar el torneo.');
    } finally {
      setLoading(false);
    }
  };

  const handleManageTournament = (t) => {
    onLoginSuccess({
      tournamentId: t.id,
      role: 'computos',
      nombre: t.nombre,
      modalidad: t.modalidad,
      pin: t.adminPin,
      federationUser: {
        username: auth.username,
        name: auth.name,
        role: auth.federativeRole
      }
    });
  };

  return (
    <div style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* CABECERA */}
      <header className="glass-panel" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 30px',
        marginBottom: '30px',
        background: 'var(--bg-card)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img src="/logo.png" alt="Federación Logo" style={{ height: '50px', objectFit: 'contain' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{
                background: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--accent-primary)',
                padding: '3px 8px',
                borderRadius: '4px',
                fontWeight: '700',
                fontSize: '0.75rem',
                letterSpacing: '0.05em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <ShieldCheck size={12} />
                PANEL DE FEDERACIÓN
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>•</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{auth.name} ({auth.federativeRole})</span>
            </div>
            <h1 style={{ fontSize: '1.5rem', color: '#fff' }}>Gestión de Torneos y Eventos</h1>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => setShowCreateForm(!showCreateForm)} 
            className="btn btn-primary"
            style={{ gap: '6px' }}
          >
            <Plus size={16} />
            Crear Torneo
          </button>
          <button onClick={onLogout} className="btn btn-secondary" style={{ gap: '6px' }}>
            <LogOut size={16} />
            Cerrar Sesión
          </button>
        </div>
      </header>

      {/* ALERTAS */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid var(--accent-danger)',
          padding: '12px 18px',
          borderRadius: '10px',
          color: '#fca5a5',
          fontSize: '0.9rem',
          marginBottom: '20px'
        }}>
          <ShieldAlert size={20} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid var(--accent-success)',
          padding: '12px 18px',
          borderRadius: '10px',
          color: '#a7f3d0',
          fontSize: '0.9rem',
          marginBottom: '20px'
        }}>
          <Award size={20} />
          <span>{success}</span>
        </div>
      )}

      {/* FORMULARIO CREAR TORNEO (COLAPSABLE) */}
      {showCreateForm && (
        <div className="glass-panel animate-fade-in" style={{ padding: '30px', marginBottom: '30px', background: 'var(--bg-card)' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--text-primary)' }}>Crear Nuevo Torneo</h2>
          <form onSubmit={handleCreateTournament} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>ID del Torneo (Corto, sin espacios)</label>
              <input
                type="text"
                placeholder="ej: torneo-federativo-2026"
                className="input-field"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Nombre Completo del Torneo</label>
              <input
                type="text"
                placeholder="ej: Campeonato Provincial GAF 2026"
                className="input-field"
                value={newNombre}
                onChange={(e) => setNewNombre(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Modalidad / Rama</label>
              <select
                value={newModalidad}
                onChange={(e) => setNewModalidad(e.target.value)}
                className="input-field"
                style={{ cursor: 'pointer' }}
              >
                <option value="GAF">GAF (Femenina - 4 Aparatos)</option>
                <option value="GAM">GAM (Masculina - 6 Aparatos)</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>PIN Cómputos</label>
                <input
                  type="password"
                  maxLength={6}
                  className="input-field"
                  value={newAdminPin}
                  onChange={(e) => setNewAdminPin(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>PIN Jueces</label>
                <input
                  type="password"
                  maxLength={6}
                  className="input-field"
                  value={newJuezPin}
                  onChange={(e) => setNewJuezPin(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ gridColumn: 'span 2', display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button type="submit" className="btn btn-primary" style={{ padding: '12px 24px' }} disabled={loading}>
                {loading ? 'Creando...' : 'Confirmar y Crear Torneo'}
              </button>
              <button type="button" onClick={() => setShowCreateForm(false)} className="btn btn-secondary">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* LISTADO DE TORNEOS */}
      <div className="glass-panel" style={{ padding: '30px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '20px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Trophy size={20} color="var(--accent-primary)" />
          Torneos Activos en el Sistema ({tournaments.length})
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
          {tournaments.map(t => (
            <div 
              key={t.id} 
              className="glass-panel" 
              style={{
                padding: '20px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.01)',
                borderColor: 'var(--border-color)',
                transition: 'all 0.2s',
                hover: { borderColor: 'var(--accent-primary)' }
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.2rem', color: '#fff', marginBottom: '4px' }}>{t.nombre}</h3>
                <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span>ID: <strong style={{ color: 'var(--text-primary)' }}>{t.id}</strong></span>
                  <span>•</span>
                  <span>Rama: <strong style={{ color: 'var(--accent-primary)' }}>{t.modalidad}</strong></span>
                  <span>•</span>
                  <span>PIN Cómputos: <strong style={{ color: 'var(--text-primary)' }}>{t.adminPin}</strong></span>
                  <span>•</span>
                  <span>PIN Jueces: <strong style={{ color: 'var(--text-primary)' }}>{t.juezPin}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => handleManageTournament(t)}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '0.85rem', gap: '6px' }}
                >
                  Administrar Cómputos
                  <ArrowRight size={14} />
                </button>
                
                <button 
                  onClick={() => window.open(`${window.location.origin}?view=public&tournamentId=${t.id}`, '_blank')}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  Ver Proyección
                </button>

                <button 
                  onClick={() => handleDeleteTournament(t.id, t.nombre)}
                  className="btn btn-secondary"
                  style={{ padding: '8px', color: 'var(--accent-danger)', borderColor: 'rgba(239,68,68,0.2)' }}
                  title="Eliminar Torneo"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}

          {tournaments.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              No hay torneos creados en el sistema. Haz clic en "Crear Torneo" para dar de alta el primero.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
