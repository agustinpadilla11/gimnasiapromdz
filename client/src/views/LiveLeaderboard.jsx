import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Users, Award, ShieldAlert, Zap, Star, Maximize, Minimize } from 'lucide-react';
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
  const [activeTeamIndex, setActiveTeamIndex] = useState(0);
  
  // Modo de proyección y última calificación
  const [projectionMode, setProjectionMode] = useState(urlApparatus ? 'ultima' : 'carrusel');
  const [lastProjected, setLastProjected] = useState(null); // { gymnast, aparato, score }

  // Estado para la revelación dramática de puntuaciones en vivo
  const [liveReveal, setLiveReveal] = useState(null);
  
  // Cola secuencial de notas flash para evitar solapamientos
  const [flashQueue, setFlashQueue] = useState([]);
  const [activeFlash, setActiveFlash] = useState(null);
  const flashTimerRef = useRef(null);

  // Helper para formatear nivel (distinguiendo Nivel 1A, Nivel 1B o Nivel 2)
  const formatNivelDisplay = (gymnast) => {
    if (!gymnast) return '';
    const nivelStr = (gymnast.nivel || '').toString().trim();
    const catStr = (gymnast.categoria || '').toString().trim();
    const grupoStr = (gymnast.grupo || '').toString().trim();
    const combined = `${nivelStr} ${catStr} ${grupoStr}`.toLowerCase().replace(/\s+/g, ' ');

    if (combined.includes('1a') || combined.includes('1 a')) {
      return 'Nivel 1A';
    }
    if (combined.includes('1b') || combined.includes('1 b')) {
      return 'Nivel 1B';
    }
    if (combined.includes('nivel 1') || combined.includes('n1') || nivelStr === '1') {
      return 'Nivel 1';
    }
    if (combined.includes('nivel 2') || combined.includes('n2') || combined.includes('2')) {
      return 'Nivel 2';
    }
    return nivelStr ? `Nivel ${nivelStr}` : 'Nivel 1';
  };

  // Pantalla completa
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (tournament) {
      const showEquipos = tournament.configuracion?.premios?.equipos ?? true;
      const showAllAround = tournament.configuracion?.premios?.allAround ?? true;
      if (!showAllAround && showEquipos && viewMode === 'individual') {
        setViewMode('equipos');
      } else if (!showEquipos && showAllAround && viewMode === 'equipos') {
        setViewMode('individual');
      }
    }
  }, [tournament, viewMode]);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error al intentar activar pantalla completa: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };
  
  // Referencias para timers
  const rotationTimerRef = useRef(null);
  const revealTimerRef = useRef(null);

  // --- LÓGICA DE CLASIFICACIÓN (Igual a la del AdminDashboard) ---
  const filteredGymnastsByTurno = selectedTurno === 'Todos'
    ? gymnasts
    : gymnasts.filter(g => g.grupo === selectedTurno);

  const groupedRankings = {};
  filteredGymnastsByTurno.forEach(g => {
    const formatStr = (str) => {
      if (!str) return '';
      return str.trim().toLowerCase().split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };
    const nivelFmt = formatStr(g.nivel);
    const catFmt = formatStr(g.categoria);
    const isMayor = catFmt.toLowerCase().includes('mayor');
    const groupingYear = isMayor ? '' : g.nacimiento;
    const key = groupingYear ? `${nivelFmt} - ${catFmt} ${groupingYear}` : `${nivelFmt} - ${catFmt}`;
    if (!groupedRankings[key]) groupedRankings[key] = [];

    let totalScore = 0;
    let hasScores = false;
    const scores = {};
    if (tournament && tournament.aparatos) {
      const is1BGroup = key.toLowerCase().replace(/\s+/g, '').includes('1b');
      const categoryApparatuses = tournament.aparatos.filter(ap => {
        if (is1BGroup) {
          const name = ap.toLowerCase();
          return name.includes('salto') || name.includes('suelo');
        }
        return true;
      });

      tournament.aparatos.forEach(ap => {
        const note = g.notas?.[ap]?.final;
        if (categoryApparatuses.includes(ap) && note !== undefined && note !== null) {
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

  const formatStr = (str) => {
    if (!str) return '';
    return str.trim().toLowerCase().split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };
  const getBaseCategory = (g) => `${formatStr(g.nivel)} - ${formatStr(g.categoria)}`;

  // Categorías completas para equipos (sin división por edad ni año)
  const allTeamCategories = [...new Set(filteredGymnastsByTurno.map(g => getBaseCategory(g)))].filter(Boolean).sort();
  const rotatedTeamCategories = selectedGroups.length > 0
    ? allTeamCategories.filter(cat => selectedGroups.some(sg => sg.startsWith(cat) || cat.startsWith(sg)))
    : allTeamCategories;

  const safeTeamIndex = activeTeamIndex >= rotatedTeamCategories.length ? 0 : activeTeamIndex;
  const activeTeamCategory = rotatedTeamCategories[safeTeamIndex] || allTeamCategories[0] || '';

  const availableTurnos = [...new Set(gymnasts.map(g => g.grupo || 'Turno 1'))].filter(Boolean).sort();
  const allGroups = [...new Set(gymnasts.map(g => {
    const nivelFmt = formatStr(g.nivel);
    const catFmt = formatStr(g.categoria);
    const isMayor = catFmt.toLowerCase().includes('mayor');
    const groupingYear = isMayor ? '' : g.nacimiento;
    return groupingYear ? `${nivelFmt} - ${catFmt} ${groupingYear}` : `${nivelFmt} - ${catFmt}`;
  }))].filter(Boolean).sort();

  // Obtener gimnastas del grupo actual
  const currentGroupGymnasts = groupedRankings[activeGroupKey] || [];

  const activeDisplayKey = viewMode === 'individual' ? activeGroupKey : activeTeamCategory;
  const is1BGroup = activeDisplayKey && activeDisplayKey.toLowerCase().replace(/\s+/g, '').includes('1b');
  const displayApparatuses = tournament ? tournament.aparatos.filter(ap => {
    if (is1BGroup) {
      const name = ap.toLowerCase();
      return name.includes('salto') || name.includes('suelo');
    }
    return true;
  }) : [];

  // Obtener ranking por equipos (se toma la CATEGORÍA COMPLETA, sin división por edad)
  const minGimnastasEquipo = tournament?.configuracion?.equipoMinGimnastas ?? (tournament?.id === 'ejemplo-regional-4874' ? 6 : 3);
  const maxGimnastasEquipo = tournament?.configuracion?.equipoMaxGimnastas ?? (tournament?.id === 'ejemplo-regional-4874' ? 12 : Infinity);
  const mejoresNotasEquipo = tournament?.configuracion?.equipoMejoresNotas ?? (tournament?.id === 'ejemplo-regional-4874' ? 6 : 3);

  const getTeamRankings = (baseCategory) => {
    if (!baseCategory) return [];
    // En equipos participan todas las gimnastas de la categoría completa (sin filtro por edad)
    const members = filteredGymnastsByTurno.filter(g => getBaseCategory(g) === baseCategory);

    const clubMembers = {};
    members.forEach(m => {
      if (!clubMembers[m.institucion]) clubMembers[m.institucion] = [];
      clubMembers[m.institucion].push(m);
    });

    const clubResults = [];
    Object.keys(clubMembers).forEach(clubName => {
      const clMembers = clubMembers[clubName];
      if (clMembers.length < minGimnastasEquipo) return;
      let totalEquipo = 0;
      const scoresPorAparato = {};
      const eligibleMembers = clMembers.slice(0, maxGimnastasEquipo);

      if (tournament && tournament.aparatos) {
        const is1B = baseCategory.toLowerCase().replace(/\s+/g, '').includes('1b');
        const categoryApparatuses = tournament.aparatos.filter(ap => {
          if (is1B) {
            const name = ap.toLowerCase();
            return name.includes('salto') || name.includes('suelo');
          }
          return true;
        });

        tournament.aparatos.forEach(ap => {
          if (!categoryApparatuses.includes(ap)) {
            scoresPorAparato[ap] = 0;
            return;
          }
          const notes = eligibleMembers
            .map(m => m.scores ? m.scores[ap] : (m.notas?.[ap]?.final !== undefined ? parseFloat(m.notas[ap].final) : null))
            .filter(n => n !== null && n !== undefined && !isNaN(n))
            .sort((a, b) => b - a);
          
          const bestScores = notes.slice(0, mejoresNotasEquipo);
          const sum = bestScores.reduce((a, b) => a + b, 0);
          scoresPorAparato[ap] = sum > 0 ? parseFloat(sum.toFixed(3)) : 0;
          totalEquipo += scoresPorAparato[ap];
        });
      }

      const descuento = tournament.descuentosEquipos?.[baseCategory]?.[clubName] || 0;
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

  const currentTeamRankings = getTeamRankings(activeTeamCategory);

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
          
          const isGlobalScreen = !urlApparatus;
          const isMatchingApparatus = urlApparatus && msg.aparato === urlApparatus;

          if (isGlobalScreen || isMatchingApparatus) {
            setLastProjected({ gymnast: msg.gymnast, aparato: msg.aparato, score: msg.score });
            
            // Si es pantalla dedicada, mostramos el dramatic reveal. Si es global, encolamos la nota flash
            if (isMatchingApparatus) {
              setProjectionMode('ultima');
              triggerReveal(msg.gymnast, msg.aparato, msg.score);
            } else {
              const newFlashItem = {
                id: Date.now() + Math.random(),
                gymnast: msg.gymnast,
                gymnastName: msg.gymnast.nombre,
                institucion: msg.gymnast.institucion,
                nivel: msg.gymnast.nivel,
                categoria: msg.gymnast.categoria,
                score: msg.score.final,
                notaD: msg.score.notaD,
                aparato: msg.aparato
              };
              setFlashQueue(prev => [...prev, newFlashItem]);
            }
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
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [apiBase, wsBase, auth.tournamentId]);

  // Manejo de la cola de notas flash (despliegue secuencial ordenado para evitar solapamientos)
  useEffect(() => {
    if (!activeFlash && flashQueue.length > 0) {
      const nextFlash = flashQueue[0];
      setActiveFlash(nextFlash);
      setFlashQueue(prev => prev.slice(1));

      // Disparar confeti si la nota es excelente (> 9.20)
      if (nextFlash.score >= 9.20) {
        confetti({
          particleCount: 130,
          spread: 80,
          origin: { y: 0.6 }
        });
      }

      // Tiempo de visualización: si hay notas esperando en cola, reducimos a 4.5s; si es única, 6.5s
      const duration = flashQueue.length > 1 ? 4500 : 6500;
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        setActiveFlash(null);
      }, duration);
    }
  }, [activeFlash, flashQueue]);

  // Lógica de carrusel rotativo
  useEffect(() => {
    if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
    
    // Si hay una revelación en vivo o nota flash activa, pausar rotación del fondo
    if (liveReveal || activeFlash) return;
 
    rotationTimerRef.current = setInterval(() => {
      const showEquipos = tournament?.configuracion?.premios?.equipos ?? true;
      const showAllAround = tournament?.configuracion?.premios?.allAround ?? true;
 
      if (viewMode === 'individual') {
        const keys = rotatedGroups;
        if (keys.length === 0) return;
        // Avanzar al siguiente grupo individual o cambiar a equipos
        if (activeGroupIndex < keys.length - 1) {
          setActiveGroupIndex(prev => prev + 1);
        } else {
          if (showEquipos && rotatedTeamCategories.length > 0) {
            setViewMode('equipos');
            setActiveTeamIndex(0);
          } else {
            setActiveGroupIndex(0);
          }
        }
      } else {
        // En modo equipos, rotar a través de las categorías completas (sin división por edad)
        const keys = rotatedTeamCategories;
        if (keys.length === 0) return;
        if (activeTeamIndex < keys.length - 1) {
          setActiveTeamIndex(prev => prev + 1);
        } else {
          if (showAllAround && rotatedGroups.length > 0) {
            setViewMode('individual');
            setActiveGroupIndex(0);
          } else {
            setActiveTeamIndex(0);
          }
        }
      }
    }, 12000); // Rota cada 12 segundos
 
    return () => clearInterval(rotationTimerRef.current);
  }, [gymnasts, activeGroupIndex, activeTeamIndex, viewMode, liveReveal, activeFlash, selectedGroups, selectedTurno, rotatedGroups, rotatedTeamCategories]);

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

      {/* Botón flotante para salir de pantalla completa en dispositivos táctiles/sin teclado */}
      {isFullscreen && (
        <button
          onClick={handleToggleFullscreen}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            opacity: 0.3,
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
          onMouseLeave={(e) => e.currentTarget.style.opacity = 0.3}
          title="Salir de Pantalla Completa (ESC)"
        >
          <Minimize size={18} />
        </button>
      )}

      {/* HEADER PRINCIPAL DE PROYECCIÓN */}
      {!isFullscreen && (
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

          {/* FILTROS DE CARRUSEL */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              display: 'flex', 
              gap: '12px', 
              alignItems: 'center', 
              background: 'rgba(255,255,255,0.02)', 
              padding: '6px 12px', 
              borderRadius: '10px', 
              border: '1px solid rgba(255,255,255,0.05)' 
            }}>
              {/* Selector de Turno */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    background: 'var(--bg-input)',
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

              {/* Divisor vertical */}
              <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.08)' }} />

              {/* Selector de Nivel - Categoría Multi-Select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Clasif:</span>
                
                <button
                  type="button"
                  onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                  className="input-field"
                  style={{
                    width: '180px',
                    padding: '4px 8px',
                    fontSize: '0.8rem',
                    background: 'var(--bg-input)',
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
                      background: 'var(--bg-card)',
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
                        borderBottom: '1px solid var(--border-color)',
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
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
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
            <button
              onClick={() => {
                setViewMode(prev => prev === 'individual' ? 'equipos' : 'individual');
              }}
              className="btn btn-secondary"
              style={{
                padding: '8px 12px',
                fontSize: '0.8rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                border: viewMode === 'equipos' ? '1px solid var(--accent-purple)' : '1px solid var(--accent-primary)',
                color: viewMode === 'equipos' ? 'var(--accent-purple)' : 'var(--accent-primary)',
                fontWeight: '600'
              }}
              title="Cambiar vista entre Individual y Equipos"
            >
              {viewMode === 'individual' ? '👥 Ver Equipos' : '🏆 Ver Individual'}
            </button>
            <button 
              onClick={handleToggleFullscreen} 
              className="btn btn-secondary" 
              style={{ 
                padding: '8px 12px', 
                fontSize: '0.8rem', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px',
                border: '1px solid rgba(255, 255, 255, 0.15)'
              }}
              title="Pantalla Completa"
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
              {isFullscreen ? 'Salir' : 'Pantalla Completa'}
            </button>
          </div>
        </header>
      )}

      {/* PANTALLA PRINCIPAL DE TABLERO DE RESULTADOS */}
      {groupKeys.length > 0 ? (
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
              <h2 style={{ fontSize: '2.5rem', color: '#fff', fontWeight: '800', letterSpacing: '-0.02em', margin: 0 }}>
                {viewMode === 'individual' ? activeGroupKey : activeTeamCategory}
              </h2>
              {viewMode === 'equipos' && (
                <div style={{ fontSize: '0.95rem', color: 'var(--accent-purple)', marginTop: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Categoría Completa (Sin división por edad)</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>· Mejores {mejoresNotasEquipo} notas</span>
                </div>
              )}
            </div>
            
            {/* Indicador visual de rotación */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {(viewMode === 'individual' ? rotatedGroups : rotatedTeamCategories).map((k, i) => (
                <div 
                  key={k} 
                  style={{
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: i === (viewMode === 'individual' ? safeGroupIndex : safeTeamIndex) ? (viewMode === 'individual' ? 'var(--accent-primary)' : 'var(--accent-purple)') : 'rgba(255,255,255,0.05)',
                    boxShadow: i === (viewMode === 'individual' ? safeGroupIndex : safeTeamIndex) ? '0 0 10px currentColor' : 'none',
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
                    {displayApparatuses.map(ap => (
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
                      {displayApparatuses.map(ap => (
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
                      <td colSpan={5 + displayApparatuses.length} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '50px' }}>
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
                    {displayApparatuses.map(ap => (
                      <th key={ap} style={{ textAlign: 'center', fontSize: '1rem' }}>{ap.toUpperCase()}</th>
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
                      {displayApparatuses.map(ap => (
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
                      <td colSpan={3 + displayApparatuses.length} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '50px' }}>
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

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 24px',
                borderRadius: '999px',
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1.5px solid var(--accent-primary)',
                color: '#60a5fa',
                fontWeight: '800',
                fontSize: '1.5rem',
                textTransform: 'uppercase'
              }}>
                Aparato: {liveReveal.aparato}
              </div>

              {(() => {
                const nivelStr = formatNivelDisplay(liveReveal.gymnast);
                const is1A = nivelStr.includes('1A');
                const is1B = nivelStr.includes('1B');
                const bgCol = is1A ? 'rgba(16, 185, 129, 0.22)' : is1B ? 'rgba(245, 158, 11, 0.22)' : 'rgba(168, 85, 247, 0.22)';
                const borderCol = is1A ? '#10b981' : is1B ? '#f59e0b' : '#a855f7';
                const textCol = is1A ? '#34d399' : is1B ? '#fbbf24' : '#c084fc';
                return (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 18px',
                    borderRadius: '999px',
                    background: bgCol,
                    border: `1.5px solid ${borderCol}`,
                    color: textCol,
                    fontWeight: '800',
                    fontSize: '1.15rem',
                    textTransform: 'uppercase'
                  }}>
                    ⭐ {nivelStr}
                  </div>
                );
              })()}
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
              {liveReveal.gymnast.institucion || 'Independiente'} • <strong>{formatNivelDisplay(liveReveal.gymnast)} {liveReveal.gymnast.categoria ? `• ${liveReveal.gymnast.categoria}` : ''}</strong>
            </p>

            {(() => {
              const isGamApparatus = tournament?.modalidad === 'GAM' || (tournament?.modalidad === 'Ambos' && (liveReveal.aparato.includes('(M)') || ['Arzones', 'Anillas', 'Barra Fija'].includes(liveReveal.aparato)));
              const tipoCalc = tournament?.configuracion?.tipoCalculo;
              const showNotaD = tipoCalc !== 'base 10' && !isGamApparatus && liveReveal.score.notaD > 0;

              return (
                <div style={{
                  display: 'flex',
                  flexDirection: showNotaD ? 'row' : 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: showNotaD ? '80px' : '0',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: '40px',
                  marginTop: '10px'
                }}>
                  
                  {showNotaD && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ fontSize: '1.2rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '15px' }}>
                        Nota D
                      </div>
                      <div style={{
                        fontSize: '6.5rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: '800',
                        color: '#f59e0b',
                        lineHeight: '1',
                        textShadow: '0 0 30px rgba(245, 158, 11, 0.3)'
                      }}>
                        {parseFloat(liveReveal.score.notaD).toFixed(3)}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: '1.2rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '15px' }}>
                      Nota Final
                    </div>
                    <div style={{
                      fontSize: showNotaD ? '7.5rem' : '8.5rem',
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
              );
            })()}

          </div>
        </div>
      )}

      {/* FLASH SCORE NOTIFICATIONS SECUENCIALES (PANTALLA COMPLETA, SIN SOLAPAMIENTO) */}
      {activeFlash && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(3, 7, 18, 0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          animation: 'fadeInFlash 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}>
          {/* Tarjeta de Flash Score */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(8, 12, 28, 0.98))',
            border: activeFlash.score >= 9.20 
              ? '3px solid #38bdf8' 
              : '3px solid var(--accent-primary)',
            boxShadow: activeFlash.score >= 9.20
              ? '0 25px 70px rgba(14, 165, 233, 0.45), 0 0 100px rgba(56, 189, 248, 0.2)'
              : '0 25px 70px rgba(0, 0, 0, 0.8), 0 0 80px rgba(59, 130, 246, 0.25)',
            borderRadius: '32px',
            padding: '45px 60px',
            maxWidth: '1000px',
            width: '92%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            position: 'relative'
          }}>
            {/* Botón para cerrar la nota anticipadamente */}
            <button
              onClick={() => setActiveFlash(null)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '25px',
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '1.2rem',
                cursor: 'pointer',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Cerrar nota"
            >
              ✕
            </button>

            {/* Badges de Aparato y Nivel (1A / 1B / 2) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', justifyContent: 'center', alignItems: 'center', marginBottom: '20px' }}>
              {/* APARATO */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 30px',
                borderRadius: '999px',
                background: 'rgba(59, 130, 246, 0.2)',
                border: '2px solid var(--accent-primary)',
                color: '#60a5fa',
                fontWeight: '900',
                fontSize: '1.8rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)'
              }}>
                Aparato: {activeFlash.aparato}
              </div>

              {/* NIVEL (Nivel 1A, Nivel 1B o Nivel 2) */}
              {(() => {
                const nivelStr = formatNivelDisplay(activeFlash.gymnast || activeFlash);
                const is1A = nivelStr.includes('1A');
                const is1B = nivelStr.includes('1B');

                const bgCol = is1A ? 'rgba(16, 185, 129, 0.22)' : is1B ? 'rgba(245, 158, 11, 0.22)' : 'rgba(168, 85, 247, 0.22)';
                const borderCol = is1A ? '#10b981' : is1B ? '#f59e0b' : '#a855f7';
                const textCol = is1A ? '#34d399' : is1B ? '#fbbf24' : '#c084fc';

                return (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 24px',
                    borderRadius: '999px',
                    background: bgCol,
                    border: `2px solid ${borderCol}`,
                    color: textCol,
                    fontWeight: '900',
                    fontSize: '1.35rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    boxShadow: `0 0 20px ${borderCol}44`
                  }}>
                    ⭐ {nivelStr}
                  </div>
                );
              })()}
            </div>

            {/* Nombre de la Gimnasta */}
            <h1 style={{
              fontSize: 'clamp(2.4rem, 5.5vw, 4.4rem)',
              fontWeight: '900',
              color: '#ffffff',
              margin: '10px 0 6px',
              textTransform: 'uppercase',
              letterSpacing: '-0.02em',
              textShadow: '0 4px 30px rgba(0,0,0,0.8)'
            }}>
              {activeFlash.gymnastName}
            </h1>

            {/* Club e Institución */}
            <div style={{
              fontSize: '1.45rem',
              color: 'var(--text-secondary)',
              marginBottom: '25px',
              fontWeight: '500'
            }}>
              {activeFlash.institucion || 'Independiente'}
              {activeFlash.categoria ? ` • ${activeFlash.categoria}` : ''}
            </div>

            {/* Puntaje Final y Nota D */}
            {(() => {
              const isGamApparatus = tournament?.modalidad === 'GAM' || (tournament?.modalidad === 'Ambos' && (activeFlash.aparato.includes('(M)') || ['Arzones', 'Anillas', 'Barra Fija'].includes(activeFlash.aparato)));
              const tipoCalc = tournament?.configuracion?.tipoCalculo;
              const showNotaD = tipoCalc !== 'base 10' && !isGamApparatus && activeFlash.notaD > 0;

              return (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: showNotaD ? '70px' : '0',
                  paddingTop: '25px',
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  width: '100%'
                }}>
                  {showNotaD && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '1.15rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: '700', marginBottom: '5px' }}>
                        Nota D
                      </span>
                      <span style={{
                        fontSize: 'clamp(3.5rem, 6.5vw, 5.2rem)',
                        fontWeight: '800',
                        color: '#f59e0b',
                        fontFamily: 'var(--font-mono)',
                        lineHeight: '1',
                        textShadow: '0 0 25px rgba(245, 158, 11, 0.4)'
                      }}>
                        {Number(activeFlash.notaD).toFixed(3)}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '1.25rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: '800', marginBottom: '5px' }}>
                      Nota Final
                    </span>
                    <span style={{
                      fontSize: showNotaD ? 'clamp(5rem, 9vw, 7.5rem)' : 'clamp(6rem, 12vw, 9rem)',
                      fontWeight: '900',
                      color: 'var(--accent-success)',
                      fontFamily: 'var(--font-mono)',
                      lineHeight: '1',
                      textShadow: '0 0 50px rgba(16, 185, 129, 0.55)'
                    }}>
                      {activeFlash.score !== undefined && activeFlash.score !== null ? Number(activeFlash.score).toFixed(3) : '-'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Aviso de Notas en Espera en la Cola */}
            {flashQueue.length > 0 && (
              <div style={{
                marginTop: '30px',
                padding: '8px 22px',
                borderRadius: '999px',
                background: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#93c5fd',
                fontSize: '1.05rem',
                fontWeight: '600',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#60a5fa', animation: 'pulseDot 1.5s infinite' }} />
                <span>En espera: <strong>{flashQueue[0].gymnastName} ({flashQueue[0].aparato})</strong> {flashQueue.length > 1 ? ` y ${flashQueue.length - 1} más` : ''}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ESTILOS CSS INLINE ADICIONALES PARA ANIMACIONES */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeInFlash {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.4); }
        }
      `}</style>

    </div>
  );
}
