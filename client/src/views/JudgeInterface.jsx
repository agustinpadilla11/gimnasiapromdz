import React, { useState, useEffect, useRef } from 'react';
import { LogOut, Check, HelpCircle, Edit2, ChevronRight, User, Settings, CheckCircle2, RotateCcw, AlertTriangle, Tv, Search } from 'lucide-react';

const MultiSelectDropdown = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="form-group" style={{ marginBottom: 0, position: 'relative' }} ref={containerRef}>
      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>{label}</label>
      <div 
        className="input-field" 
        style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.95rem' }}>
          {selected.includes('Todos') ? 'Todos' : selected.join(', ')}
        </span>
        <span style={{ fontSize: '0.8rem' }}>▼</span>
      </div>
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          marginTop: '4px',
          maxHeight: '220px',
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
        }}>
          {options.map(opt => (
            <div 
              key={opt}
              style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              onClick={() => {
                let newSelected;
                if (opt === 'Todos') {
                  newSelected = ['Todos'];
                } else {
                  newSelected = selected.filter(x => x !== 'Todos');
                  if (newSelected.includes(opt)) {
                    newSelected = newSelected.filter(x => x !== opt);
                  } else {
                    newSelected.push(opt);
                  }
                  if (newSelected.length === 0) newSelected = ['Todos'];
                }
                onChange(newSelected);
              }}
            >
              <input type="checkbox" checked={selected.includes(opt)} readOnly style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }} />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{opt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function JudgeInterface({ apiBase, wsBase, auth, onLogout, onChangeView }) {
  const [tournament, setTournament] = useState(null);
  const activeModalidad = tournament ? (auth.ramaJuez || tournament.modalidad) : '';
  const [gymnasts, setGymnasts] = useState([]);
  const [selectedApparatus, setSelectedApparatus] = useState(() => localStorage.getItem('olympo_selectedApparatus') || '');
  const [activeTurno, setActiveTurno] = useState('Turno 1');
  const [activeNivel, setActiveNivel] = useState(['Todos']);
  const [activeCategoria, setActiveCategoria] = useState(['Todos']);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGymnast, setSelectedGymnast] = useState(null);
  
  // Nuevos estados para configuración de juez
  const [setupComplete, setSetupComplete] = useState(() => localStorage.getItem('olympo_setupComplete') === 'true');
  const [numJueces, setNumJueces] = useState(() => parseInt(localStorage.getItem('olympo_numJueces') || '2'));
  
  // Guardar configuración al inicializar/actualizar
  useEffect(() => {
    localStorage.setItem('olympo_setupComplete', setupComplete);
    localStorage.setItem('olympo_numJueces', numJueces);
    if (selectedApparatus) {
      localStorage.setItem('olympo_selectedApparatus', selectedApparatus);
    }
  }, [setupComplete, selectedApparatus, numJueces]);
  
  // Sincronización offline-to-online
  useEffect(() => {
    const syncOfflineScores = async () => {
      const pending = JSON.parse(localStorage.getItem('pending_scores') || '[]');
      if (pending.length === 0) return;

      console.log(`Intentando sincronizar ${pending.length} notas pendientes...`);
      let failed = [];

      for (const score of pending) {
        try {
          const res = await fetch(`${apiBase}/tournaments/${auth.tournamentId}/score`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-juez-pin': auth.pin,
              'x-admin-pin': auth.pin
            },
            body: JSON.stringify({
              gymnastId: score.gymnastId,
              aparato: score.aparato,
              notaD: score.notaD,
              dtos: score.dtos,
              dtosAparato: score.dtosAparato,
              jueces: score.jueces,
              baseScore: score.baseScore
            })
          });

          if (!res.ok) {
            failed.push(score);
          }
        } catch (e) {
          failed.push(score);
        }
      }

      localStorage.setItem('pending_scores', JSON.stringify(failed));
      if (failed.length === 0) {
        setMessage('Sincronización completada: todas las notas pendientes fueron enviadas.');
        setTimeout(() => setMessage(''), 4000);
      } else {
        setMessage(`Quedaron ${failed.length} notas pendientes por enviar.`);
      }
    };

    window.addEventListener('online', syncOfflineScores);
    return () => window.removeEventListener('online', syncOfflineScores);
  }, [apiBase, auth.tournamentId, auth.pin]);
  
  // Estado para el buffer (semáforo) de los jueces
  const [scoreBuffer, setScoreBuffer] = useState({});
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
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

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
  const [juezDeductions, setJuezDeductions] = useState(['', '', '', '', '', '']); // Deducciones de Juez 1 a 6
  const [notaD, setNotaD] = useState(''); // Nota D (Dificultad)
  const [mesaDeduction, setMesaDeduction] = useState(0); // Descuento de mesa (penalizaciones neutrales)
  const [aparatoDeduction, setAparatoDeduction] = useState(0); // Descuento de aparato acumulativo
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
        
        const activeMod = auth.ramaJuez || data.modalidad;
        const availAp = data.aparatos.filter(ap => {
          if (data.modalidad !== 'Ambos') return true;
          if (activeMod === 'GAM') return ap.includes('(M)') || ['Arzones', 'Anillas', 'Barra Fija'].includes(ap);
          return ap.includes('(F)') || ['Paralelas Asim.', 'Viga'].includes(ap);
        });
        
        // Auto-seleccionar primer aparato si no hay ninguno seleccionado
        if (!selectedApparatus && availAp.length > 0) {
          setSelectedApparatus(availAp[0]);
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
        } else if (msg.type === 'BUFFER_UPDATED') {
          if (msg.aparato === selectedApparatus && selectedGymnast && msg.gymnastId === selectedGymnast.id) {
            setScoreBuffer(msg.buffer || {});
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
  }, [apiBase, wsBase, auth.tournamentId, selectedApparatus, selectedGymnast]);

  // Escuchar teclado físico para ingresar deducciones en caliente
  useEffect(() => {
    if (!selectedGymnast) return;

    const handleKeyDown = (e) => {
      // Evitar interceptar si el usuario está en el campo de búsqueda de texto
      if (document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text') {
        return;
      }

      const key = e.key;

      if (/^[0-9.,]$/.test(key)) {
        e.preventDefault();
        const val = key === ',' ? '.' : key;
        handleKeypadPress(val);
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
        } else if (currentInputIdx === numJueces - 1) {
          setCurrentInputIdx('D');
        } else if (currentInputIdx === 'D') {
          handleSubmitScore();
        }
      } else if (key === 'ArrowDown' || key === 'Tab') {
        e.preventDefault();
        if (currentInputIdx === 'D') return;
        if (currentInputIdx < numJueces - 1) {
          setCurrentInputIdx(prev => prev + 1);
        } else if (currentInputIdx === numJueces - 1) {
          setCurrentInputIdx('D');
        }
      } else if (key === 'ArrowUp') {
        e.preventDefault();
        if (currentInputIdx === 'D') {
          setCurrentInputIdx(numJueces - 1);
        } else if (currentInputIdx > 0) {
          setCurrentInputIdx(prev => prev - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedGymnast, currentInputIdx, numJueces, juezDeductions, notaD]);

  if (!tournament) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Cargando datos del torneo...</p>
      </div>
    );
  }

  if (!setupComplete) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '20px' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '30px' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Configuración de Juez</h2>
          
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label>Aparato</label>
            <select
              className="input-field"
              value={selectedApparatus}
              onChange={(e) => setSelectedApparatus(e.target.value)}
            >
              <option value="">Selecciona un aparato</option>
              {tournament.aparatos.filter(ap => {
                if (tournament.modalidad !== 'Ambos') return true;
                if (activeModalidad === 'GAM') return ap.includes('(M)') || ['Arzones', 'Anillas', 'Barra Fija'].includes(ap);
                return ap.includes('(F)') || ['Paralelas Asim.', 'Viga'].includes(ap);
              }).map(ap => (
                <option key={ap} value={ap}>{ap}</option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 'bold' }}
            disabled={!selectedApparatus}
            onClick={() => {
              setSetupComplete(true);
            }}
          >
            Ingresar
          </button>
        </div>
      </div>
    );
  }

  // Filtrar gimnastas
  const filteredGymnasts = gymnasts.filter(g => {
    // Si es Nivel 1B, solo compite en Salto y Suelo
    const isNivel1B = g.nivel && g.nivel.toLowerCase().replace(/\s+/g, '').includes('1b');
    if (isNivel1B) {
      const isSaltoOrSuelo = selectedApparatus.toLowerCase().includes('salto') || selectedApparatus.toLowerCase().includes('suelo');
      if (!isSaltoOrSuelo) return false;
    }

    const matchTurno = g.grupo === activeTurno;
    const matchNivel = activeNivel.includes('Todos') || activeNivel.includes(g.nivel);
    const matchCategoria = activeCategoria.includes('Todos') || activeCategoria.includes(g.categoria);
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
    setScoreBuffer({});
    
    // Cargar nota si ya existe una registrada
    const notaExistente = gymnast.notas?.[selectedApparatus];
    if (notaExistente && notaExistente.jueces) {
      const newDeductions = ['', '', '', '', '', ''];
      notaExistente.jueces.forEach((val, i) => {
        if (i < 6) newDeductions[i] = val !== null && val !== undefined ? String(val) : '';
      });
      setJuezDeductions(newDeductions);
      setNumJueces(notaExistente.jueces.length);
      setNotaD(notaExistente.notaD !== undefined ? String(notaExistente.notaD) : '');
      setMesaDeduction(notaExistente.dtos !== undefined ? parseFloat(notaExistente.dtos) : 0);
      setAparatoDeduction(notaExistente.dtosAparato !== undefined ? parseFloat(notaExistente.dtosAparato) : 0);
    } else {
      setJuezDeductions(['', '', '', '', '', '']);
      setNotaD('');
      setMesaDeduction(0);
      setAparatoDeduction(0);
    }
    setCurrentInputIdx(0);
  };

  const getBaseScoreForGymnast = (gymnast) => {
    if (!tournament || activeModalidad !== 'GAM') return 10.00;
    
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

    if (activeVals.length === 0) {
      const final = base - mesaDeduction - aparatoDeduction;
      return {
        promedio: 0,
        notaB: base,
        final: parseFloat(final.toFixed(3)),
        numActive: 0
      };
    }

    const promedio = activeVals.reduce((a, b) => a + b, 0) / activeVals.length;
    
    let notaB = 0;
    let final = 0;
    
    if (activeModalidad === 'GAM') {
      // En GAM el juez ingresa la nota final calculada por él mismo.
      notaB = promedio; // notaB referenciará el promedio ingresado por jueces para visualización
      final = promedio - mesaDeduction - aparatoDeduction;
    } else {
      notaB = base - promedio;
      final = notaB + (parseFloat(notaD) || 0) - mesaDeduction - aparatoDeduction;
    }

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
    
    // Validar que se haya ingresado al menos una nota
    const activeVals = juezDeductions.slice(0, numJueces)
      .map(v => v !== '' ? parseFloat(v) : null);
    
    const hasNotes = activeVals.some(v => v !== null);
    if (!hasNotes) {
      setMessage('Por favor, ingresa al menos una nota.');
      return;
    }

    setSubmitting(true);
    setMessage('');

    try {
      if (!navigator.onLine) {
        // MODO OFFLINE: Guardar localmente
        const pending = JSON.parse(localStorage.getItem('pending_scores') || '[]');
        pending.push({
          gymnastId: selectedGymnast.id,
          aparato: selectedApparatus,
          notaD: notaD === '' ? 0 : parseFloat(notaD),
          dtos: mesaDeduction,
          dtosAparato: aparatoDeduction,
          jueces: activeVals,
          baseScore: getBaseScoreForGymnast(selectedGymnast),
          timestamp: Date.now()
        });
        localStorage.setItem('pending_scores', JSON.stringify(pending));
        
        setMessage('Sin conexión. La nota se guardó localmente y se enviará cuando vuelva el internet.');
        setLastSubmittedScore({ gymnast: selectedGymnast, score: { final: scoreCalc.final } });
        setSubmittedSuccess(true);
        setSubmitting(false);
        return;
      }

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
          notaD: notaD === '' ? 0 : parseFloat(notaD),
          dtos: mesaDeduction,
          dtosAparato: aparatoDeduction,
          jueces: activeVals,
          baseScore: getBaseScoreForGymnast(selectedGymnast)
        })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage('');
        setLastSubmittedScore({
          gymnast: selectedGymnast,
          score: data.gymnast.notas[selectedApparatus]
        });
        setSubmittedSuccess(true);
        setScoreBuffer({});
        
        // Actualizar la lista local de gimnastas
        setGymnasts(prev => prev.map(g => {
          if (g.id === selectedGymnast.id) {
            return data.gymnast;
          }
          return g;
        }));
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      // Fallback a offline si el servidor no responde
      const pending = JSON.parse(localStorage.getItem('pending_scores') || '[]');
      pending.push({
        gymnastId: selectedGymnast.id,
        aparato: selectedApparatus,
        notaD: notaD === '' ? 0 : parseFloat(notaD),
        dtos: mesaDeduction,
        dtosAparato: aparatoDeduction,
        jueces: activeVals,
        baseScore: getBaseScoreForGymnast(selectedGymnast),
        timestamp: Date.now()
      });
      localStorage.setItem('pending_scores', JSON.stringify(pending));
      setMessage('Error de conexión. La nota se guardó localmente.');
      setLastSubmittedScore({ gymnast: selectedGymnast, score: { final: scoreCalc.final } });
      setSubmittedSuccess(true);
    } finally {
      setSubmitting(false);
    }
  };

  // Pasar a la siguiente gimnasta pendiente
  const handleNextGymnast = () => {
    setSubmittedSuccess(false);
    setLastSubmittedScore(null);
    setMessage('');
    setSelectedGymnast(null);
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
    let currentVal = currentInputIdx === 'D' ? notaD : juezDeductions[currentInputIdx];
    if (typeof currentVal !== 'string') currentVal = String(currentVal || '');
    
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
      newVal = currentVal + val;
    }

    if (currentInputIdx === 'D') {
      setNotaD(newVal);
    } else {
      const updated = [...juezDeductions];
      updated[currentInputIdx] = newVal;
      setJuezDeductions(updated);
    }
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
  const isNotaDTournament = tournament?.configuracion?.tipoCalculo === 'Nota D' || tournament?.configuracion?.tipoCalculo === 'Ambas';

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* HEADER DE MESA JUECES */}
      {(!isMobile || !selectedGymnast) && (
        <header className="glass-panel" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          marginBottom: '24px',
          background: 'var(--bg-card)',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'var(--accent-primary)',
              color: '#fff',
              fontWeight: '800',
              fontSize: '1.2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '80px',
              minHeight: '60px'
            }}>
              {selectedApparatus.toUpperCase()}
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', marginBottom: '2px' }}>Panel de Jueces</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {tournament.nombre} ({activeModalidad})
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => {
              localStorage.removeItem('olympo_setupComplete');
              onLogout();
            }} className="btn btn-secondary" style={{ padding: '8px 14px', gap: '6px' }}>
              <LogOut size={16} />
              Salir
            </button>
          </div>
        </header>
      )}

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
          <div style={{ marginBottom: '15px' }}>
            {isMobile && (
              <button 
                onClick={() => setShowFiltersMobile(!showFiltersMobile)}
                className="btn btn-secondary"
                style={{ width: '100%', marginBottom: showFiltersMobile ? '15px' : '0', padding: '10px', fontSize: '0.9rem', justifyContent: 'center', background: 'rgba(255,255,255,0.03)' }}
              >
                {showFiltersMobile ? 'Ocultar Filtros (Turno, Nivel, Categoría)' : 'Mostrar Filtros (Turno, Nivel, Categoría)'}
              </button>
            )}
            
            {(!isMobile || showFiltersMobile) && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '10px' }}>
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

                <MultiSelectDropdown 
                  label="Nivel" 
                  options={['Todos', ...niveles]} 
                  selected={activeNivel} 
                  onChange={(val) => {
                    setActiveNivel(val);
                    setSelectedGymnast(null);
                  }} 
                />

                <MultiSelectDropdown 
                  label="Categoría" 
                  options={['Todos', ...categorias]} 
                  selected={activeCategoria} 
                  onChange={(val) => {
                    setActiveCategoria(val);
                    setSelectedGymnast(null);
                  }} 
                />
              </div>
            )}
          </div>

          <div style={{ marginBottom: '20px', position: 'relative' }}>
            <div style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }}>
              <Search size={18} />
            </div>
            <input
              type="text"
              placeholder="Buscar gimnasta por nombre o club..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field"
              style={{ 
                width: '100%', 
                padding: '12px 16px 12px 40px',
                fontSize: '0.95rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                color: 'var(--text-primary)',
                transition: 'all 0.2s ease'
              }}
            />
          </div>


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
                  Volver a Lista
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
                {activeModalidad === 'GAM' && (
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

              {/* INTERFAZ DEL JUEZ LÍDER O INDIVIDUAL */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px', display: 'block' }}>Cantidad de Juezas:</label>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '5px' }}>
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <button
                      key={n}
                      onClick={() => setNumJueces(n)}
                      style={{
                        flex: '1',
                        minWidth: '40px',
                        padding: '10px 0',
                        borderRadius: '8px',
                        background: numJueces === n ? 'var(--accent-primary)' : 'var(--bg-input)',
                        color: numJueces === n ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${numJueces === n ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        fontWeight: '700',
                        fontSize: '1rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '25px', display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))`, gap: '15px' }}>
                {Array.from({ length: numJueces }).map((_, idx) => (
                  <div key={idx} style={{
                      background: 'var(--bg-input)',
                      border: '2px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '15px',
                      textAlign: 'center',
                      transition: 'all 0.2s ease'
                    }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
                      Juez {idx + 1}
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="0.00"
                      value={juezDeductions[idx]}
                      onChange={(e) => {
                        const updated = [...juezDeductions];
                        updated[idx] = e.target.value;
                        setJuezDeductions(updated);
                      }}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        textAlign: 'center',
                        fontSize: '2rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: '700',
                        color: juezDeductions[idx] !== '' ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    />
                  </div>
                ))}
              </div>

              {activeModalidad !== 'GAM' && (
                <div style={{ 
                  background: 'var(--bg-input)', 
                  padding: '15px', 
                  borderRadius: '12px', 
                  border: '2px solid var(--border-color)',
                  marginBottom: '20px',
                  transition: 'all 0.2s ease',
                  textAlign: 'center'
                }}>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px', fontWeight: '600' }}>
                    Nota D (Dificultad)
                  </h4>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="0.00"
                    value={notaD}
                    onChange={(e) => setNotaD(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      textAlign: 'center',
                      fontSize: '1.8rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: '700',
                      color: notaD !== '' ? 'var(--accent-primary)' : 'var(--text-muted)'
                    }}
                  />
                </div>
              )}

               <div style={{ 
                 display: 'grid', 
                 gridTemplateColumns: isMobile ? '1fr' : (activeModalidad === 'GAM' ? '1fr' : '1.2fr 1fr'), 
                 gap: '20px', 
                 alignItems: 'start' 
               }}>
                 
                 
                 {/* BOTÓN PARA LIMPIAR NOTA (SIN TECLADO VIRTUAL) */}
                 <div>
                  {activeModalidad !== 'GAM' ? (
                    /* ATAJOS RÁPIDOS DE DEDUCCIÓN (DESCUENTOS DE MESA) */
                    <div>
                      <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '600' }}>
                        Descuento de Mesa (Final)
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {[
                          { l: 'Sin desc. (0.00)', v: '0.00', bg: 'rgba(16, 185, 129, 0.06)', bc: 'rgba(16, 185, 129, 0.25)', tc: 'var(--accent-success)' },
                          { l: 'Falta Línea / Salida (-0.10)', v: '0.10', bg: 'rgba(239, 68, 68, 0.03)', bc: 'rgba(239, 68, 68, 0.15)', tc: '#f87171' },
                          { l: 'Falta Presentación (-0.30)', v: '0.30', bg: 'rgba(239, 68, 68, 0.04)', bc: 'rgba(239, 68, 68, 0.2)', tc: '#f87171' },
                          { l: 'Ayuda Entrenador (-0.50)', v: '0.50', bg: 'rgba(239, 68, 68, 0.06)', bc: 'rgba(239, 68, 68, 0.25)', tc: '#fca5a5' },
                          { l: 'Falta Vestimenta (-1.00)', v: '1.00', bg: 'rgba(239, 68, 68, 0.12)', bc: 'rgba(239, 68, 68, 0.4)', tc: '#ef4444' }
                        ].map(item => {
                          const valNum = parseFloat(item.v);
                          const isSelected = Math.abs(mesaDeduction - valNum) < 0.001;
                          return (
                            <button
                              key={item.v}
                              type="button"
                              onClick={() => setMesaDeduction(valNum)}
                              className="btn"
                              style={{
                                padding: '8px 12px',
                                fontSize: '0.85rem',
                                fontWeight: '700',
                                background: isSelected ? item.bc : item.bg,
                                border: `1px solid ${item.bc}`,
                                color: item.tc,
                                justifyContent: 'flex-start',
                                transition: 'all 0.1s ease',
                                boxShadow: isSelected ? `0 0 10px ${item.bc}` : 'none'
                              }}
                            >
                              {item.l} {isSelected ? '✓' : ''}
                            </button>
                          );
                        })}
                      </div>

                      {isNotaDTournament && (
                        <div style={{ marginTop: '24px' }}>
                          <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '600' }}>
                            Descuento de Aparato: -{aparatoDeduction.toFixed(2)}
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {[
                              { l: 'Limpiar (0.00)', v: '0.00', bg: 'rgba(16, 185, 129, 0.06)', bc: 'rgba(16, 185, 129, 0.25)', tc: 'var(--accent-success)' },
                              { l: '(-0.10)', v: '0.10', bg: 'rgba(239, 68, 68, 0.03)', bc: 'rgba(239, 68, 68, 0.15)', tc: '#f87171' },
                              { l: '(-0.30)', v: '0.30', bg: 'rgba(239, 68, 68, 0.04)', bc: 'rgba(239, 68, 68, 0.2)', tc: '#f87171' },
                              { l: '(-0.50)', v: '0.50', bg: 'rgba(239, 68, 68, 0.06)', bc: 'rgba(239, 68, 68, 0.25)', tc: '#fca5a5' },
                              { l: '(-1.00)', v: '1.00', bg: 'rgba(239, 68, 68, 0.12)', bc: 'rgba(239, 68, 68, 0.4)', tc: '#ef4444' }
                            ].map(item => {
                              const valNum = parseFloat(item.v);
                              return (
                                <button
                                  key={item.v}
                                  type="button"
                                  onClick={() => valNum === 0 ? setAparatoDeduction(0) : setAparatoDeduction(prev => prev + valNum)}
                                  className="btn"
                                  style={{
                                    padding: '8px 12px',
                                    fontSize: '0.85rem',
                                    fontWeight: '700',
                                    background: item.bg,
                                    border: `1px solid ${item.bc}`,
                                    color: item.tc,
                                    justifyContent: 'flex-start',
                                    transition: 'all 0.1s ease',
                                  }}
                                >
                                  {valNum === 0 ? item.l : `Sumar ${item.l}`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
  
                      {/* Restablecer campos */}
                      <button
                        type="button"
                        onClick={() => {
                          setJuezDeductions(['', '', '', '', '', '']);
                          setMesaDeduction(0);
                          setAparatoDeduction(0);
                        }}
                        className="btn btn-secondary"
                        style={{ width: '100%', marginTop: '16px', gap: '8px', fontSize: '0.85rem' }}
                      >
                        <RotateCcw size={14} />
                        Limpiar todo
                      </button>
                    </div>
                  ) : (
                    /* Para GAM o jueces individuales, botón simple para limpiar */
                    <button
                      type="button"
                      onClick={() => {
                        setJuezDeductions(['', '', '', '', '', '']);
                        setMesaDeduction(0);
                      }}
                      className="btn btn-secondary"
                      style={{ width: '100%', marginTop: '16px', gap: '8px', fontSize: '0.85rem' }}
                    >
                      <RotateCcw size={14} />
                      Limpiar nota
                    </button>
                  )}
                 </div>
               </div>

              {/* PANEL DE RESULTADOS / FÓRMULA */}
              <div className="glass-panel" style={{
                marginTop: '25px',
                padding: '16px',
                background: 'var(--bg-card)',
                borderColor: 'var(--border-color)'
              }}>
                {activeModalidad !== 'GAM' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', textAlign: 'center', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        PROM. DEDUCCIONES
                      </div>
                      <div style={{ 
                        fontSize: '1.2rem', 
                        fontFamily: 'var(--font-mono)', 
                        fontWeight: '700', 
                        color: 'var(--accent-danger)' 
                      }}>
                        -{scoreCalc.promedio.toFixed(3)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>NOTA B (EJE)</div>
                      <div style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {scoreCalc.notaB.toFixed(3)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>DESCUENTOS MESA</div>
                      <div style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--accent-danger)' }}>
                        -{parseFloat(mesaDeduction || 0).toFixed(3)}
                      </div>
                    </div>
                  </div>
                )}
                
                <div style={{
                  padding: '12px',
                  background: 'var(--bg-input)',
                  borderRadius: '8px',
                  textAlign: 'center',
                  border: '1px solid var(--accent-primary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                    NOTA FINAL A ENVIAR:
                  </div>
                  <div style={{ 
                    fontSize: '2rem', 
                    fontFamily: 'var(--font-mono)', 
                    fontWeight: '800', 
                    color: 'var(--accent-primary)' 
                  }}>
                    {scoreCalc.final.toFixed(3)}
                  </div>
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
                  background: 'var(--bg-card)',
                  borderColor: 'rgba(59, 130, 246, 0.2)',
                  borderRadius: '16px',
                  marginBottom: '35px',
                  textAlign: 'center',
                  boxShadow: 'var(--shadow-glow)'
                }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '10px' }}>
                    ÚLTIMA CALIFICACIÓN EN {selectedApparatus.toUpperCase()}
                  </div>
                  <h4 style={{ fontSize: '1.4rem', color: 'var(--text-primary)', fontWeight: '800', marginBottom: '4px' }}>
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
