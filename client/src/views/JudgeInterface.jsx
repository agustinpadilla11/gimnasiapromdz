import React, { useState, useEffect, useRef } from 'react';
import { LogOut, Check, HelpCircle, Edit2, ChevronRight, User, Settings, CheckCircle2, RotateCcw, AlertTriangle, Tv } from 'lucide-react';

export default function JudgeInterface({ apiBase, wsBase, auth, onLogout, onChangeView }) {
  const [tournament, setTournament] = useState(null);
  const [gymnasts, setGymnasts] = useState([]);
  const [selectedApparatus, setSelectedApparatus] = useState('');
  const [activeTurno, setActiveTurno] = useState('Turno 1');
  const [activeNivel, setActiveNivel] = useState('Todos');
  const [activeCategoria, setActiveCategoria] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGymnast, setSelectedGymnast] = useState(null);
  
  // Extraer valores únicos para los filtros basados en la lista de gimnastas
  const turnos = [...new Set(gymnasts.map(g => g.grupo || 'Turno 1'))].sort();
  const niveles = ['Todos', ...new Set(gymnasts.map(g => g.nivel))].sort();
  const categorias = ['Todos', ...new Set(gymnasts.map(g => g.categoria))].sort();
  
  // Conexión websocket persistida
  const wsRef = useRef(null);
  
  // Estado para proyectar la nota cargada
  const [lastSubmittedScore, setLastSubmittedScore] = useState(null); // { gymnast, score }
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // Última calificación fija en el aparato activo
  const [lastScore, setLastScore] = useState(null); 
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (turnos.length > 0 && !turnos.includes(activeTurno)) {
      setActiveTurno(turnos[0]);
    }
  }, [gymnasts, activeTurno]);
  
  // Configuración de notas de jueces
  const [numJueces, setNumJueces] = useState(2); // Por defecto 2 jueces como la planilla
  const [juezDeductions, setJuezDeductions] = useState(['', '', '', '', '', '']); // Deducciones de Juez 1 a 6
  const [currentInputIdx, setCurrentInputIdx] = useState(0); // Foco en el teclado numérico virtual
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // Cargar datos del torneo
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
        
        // Auto-seleccionar primer aparato si no hay ninguno seleccionado
        if (!selectedApparatus && data.aparatos && data.aparatos.length > 0) {
          setSelectedApparatus(data.aparatos[0]);
        }
      }
    } catch (err) {
      console.error('Error al cargar datos del torneo:', err);
    }
  };

  const getLatestScoreForApparatus = (gymnastList, apparatus) => {
    let latest = null;
    gymnastList.forEach(g => {
      const scObj = g.notas?.[apparatus];
      if (scObj && scObj.fechaRegistro) {
        if (!latest || new Date(scObj.fechaRegistro) > new Date(latest.score.fechaRegistro)) {
          latest = { gymnast: g, aparato: apparatus, score: scObj };
        }
      }
    });
    return latest;
  };

  useEffect(() => {
    if (tournament && gymnasts.length > 0 && selectedApparatus) {
      const latest = getLatestScoreForApparatus(gymnasts, selectedApparatus);
      setLastScore(latest);
    }
  }, [selectedApparatus, gymnasts, tournament]);

  useEffect(() => {
    fetchTournamentData();
    
    // Conectar WebSocket para recibir actualizaciones (por si cómputos cambia datos de gimnastas)
    const ws = new WebSocket(`${wsBase}`);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'REGISTER',
        tournamentId: auth.tournamentId,
        role: 'jueces'
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
          setGymnasts(prev => prev.map(g => g.id === msg.gymnast.id ? msg.gymnast : g));
          if (msg.aparato === selectedApparatus) {
            setLastScore({ gymnast: msg.gymnast, aparato: msg.aparato, score: msg.score });
          }
        } else if (msg.type === 'PROJECT_SCORE') {
          if (msg.aparato === selectedApparatus) {
            setLastScore({ gymnast: msg.gymnast, aparato: msg.aparato, score: msg.score });
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [apiBase, wsBase, auth.tournamentId, selectedApparatus]);

  // Escuchar teclado físico para ingresar deducciones en caliente
  useEffect(() => {
    if (!selectedGymnast) return;

    const handleKeyDown = (e) => {
      // Evitar interceptar si el usuario está en el campo de búsqueda de texto
      if (document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text') {
        return;
      }

      const key = e.key;

      if (/^[0-9.]$/.test(key)) {
        e.preventDefault();
        handleKeypadPress(key);
      } else if (key === 'Backspace') {
        e.preventDefault();
        handleKeypadPress('BACK');
      } else if (key === 'Escape' || key === 'c' || key === 'C') {
        e.preventDefault();
        handleKeypadPress('CLEAR');
      } else if (key === 'Enter') {
        e.preventDefault();
        // Si hay un juez posterior, avanzar el foco. Si es el último, enviar nota
        if (currentInputIdx < numJueces - 1) {
          setCurrentInputIdx(prev => prev + 1);
        } else {
          handleSubmitScore();
        }
      } else if (key === 'ArrowDown' || key === 'Tab') {
        e.preventDefault();
        if (currentInputIdx < numJueces - 1) {
          setCurrentInputIdx(prev => prev + 1);
        }
      } else if (key === 'ArrowUp') {
        e.preventDefault();
        if (currentInputIdx > 0) {
          setCurrentInputIdx(prev => prev - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedGymnast, currentInputIdx, numJueces, juezDeductions]);

  if (!tournament) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Cargando datos del torneo...</p>
      </div>
    );
  }

  // Filtrar gimnastas
  const filteredGymnasts = gymnasts.filter(g => {
    const matchTurno = g.grupo === activeTurno;
    const matchNivel = activeNivel === 'Todos' || g.nivel === activeNivel;
    const matchCategoria = activeCategoria === 'Todos' || g.categoria === activeCategoria;
    const matchSearch = g.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        g.institucion.toLowerCase().includes(searchQuery.toLowerCase());
    return matchTurno && matchNivel && matchCategoria && matchSearch;
  });

  // Dividir en juzgados y no juzgados para el aparato actual
  const pendingGymnasts = filteredGymnasts.filter(g => !g.notas?.[selectedApparatus]);
  const judgedGymnasts = filteredGymnasts.filter(g => !!g.notas?.[selectedApparatus]);
  
  const totalGymnastsCount = filteredGymnasts.length;
  const judgedGymnastsCount = judgedGymnasts.length;
  const progressPercent = totalGymnastsCount > 0 ? (judgedGymnastsCount / totalGymnastsCount) * 100 : 0;

  // Selección de gimnasta para calificar
  const handleSelectGymnast = (gymnast) => {
    setSelectedGymnast(gymnast);
    setMessage('');
    setSubmittedSuccess(false);
    setLastSubmittedScore(null);
    
    // Cargar nota si ya existe una registrada
    const notaExistente = gymnast.notas?.[selectedApparatus];
    if (notaExistente && notaExistente.jueces) {
      const newDeductions = ['', '', '', '', '', ''];
      notaExistente.jueces.forEach((val, i) => {
        if (i < 6) newDeductions[i] = val !== null && val !== undefined ? String(val) : '';
      });
      setJuezDeductions(newDeductions);
      setNumJueces(notaExistente.jueces.length);
    } else {
      setJuezDeductions(['', '', '', '', '', '']);
    }
    setCurrentInputIdx(0);
  };

  const getBaseScoreForGymnast = (gymnast) => {
    if (!tournament || tournament.modalidad !== 'GAM') return 10.00;
    
    const nivel = gymnast?.nivel || '';
    const categoria = gymnast?.categoria || '';
    const text = `${nivel} ${categoria}`.toLowerCase();
    
    if (text.includes('ac4')) return 9.50;
    if (text.includes('ac3')) return 9.20;
    if (text.includes('ac2')) return 8.90;
    if (text.includes('ac1')) return 8.60;
    if (text.includes('ac0')) return 8.30;
    
    if (text.includes('juvenil') || text.includes('junior')) return 9.50;
    if (text.includes('cadete')) return 9.20;
    if (text.includes('infantil') && !text.includes('pre')) return 8.90;
    if (text.includes('pre')) return 8.60;
    if (text.includes('mini')) return 8.30;
    
    if (text.includes('ac')) return 8.30;
    
    return 10.00;
  };

  // Lógica de cálculo en caliente
  const getCalculatedScore = () => {
    const activeVals = juezDeductions.slice(0, numJueces)
      .map(v => v !== '' ? parseFloat(v) : null)
      .filter(v => v !== null && !isNaN(v));

    const base = getBaseScoreForGymnast(selectedGymnast);

    if (activeVals.length === 0) return { promedio: 0, notaB: base, final: base };

    const promedio = activeVals.reduce((a, b) => a + b, 0) / activeVals.length;
    
    let notaB = 0;
    if (tournament.modalidad === 'GAM') {
      notaB = promedio;
    } else {
      notaB = base - promedio;
    }
    
    // Si la gimnasta ya tiene descuentos extra en cómputos, mantenerlos
    const dtos = selectedGymnast?.notas?.[selectedApparatus]?.dtos || 0;
    const final = notaB - dtos;

    return {
      promedio: parseFloat(promedio.toFixed(3)),
      notaB: parseFloat(notaB.toFixed(3)),
      final: parseFloat(final.toFixed(3)),
      numActive: activeVals.length
    };
  };

  const scoreCalc = getCalculatedScore();

  // Enviar puntuación al servidor
  const handleSubmitScore = async () => {
    if (!selectedGymnast) return;
    
    // Asegurar que hay al menos una nota ingresada
    const activeVals = juezDeductions.slice(0, numJueces).filter(v => v !== '');
    if (activeVals.length === 0) {
      setMessage('Por favor, ingresa al menos una nota de juez.');
      return;
    }

    setSubmitting(true);
    setMessage('');

    try {
      const res = await fetch(`${apiBase}/tournaments/${auth.tournamentId}/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-juez-pin': auth.pin,
          'x-admin-pin': auth.pin
        },
        body: JSON.stringify({
          gymnastId: selectedGymnast.id,
          aparato: selectedApparatus,
          jueces: juezDeductions.slice(0, numJueces).map(v => v === '' ? null : parseFloat(v)),
          dtos: selectedGymnast.notas?.[selectedApparatus]?.dtos || 0,
          baseScore: getBaseScoreForGymnast(selectedGymnast)
        })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage('');
        setLastSubmittedScore({
          gymnast: selectedGymnast,
          score: data.score || scoreCalc
        });
        setSubmittedSuccess(true);
        
        // Actualizar la lista local de gimnastas inmediatamente para marcarla en verde y pasarla a Calificados
        setGymnasts(prev => prev.map(g => {
          if (g.id === selectedGymnast.id) {
            return {
              ...g,
              notas: {
                ...g.notas,
                [selectedApparatus]: data.score || scoreCalc
              }
            };
          }
          return g;
        }));
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setMessage('Error de conexión al enviar puntuación.');
    } finally {
      setSubmitting(false);
    }
  };

  // Pasar a la siguiente gimnasta pendiente
  const handleNextGymnast = () => {
    setSubmittedSuccess(false);
    setLastSubmittedScore(null);
    setMessage('');

    if (selectedGymnast) {
      const currentIdx = pendingGymnasts.findIndex(g => g.id === selectedGymnast.id);
      if (currentIdx !== -1 && currentIdx < pendingGymnasts.length - 1) {
        handleSelectGymnast(pendingGymnasts[currentIdx + 1]);
      } else if (pendingGymnasts.length > 1 && currentIdx === pendingGymnasts.length - 1) {
        handleSelectGymnast(pendingGymnasts[0]);
      } else {
        setSelectedGymnast(null);
      }
    }
  };

  // Emitir señal WS para proyectar la nota sólo en la TV HDMI de la mesa de este juez
  const handleProjectJudgeScore = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && lastSubmittedScore) {
      wsRef.current.send(JSON.stringify({
        type: 'PROJECT_JUDGE_SCORE',
        tournamentId: auth.tournamentId,
        gymnast: lastSubmittedScore.gymnast,
        aparato: selectedApparatus,
        score: lastSubmittedScore.score
      }));
      setMessage('¡Nota proyectada en la TV de tu mesa!');
    } else {
      setMessage('Error: Sin conexión para proyectar en TV.');
    }
  };

  // Teclado virtual
  const handleKeypadPress = (val) => {
    const currentVal = juezDeductions[currentInputIdx];
    let newVal = currentVal;

    if (val === 'CLEAR') {
      newVal = '';
    } else if (val === 'BACK') {
      newVal = currentVal.substring(0, currentVal.length - 1);
    } else if (val === '.') {
      if (!currentVal.includes('.')) {
        newVal = currentVal === '' ? '0.' : currentVal + '.';
      }
    } else {
      // Evitar ingresar múltiples números en el entero si son descuentos estándar (normalmente 0, 1, 2)
      newVal = currentVal + val;
    }

    const updated = [...juezDeductions];
    updated[currentInputIdx] = newVal;
    setJuezDeductions(updated);
  };

  // Atajos rápidos para tablet de deducciones
  const handleQuickDeduction = (dedValue) => {
    const updated = [...juezDeductions];
    updated[currentInputIdx] = String(dedValue);
    setJuezDeductions(updated);
    
    // Auto avanzar al siguiente juez
    if (currentInputIdx < numJueces - 1) {
      setCurrentInputIdx(prev => prev + 1);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* HEADER DE MESA JUECES */}
      <header className="glass-panel" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        marginBottom: '24px',
        background: 'rgba(15, 23, 42, 0.8)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{
            padding: '8px 12px',
            borderRadius: '10px',
            background: 'var(--accent-primary)',
            color: '#fff',
            fontWeight: '800',
            fontSize: '1.1rem'
          }}>
            {selectedApparatus === 'Salto' ? '🪵' : selectedApparatus === 'Suelo' ? '🤸' : selectedApparatus === 'Viga' ? '🛹' : '🪜'} {selectedApparatus.toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '2px' }}>Panel de Jueces</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {tournament.nombre} ({tournament.modalidad})
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Selector de Aparato en barra superior */}
          <select
            className="input-field"
            style={{ width: '150px', padding: '8px 12px', fontSize: '0.9rem', cursor: 'pointer' }}
            value={selectedApparatus}
            onChange={(e) => {
              setSelectedApparatus(e.target.value);
              setSelectedGymnast(null);
            }}
          >
            {tournament.aparatos.map(ap => (
              <option key={ap} value={ap}>{ap}</option>
            ))}
          </select>

          <button 
            onClick={() => window.open(`${window.location.origin}?view=public&aparato=${selectedApparatus}&tournamentId=${auth.tournamentId}`, '_blank')} 
            className="btn btn-secondary" 
            style={{ gap: '8px', border: '1px solid var(--accent-primary)', fontSize: '0.9rem', padding: '8px 14px' }}
          >
            Ver Proyección
          </button>

          <button onClick={onLogout} className="btn btn-secondary" style={{ padding: '8px 14px', gap: '6px' }}>
            <LogOut size={16} />
            Salir
          </button>
        </div>
      </header>

      <div style={{ 
        display: isMobile ? 'flex' : 'grid',
        gridTemplateColumns: isMobile ? undefined : '1fr 1fr',
        flexDirection: isMobile ? 'column' : undefined,
        gap: isMobile ? '16px' : '24px',
        alignItems: 'start'
      }}>
        {(!isMobile || (!selectedGymnast && !submittedSuccess)) && (
          /* COLUMNA IZQUIERDA: SELECCIÓN DE GIMNASTAS */
          <section className="glass-panel" style={{ padding: isMobile ? '16px' : '24px', minHeight: isMobile ? 'auto' : '650px', width: '100%' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={18} color="var(--accent-primary)" />
            Gimnastas en Pista
          </h3>

          {/* Barra de Filtros */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '15px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Turno / Rotación</label>
              <select 
                className="input-field" 
                style={{ padding: '8px' }}
                value={activeTurno}
                onChange={(e) => {
                  setActiveTurno(e.target.value);
                  setSelectedGymnast(null);
                }}
              >
                {turnos.length > 0 ? turnos.map(t => (
                  <option key={t} value={t}>{t}</option>
                )) : <option value="Turno 1">Turno 1</option>}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Nivel</label>
              <select 
                className="input-field" 
                style={{ padding: '8px' }}
                value={activeNivel}
                onChange={(e) => {
                  setActiveNivel(e.target.value);
                  setSelectedGymnast(null);
                }}
              >
                {niveles.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Categoría</label>
              <select 
                className="input-field" 
                style={{ padding: '8px' }}
                value={activeCategoria}
                onChange={(e) => {
                  setActiveCategoria(e.target.value);
                  setSelectedGymnast(null);
                }}
              >
                {categorias.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="Buscar gimnasta por nombre o club..."
              className="input-field"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Indicador de Progreso del Turno */}
          {totalGymnastsCount > 0 && (
            <div style={{ marginBottom: '20px', background: 'rgba(255, 255, 255, 0.02)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Progreso del Turno:</span>
                <strong style={{ color: 'var(--accent-success)' }}>{judgedGymnastsCount} / {totalGymnastsCount} Evaluadas</strong>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-success))', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }} />
              </div>
            </div>
          )}

          {/* Listas de Gimnastas */}
          <div style={{ maxHeight: '430px', overflowY: 'auto', paddingRight: '5px' }}>
            
            {/* Pendientes */}
            {pendingGymnasts.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.05em' }}>
                  Pendientes ({pendingGymnasts.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {pendingGymnasts.map(g => (
                    <div
                      key={g.id}
                      onClick={() => handleSelectGymnast(g)}
                      className="glass-panel"
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: selectedGymnast?.id === g.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.01)',
                        borderColor: selectedGymnast?.id === g.id ? 'var(--accent-primary)' : 'var(--border-color)'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '600' }}>{g.nombre}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {g.institucion} • <span style={{ color: 'var(--text-primary)' }}>{g.nivel} {g.categoria}</span>
                        </div>
                      </div>
                      <ChevronRight size={18} color="var(--text-muted)" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Juzgados */}
            {judgedGymnasts.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--accent-success)', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Check size={14} />
                  Calificados ({judgedGymnasts.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {judgedGymnasts.map(g => (
                    <div
                      key={g.id}
                      onClick={() => handleSelectGymnast(g)}
                      className="glass-panel"
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: selectedGymnast?.id === g.id ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.03)',
                        borderColor: selectedGymnast?.id === g.id ? 'var(--accent-primary)' : 'rgba(16, 185, 129, 0.2)'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>{g.nombre}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {g.institucion} • {g.nivel} {g.categoria}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: '700',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#6ee7b7',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '0.9rem'
                        }}>
                          {parseFloat(g.notas[selectedApparatus].final).toFixed(3)}
                        </div>
                        <CheckCircle2 size={16} color="var(--accent-success)" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredGymnasts.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: 'var(--text-secondary)',
                fontSize: '0.9rem'
              }}>
                No hay gimnastas inscriptas en {activeTurno} con los filtros seleccionados.
              </div>
            )}
          </div>
        </section>
        )}

        {(!isMobile || selectedGymnast || submittedSuccess) && (
          /* COLUMNA DERECHA: CALCULADORA DE CALIFICACIÓN */
          <section className="glass-panel" style={{ padding: isMobile ? '16px' : '24px', minHeight: isMobile ? 'auto' : '650px', width: '100%' }}>
          {submittedSuccess ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '450px',
              animation: 'fadeIn 0.5s ease-out'
            }}>
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                padding: '20px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 25px rgba(16, 185, 129, 0.25)',
                border: '2px solid var(--accent-success)'
              }}>
                <CheckCircle2 size={48} color="var(--accent-success)" />
              </div>
              
              <div>
                <h3 style={{ fontSize: '1.4rem', color: '#fff', marginBottom: '8px' }}>¡Nota Enviada!</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                  La nota de <strong style={{ color: '#fff' }}>{lastSubmittedScore?.gymnast?.nombre}</strong> ha sido registrada.
                </p>
                <div style={{
                  fontSize: '3.5rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: '900',
                  color: 'var(--accent-success)',
                  marginTop: '15px',
                  textShadow: '0 0 15px rgba(16, 185, 129, 0.3)'
                }}>
                  {lastSubmittedScore?.score?.final.toFixed(3)}
                </div>
              </div>

              {message && (
                <div style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  color: '#93c5fd',
                  fontSize: '0.85rem'
                }}>
                  {message}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '280px', marginTop: '10px' }}>
                <button
                  onClick={handleProjectJudgeScore}
                  className="btn btn-gold"
                  style={{
                    width: '100%',
                    padding: '14px',
                    fontSize: '1.1rem',
                    fontWeight: '700',
                    gap: '8px',
                    justifyContent: 'center',
                    boxShadow: '0 4px 15px rgba(226, 177, 60, 0.25)'
                  }}
                >
                  <Tv size={20} />
                  Proyectar en TV
                </button>
                
                <button
                  onClick={handleNextGymnast}
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '14px',
                    fontSize: '1.1rem',
                    fontWeight: '700',
                    justifyContent: 'center',
                    boxShadow: '0 4px 15px rgba(59, 130, 246, 0.25)'
                  }}
                >
                  Siguiente Gimnasta
                </button>
              </div>
            </div>
          ) : selectedGymnast ? (
            <div>
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '15px', marginBottom: '20px' }}>
                {isMobile && (
                  <button 
                    onClick={() => {
                      setSelectedGymnast(null);
                      setSubmittedSuccess(false);
                      setLastSubmittedScore(null);
                      setMessage('');
                    }}
                    className="btn btn-secondary"
                    style={{
                      marginBottom: '15px',
                      padding: '8px 12px',
                      fontSize: '0.85rem',
                      width: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    ← Volver a Gimnastas
                  </button>
                )}
                <span style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: 'var(--accent-primary)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontWeight: '600',
                  letterSpacing: '0.05em'
                }}>
                  Calificando Gimnasta
                </span>
                <h3 style={{ fontSize: '1.4rem', marginTop: '8px' }}>{selectedGymnast.nombre}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {selectedGymnast.institucion} • <strong>{selectedGymnast.nivel} {selectedGymnast.categoria}</strong> {selectedGymnast.nacimiento ? `(Año ${selectedGymnast.nacimiento})` : ''}
                </p>
                {tournament.modalidad === 'GAM' && (
                  <div style={{ 
                    marginTop: '8px', 
                    display: 'inline-block',
                    background: 'rgba(139, 92, 246, 0.15)', 
                    color: 'var(--accent-purple)', 
                    padding: '4px 10px', 
                    borderRadius: '6px', 
                    fontWeight: '700', 
                    fontSize: '0.85rem' 
                  }}>
                    Nota de Partida: {getBaseScoreForGymnast(selectedGymnast).toFixed(2)}
                  </div>
                )}
              </div>

              {/* Selector de número de jueces en mesa */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Cantidad de Jueces en Mesa:
                </span>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setNumJueces(n);
                        if (currentInputIdx >= n) {
                          setCurrentInputIdx(n - 1);
                        }
                      }}
                      className="btn"
                      style={{
                        padding: '6px 14px',
                        background: numJueces === n ? 'var(--accent-primary)' : 'rgba(255,255,255,0.03)',
                        borderColor: numJueces === n ? 'var(--accent-primary)' : 'var(--border-color)',
                        color: numJueces === n ? '#fff' : 'var(--text-primary)',
                        borderRadius: '6px'
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cajas de entrada de notas de Jueces */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numJueces}, 1fr)`, gap: '15px', marginBottom: '25px' }}>
                {Array.from({ length: numJueces }).map((_, idx) => (
                  <div
                    key={idx}
                    onClick={() => setCurrentInputIdx(idx)}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: `2px solid ${currentInputIdx === idx ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      borderRadius: '12px',
                      padding: '12px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      boxShadow: currentInputIdx === idx ? 'var(--shadow-glow)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>
                      Juez {idx + 1}
                    </div>
                    <div style={{
                      fontSize: '1.8rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: '700',
                      minHeight: '40px',
                      color: juezDeductions[idx] !== '' 
                        ? (tournament.modalidad === 'GAM' ? 'var(--accent-success)' : 'var(--accent-danger)') 
                        : 'var(--text-muted)'
                    }}>
                      {juezDeductions[idx] !== '' ? juezDeductions[idx] : '-'}
                    </div>
                  </div>
                ))}
              </div>

               <div style={{ 
                 display: 'grid', 
                 gridTemplateColumns: tournament.modalidad === 'GAM' ? '1fr' : '1.2fr 1fr', 
                 gap: '20px', 
                 alignItems: 'start' 
               }}>
                 
                 {/* TECLADO VIRTUAL */}
                 <div>
                   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                     {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', 'CLEAR'].map(key => (
                       <button
                         key={key}
                         type="button"
                         onClick={() => handleKeypadPress(key)}
                         className="btn btn-secondary"
                         style={{
                           height: '52px',
                           fontSize: '1.2rem',
                           fontWeight: '700',
                           fontFamily: 'var(--font-mono)',
                           background: key === 'CLEAR' 
                             ? 'rgba(239, 68, 68, 0.08)' 
                             : 'rgba(59, 130, 246, 0.04)',
                           borderColor: key === 'CLEAR' 
                             ? 'rgba(239, 68, 68, 0.25)' 
                             : 'rgba(59, 130, 246, 0.2)',
                           color: key === 'CLEAR' ? 'var(--accent-danger)' : 'var(--text-primary)',
                           transition: 'all 0.1s ease',
                           boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
                         }}
                       >
                         {key === 'CLEAR' ? 'C' : key}
                       </button>
                     ))}
                   </div>
                   
                   {/* Botón de retroceso debajo */}
                   <button
                     type="button"
                     onClick={() => handleKeypadPress('BACK')}
                     className="btn btn-secondary"
                     style={{ 
                       width: '100%', 
                       marginTop: '8px', 
                       padding: '12px', 
                       fontSize: '0.95rem',
                       background: 'rgba(255,255,255,0.02)',
                       borderColor: 'var(--border-color)',
                       color: 'var(--text-secondary)'
                     }}
                   >
                     Borrar dígito
                   </button>
                 </div>
 
                 {tournament.modalidad !== 'GAM' ? (
                   /* ATAJOS RÁPIDOS DE DEDUCCIÓN */
                   <div>
                     <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '600' }}>
                       Atajos de Deducción
                     </h4>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                       {[
                         { l: 'Sin ded. (0.00)', v: '0.00', bg: 'rgba(16, 185, 129, 0.06)', bc: 'rgba(16, 185, 129, 0.25)', tc: 'var(--accent-success)' },
                         { l: 'Leve (-0.10)', v: '0.10', bg: 'rgba(239, 68, 68, 0.03)', bc: 'rgba(239, 68, 68, 0.15)', tc: '#f87171' },
                         { l: 'Media (-0.30)', v: '0.30', bg: 'rgba(239, 68, 68, 0.04)', bc: 'rgba(239, 68, 68, 0.2)', tc: '#f87171' },
                         { l: 'Grave (-0.50)', v: '0.50', bg: 'rgba(239, 68, 68, 0.06)', bc: 'rgba(239, 68, 68, 0.25)', tc: '#fca5a5' },
                         { l: 'Muy Grave (-0.80)', v: '0.80', bg: 'rgba(239, 68, 68, 0.08)', bc: 'rgba(239, 68, 68, 0.3)', tc: '#fca5a5' },
                         { l: 'Caída (-1.00)', v: '1.00', bg: 'rgba(239, 68, 68, 0.12)', bc: 'rgba(239, 68, 68, 0.4)', tc: '#ef4444' }
                       ].map(item => (
                         <button
                           key={item.v}
                           type="button"
                           onClick={() => handleQuickDeduction(item.v)}
                           className="btn"
                           style={{
                             padding: '8px 12px',
                             fontSize: '0.85rem',
                             fontWeight: '700',
                             background: item.bg,
                             border: `1px solid ${item.bc}`,
                             color: item.tc,
                             justifyContent: 'flex-start',
                             transition: 'all 0.1s ease'
                           }}
                         >
                           {item.l}
                         </button>
                       ))}
                     </div>
 
                     {/* Restablecer campos */}
                     <button
                       type="button"
                       onClick={() => setJuezDeductions(['', '', ''])}
                       className="btn btn-secondary"
                       style={{ width: '100%', marginTop: '16px', gap: '8px', fontSize: '0.85rem' }}
                     >
                       <RotateCcw size={14} />
                       Limpiar todo
                     </button>
                   </div>
                 ) : (
                   /* Para GAM, botón simple para limpiar */
                   <button
                     type="button"
                     onClick={() => setJuezDeductions(['', '', '', '', '', ''])}
                     className="btn btn-secondary"
                     style={{ width: '100%', marginTop: '16px', gap: '8px', fontSize: '0.85rem' }}
                   >
                     <RotateCcw size={14} />
                     Limpiar notas
                   </button>
                 )}
               </div>

              {/* PANEL DE RESULTADOS / FÓRMULA */}
              <div className="glass-panel" style={{
                marginTop: '25px',
                padding: '16px',
                background: 'rgba(15, 23, 42, 0.4)',
                borderColor: 'var(--border-color)'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', textAlign: 'center', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {tournament.modalidad === 'GAM' ? 'PROM. JUECES' : 'PROM. DEDUCCIONES'}
                    </div>
                    <div style={{ 
                      fontSize: '1.2rem', 
                      fontFamily: 'var(--font-mono)', 
                      fontWeight: '700', 
                      color: tournament.modalidad === 'GAM' ? 'var(--accent-success)' : 'var(--accent-danger)' 
                    }}>
                      {tournament.modalidad === 'GAM' ? '' : '-'}{scoreCalc.promedio.toFixed(3)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>NOTA B (EJE)</div>
                    <div style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--text-primary)' }}>
                      {scoreCalc.notaB.toFixed(3)}
                    </div>
                    {tournament.modalidad === 'GAM' && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        (Base: {getBaseScoreForGymnast(selectedGymnast).toFixed(2)})
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>DESCUENTOS MESA</div>
                    <div style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)', fontWeight: '700', color: '#fda4af' }}>
                      -{parseFloat(selectedGymnast?.notas?.[selectedApparatus]?.dtos || 0).toFixed(3)}
                    </div>
                  </div>
                </div>

                <div style={{
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-secondary)' }}>
                    NOTA FINAL ESTIMADA:
                  </span>
                  <span style={{
                    fontSize: '1.8rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: '800',
                    color: 'var(--accent-success)',
                    textShadow: '0 0 10px rgba(16, 185, 129, 0.2)'
                  }}>
                    {scoreCalc.final.toFixed(3)}
                  </span>
                </div>
              </div>

              {message && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: message.includes('Error') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                  border: `1px solid ${message.includes('Error') ? 'var(--accent-danger)' : 'var(--accent-success)'}`,
                  color: message.includes('Error') ? '#fca5a5' : '#a7f3d0',
                  fontSize: '0.85rem',
                  marginTop: '15px',
                  textAlign: 'center'
                }}>
                  {message}
                </div>
              )}

              {/* Botón de Enviar */}
              <button
                type="button"
                onClick={handleSubmitScore}
                disabled={submitting}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginTop: '15px',
                  padding: '14px',
                  fontSize: '1.1rem',
                  boxShadow: '0 0 20px rgba(59, 130, 246, 0.35)'
                }}
              >
                {submitting ? 'Enviando Calificación...' : 'CONFIRMAR Y ENVIAR NOTA'}
              </button>

            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              minHeight: '400px',
              color: 'var(--text-secondary)',
              textAlign: 'center',
              padding: '20px'
            }}>
              {lastScore ? (
                <div className="glass-panel animate-fade-in" style={{
                  width: '100%',
                  padding: '30px',
                  background: 'rgba(15, 23, 42, 0.4)',
                  borderColor: 'rgba(59, 130, 246, 0.2)',
                  borderRadius: '16px',
                  marginBottom: '35px',
                  textAlign: 'center',
                  boxShadow: 'var(--shadow-glow)'
                }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '10px' }}>
                    ÚLTIMA CALIFICACIÓN EN {selectedApparatus.toUpperCase()}
                  </div>
                  <h4 style={{ fontSize: '1.4rem', color: '#fff', fontWeight: '800', marginBottom: '4px' }}>
                    {lastScore.gymnast.nombre}
                  </h4>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                    {lastScore.gymnast.institucion} • <strong>{lastScore.gymnast.nivel} {lastScore.gymnast.categoria}</strong>
                  </p>
                  <div style={{
                    fontSize: '3.5rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: '900',
                    color: 'var(--accent-success)',
                    textShadow: '0 0 15px rgba(16, 185, 129, 0.3)'
                  }}>
                    {parseFloat(lastScore.score.final).toFixed(3)}
                  </div>
                </div>
              ) : null}
              
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed var(--border-color)',
                marginBottom: '15px'
              }}>
                <HelpCircle size={28} color="var(--text-muted)" />
              </div>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '5px' }}>Ninguna Gimnasta Seleccionada</h4>
              <p style={{ fontSize: '0.85rem', maxWidth: '300px' }}>
                Selecciona una gimnasta de la lista de la izquierda para comenzar a ingresar sus notas de jueces.
              </p>
            </div>
          )}
        </section>
        )}
      </div>
    </div>
  );
}
