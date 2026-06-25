import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Users, Award, ShieldAlert, Zap, Star } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function LiveLeaderboard({ apiBase, wsBase, auth, onLogout, onChangeView }) {
  const queryParams = new URLSearchParams(window.location.search);
  const urlApparatus = queryParams.get('aparato') || queryParams.get('apparatus');

  const [gymnasts, setGymnasts] = useState([]);
  const [tournament, setTournament] = useState(null);
  
  // Estados para el carrusel automático
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [selectedTurno, setSelectedTurno] = useState('Todos');
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [viewMode, setViewMode] = useState('individual'); // 'individual' | 'equipos'
  
  // Modo de proyección y última calificación
  const [projectionMode, setProjectionMode] = useState(urlApparatus ? 'ultima' : 'carrusel');
  const [lastProjected, setLastProjected] = useState(null); // { gymnast, aparato, score }

  // Estado para la revelación dramática de puntuaciones en vivo
  const [liveReveal, setLiveReveal] = useState(null);
  
  // Referencias para timers
  const rotationTimerRef = useRef(null);
  const revealTimerRef = useRef(null);

  // --- LÓGICA DE CLASIFICACIÓN (Igual a la del AdminDashboard) ---
  const filteredGymnastsByTurno = selectedTurno === 'Todos'
    ? gymnasts
    : gymnasts.filter(g => g.grupo === selectedTurno);

  const groupedRankings = {};
  filteredGymnastsByTurno.forEach(g => {
    const key = `${g.nivel} - ${g.categoria}`;
    if (!groupedRankings[key]) groupedRankings[key] = [];

    let totalScore = 0;
    let hasScores = false;
    const scores = {};
    if (tournament && tournament.aparatos) {
      tournament.aparatos.forEach(ap => {
        const note = g.notas?.[ap]?.final;
        if (note !== undefined && note !== null) {
          scores[ap] = parseFloat(note);
          totalScore += parseFloat(note);
          hasScores = true;
        } else {
          scores[ap] = null;
        }
      });
    }

    groupedRankings[key].push({
      ...g,
      scores,
      totalScore: hasScores ? parseFloat(totalScore.toFixed(3)) : 0,
      hasScores
    });
  });

  // Ordenar y rankear individualmente
  Object.keys(groupedRankings).forEach(k => {
    groupedRankings[k].sort((a, b) => b.totalScore - a.totalScore);
    let rank = 1;
    for (let idx = 0; idx < groupedRankings[k].length; idx++) {
      if (idx > 0 && groupedRankings[k][idx].totalScore < groupedRankings[k][idx - 1].totalScore) {
        rank = idx + 1;
      }
      groupedRankings[k][idx].puesto = groupedRankings[k][idx].totalScore > 0 ? rank : '-';
    }
  });

  const groupKeys = Object.keys(groupedRankings).sort();
  const rotatedGroups = selectedGroups.length > 0
    ? groupKeys.filter(k => selectedGroups.includes(k))
    : groupKeys;

  const safeGroupIndex = activeGroupIndex >= rotatedGroups.length ? 0 : activeGroupIndex;
  const activeGroupKey = rotatedGroups[safeGroupIndex] || '';

  const availableTurnos = [...new Set(gymnasts.map(g => g.grupo || 'Turno 1'))].filter(Boolean).sort();
  const allGroups = [...new Set(gymnasts.map(g => `${g.nivel} - ${g.categoria}`))].filter(Boolean).sort();
  
  // Obtener gimnastas del grupo actual
  const currentGroupGymnasts = groupedRankings[activeGroupKey] || [];

  // Obtener ranking por equipos del grupo actual
  const getTeamRankings = (groupKey) => {
    const members = groupedRankings[groupKey] || [];
    const clubMembers = {};
    members.forEach(m => {
      if (!clubMembers[m.institucion]) clubMembers[m.institucion] = [];
      clubMembers[m.institucion].push(m);
    });

    const clubResults = [];
    Object.keys(clubMembers).forEach(clubName => {
      const clMembers = clubMembers[clubName];
      let totalEquipo = 0;
      const scoresPorAparato = {};

      if (tournament && tournament.aparatos) {
        tournament.aparatos.forEach(ap => {
          const notes = clMembers
            .map(m => m.scores[ap])
            .filter(n => n !== null && n !== undefined)
            .sort((a, b) => b - a);
          
          const best3 = notes.slice(0, 3);
          const sum = best3.reduce((a, b) => a + b, 0);
          scoresPorAparato[ap] = sum > 0 ? parseFloat(sum.toFixed(3)) : 0;
          totalEquipo += scoresPorAparato[ap];
        });
      }

      const descuento = tournament.descuentosEquipos?.[groupKey]?.[clubName] || 0;
      const totalConDescuento = parseFloat(Math.max(0, totalEquipo - descuento).toFixed(3));

      clubResults.push({
        clubName,
        scoresPorAparato,
        descuento,
        totalEquipoRaw: parseFloat(totalEquipo.toFixed(3)),
        totalEquipo: totalConDescuento
      });
    });

    clubResults.sort((a, b) => b.totalEquipo - a.totalEquipo);
    
    let rank = 1;
    for (let idx = 0; idx < clubResults.length; idx++) {
      if (idx > 0 && clubResults[idx].totalEquipo < clubResults[idx - 1].totalEquipo) {
        rank = idx + 1;
      }
      clubResults[idx].puesto = clubResults[idx].totalEquipo > 0 ? rank : '-';
    }

    return clubResults;
  };

  const currentTeamRankings = getTeamRankings(activeGroupKey);

  const getLatestScore = (gymnastList, filterAp = null) => {
    let latest = null;
    gymnastList.forEach(g => {
      if (g.notas) {
        Object.keys(g.notas).forEach(ap => {
          if (filterAp && ap !== filterAp) return;
          const scObj = g.notas[ap];
          if (scObj && scObj.fechaRegistro) {
            if (!latest || new Date(scObj.fechaRegistro) > new Date(latest.score.fechaRegistro)) {
              latest = { gymnast: g, aparato: ap, score: scObj };
            }
          }
        });
      }
    });
    return latest;
  };

  // Cargar datos
  const fetchTournamentData = async () => {
    try {
      const res = await fetch(`${apiBase}/tournaments/${auth.tournamentId}`, {
        headers: {
          'x-juez-pin': auth.pin,
          'x-admin-pin': auth.pin
        }
      });
      if (res.ok) {
        const data = await res.json();
        setTournament(data);
        setGymnasts(data.gimnastas || []);
        const latest = getLatestScore(data.gimnastas || [], urlApparatus);
        if (latest) {
          setLastProjected(latest);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTournamentData();

    // WebSocket para recibir notas en vivo y activar la revelación dramática
    const ws = new WebSocket(`${wsBase}`);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'REGISTER',
        tournamentId: auth.tournamentId,
        role: 'publico'
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.type === 'TOURNAMENT_RELOADED') {
          setGymnasts(msg.gimnastas);
        } else if (msg.type === 'GYMNAST_UPDATED') {
          setGymnasts(prev => prev.map(g => g.id === msg.gymnast.id ? msg.gymnast : g));
        } else if (msg.type === 'GYMNAST_DELETED') {
          setGymnasts(prev => prev.filter(g => g.id !== msg.gymnastId));
        } else if (msg.type === 'SCORE_SUBMITTED') {
          // 1. Actualizar el listado en local
          setGymnasts(prev => prev.map(g => g.id === msg.gymnast.id ? msg.gymnast : g));
          
          // Solo proyectar automáticamente si NO estamos en una pantalla dedicada de juez
          if (!urlApparatus) {
            setLastProjected({ gymnast: msg.gymnast, aparato: msg.aparato, score: msg.score });
            setProjectionMode('ultima');
            triggerReveal(msg.gymnast, msg.aparato, msg.score);
          }
        } else if (msg.type === 'PROJECT_SCORE') {
          // Si estamos en una pantalla de juez y el aparato no coincide, ignorar la proyección del administrador
          if (urlApparatus && msg.aparato !== urlApparatus) return;
          
          setLastProjected({ gymnast: msg.gymnast, aparato: msg.aparato, score: msg.score });
          setProjectionMode('ultima');
          triggerReveal(msg.gymnast, msg.aparato, msg.score);
        } else if (msg.type === 'PROJECT_JUDGE_SCORE') {
          // Solo procesar si coincide exactamente con el aparato de esta pantalla de juez
          if (urlApparatus && msg.aparato === urlApparatus) {
            setLastProjected({ gymnast: msg.gymnast, aparato: msg.aparato, score: msg.score });
            setProjectionMode('ultima');
            triggerReveal(msg.gymnast, msg.aparato, msg.score);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    return () => {
      ws.close();
      if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, [apiBase, wsBase, auth.tournamentId]);

  // Lógica de carrusel rotativo
  useEffect(() => {
    if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    
    // Si hay una revelación en vivo activa, pausar rotación
    if (liveReveal) return;
 
    rotationTimerRef.current = setInterval(() => {
      const keys = rotatedGroups;
      if (keys.length === 0) return;
 
      if (viewMode === 'individual') {
        // Pasar a ranking por equipos o al siguiente grupo
        if (activeGroupIndex < keys.length - 1) {
          setActiveGroupIndex(prev => prev + 1);
        } else {
          // Cambiar a ver equipos
          setViewMode('equipos');
          setActiveGroupIndex(0);
        }
      } else {
        // En modo equipos, pasar al siguiente grupo o volver a individual
        if (activeGroupIndex < keys.length - 1) {
          setActiveGroupIndex(prev => prev + 1);
        } else {
          setViewMode('individual');
          setActiveGroupIndex(0);
        }
      }
    }, 12000); // Rota cada 12 segundos
 
    return () => clearInterval(rotationTimerRef.current);
  }, [gymnasts, activeGroupIndex, viewMode, liveReveal, selectedGroups, selectedTurno]);

  // Disparador del reveal en vivo
  const triggerReveal = (gymnast, aparato, score) => {
    // Si hay un reveal timer activo, limpiarlo
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);

    setLiveReveal({ gymnast, aparato, score });

    // Disparar confeti si la nota es excelente (> 9.20)
    if (score.final >= 9.20) {
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
    }

    // Ocultar reveal tras 6 segundos
    revealTimerRef.current = setTimeout(() => {
      setLiveReveal(null);
    }, 7000);
  };

  if (!tournament) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#080c16' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Cargando pantalla de resultados...</p>
      </div>
    );
  }


  // El bloque de clasificación duplicado fue removido y ahora se calcula correctamente al inicio del componente.


  return (
    <div style={{
      background: '#040814',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden'
    }}>
      
      {/* GLOW DE FONDO */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '25%',
        right: '25%',
        height: '40%',
        background: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.12) 0%, transparent 70%)',
        zIndex: 0
      }} />

      {/* HEADER PRINCIPAL DE PROYECCIÓN */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 40px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(6, 11, 25, 0.8)',
        backdropFilter: 'blur(10px)',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img src="/logo.png" alt="Logo" style={{ height: '48px', objectFit: 'contain' }} />
          <div>
            <h1 style={{ fontSize: '1.4rem', letterSpacing: '-0.02em', color: '#fff' }}>
              {tournament.nombre}
            </h1>
            <p style={{ color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Resultados Oficiales en Vivo
            </p>
          </div>
        </div>

        {/* SELECTOR DE MODO DE PROYECCIÓN Y FILTROS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.02)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', gap: '4px' }}>
            <button 
              onClick={() => setProjectionMode('carrusel')} 
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: '700',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: projectionMode === 'carrusel' ? 'var(--accent-primary)' : 'transparent',
                color: projectionMode === 'carrusel' ? '#000' : 'var(--text-secondary)',
                transition: 'all 0.2s'
              }}
            >
              Carrusel Rotativo
            </button>
            <button 
              onClick={() => setProjectionMode('ultima')} 
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: '700',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: projectionMode === 'ultima' ? 'var(--accent-primary)' : 'transparent',
                color: projectionMode === 'ultima' ? '#000' : 'var(--text-secondary)',
                transition: 'all 0.2s'
              }}
            >
              Última Calificación (Fija)
            </button>
          </div>

          {projectionMode === 'carrusel' && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(255,255,255,0.01)', padding: '4px 10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
              {/* Selector de Turno */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Turno:</span>
                <select
                  value={selectedTurno}
                  onChange={(e) => {
                    setSelectedTurno(e.target.value);
                    setActiveGroupIndex(0); // Reiniciar carrusel
                  }}
                  className="input-field"
                  style={{
                    width: '140px',
                    padding: '4px 8px',
                    fontSize: '0.8rem',
                    background: 'rgba(15, 23, 42, 0.8)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    marginBottom: 0
                  }}
                >
                  <option value="Todos">Todos los Turnos</option>
                  {availableTurnos.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Selector de Nivel - Categoría Multi-Select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Clasif:</span>
                
                <button
                  type="button"
                  onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                  className="input-field"
                  style={{
                    width: '180px',
                    padding: '4px 8px',
                    fontSize: '0.8rem',
                    background: 'rgba(15, 23, 42, 0.8)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 0
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                    {selectedGroups.length === 0 
                      ? '🔄 Rotar todos' 
                      : `📋 Rotar (${selectedGroups.length})`}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>▼</span>
                </button>

                {showGroupDropdown && (
                  <>
                    {/* Backdrop transparente para cerrar al hacer clic afuera */}
                    <div 
                      onClick={() => setShowGroupDropdown(false)}
                      style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        zIndex: 998,
                        background: 'transparent'
                      }}
                    />
                    
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '8px',
                      width: '280px',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      background: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid var(--border-color-hover)',
                      borderRadius: '8px',
                      padding: '12px',
                      zIndex: 999,
                      boxShadow: 'var(--shadow-lg)',
                      backdropFilter: 'blur(10px)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      textAlign: 'left'
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        paddingBottom: '6px',
                        marginBottom: '4px'
                      }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Seleccionar categorías</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGroups([]);
                            setActiveGroupIndex(0);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-primary)',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          Limpiar
                        </button>
                      </div>

                      {allGroups.map(g => {
                        const isChecked = selectedGroups.includes(g);
                        return (
                          <label
                            key={g}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              fontSize: '0.85rem',
                              color: isChecked ? '#fff' : 'var(--text-secondary)',
                              cursor: 'pointer',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              background: isChecked ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                              transition: 'all 0.1s'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedGroups(prev => prev.filter(item => item !== g));
                                } else {
                                  setSelectedGroups(prev => [...prev, g]);
                                }
                                setActiveGroupIndex(0);
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g}</span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/logo.png" alt="Logo" style={{ height: '32px', objectFit: 'contain' }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SISTEMA</div>
              <div style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: '700' }}>GIMNASIA PRO MDZ</div>
            </div>
          </div>
          {auth.role === 'computos' && (
            <button onClick={() => onChangeView('admin')} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.8rem', border: '1px solid var(--accent-primary)' }}>
              Volver a Cómputos
            </button>
          )}
          {auth.role === 'jueces' && (
            <button onClick={() => onChangeView('judge')} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.8rem', border: '1px solid var(--accent-primary)' }}>
              Volver a Jueces
            </button>
          )}
          {auth.role === 'publico' && (
            <button onClick={onLogout} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.8rem' }}>
              Volver al Inicio
            </button>
          )}
        </div>
      </header>

      {/* PANTALLA PRINCIPAL DE TABLERO DE RESULTADOS */}
      {projectionMode === 'ultima' ? (
        <main style={{
          flex: 1,
          padding: '40px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 5
        }}>
          {lastProjected ? (
            <div className="glass-panel" style={{
              width: '90%',
              maxWidth: '900px',
              padding: '50px',
              textAlign: 'center',
              background: 'rgba(11, 18, 38, 0.95)',
              borderWidth: '2px',
              borderColor: lastProjected.score.final >= 9.20 ? 'var(--accent-gold)' : 'var(--accent-primary)',
              boxShadow: lastProjected.score.final >= 9.20 ? 'var(--shadow-gold-glow)' : 'var(--shadow-glow)',
              position: 'relative',
              borderRadius: '24px',
              animation: 'fadeIn 0.5s ease-out'
            }}>
              {lastProjected.score.final >= 9.20 && (
                <div style={{
                  position: 'absolute',
                  top: '-18px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'linear-gradient(135deg, var(--accent-gold), #0284c7)',
                  color: '#fff',
                  padding: '6px 20px',
                  borderRadius: '20px',
                  fontWeight: '800',
                  fontSize: '0.85rem',
                  letterSpacing: '0.1em',
                  boxShadow: '0 4px 15px rgba(14, 165, 233, 0.4)'
                }}>
                  ✨ PUNTUACIÓN SOBRESALIENTE
                </div>
              )}
              
              {/* Logo en la presentación de la nota */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                <img 
                  src="/logo.png" 
                  alt="Gimnasia Pro MDZ" 
                  style={{
                    height: '55px',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 0 10px rgba(14, 165, 233, 0.2))'
                  }}
                />
              </div>
              
              <div style={{
                fontSize: '1rem',
                color: lastProjected.score.final >= 9.20 ? 'var(--accent-gold)' : 'var(--accent-primary)',
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                marginBottom: '15px'
              }}>
                PANTALLA DE RESULTADOS EN VIVO
              </div>

              <h2 style={{ fontSize: '3.8rem', color: '#fff', fontWeight: '800', marginBottom: '8px', letterSpacing: '-0.02em' }}>
                {lastProjected.gymnast.nombre}
              </h2>

              <p style={{ fontSize: '1.6rem', color: 'var(--text-secondary)', marginBottom: '30px' }}>
                {lastProjected.gymnast.institucion} • <strong>{lastProjected.gymnast.nivel} {lastProjected.gymnast.categoria}</strong>
              </p>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                paddingTop: '40px',
                marginTop: '10px'
              }}>
                <div style={{ fontSize: '1.2rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '15px' }}>
                  Nota Final
                </div>
                <div style={{
                  fontSize: '8.5rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: '900',
                  color: 'var(--accent-success)',
                  lineHeight: '1',
                  textShadow: '0 0 40px rgba(16, 185, 129, 0.45)'
                }}>
                  {parseFloat(lastProjected.score.final).toFixed(3)}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>
              Esperando calificaciones para proyectar...
            </div>
          )}
        </main>
      ) : groupKeys.length > 0 ? (
        <main style={{
          flex: 1,
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 5
        }}>
          
          {/* Nombre de la Categoría y Nivel Destacado */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '30px'
          }}>
            <div>
              <span style={{
                background: viewMode === 'individual' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                color: viewMode === 'individual' ? 'var(--accent-primary)' : 'var(--accent-purple)',
                padding: '6px 14px',
                borderRadius: '8px',
                fontWeight: '800',
                fontSize: '0.9rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                display: 'inline-block',
                marginBottom: '10px'
              }}>
                {viewMode === 'individual' ? '🏆 Ranking Individual General' : '👥 Ranking por Equipos'}
              </span>
              <h2 style={{ fontSize: '2.5rem', color: '#fff', fontWeight: '800', letterSpacing: '-0.02em' }}>
                {activeGroupKey}
              </h2>
            </div>
            
            {/* Indicador visual de rotación */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {groupKeys.map((k, i) => (
                <div 
                  key={k} 
                  style={{
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: i === activeGroupIndex ? (viewMode === 'individual' ? 'var(--accent-primary)' : 'var(--accent-purple)') : 'rgba(255,255,255,0.05)',
                    boxShadow: i === activeGroupIndex ? '0 0 10px currentColor' : 'none',
                    transition: 'all 0.3s'
                  }} 
                />
              ))}
            </div>
          </div>

          {/* TABLA DE RESULTADOS EN TAMAÑO GIGANTE */}
          <div className="glass-panel" style={{
            padding: '30px',
            background: 'rgba(10, 16, 32, 0.8)',
            boxShadow: 'var(--shadow-lg)'
          }}>
            {viewMode === 'individual' ? (
              <table style={{ fontSize: '1.25rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '80px', textAlign: 'center', fontSize: '1rem' }}>PUESTO</th>
                    <th style={{ fontSize: '1rem' }}>GIMNASTA</th>
                    <th style={{ fontSize: '1rem' }}>CLUB / INSTITUCIÓN</th>
                    <th style={{ fontSize: '1rem', textAlign: 'center', width: '90px' }}>AÑO</th>
                    {tournament.aparatos.map(ap => (
                      <th key={ap} style={{ textAlign: 'center', fontSize: '1rem' }}>{ap.toUpperCase()}</th>
                    ))}
                    <th style={{ textAlign: 'center', fontSize: '1.1rem', background: 'rgba(226, 177, 60, 0.08)', color: 'var(--accent-gold)', width: '130px' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {currentGroupGymnasts.slice(0, 8).map((gym, idx) => ( // Top 8 para que quepa bien en un proyector
                    <tr key={gym.id} style={{
                      background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                      height: '65px'
                    }}>
                      <td style={{ textAlign: 'center' }}>
                        {gym.puesto <= 3 ? (
                          <span className={`podium-rank rank-${gym.puesto}`} style={{ width: '40px', height: '40px', fontSize: '1.25rem' }}>
                            {gym.puesto}
                          </span>
                        ) : (
                          <span style={{ fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{gym.puesto}</span>
                        )}
                      </td>
                      <td style={{ fontWeight: '700', color: '#fff' }}>{gym.nombre}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{gym.institucion}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{gym.nacimiento || '-'}</td>
                      {tournament.aparatos.map(ap => (
                        <td key={ap} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                          {gym.scores[ap] !== null ? gym.scores[ap].toFixed(3) : '-'}
                        </td>
                      ))}
                      <td style={{
                        textAlign: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: '800',
                        fontSize: '1.4rem',
                        color: 'var(--accent-gold)',
                        background: 'rgba(226, 177, 60, 0.04)'
                      }}>
                        {gym.totalScore > 0 ? gym.totalScore.toFixed(3) : '-'}
                      </td>
                    </tr>
                  ))}

                  {currentGroupGymnasts.length === 0 && (
                    <tr>
                      <td colSpan={5 + tournament.aparatos.length} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '50px' }}>
                        Esperando calificaciones...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              // VISTA DE TABLA DE EQUIPOS
              <table style={{ fontSize: '1.25rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '80px', textAlign: 'center', fontSize: '1rem' }}>PUESTO</th>
                    <th style={{ fontSize: '1rem' }}>CLUB / INSTITUCIÓN</th>
                    {tournament.aparatos.map(ap => (
                      <th key={ap} style={{ textAlign: 'center', fontSize: '1rem' }}>{ap.toUpperCase()} (TOP 3)</th>
                    ))}
                    <th style={{ textAlign: 'center', fontSize: '1.1rem', background: 'rgba(139, 92, 246, 0.08)', color: 'var(--accent-purple)', width: '150px' }}>TOTAL EQUIPO</th>
                  </tr>
                </thead>
                <tbody>
                  {currentTeamRankings.slice(0, 8).map((club, idx) => (
                    <tr key={club.clubName} style={{
                      background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                      height: '65px'
                    }}>
                      <td style={{ textAlign: 'center' }}>
                        {club.puesto <= 3 ? (
                          <span className={`podium-rank rank-${club.puesto}`} style={{ width: '40px', height: '40px', fontSize: '1.25rem' }}>
                            {club.puesto}
                          </span>
                        ) : (
                          <span style={{ fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{club.puesto}</span>
                        )}
                      </td>
                      <td style={{ fontWeight: '800', color: '#fff' }}>{club.clubName}</td>
                      {tournament.aparatos.map(ap => (
                        <td key={ap} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                          {club.scoresPorAparato[ap] > 0 ? club.scoresPorAparato[ap].toFixed(3) : '-'}
                        </td>
                      ))}
                      <td style={{
                        textAlign: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: '800',
                        fontSize: '1.4rem',
                        color: 'var(--accent-purple)',
                        background: 'rgba(139, 92, 246, 0.04)'
                      }}>
                        {club.totalEquipo > 0 ? club.totalEquipo.toFixed(3) : '-'}
                      </td>
                    </tr>
                  ))}

                  {currentTeamRankings.length === 0 && (
                    <tr>
                      <td colSpan={3 + tournament.aparatos.length} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '50px' }}>
                        No hay suficientes notas registradas para calcular clasificación por equipos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </main>
      ) : (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)' }}>
          <p>No hay gimnastas registradas en el torneo aún.</p>
        </div>
      )}

      {/* OVERLAY DRAMÁTICO EN VIVO (SCORE REVEAL) */}
      {liveReveal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: '#040712',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}>
          
          {/* ESTRUCTURAS DE LUCES DE DESTELLOS */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: liveReveal.score.final >= 9.20 
              ? 'radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, transparent 60%)'
              : 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 60%)',
            zIndex: 0
          }} />

          {/* Tarjeta de Revelación Gigante */}
          <div className="glass-panel" style={{
            width: '90%',
            maxWidth: '900px',
            padding: '50px',
            textAlign: 'center',
            background: 'rgba(11, 18, 38, 0.9)',
            borderWidth: '2px',
            borderColor: liveReveal.score.final >= 9.20 ? '#0ea5e9' : 'var(--accent-primary)',
            boxShadow: liveReveal.score.final >= 9.20 ? '0 0 40px rgba(14, 165, 233, 0.3)' : 'var(--shadow-glow)',
            zIndex: 5,
            position: 'relative',
            borderRadius: '24px'
          }}>
            
            {/* Logo en la tarjeta de revelación dramática */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '25px', flexDirection: 'column', alignItems: 'center' }}>
              <img 
                src="/logo.png" 
                alt="Logo" 
                style={{
                  height: '75px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 0 12px rgba(14, 165, 233, 0.25))',
                  marginBottom: '10px'
                }}
              />
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff', letterSpacing: '0.05em' }}>Gimnasia Pro MDZ</span>
            </div>

            <div style={{
              fontSize: '1rem',
              color: liveReveal.score.final >= 9.20 ? '#0ea5e9' : 'var(--accent-primary)',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              marginBottom: '10px'
            }}>
              {liveReveal.score.final >= 9.20 ? '✨ PUNTUACIÓN SOBRESALIENTE ✨' : '📣 NOTA REGISTRADA EN VIVO'}
            </div>

            <h2 style={{ fontSize: '3.8rem', color: '#fff', fontWeight: '800', marginBottom: '8px', letterSpacing: '-0.02em' }}>
              {liveReveal.gymnast.nombre}
            </h2>

            <p style={{ fontSize: '1.6rem', color: 'var(--text-secondary)', marginBottom: '30px' }}>
              {liveReveal.gymnast.institucion} • <strong>{liveReveal.gymnast.nivel} {liveReveal.gymnast.categoria}</strong>
            </p>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: '40px',
              marginTop: '10px'
            }}>
              <div style={{ fontSize: '1.2rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '15px' }}>
                Nota Final
              </div>
              <div style={{
                fontSize: '8.5rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: '900',
                color: 'var(--accent-success)',
                lineHeight: '1',
                textShadow: '0 0 40px rgba(16, 185, 129, 0.45)'
              }}>
                {parseFloat(liveReveal.score.final).toFixed(3)}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ESTILOS CSS INLINE ADICIONALES PARA EL FADEIN */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

    </div>
  );
}
