import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, Trophy, Calendar, Upload, Download, Edit, Trash2, Plus, 
  Search, Check, ShieldAlert, Award, Grid, RefreshCw, Layers, MapPin, 
  Save, X, FileText, CheckSquare, PlusCircle, Tv
} from 'lucide-react';

export default function AdminDashboard({ apiBase, wsBase, auth, onLogout, onChangeView }) {
  const [tournament, setTournament] = useState(null);
  const [gymnasts, setGymnasts] = useState([]);
  const [activeTab, setActiveTab] = useState('monitoreo'); // 'gimnastas' | 'monitoreo' | 'podios'
  const [searchQuery, setSearchQuery] = useState('');
  const [orderBy, setOrderBy] = useState('grupo'); // 'grupo' | 'nivel'
  
  // Estados de carga e informes
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Estados para agregar/editar gimnasta
  const [editingGymnast, setEditingGymnast] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [gymnastForm, setGymnastForm] = useState({
    nombre: '',
    nacimiento: '',
    institucion: '',
    categoria: '',
    nivel: '',
    grupo: 'Turno 1'
  });

  // Estados para editar notas de gimnasta (Mesa de control)
  const [scoringGymnast, setScoringGymnast] = useState(null);
  const [scoringApparatus, setScoringApparatus] = useState('');
  const [scoringForm, setScoringForm] = useState({
    jueces: ['', '', '', '', '', ''],
    dtos: '0.00'
  });

  // Estados para descuento de equipo manual
  const [editingTeamDiscount, setEditingTeamDiscount] = useState(null); // { groupKey, clubName }
  const [teamDiscountValue, setTeamDiscountValue] = useState('0.0');

  // Efecto visual para destacar filas actualizadas
  const [flashGymnastId, setFlashGymnastId] = useState(null);
  const [flashApparatus, setFlashApparatus] = useState('');

  // Estados para Cargar Turno Modal
  const [showTurnoModal, setShowTurnoModal] = useState(false);
  const [turnoForm, setTurnoForm] = useState({ name: '', niveles: '' });
  const [turnoFile, setTurnoFile] = useState(null);
  const [selectedTurno, setSelectedTurno] = useState('Todos');

  const fileInputRef = useRef(null);
  const wsRef = useRef(null);

  // Auto-enfoque para el modal de carga de nota manual
  useEffect(() => {
    if (scoringGymnast) {
      setTimeout(() => {
        const firstInput = document.getElementById('juez-input-0');
        if (firstInput) {
          firstInput.focus();
          firstInput.select();
        }
      }, 50);
    }
  }, [scoringGymnast]);

  // Cargar datos
  const fetchTournamentData = async () => {
    try {
      const res = await fetch(`${apiBase}/tournaments/${auth.tournamentId}`, {
        headers: { 'x-admin-pin': auth.pin }
      });
      if (res.ok) {
        const data = await res.json();
        setTournament(data);
        setGymnasts(data.gimnastas || []);
      } else {
        setError('No se pudieron cargar los datos del torneo.');
      }
    } catch (e) {
      setError('Error al conectar con el servidor.');
    }
  };

  useEffect(() => {
    fetchTournamentData();

    // Configurar WebSocket
    const ws = new WebSocket(`${wsBase}`);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'REGISTER',
        tournamentId: auth.tournamentId,
        role: 'computos'
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'TOURNAMENT_RELOADED') {
          setGymnasts(msg.gimnastas);
          showFlashNotification('Planilla de gimnastas actualizada.');
        } else if (msg.type === 'GYMNAST_UPDATED') {
          setGymnasts(prev => prev.map(g => g.id === msg.gymnast.id ? msg.gymnast : g));
        } else if (msg.type === 'GYMNAST_DELETED') {
          setGymnasts(prev => prev.filter(g => g.id !== msg.gymnastId));
        } else if (msg.type === 'SCORE_SUBMITTED') {
          setGymnasts(prev => prev.map(g => g.id === msg.gymnast.id ? msg.gymnast : g));
          // Activar flash visual
          setFlashGymnastId(msg.gymnast.id);
          setFlashApparatus(msg.aparato);
          setTimeout(() => {
            setFlashGymnastId(null);
            setFlashApparatus('');
          }, 2000);
        }
      } catch (e) {
        console.error('Error al procesar mensaje de WebSocket:', e);
      }
    };

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [apiBase, wsBase, auth.tournamentId]);

  const handleProjectScore = (gymnast, aparato, score) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'PROJECT_SCORE',
        tournamentId: auth.tournamentId,
        gymnast,
        aparato,
        score
      }));
      showFlashNotification(`Proyectando nota de ${gymnast.nombre} en ${aparato}.`);
    } else {
      setError('No hay conexión activa de WebSocket para proyectar.');
      setTimeout(() => setError(''), 4000);
    }
  };

  const showFlashNotification = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 4000);
  };

  if (!tournament) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Cargando panel de administración...</p>
      </div>
    );
  }

  // --- IMPORTACIÓN DE EXCEL ---
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${apiBase}/tournaments/${auth.tournamentId}/import`, {
        method: 'POST',
        headers: { 'x-admin-pin': auth.pin },
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        showFlashNotification(`¡Importación exitosa! Se cargaron ${data.count} gimnastas.`);
        fetchTournamentData();
      } else {
        setError(data.error || 'Ocurrió un error al importar.');
      }
    } catch (err) {
      setError('Error al subir el archivo.');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- CARGAR TURNO (SUBIR EXCEL CON TURNO) ---
  const handleTurnoSubmit = async (e) => {
    e.preventDefault();
    if (!turnoForm.name.trim()) {
      alert('Por favor, ingresa el nombre del turno.');
      return;
    }
    if (!turnoFile) {
      alert('Por favor, selecciona un archivo Excel.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('file', turnoFile);
    formData.append('turno', turnoForm.name.trim());
    formData.append('niveles', turnoForm.niveles.trim());

    try {
      const res = await fetch(`${apiBase}/tournaments/${auth.tournamentId}/import`, {
        method: 'POST',
        headers: { 'x-admin-pin': auth.pin },
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        showFlashNotification(`¡Turno "${turnoForm.name}" cargado con éxito! Se importaron ${data.count} gimnastas.`);
        setShowTurnoModal(false);
        setTurnoForm({ name: '', niveles: '' });
        setTurnoFile(null);
        fetchTournamentData();
      } else {
        setError(data.error || 'Error al cargar el turno.');
      }
    } catch (err) {
      setError('Error de red al subir el archivo.');
    } finally {
      setLoading(false);
    }
  };

  // --- EXPORTAR EXCEL ---
  const handleExportExcel = () => {
    window.location.href = `${apiBase}/tournaments/${auth.tournamentId}/export?sortBy=${orderBy}&x-admin-pin=${auth.pin}`;
  };

  // --- ELIMINAR GIMNASTA ---
  const handleDeleteGymnast = async (id, nombre) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar a ${nombre}?`)) return;

    try {
      const res = await fetch(`${apiBase}/tournaments/${auth.tournamentId}/gymnasts/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-pin': auth.pin }
      });
      if (res.ok) {
        showFlashNotification('Gimnasta eliminada correctamente.');
        setGymnasts(prev => prev.filter(g => g.id !== id));
      } else {
        setError('No se pudo eliminar a la gimnasta.');
      }
    } catch (e) {
      setError('Error al comunicar con el servidor.');
    }
  };

  // --- AGREGAR O EDITAR GIMNASTA ---
  const handleOpenAddForm = () => {
    setEditingGymnast(null);
    setGymnastForm({
      nombre: '',
      nacimiento: '',
      institucion: '',
      categoria: '',
      nivel: '',
      grupo: 'Turno 1'
    });
    setShowAddForm(true);
  };

  const handleOpenEditForm = (g) => {
    setEditingGymnast(g);
    setGymnastForm({
      nombre: g.nombre,
      nacimiento: g.nacimiento || '',
      institucion: g.institucion,
      categoria: g.categoria,
      nivel: g.nivel,
      grupo: g.grupo || 'Turno 1'
    });
    setShowAddForm(true);
  };

  const handleSaveGymnast = async (e) => {
    e.preventDefault();
    if (!gymnastForm.nombre) return;

    setLoading(true);
    setError('');

    const url = editingGymnast 
      ? `${apiBase}/tournaments/${auth.tournamentId}/gymnasts/${editingGymnast.id}`
      : `${apiBase}/tournaments/${auth.tournamentId}/gymnasts`;
    
    const method = editingGymnast ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': auth.pin
        },
        body: JSON.stringify(gymnastForm)
      });

      const data = await res.json();
      if (res.ok) {
        showFlashNotification(editingGymnast ? 'Datos de la gimnasta guardados.' : 'Gimnasta agregada con éxito.');
        setShowAddForm(false);
        fetchTournamentData();
      } else {
        setError(data.error || 'No se pudo guardar la gimnasta.');
      }
    } catch (err) {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  // --- MODAL DE NOTAS (MESA DE CÓMPUTOS) ---
  const handleOpenScoreModal = (g, apparatus) => {
    setScoringGymnast(g);
    setScoringApparatus(apparatus);
    
    const notaObj = g.notas?.[apparatus];
    const initialJueces = ['', '', '', '', '', ''];
    if (notaObj && notaObj.jueces) {
      notaObj.jueces.forEach((v, i) => {
        if (i < 6) initialJueces[i] = v !== null && v !== undefined ? String(v) : '';
      });
    }

    setScoringForm({
      jueces: initialJueces,
      dtos: notaObj?.dtos !== undefined ? String(notaObj.dtos) : '0.00'
    });
  };

  const handleModalKeyDown = (e, index) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      if (index === 'dtos') {
        handleSaveScore();
      } else {
        const nextInput = document.getElementById(`juez-input-${index + 1}`);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        } else {
          const dtosInput = document.getElementById('dtos-input');
          if (dtosInput) {
            dtosInput.focus();
            dtosInput.select();
          }
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (index === 'dtos') {
        const prevInput = document.getElementById('juez-input-5');
        if (prevInput) {
          prevInput.focus();
          prevInput.select();
        }
      } else {
        const prevInput = document.getElementById(`juez-input-${index - 1}`);
        if (prevInput) {
          prevInput.focus();
          prevInput.select();
        }
      }
    }
  };

  const handleOpenTeamDiscountModal = (groupKey, clubName, currentDiscount) => {
    setEditingTeamDiscount({ groupKey, clubName });
    setTeamDiscountValue(String(currentDiscount || '0.0'));
  };

  const handleSaveTeamDiscount = async () => {
    if (!editingTeamDiscount) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiBase}/tournaments/${auth.tournamentId}/team-discounts`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': auth.pin
        },
        body: JSON.stringify({
          groupKey: editingTeamDiscount.groupKey,
          clubName: editingTeamDiscount.clubName,
          descuento: parseFloat(teamDiscountValue) || 0
        })
      });

      if (res.ok) {
        showFlashNotification('Descuento de equipo guardado y retransmitido.');
        setEditingTeamDiscount(null);
        fetchTournamentData();
      } else {
        const data = await res.json();
        setError(data.error || 'No se pudo guardar el descuento de equipo.');
      }
    } catch (err) {
      setError('Error al enviar el descuento de equipo.');
    } finally {
      setLoading(false);
    }
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

  const handleSaveScore = async () => {
    if (!scoringGymnast) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiBase}/tournaments/${auth.tournamentId}/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': auth.pin
        },
        body: JSON.stringify({
          gymnastId: scoringGymnast.id,
          aparato: scoringApparatus,
          jueces: scoringForm.jueces.map(v => v === '' ? null : parseFloat(v)),
          dtos: parseFloat(scoringForm.dtos) || 0,
          baseScore: getBaseScoreForGymnast(scoringGymnast)
        })
      });

      if (res.ok) {
        showFlashNotification('Calificación guardada y retransmitida.');
        setScoringGymnast(null);
        fetchTournamentData();
      } else {
        const data = await res.json();
        setError(data.error || 'No se pudo guardar la nota.');
      }
    } catch (err) {
      setError('Error al enviar la calificación.');
    } finally {
      setLoading(false);
    }
  };

  // --- CLASIFICACIONES EN TIEMPO REAL ---
  const availableTurnos = [...new Set(gymnasts.map(g => g.grupo || 'Turno 1'))].filter(Boolean);

  const getTurnoSummary = (turnoName) => {
    if (turnoName === 'Todos') {
      const uniqueNiveles = [...new Set(gymnasts.map(g => g.nivel))].filter(Boolean);
      const uniqueCategorias = [...new Set(gymnasts.map(g => g.categoria))].filter(Boolean);
      return {
        count: gymnasts.length,
        niveles: uniqueNiveles.slice(0, 4).join(', ') + (uniqueNiveles.length > 4 ? '...' : ''),
        categorias: uniqueCategorias.slice(0, 4).join(', ') + (uniqueCategorias.length > 4 ? '...' : '')
      };
    }
    const turnGymnasts = gymnasts.filter(g => g.grupo === turnoName);
    const uniqueNiveles = [...new Set(turnGymnasts.map(g => g.nivel))].filter(Boolean);
    const uniqueCategorias = [...new Set(turnGymnasts.map(g => g.categoria))].filter(Boolean);
    return {
      count: turnGymnasts.length,
      niveles: uniqueNiveles.join(', '),
      categorias: uniqueCategorias.join(', ')
    };
  };

  const podiumFilteredGymnasts = selectedTurno === 'Todos'
    ? gymnasts
    : gymnasts.filter(g => g.grupo === selectedTurno);
  
  // Agrupar gimnastas por Nivel y Categoría
  const groupedRankings = {};
  podiumFilteredGymnasts.forEach(g => {
    const key = `${g.nivel} - ${g.categoria}`;
    if (!groupedRankings[key]) groupedRankings[key] = [];

    // Calcular totales
    let totalScore = 0;
    let hasScores = false;
    const scores = {};
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

    groupedRankings[key].push({
      ...g,
      scores,
      totalScore: hasScores ? parseFloat(totalScore.toFixed(3)) : 0,
      hasScores
    });
  });

  // Ordenar y rankear
  Object.keys(groupedRankings).forEach(k => {
    groupedRankings[k].sort((a, b) => b.totalScore - a.totalScore);
    let rank = 1;
    for (let idx = 0; idx < groupedRankings[k].length; idx++) {
      if (idx > 0 && groupedRankings[k][idx].totalScore < groupedRankings[k - 1]?.totalScore) {
        // En caso de empate, mismo puesto
      }
      if (idx > 0 && groupedRankings[k][idx].totalScore < groupedRankings[k][idx - 1].totalScore) {
        rank = idx + 1;
      }
      groupedRankings[k][idx].puesto = groupedRankings[k][idx].totalScore > 0 ? rank : '-';
    }
  });

  // Podios segmentados por año de nacimiento dentro de Nivel + Categoría
  const getPodiumByYear = (groupKey) => {
    const members = groupedRankings[groupKey] || [];
    // Agrupar por año
    const yearsGroup = {};
    members.forEach(m => {
      const yr = m.nacimiento || 'S/A';
      if (!yearsGroup[yr]) yearsGroup[yr] = [];
      yearsGroup[yr].push(m);
    });

    // Ordenar y rankear por año
    Object.keys(yearsGroup).forEach(yr => {
      yearsGroup[yr].sort((a, b) => b.totalScore - a.totalScore);
      let rank = 1;
      for (let idx = 0; idx < yearsGroup[yr].length; idx++) {
        if (idx > 0 && yearsGroup[yr][idx].totalScore < yearsGroup[yr][idx - 1].totalScore) {
          rank = idx + 1;
        }
        yearsGroup[yr][idx].podioAnio = yearsGroup[yr][idx].totalScore > 0 ? rank : '-';
      }
    });

    return yearsGroup;
  };

  // Clasificación por Equipos (Clubes): suma de las mejores 3 notas de cada aparato por institución
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

      tournament.aparatos.forEach(ap => {
        const notes = clMembers
          .map(m => m.scores[ap])
          .filter(n => n !== null && n !== undefined)
          .sort((a, b) => b - a);
        
        // Sumar mejores 3
        const best3 = notes.slice(0, 3);
        const sum = best3.reduce((a, b) => a + b, 0);
        scoresPorAparato[ap] = sum > 0 ? parseFloat(sum.toFixed(3)) : 0;
        totalEquipo += scoresPorAparato[ap];
      });

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

  // --- FILTROS DE LISTA DE GIMNASTAS (Tab 1) ---
  const filteredGymnastList = gymnasts.filter(g => {
    const matchTurno = selectedTurno === 'Todos' || g.grupo === selectedTurno;
    const matchSearch = g.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.institucion.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.categoria.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.nivel.toLowerCase().includes(searchQuery.toLowerCase());
    return matchTurno && matchSearch;
  }).sort((a, b) => {
    if (orderBy === 'nivel') {
      // 1. Ordenar por Nivel
      const nivelA = String(a.nivel || '');
      const nivelB = String(b.nivel || '');
      const cmpNivel = nivelA.localeCompare(nivelB, undefined, { numeric: true, sensitivity: 'base' });
      if (cmpNivel !== 0) return cmpNivel;

      // 2. Ordenar por Turno / Grupo
      const groupA = String(a.grupo || 'Turno 1');
      const groupB = String(b.grupo || 'Turno 1');
      const cmpGroup = groupA.localeCompare(groupB, undefined, { numeric: true, sensitivity: 'base' });
      if (cmpGroup !== 0) return cmpGroup;
    } else {
      // 1. Ordenar por Turno / Grupo (ej: "Turno 1" vs "Turno 2")
      const groupA = String(a.grupo || 'Turno 1');
      const groupB = String(b.grupo || 'Turno 1');
      const cmpGroup = groupA.localeCompare(groupB, undefined, { numeric: true, sensitivity: 'base' });
      if (cmpGroup !== 0) return cmpGroup;
      
      // 2. Ordenar por Nivel (ej: "Nivel 4" vs "Nivel 5")
      const nivelA = String(a.nivel || '');
      const nivelB = String(b.nivel || '');
      const cmpNivel = nivelA.localeCompare(nivelB, undefined, { numeric: true, sensitivity: 'base' });
      if (cmpNivel !== 0) return cmpNivel;
    }

    // 3. Ordenar por Categoría
    const catA = String(a.categoria || '');
    const catB = String(b.categoria || '');
    const cmpCat = catA.localeCompare(catB, undefined, { numeric: true, sensitivity: 'base' });
    if (cmpCat !== 0) return cmpCat;

    // 4. Ordenar por Nombre
    return a.nombre.localeCompare(b.nombre);
  });

  return (
    <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto' }}>
      
      {/* HEADER DE LA MESA DE CÓMPUTOS */}
      <header className="glass-panel" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 30px',
        marginBottom: '24px',
        background: 'rgba(15, 23, 42, 0.85)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span style={{
              background: 'rgba(226, 177, 60, 0.15)',
              color: 'var(--accent-gold)',
              padding: '4px 10px',
              borderRadius: '6px',
              fontWeight: '700',
              fontSize: '0.8rem',
              letterSpacing: '0.05em'
            }}>
              MESA DE CÓMPUTOS GESTIÓN
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>•</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: '600' }}>
              Modalidad: {tournament.modalidad}
            </span>
          </div>
          <h1 style={{ fontSize: '1.6rem', letterSpacing: '-0.02em' }}>{tournament.nombre}</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={() => setShowTurnoModal(true)} className="btn btn-secondary" style={{ gap: '8px', border: '1px solid var(--accent-purple)' }}>
            <Calendar size={18} color="var(--accent-purple)" />
            Cargar Turno
          </button>

          <button onClick={() => onChangeView('public')} className="btn btn-secondary" style={{ gap: '8px', border: '1px solid var(--accent-primary)' }}>
            <Tv size={18} color="var(--accent-primary)" />
            Ver Proyección
          </button>

          <button onClick={handleExportExcel} className="btn btn-gold" style={{ gap: '8px' }}>
            <Download size={18} />
            Exportar Resultados
          </button>

          <button onClick={onLogout} className="btn btn-secondary" style={{ padding: '10px 16px' }}>
            Cerrar Sesión
          </button>
        </div>
      </header>

      {/* ALERTAS DE NOTIFICACIÓN */}
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
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>
            <X size={16} />
          </button>
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
          <button onClick={() => setSuccess('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#a7f3d0', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* WIDGETS DE RED LOCAL */}
      <div className="glass-panel" style={{
        padding: '15px 24px', 
        marginBottom: '24px', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(20, 30, 54, 0.3)',
        fontSize: '0.9rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin size={16} color="var(--accent-primary)" />
          <span style={{ color: 'var(--text-secondary)' }}>Instrucciones de Red:</span>
          <strong>Conecta tablets de jueces al Wi-Fi y abre la IP de esta PC en el navegador.</strong>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <div>PIN Jueces: <strong style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>{tournament.juezPin || '5555'}</strong></div>
          <div>Gimnastas: <strong>{gymnasts.length}</strong></div>
        </div>
      </div>

      {/* PESTAÑAS DE VISTA */}
      <div className="tabs">
        <button 
          onClick={() => setActiveTab('monitoreo')} 
          className={`tab-btn ${activeTab === 'monitoreo' ? 'active' : ''}`}
        >
          <Grid size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
          Monitoreo y Carga en Vivo
        </button>
        <button 
          onClick={() => setActiveTab('gimnastas')} 
          className={`tab-btn ${activeTab === 'gimnastas' ? 'active' : ''}`}
        >
          <Users size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
          Gimnastas ({gymnasts.length})
        </button>
        <button 
          onClick={() => setActiveTab('podios')} 
          className={`tab-btn ${activeTab === 'podios' ? 'active' : ''}`}
        >
          <Trophy size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
          Clasificaciones y Podios
        </button>
      </div>

      {/* SECTOR DE TURNOS DYNAMIC/PREMIUM */}
      <div className="glass-panel" style={{
        padding: '16px 20px',
        marginBottom: '24px',
        background: 'rgba(15, 23, 42, 0.4)',
        borderColor: 'rgba(59, 130, 246, 0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Calendar size={18} color="var(--accent-primary)" />
          <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Turnos del Torneo / Carga por Día
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            (Selecciona un turno para filtrar el Monitoreo, Gimnastas y Podios en tiempo real)
          </span>
        </div>
        
        <div style={{
          display: 'flex',
          gap: '12px',
          overflowX: 'auto',
          paddingBottom: '8px',
          scrollbarWidth: 'thin'
        }}>
          {/* Card para "Todos los Turnos" */}
          <div
            onClick={() => setSelectedTurno('Todos')}
            style={{
              minWidth: '220px',
              padding: '12px 16px',
              borderRadius: '10px',
              cursor: 'pointer',
              background: selectedTurno === 'Todos' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
              border: `2px solid ${selectedTurno === 'Todos' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              transition: 'all 0.2s ease',
              boxShadow: selectedTurno === 'Todos' ? '0 0 15px rgba(59, 130, 246, 0.2)' : 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontWeight: '700', fontSize: '0.95rem', color: selectedTurno === 'Todos' ? '#fff' : 'var(--text-secondary)' }}>
                Todos los Turnos
              </span>
              <span style={{
                fontSize: '0.75rem',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text-muted)'
              }}>
                {gymnasts.length} gimn.
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>Niveles:</strong> {getTurnoSummary('Todos').niveles || 'Ninguno'}
            </div>
          </div>

          {/* Cards para cada Turno cargado */}
          {availableTurnos.map(t => {
            const summary = getTurnoSummary(t);
            const isSelected = selectedTurno === t;
            return (
              <div
                key={t}
                onClick={() => setSelectedTurno(t)}
                style={{
                  minWidth: '220px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  border: `2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 0 15px rgba(59, 130, 246, 0.2)' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.95rem', color: isSelected ? '#fff' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t}>
                    {t}
                  </span>
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                    color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)',
                    fontWeight: '600'
                  }}>
                    {summary.count} gimn.
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong>Niveles:</strong> {summary.niveles || 'Ninguno'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CONTENIDO DE PESTAÑAS */}
      
      {/* 1. MONITOREO EN VIVO */}
      {activeTab === 'monitoreo' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.2rem' }}>Puntuaciones en Tiempo Real</h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ordenar por:</span>
                <select
                  value={orderBy}
                  onChange={(e) => setOrderBy(e.target.value)}
                  className="input-field"
                  style={{
                    width: '150px',
                    padding: '8px 12px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="grupo">Turno</option>
                  <option value="nivel">Nivel</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="Filtrar por gimnasta o club..."
                className="input-field"
                style={{ width: '260px', padding: '8px 12px' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button onClick={fetchTournamentData} className="btn btn-secondary" style={{ padding: '8px 12px' }}>
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          <div className="table-container" style={{ maxHeight: '600px' }}>
            <table>
              <thead>
                <tr>
                  <th>Gimnasta</th>
                  <th>Club / Institución</th>
                  <th>Categoría</th>
                  <th>Nivel</th>
                  {tournament.aparatos.map(ap => (
                    <th key={ap} style={{ textAlign: 'center' }}>{ap}</th>
                  ))}
                  <th style={{ textAlign: 'center', background: 'rgba(15, 23, 42, 0.9)', color: 'var(--accent-gold)' }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {filteredGymnastList.map((g, idx) => {
                  let totalScore = 0;
                  let hasScores = false;

                  const prevGymnast = idx > 0 ? filteredGymnastList[idx - 1] : null;
                  const showGroupDivider = orderBy === 'nivel'
                    ? (!prevGymnast || prevGymnast.nivel !== g.nivel)
                    : (!prevGymnast || prevGymnast.grupo !== g.grupo);
                  
                  return (
                    <React.Fragment key={g.id}>
                      {showGroupDivider && (
                        <tr style={{ background: 'rgba(59, 130, 246, 0.08)', height: '45px' }}>
                          <td colSpan={5 + tournament.aparatos.length} style={{ fontWeight: '800', color: 'var(--accent-primary)', fontSize: '0.9rem', letterSpacing: '0.05em', paddingLeft: '15px' }}>
                            {orderBy === 'nivel'
                              ? `🏆 NIVEL: ${String(g.nivel || 'SIN NIVEL').toUpperCase()}`
                              : `📅 TURNO: ${String(g.grupo || 'TURNO 1').toUpperCase()}`}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ fontWeight: '600' }}>{g.nombre}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{g.institucion}</td>
                        <td>{g.categoria}</td>
                        <td>{g.nivel}</td>
                        {tournament.aparatos.map(ap => {
                          const scoreObj = g.notas?.[ap];
                          const scoreVal = scoreObj?.final;
                          
                          if (scoreVal !== undefined && scoreVal !== null) {
                            totalScore += parseFloat(scoreVal);
                            hasScores = true;
                          }

                          const isFlashing = flashGymnastId === g.id && flashApparatus === ap;

                          return (
                            <td
                              key={ap}
                              onClick={() => handleOpenScoreModal(g, ap)}
                              className={isFlashing ? 'flash-update' : ''}
                              style={{
                                textAlign: 'center',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: '700',
                                cursor: 'pointer',
                                color: scoreVal !== undefined ? 'var(--text-primary)' : 'var(--text-muted)',
                                background: scoreVal !== undefined ? 'rgba(59, 130, 246, 0.05)' : 'none',
                                borderRight: '1px solid rgba(255,255,255,0.02)',
                                transition: 'all 0.3s',
                                position: 'relative',
                                padding: '12px 8px'
                              }}
                              title="Haz clic para modificar la nota"
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <span>{scoreVal !== undefined ? parseFloat(scoreVal).toFixed(3) : '-'}</span>
                                {scoreVal !== undefined && scoreVal !== null && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleProjectScore(g, ap, scoreObj);
                                    }}
                                    style={{
                                      background: 'rgba(59, 130, 246, 0.15)',
                                      border: 'none',
                                      borderRadius: '4px',
                                      color: 'var(--accent-primary)',
                                      cursor: 'pointer',
                                      padding: '4px 6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'all 0.2s',
                                    }}
                                    title="Proyectar esta nota en la pantalla de resultados"
                                  >
                                    <Tv size={12} />
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td style={{
                          textAlign: 'center',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: '800',
                          fontSize: '1rem',
                          color: 'var(--accent-gold)',
                          background: 'rgba(226, 177, 60, 0.05)'
                        }}>
                          {hasScores ? totalScore.toFixed(3) : '-'}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}

                {filteredGymnastList.length === 0 && (
                  <tr>
                    <td colSpan={5 + tournament.aparatos.length} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '30px' }}>
                      No se encontraron gimnastas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. GESTIÓN DE GIMNASTAS */}
      {activeTab === 'gimnastas' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>Inscripciones del Torneo</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Importa planillas Excel o agrega/edita competidoras de forma manual.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="Buscar por nombre, club, nivel..."
                className="input-field"
                style={{ width: '280px', padding: '8px 12px' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button onClick={handleOpenAddForm} className="btn btn-primary" style={{ gap: '6px', padding: '8px 16px' }}>
                <Plus size={16} />
                Agregar Gimnasta
              </button>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx, .xls"
                style={{ display: 'none' }}
              />
              <button 
                onClick={handleImportClick} 
                className="btn btn-secondary" 
                style={{ gap: '6px', padding: '8px 16px' }}
                disabled={loading}
              >
                <Upload size={16} />
                Importar Excel
              </button>
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nombre Completo</th>
                  <th>Institución / Club</th>
                  <th>Categoría</th>
                  <th>Nivel</th>
                  <th>Año Nac.</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredGymnastList.map(g => (
                  <tr key={g.id}>
                    <td style={{ fontWeight: '600' }}>{g.nombre}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{g.institucion}</td>
                    <td>{g.categoria}</td>
                    <td>{g.nivel}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{g.nacimiento || g.fechaNacimiento || '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button 
                          onClick={() => handleOpenEditForm(g)}
                          className="btn btn-secondary" 
                          style={{ padding: '6px 10px' }}
                          title="Editar perfil de gimnasta"
                        >
                          <Edit size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteGymnast(g.id, g.nombre)}
                          className="btn btn-secondary" 
                          style={{ padding: '6px 10px', color: 'var(--accent-danger)' }}
                          title="Eliminar del torneo"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredGymnastList.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '30px' }}>
                      No hay gimnastas registradas. ¡Importa un Excel para comenzar rápidamente!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. PODIOS Y RESULTADOS */}
      {activeTab === 'podios' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* FILTRO DE TURNO PARA PODIOS */}
          <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(20, 30, 54, 0.4)' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>Resultados y Podios del Torneo</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Filtra los podios individuales y por equipos por el turno correspondiente para evitar mezclar puntajes.
              </p>
            </div>
            
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
               <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Seleccionar Turno:</span>
               <select
                 value={selectedTurno}
                 onChange={(e) => setSelectedTurno(e.target.value)}
                 className="input-field"
                 style={{
                   width: '200px',
                   padding: '8px 12px',
                   background: 'rgba(15, 23, 42, 0.6)',
                   color: 'var(--text-primary)',
                   border: '1px solid var(--border-color)',
                   borderRadius: '8px',
                   cursor: 'pointer'
                 }}
               >
                 <option value="Todos">Todos los Turnos</option>
                 {availableTurnos.map(t => (
                   <option key={t} value={t}>{t}</option>
                 ))}
               </select>
             </div>
          </div>
          
          {/* RECORRER TODOS LOS GRUPOS (Nivel + Categoría) */}
          {Object.keys(groupedRankings).sort().map(groupKey => {
            const rankedList = groupedRankings[groupKey];
            const podiumsByYear = getPodiumByYear(groupKey);
            const teamRankings = getTeamRankings(groupKey);

            return (
              <div key={groupKey} className="glass-panel" style={{ padding: '24px' }}>
                <h2 style={{ 
                  fontSize: '1.4rem', 
                  borderBottom: '1px solid var(--border-color)', 
                  paddingBottom: '10px',
                  marginBottom: '20px',
                  color: 'var(--accent-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <Layers size={22} />
                  {groupKey}
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '30px', alignItems: 'start' }}>
                  
                  {/* TABLA PODIO POR AÑO (Clasificación Clave) */}
                  <div>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '15px', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Trophy size={18} />
                      Clasificación Individual (Podio por Año)
                    </h3>
                    
                    {Object.keys(podiumsByYear).sort().map(year => (
                      <div key={year} style={{ marginBottom: '25px' }}>
                        <div style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          borderLeft: '4px solid var(--accent-gold)',
                          fontWeight: '700',
                          fontSize: '0.9rem',
                          marginBottom: '10px'
                        }}>
                          AÑO DE NACIMIENTO: {year}
                        </div>

                        <div className="table-container">
                          <table>
                            <thead>
                              <tr>
                                <th style={{ width: '50px', textAlign: 'center', padding: '10px 6px' }}>Pos.</th>
                                <th style={{ padding: '10px 8px' }}>Gimnasta</th>
                                <th style={{ padding: '10px 8px' }}>Club / Institución</th>
                                {tournament.aparatos.map(ap => (
                                  <th key={ap} style={{ textAlign: 'center', fontSize: '0.75rem', padding: '10px 4px' }}>{ap.substring(0,3)}</th>
                                ))}
                                <th style={{ textAlign: 'center', padding: '10px 6px' }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {podiumsByYear[year].map(gym => (
                                <tr key={gym.id}>
                                  <td style={{ textAlign: 'center', padding: '10px 6px' }}>
                                    {gym.podioAnio <= 3 ? (
                                      <span className={`podium-rank rank-${gym.podioAnio}`}>
                                        {gym.podioAnio}
                                      </span>
                                    ) : (
                                      <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{gym.podioAnio}</span>
                                    )}
                                  </td>
                                  <td style={{ fontWeight: '600', padding: '10px 8px' }}>{gym.nombre}</td>
                                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '10px 8px' }}>{gym.institucion}</td>
                                  {tournament.aparatos.map(ap => (
                                    <td key={ap} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', padding: '10px 4px' }}>
                                      {gym.scores[ap] !== null ? gym.scores[ap].toFixed(3) : '-'}
                                    </td>
                                  ))}
                                  <td style={{
                                    textAlign: 'center',
                                    fontFamily: 'var(--font-mono)',
                                    fontWeight: '800',
                                    color: 'var(--accent-success)',
                                    padding: '10px 6px'
                                  }}>
                                    {gym.totalScore > 0 ? gym.totalScore.toFixed(3) : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* TABLA PODIO POR EQUIPOS */}
                  <div>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '15px', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Users size={18} />
                      Clasificación por Equipos (Mejores 3 Notas)
                    </h3>
                    
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th style={{ width: '50px', textAlign: 'center', padding: '10px 6px' }}>Pos.</th>
                            <th style={{ padding: '10px 8px' }}>Club / Institución</th>
                            {tournament.aparatos.map(ap => (
                              <th key={ap} style={{ textAlign: 'center', fontSize: '0.75rem', padding: '10px 4px' }}>{ap.substring(0,3)}</th>
                            ))}
                            <th style={{ textAlign: 'center', padding: '10px 6px' }}>Descuento</th>
                            <th style={{ textAlign: 'center', padding: '10px 6px' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamRankings.map(club => (
                            <tr key={club.clubName}>
                              <td style={{ textAlign: 'center', padding: '10px 6px' }}>
                                {club.puesto <= 3 ? (
                                  <span className={`podium-rank rank-${club.puesto}`}>
                                    {club.puesto}
                                  </span>
                                ) : (
                                  <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{club.puesto}</span>
                                )}
                              </td>
                              <td style={{ fontWeight: '700', padding: '10px 8px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span>{club.clubName}</span>
                                  {club.descuento > 0 && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-danger)', fontWeight: 'normal' }}>
                                      Bruto: {club.totalEquipoRaw.toFixed(3)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {tournament.aparatos.map(ap => (
                                <td key={ap} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', padding: '10px 4px' }}>
                                  {club.scoresPorAparato[ap] > 0 ? club.scoresPorAparato[ap].toFixed(3) : '-'}
                                </td>
                              ))}
                              <td style={{ textAlign: 'center', padding: '10px 6px' }}>
                                <button
                                  onClick={() => handleOpenTeamDiscountModal(groupKey, club.clubName, club.descuento)}
                                  className="btn"
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '0.8rem',
                                    fontWeight: '700',
                                    color: club.descuento > 0 ? 'var(--accent-danger)' : 'var(--text-secondary)',
                                    borderColor: club.descuento > 0 ? 'var(--accent-danger)' : 'var(--border-color)',
                                    background: club.descuento > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.02)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                  }}
                                  title="Aplicar o editar descuento manual a este club"
                                >
                                  <Edit size={12} />
                                  {club.descuento > 0 ? `-${club.descuento.toFixed(1)}` : '0.0'}
                                </button>
                              </td>
                              <td style={{
                                textAlign: 'center',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: '800',
                                color: 'var(--accent-purple)',
                                background: 'rgba(139, 92, 246, 0.04)',
                                padding: '10px 6px'
                              }}>
                                {club.totalEquipo > 0 ? club.totalEquipo.toFixed(3) : '-'}
                              </td>
                            </tr>
                          ))}

                          {teamRankings.length === 0 && (
                            <tr>
                              <td colSpan={4 + tournament.aparatos.length} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px' }}>
                                No hay suficientes datos para calcular clasificación por equipos.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              </div>
            );
          })}

          {Object.keys(groupedRankings).length === 0 && (
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No hay gimnastas inscritas en el torneo para generar clasificaciones.
            </div>
          )}
        </div>
      )}


      {/* MODAL: CARGAR TURNO / DÍA */}
      {showTurnoModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div className="glass-panel" style={{
            width: '100%', maxWidth: '550px', padding: '30px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color-hover)',
            borderRadius: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={22} color="var(--accent-purple)" />
                <h3 style={{ fontSize: '1.3rem', fontWeight: '700' }}>Cargar Nuevo Turno</h3>
              </div>
              <button 
                onClick={() => {
                  setShowTurnoModal(false);
                  setTurnoForm({ name: '', niveles: '' });
                  setTurnoFile(null);
                }} 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleTurnoSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '8px' }}>Nombre del Turno / Rotación</label>
                <input
                  type="text"
                  required
                  placeholder="ej: Turno 1 (Día 1 - 08:00am)"
                  className="input-field"
                  value={turnoForm.name}
                  onChange={(e) => setTurnoForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '8px' }}>Nivel/es Asociados (Informativo)</label>
                <input
                  type="text"
                  placeholder="ej: Nivel 4, Nivel 5"
                  className="input-field"
                  value={turnoForm.niveles}
                  onChange={(e) => setTurnoForm(prev => ({ ...prev, niveles: e.target.value }))}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '8px' }}>Cargar Planilla Excel (.xlsx, .xls)</label>
                <div style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '10px',
                  padding: '24px',
                  textAlign: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  cursor: 'pointer',
                  position: 'relative'
                }}
                onClick={() => document.getElementById('turno-file-input').click()}
                >
                  <Upload size={32} color={turnoFile ? 'var(--accent-success)' : 'var(--text-muted)'} style={{ marginBottom: '8px', margin: '0 auto' }} />
                  {turnoFile ? (
                    <div>
                      <p style={{ color: 'var(--accent-success)', fontWeight: '600', fontSize: '0.9rem' }}>{turnoFile.name}</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px' }}>Haz clic para cambiar de archivo</p>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: '0.9rem', fontWeight: '500' }}>Selecciona tu archivo excel aquí</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px' }}>Formato idéntico al de prueba</p>
                    </div>
                  )}
                  <input
                    type="file"
                    id="turno-file-input"
                    accept=".xlsx, .xls"
                    style={{ display: 'none' }}
                    onChange={(e) => setTurnoFile(e.target.files[0])}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowTurnoModal(false);
                    setTurnoForm({ name: '', niveles: '' });
                    setTurnoFile(null);
                  }}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, gap: '8px', background: 'linear-gradient(135deg, var(--accent-purple), #6d28d9)', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)' }}
                  disabled={loading}
                >
                  {loading ? 'Cargando...' : 'Cargar Turno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: MODIFICAR / INGRESAR NOTAS (ADMIN) */}
      {scoringGymnast && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div className="glass-panel" style={{
            width: '100%', maxWidth: '500px', padding: '30px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color-hover)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem' }}>Modificar Nota - {scoringApparatus}</h3>
              <button onClick={() => setScoringGymnast(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '1.1rem' }}>{scoringGymnast.nombre}</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{scoringGymnast.institucion} • {scoringGymnast.nivel} • {scoringGymnast.categoria}</p>
              {tournament.modalidad === 'GAM' && (
                <p style={{ color: 'var(--accent-primary)', fontSize: '0.9rem', marginTop: '6px', fontWeight: 'bold' }}>
                  Nota de Partida (Base): {getBaseScoreForGymnast(scoringGymnast).toFixed(2)}
                </p>
              )}
            </div>

            {/* Inputs para Notas de Jueces */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {[0, 1, 2, 3, 4, 5].map(idx => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', alignItems: 'center', gap: '15px' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {tournament.modalidad === 'GAM' ? `Nota Juez ${idx + 1}:` : `Deducción Juez ${idx + 1}:`}
                  </label>
                  <input
                    id={`juez-input-${idx}`}
                    type="number"
                    step="0.05"
                    min="0"
                    max="10"
                    placeholder={tournament.modalidad === 'GAM' ? "ej. 8.50" : "ej. 0.50"}
                    className="input-field"
                    value={scoringForm.jueces[idx]}
                    onKeyDown={(e) => handleModalKeyDown(e, idx)}
                    onChange={(e) => {
                      const updated = [...scoringForm.jueces];
                      updated[idx] = e.target.value;
                      setScoringForm(prev => ({ ...prev, jueces: updated }));
                    }}
                  />
                </div>
              ))}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', alignItems: 'center', gap: '15px', borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Descuento Mesa (DTOS):</label>
                <input
                  id="dtos-input"
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  className="input-field"
                  value={scoringForm.dtos}
                  onKeyDown={(e) => handleModalKeyDown(e, 'dtos')}
                  onChange={(e) => setScoringForm(prev => ({ ...prev, dtos: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '30px' }}>
              <button onClick={handleSaveScore} className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
              <button onClick={() => setScoringGymnast(null)} className="btn btn-secondary" style={{ flex: 1 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CREAR / EDITAR PERFIL DE GIMNASTA */}
      {showAddForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1000, padding: '20px'
        }}>
          <form onSubmit={handleSaveGymnast} className="glass-panel" style={{
            width: '100%', maxWidth: '500px', padding: '30px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color-hover)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem' }}>
                {editingGymnast ? 'Editar Gimnasta' : 'Agregar Gimnasta Manual'}
              </h3>
              <button type="button" onClick={() => setShowAddForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Nombre y Apellido</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Gomez, Sofia"
                  className="input-field"
                  value={gymnastForm.nombre}
                  onChange={(e) => setGymnastForm(prev => ({ ...prev, nombre: e.target.value }))}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Institución / Club / Provincia</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Akro's"
                  className="input-field"
                  value={gymnastForm.institucion}
                  onChange={(e) => setGymnastForm(prev => ({ ...prev, institucion: e.target.value }))}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Categoría</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Infantil"
                    className="input-field"
                    value={gymnastForm.categoria}
                    onChange={(e) => setGymnastForm(prev => ({ ...prev, categoria: e.target.value }))}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Nivel</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Nivel 1A"
                    className="input-field"
                    value={gymnastForm.nivel}
                    onChange={(e) => setGymnastForm(prev => ({ ...prev, nivel: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Año Nacimiento</label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="ej. 2013"
                    className="input-field"
                    value={gymnastForm.nacimiento}
                    onChange={(e) => setGymnastForm(prev => ({ ...prev, nacimiento: e.target.value }))}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Grupo / Turno</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Turno 1"
                    className="input-field"
                    value={gymnastForm.grupo}
                    onChange={(e) => setGymnastForm(prev => ({ ...prev, grupo: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '30px' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar Perfil'}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: DESCUENTO DE EQUIPO MANUAL */}
      {editingTeamDiscount && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div className="glass-panel" style={{
            width: '100%', maxWidth: '400px', padding: '30px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color-hover)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem' }}>Descuento de Equipo</h3>
              <button onClick={() => setEditingTeamDiscount(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '1.1rem', color: '#fff' }}>{editingTeamDiscount.clubName}</h4>
              <p style={{ color: 'var(--accent-purple)', fontSize: '0.85rem', fontWeight: 'bold' }}>{editingTeamDiscount.groupKey}</p>
            </div>

            <div className="form-group">
              <label>Puntos a descontar al Total del Club:</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="50"
                placeholder="ej. 1.0"
                className="input-field"
                value={teamDiscountValue}
                onChange={(e) => setTeamDiscountValue(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '25px' }}>
              <button onClick={handleSaveTeamDiscount} className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? 'Guardando...' : 'Aplicar Descuento'}
              </button>
              <button onClick={() => setEditingTeamDiscount(null)} className="btn btn-secondary" style={{ flex: 1 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
