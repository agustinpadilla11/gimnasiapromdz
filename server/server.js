import { Mutex } from 'async-mutex';
const tournamentLocks = {};
function getTournamentLock(id) { if (!tournamentLocks[id]) tournamentLocks[id] = new Mutex(); return tournamentLocks[id]; }
import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import multer from 'multer';
import http from 'http';
import os from 'os';
import {
  getTournaments,
  createTournament,
  loadTournament,
  saveTournamentData,
  deleteTournament
} from './db.js';
import {
  importGimnastasFromExcel,
  exportTournamentToExcel
} from './excelProcessor.js';

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filenameFederacion = fileURLToPath(import.meta.url);
const __dirnameFederacion = path.dirname(__filenameFederacion);
const USERS_FILE = path.join(__dirnameFederacion, 'data', 'users.json');

const getUsers = () => {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
};

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend desde la carpeta client/dist
const clientBuildPath = path.join(__dirnameFederacion, '..', 'client', 'dist');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  // Carga SPA en rutas no API
  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}


// Configuración de Multer para recibir el archivo Excel en memoria
const upload = multer({ storage: multer.memoryStorage() });

// --- MIDDLEWARES DE SEGURIDAD ---

// Middleware para verificar acceso de Federación (Presidente, Secretario, Delegado)
const requireFederacion = (req, res, next) => {
  const userRole = req.headers['x-user-role'];
  if (!userRole || !['Presidente', 'Secretario', 'Delegado'].includes(userRole)) {
    return res.status(403).json({ error: 'Acceso denegado: Se requieren credenciales federativas' });
  }
  next();
};

// Middleware para verificar PIN de Cómputos (Admin)
const requireAdmin = async (req, res, next) => {
  const { tournamentId } = req.params;
  const adminPin = req.headers['x-admin-pin'];

  if (!tournamentId) {
    return res.status(400).json({ error: 'Se requiere ID del torneo' });
  }

  try {
    const tournament = await loadTournament(tournamentId);
    if (tournament.adminPin && tournament.adminPin !== adminPin) {
      return res.status(403).json({ error: 'PIN de Administración incorrecto' });
    }
    req.tournament = tournament; // Adjuntar datos del torneo a la request
    next();
  } catch (e) {
    res.status(404).json({ error: 'Torneo no encontrado' });
  }
};

// Middleware para verificar PIN de Juez u Cómputos
const requireAuth = async (req, res, next) => {
  const { tournamentId } = req.params;
  const adminPin = req.headers['x-admin-pin'];
  const juezPin = req.headers['x-juez-pin'];

  if (!tournamentId) {
    return res.status(400).json({ error: 'Se requiere ID del torneo' });
  }

  try {
    const tournament = await loadTournament(tournamentId);
    const isAdmin = tournament.adminPin && tournament.adminPin === adminPin;
    const isJuezGaf = tournament.juezPin && tournament.juezPin === juezPin;
    const isJuezGam = tournament.juezPinGam && tournament.juezPinGam === juezPin;
    const isJuez = isJuezGaf || isJuezGam;

    // Permitir lectura (GET) de forma pública para la pantalla del público,
    // pero asegurando que no se expongan los PINs en la respuesta.
    if (req.method === 'GET') {
      req.tournament = tournament;
      req.isAdmin = isAdmin;
      return next();
    }

    if (!isAdmin && !isJuez) {
      return res.status(403).json({ error: 'PIN de acceso incorrecto para este torneo' });
    }

    req.tournament = tournament;
    req.isAdmin = isAdmin;
    next();
  } catch (e) {
    res.status(404).json({ error: 'Torneo no encontrado' });
  }
};

// --- RUTAS DE LA API ---

// 0. Autenticar acceso federativo
app.post('/api/auth/federacion', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  const users = getUsers();
  const user = users.find(u => u.username === username.toLowerCase() && u.password === password);

  if (user) {
    res.json({
      success: true,
      role: user.role,
      name: user.name,
      username: user.username
    });
  } else {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
});

// 1. Listar todos los torneos (Básico, sin protección para el selector inicial)
app.get('/api/tournaments', async (req, res) => {
  try {
    const list = await getTournaments();
    const userRole = req.headers['x-user-role'];
    const isFederacion = userRole && ['Presidente', 'Secretario', 'Delegado'].includes(userRole);
    
    if (isFederacion) {
      res.json(list);
    } else {
      // No enviar los PINs al selector del cliente por seguridad
      const safeList = list.map(({ adminPin, juezPin, ...rest }) => rest);
      res.json(safeList);
    }
  } catch (e) {
    res.status(500).json({ error: 'Error al listar torneos' });
  }
});

// 2. Crear un torneo nuevo (Requiere usuario de federación)
app.post('/api/tournaments', requireFederacion, async (req, res) => {
  const { id, nombre, modalidad, adminPin, juezPin, juezPinGam, opciones } = req.body;

  if (!id || !nombre || !modalidad) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const finalAdminPin = adminPin || '1111';
  const finalJuezPin = juezPin || '5555';
  const finalJuezPinGam = juezPinGam || '6666';

  if (finalAdminPin === finalJuezPin || (modalidad === 'Ambos' && finalAdminPin === finalJuezPinGam)) {
    return res.status(400).json({ error: 'El PIN de Jueces no puede ser igual al PIN de Cómputos' });
  }

  try {
    const nuevoTorneo = await createTournament(id, nombre, modalidad, finalAdminPin, finalJuezPin, finalJuezPinGam, opciones || {});
    res.status(201).json({ success: true, torneo: nuevoTorneo });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 3. Eliminar un torneo (Requiere usuario de federación)
app.delete('/api/tournaments/:tournamentId', requireFederacion, async (req, res) => {
  const { tournamentId } = req.params;
  try {
    await deleteTournament(tournamentId);
    res.json({ success: true, message: 'Torneo eliminado correctamente' });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar el torneo' });
  }
});

// 4. Autenticar acceso a un torneo (Comprueba PIN y devuelve el rol asignado)
app.post('/api/tournaments/:tournamentId/auth', async (req, res) => {
  const { tournamentId } = req.params;
  const { pin } = req.body;

  try {
    const tournament = await loadTournament(tournamentId);
    if (tournament.adminPin === pin) {
      return res.json({ success: true, role: 'computos', nombre: tournament.nombre, modalidad: tournament.modalidad });
    } else if (tournament.juezPinGam && tournament.juezPinGam === pin) {
      return res.json({ success: true, role: 'jueces', nombre: tournament.nombre, modalidad: tournament.modalidad, ramaJuez: 'GAM' });
    } else if (tournament.juezPin === pin) {
      return res.json({ success: true, role: 'jueces', nombre: tournament.nombre, modalidad: tournament.modalidad, ramaJuez: 'GAF' });
    }
    res.status(401).json({ error: 'PIN incorrecto' });
  } catch (e) {
    res.status(404).json({ error: 'Torneo no encontrado' });
  }
});

// 5. Cargar detalles completos del torneo (Requiere autenticación)
app.get('/api/tournaments/:tournamentId', requireAuth, (req, res) => {
  // Retornar los datos del torneo
  // Si no es admin, ocultar pines de configuración
  const data = { ...req.tournament };
  if (!req.isAdmin) {
    delete data.adminPin;
    delete data.juezPin;
  }
  res.json(data);
});

// 6. Importar gimnastas desde Excel
app.post('/api/tournaments/:tournamentId/import', requireAdmin, upload.array('files'), async (req, res) => {
  const { tournamentId } = req.params;
  const { turno, niveles } = req.body;
  
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se subieron archivos' });
  }

  try {
    let nuevasGimnastas = [];
    for (const file of req.files) {
      const gims = importGimnastasFromExcel(file.buffer, file.originalname);
      nuevasGimnastas = nuevasGimnastas.concat(gims);
    }
    
    const lock = getTournamentLock(tournamentId);
    const release = await lock.acquire();
    try {
      const tData = await loadTournament(tournamentId);

      if (turno) {
        // Asignar el nombre del turno a cada gimnasta
        nuevasGimnastas.forEach(g => {
          g.grupo = turno;
        });

        // Filtrar gimnastas preexistentes de este mismo turno para evitar duplicaciones si vuelven a importar
        const filtradas = (tData.gimnastas || []).filter(g => g.grupo !== turno);
        tData.gimnastas = [...filtradas, ...nuevasGimnastas];
      } else {
        tData.gimnastas = [...(tData.gimnastas || []), ...nuevasGimnastas];
      }

      await saveTournamentData(tournamentId, tData);
      
      // Notificar a todos por WebSocket
      broadcast(tournamentId, { type: 'TOURNAMENT_RELOADED', gimnastas: tData.gimnastas });

      res.json({ success: true, count: nuevasGimnastas.length });
    } finally {
      release();
    }
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 7. Agregar gimnasta individualmente (Admin)
app.post('/api/tournaments/:tournamentId/gymnasts', requireAdmin, async (req, res) => {
  const { tournamentId } = req.params;
  const { nombre, nacimiento, institucion, categoria, nivel, sexo, grupo } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  const lock = getTournamentLock(tournamentId);
  const release = await lock.acquire();
  try {
    const tData = await loadTournament(tournamentId);
    const nueva = {
      id: `g_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      nombre,
      nacimiento: nacimiento || '',
      fechaNacimiento: nacimiento || '',
      institucion: institucion || 'Independiente',
      categoria: categoria || 'Única',
      nivel: nivel || 'Nivel 1',
      sexo: sexo || '',
      grupo: grupo || 'Turno 1',
      notas: {}
    };

    tData.gimnastas.push(nueva);
    await saveTournamentData(tournamentId, tData);

    broadcast(tournamentId, { type: 'GYMNAST_UPDATED', gymnast: nueva });

    res.status(201).json({ success: true, gymnast: nueva });
  } catch (err) {
    res.status(500).json({ error: 'Error al agregar gimnasta' });
  } finally {
    release();
  }
});

// 8. Modificar gimnasta individualmente (Admin)
app.put('/api/tournaments/:tournamentId/gymnasts/:gymnastId', requireAdmin, async (req, res) => {
  const { tournamentId, gymnastId } = req.params;
  const updatedFields = req.body;

  const lock = getTournamentLock(tournamentId);
  const release = await lock.acquire();
  try {
    const tData = await loadTournament(tournamentId);
    const idx = tData.gimnastas.findIndex(g => g.id === gymnastId);

    if (idx === -1) {
      return res.status(404).json({ error: 'Gimnasta no encontrada' });
    }

    // Conservar las notas existentes al actualizar campos de perfil
    tData.gimnastas[idx] = {
      ...tData.gimnastas[idx],
      ...updatedFields,
      id: gymnastId, // prevenir cambio de ID
      notas: tData.gimnastas[idx].notas // no sobreescribir notas mediante este endpoint
    };

    await saveTournamentData(tournamentId, tData);

    broadcast(tournamentId, { type: 'GYMNAST_UPDATED', gymnast: tData.gimnastas[idx] });

    res.json({ success: true, gymnast: tData.gimnastas[idx] });
  } catch (err) {
    res.status(500).json({ error: 'Error al modificar gimnasta' });
  } finally {
    release();
  }
});

// 9. Eliminar gimnasta (Admin)
app.delete('/api/tournaments/:tournamentId/gymnasts/:gymnastId', requireAdmin, async (req, res) => {
  const { tournamentId, gymnastId } = req.params;

  const lock = getTournamentLock(tournamentId);
  const release = await lock.acquire();
  try {
    const tData = await loadTournament(tournamentId);
    const initialLength = tData.gimnastas.length;
    tData.gimnastas = tData.gimnastas.filter(g => g.id !== gymnastId);

    if (tData.gimnastas.length === initialLength) {
      return res.status(404).json({ error: 'Gimnasta no encontrada' });
    }

    await saveTournamentData(tournamentId, tData);

    broadcast(tournamentId, { type: 'GYMNAST_DELETED', gymnastId });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar gimnasta' });
  } finally {
    release();
  }
});
// 10. Guardar o actualizar notas (Juez/Admin)
app.post('/api/tournaments/:tournamentId/score', async (req, res) => {
  const { tournamentId } = req.params;
  const { gymnastId, aparato, jueces, dtos, dtosAparato, baseScore } = req.body;

  if (!gymnastId || !aparato || !jueces) {
    return res.status(400).json({ error: 'Campos requeridos faltantes' });
  }

  const adminPinHeader = req.headers['x-admin-pin'];
  const juezPinHeader = req.headers['x-juez-pin'];

  const lock = getTournamentLock(tournamentId);
  const release = await lock.acquire();

  try {
    // 1. Recargar los datos frescos dentro del lock
    const tData = await loadTournament(tournamentId);

    // 2. Validar autenticación con los datos frescos
    const isAdmin = adminPinHeader === tData.adminPin;
    const isJuez = (juezPinHeader === tData.juezPin) || (tData.juezPinGam && juezPinHeader === tData.juezPinGam);
    
    if (!isAdmin && !isJuez) {
      return res.status(403).json({ error: 'PIN de acceso incorrecto para este torneo' });
    }

    const idx = tData.gimnastas.findIndex(g => g.id === gymnastId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Gimnasta no encontrada' });
    }

    // Bloquear notas de otros aparatos para Nivel 1B
    const is1B = tData.gimnastas[idx].nivel && tData.gimnastas[idx].nivel.toLowerCase().replace(/\s+/g, '').includes('1b');
    if (is1B) {
      const isSaltoOrSuelo = aparato.toLowerCase().includes('salto') || aparato.toLowerCase().includes('suelo');
      if (!isSaltoOrSuelo) {
        return res.status(400).json({ error: `Nivel 1B solo compite en Salto y Suelo. No se puede calificar en ${aparato}.` });
      }
    }

    // Inicializar objeto de notas si no existe
    if (!tData.gimnastas[idx].notas) tData.gimnastas[idx].notas = {};

    const validJueces = (jueces || [])
      .map(val => val !== null && val !== undefined && val !== '' ? parseFloat(val) : null)
      .filter(val => val !== null && !isNaN(val));

    let averageDeduction = 0;
    let notaB = 0;
    let finalScore = 0;
    const base = baseScore !== undefined ? parseFloat(baseScore) : 10.00;
    const discount = dtos !== undefined && dtos !== '' ? parseFloat(dtos) : 0.0;
    const discountAparato = dtosAparato !== undefined && dtosAparato !== '' ? parseFloat(dtosAparato) : 0.0;
    const dScore = req.body.notaD !== undefined && req.body.notaD !== '' ? parseFloat(req.body.notaD) : 0.0;

    if (validJueces.length > 0) {
      const averageVal = validJueces.reduce((a, b) => a + b, 0) / validJueces.length;
      const isGamApparatus = aparato && (aparato.includes('(M)') || ['Arzones', 'Anillas', 'Barra Fija'].includes(aparato));
      const isGAM = tData.modalidad === 'GAM' || (tData.modalidad === 'Ambos' && isGamApparatus);
      
      if (isGAM) {
        // En GAM, el juez ingresa la nota final. Restamos el descuento de mesa si lo hay.
        notaB = averageVal;
        averageDeduction = base - notaB; 
        finalScore = averageVal - discount - discountAparato;
      } else {
        averageDeduction = averageVal;
        notaB = base - averageDeduction;
        finalScore = notaB + dScore - discount - discountAparato;
      }

      // Redondear a 3 decimales
      averageDeduction = parseFloat(averageDeduction.toFixed(3));
      notaB = parseFloat(notaB.toFixed(3));
      finalScore = parseFloat(finalScore.toFixed(3));
    } else {
      // Limpiar la nota si no hay jueces
      tData.gimnastas[idx].notas[aparato] = null;
      await saveTournamentData(tournamentId, tData);
      broadcast(tournamentId, { type: 'GYMNAST_UPDATED', gymnast: tData.gimnastas[idx] });
      return res.json({ success: true, gymnast: tData.gimnastas[idx] });
    }

    // Guardar puntuación
    tData.gimnastas[idx].notas[aparato] = {
      jueces: jueces.map(v => v !== null && v !== undefined && v !== '' ? parseFloat(v) : null),
      notaD: dScore,
      notaB,
      dtos: discount,
      dtosAparato: discountAparato,
      final: finalScore,
      baseScore: base,
      fechaRegistro: new Date().toISOString()
    };

    await saveTournamentData(tournamentId, tData);

    broadcast(tournamentId, { 
      type: 'SCORE_SUBMITTED', 
      gymnast: tData.gimnastas[idx],
      aparato,
      score: tData.gimnastas[idx].notas[aparato]
    });

    res.json({ success: true, gymnast: tData.gimnastas[idx] });
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar la nota' });
  } finally {
    release();
  }
});

// 10.1 Recibir nota de un juez individual (al buffer)
app.post('/api/tournaments/:tournamentId/juez-nota-individual', async (req, res) => {
  const { tournamentId } = req.params;
  const { gymnastId, aparato, juezRol, nota, notaD, dtos } = req.body;

  if (!gymnastId || !aparato || !juezRol) {
    return res.status(400).json({ error: 'Campos requeridos faltantes' });
  }

  const adminPinHeader = req.headers['x-admin-pin'];
  const juezPinHeader = req.headers['x-juez-pin'];

  const lock = getTournamentLock(tournamentId);
  const release = await lock.acquire();

  try {
    const tData = await loadTournament(tournamentId);
    const isAdmin = adminPinHeader === tData.adminPin;
    const isJuez = (juezPinHeader === tData.juezPin) || (tData.juezPinGam && juezPinHeader === tData.juezPinGam);
    
    if (!isAdmin && !isJuez) {
      return res.status(403).json({ error: 'PIN de acceso incorrecto para este torneo' });
    }

    if (!tData.bufferNotas) tData.bufferNotas = {};
    if (!tData.bufferNotas[gymnastId]) tData.bufferNotas[gymnastId] = {};
    if (!tData.bufferNotas[gymnastId][aparato]) tData.bufferNotas[gymnastId][aparato] = {};

    // Guardar nota en el buffer
    tData.bufferNotas[gymnastId][aparato][juezRol] = {
      nota: nota !== undefined && nota !== '' ? parseFloat(nota) : null,
      notaD: notaD !== undefined && notaD !== '' ? parseFloat(notaD) : null,
      dtos: dtos !== undefined && dtos !== '' ? parseFloat(dtos) : null,
      fecha: new Date().toISOString()
    };

    await saveTournamentData(tournamentId, tData);

    // Emitir evento para el semáforo
    broadcast(tournamentId, {
      type: 'BUFFER_UPDATED',
      gymnastId,
      aparato,
      buffer: tData.bufferNotas[gymnastId][aparato]
    });

    res.json({ success: true, buffer: tData.bufferNotas[gymnastId][aparato] });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar nota en buffer' });
  } finally {
    release();
  }
});

// 10.2 Jueza Líder calcula la nota final
app.post('/api/tournaments/:tournamentId/calcular-nota-final', async (req, res) => {
  const { tournamentId } = req.params;
    const { gymnastId, aparato, notaD: reqNotaD, dtos: reqDtos, dtosAparato: reqDtosAparato, liderNota, liderRol } = req.body;

    if (!gymnastId || !aparato) {
      return res.status(400).json({ error: 'Faltan campos' });
    }

    const adminPinHeader = req.headers['x-admin-pin'];
    const juezPinHeader = req.headers['x-juez-pin'];

    const lock = getTournamentLock(tournamentId);
    const release = await lock.acquire();

    try {
      const tData = await loadTournament(tournamentId);
      const isAdmin = adminPinHeader === tData.adminPin;
      const isJuez = (juezPinHeader === tData.juezPin) || (tData.juezPinGam && juezPinHeader === tData.juezPinGam);
      
      if (!isAdmin && !isJuez) {
        return res.status(403).json({ error: 'PIN de acceso incorrecto para este torneo' });
      }

      if (!tData.bufferNotas) tData.bufferNotas = {};
      if (!tData.bufferNotas[gymnastId]) tData.bufferNotas[gymnastId] = {};
      if (!tData.bufferNotas[gymnastId][aparato]) tData.bufferNotas[gymnastId][aparato] = {};
      
      const buffer = tData.bufferNotas[gymnastId][aparato];

      // Si la jueza líder también envía su propia nota en este mismo momento:
      if (liderRol && (liderNota !== undefined || reqNotaD !== undefined || reqDtos !== undefined || reqDtosAparato !== undefined)) {
        buffer[liderRol] = {
          nota: liderNota !== undefined && liderNota !== null ? parseFloat(liderNota) : null,
          notaD: reqNotaD !== undefined && reqNotaD !== null ? parseFloat(reqNotaD) : null,
          dtos: reqDtos !== undefined && reqDtos !== null ? parseFloat(reqDtos) : null,
          dtosAparato: reqDtosAparato !== undefined && reqDtosAparato !== null ? parseFloat(reqDtosAparato) : null,
          fecha: new Date().toISOString()
        };
      }

      if (Object.keys(buffer).length === 0) {
        return res.status(400).json({ error: 'No hay notas en el buffer para calcular' });
      }

      const idx = tData.gimnastas.findIndex(g => g.id === gymnastId);
      if (idx === -1) return res.status(404).json({ error: 'Gimnasta no encontrada' });

      // Recolectar notas E (Juez 1, Juez 2, etc.)
      const juecesKeys = Object.keys(buffer).filter(k => k.startsWith('Juez ') && !isNaN(parseInt(k.split(' ')[1])));
      // Ordenar jueces (Juez 1, Juez 2...)
      juecesKeys.sort((a, b) => parseInt(a.split(' ')[1]) - parseInt(b.split(' ')[1]));
      
      const validJueces = juecesKeys.map(k => buffer[k].nota).filter(n => n !== null);
      
      // Buscar notaD, dtos, y dtosAparato en el buffer (pueden venir del request o ya estar en el buffer)
      let dScore = 0;
      let dtos = 0;
      let dtosAparato = 0;
      Object.values(buffer).forEach(b => {
        if (b.notaD !== null && b.notaD !== undefined) dScore = b.notaD;
        if (b.dtos !== null && b.dtos !== undefined) dtos = b.dtos;
        if (b.dtosAparato !== null && b.dtosAparato !== undefined) dtosAparato = b.dtosAparato;
      });

      let averageDeduction = 0;
      let notaB = 0;
      let finalScore = 0;
      const base = 10.00;

      if (validJueces.length > 0) {
        const averageVal = validJueces.reduce((a, b) => a + b, 0) / validJueces.length;
        const isGamApparatus = aparato && (aparato.includes('(M)') || ['Arzones', 'Anillas', 'Barra Fija'].includes(aparato));
        const isGAM = tData.modalidad === 'GAM' || (tData.modalidad === 'Ambos' && isGamApparatus);
        
        if (isGAM) {
          notaB = averageVal;
          averageDeduction = base - notaB; 
          finalScore = averageVal - dtos - dtosAparato; // dtos en GAM si los hubiera
        } else {
          averageDeduction = averageVal;
          notaB = base - averageDeduction;
          finalScore = notaB + dScore - dtos - dtosAparato;
        }

      averageDeduction = parseFloat(averageDeduction.toFixed(3));
      notaB = parseFloat(notaB.toFixed(3));
      finalScore = parseFloat(finalScore.toFixed(3));
    } else {
      return res.status(400).json({ error: 'Faltan las notas de ejecución de los jueces' });
    }

    if (!tData.gimnastas[idx].notas) tData.gimnastas[idx].notas = {};
    
    // Convertir el arreglo para retrocompatibilidad
    const maxJuez = juecesKeys.length > 0 ? Math.max(...juecesKeys.map(k => parseInt(k.split(' ')[1]))) : 0;
    const arrayJueces = Array(maxJuez).fill(null);
    juecesKeys.forEach(k => {
      const jIdx = parseInt(k.split(' ')[1]) - 1;
      arrayJueces[jIdx] = buffer[k].nota;
    });

    tData.gimnastas[idx].notas[aparato] = {
      jueces: arrayJueces,
      notaD: dScore,
      notaB,
      dtos,
      dtosAparato,
      final: finalScore,
      baseScore: base,
      fechaRegistro: new Date().toISOString()
    };

    // Limpiar buffer para este aparato y gimnasta
    delete tData.bufferNotas[gymnastId][aparato];

    await saveTournamentData(tournamentId, tData);

    broadcast(tournamentId, { 
      type: 'SCORE_SUBMITTED', 
      gymnast: tData.gimnastas[idx],
      aparato,
      score: tData.gimnastas[idx].notas[aparato]
    });
    // Broadcast extra para que el AdminDashboard limpie el semáforo
    broadcast(tournamentId, {
      type: 'BUFFER_CLEARED',
      gymnastId,
      aparato
    });

    res.json({ success: true, gymnast: tData.gimnastas[idx] });
  } catch (err) {
    res.status(500).json({ error: 'Error al calcular nota final' });
  } finally {
    release();
  }
});

// 12. Actualizar descuentos de equipos (Admin)
app.put('/api/tournaments/:tournamentId/team-discounts', requireAdmin, async (req, res) => {
  const { tournamentId } = req.params;
  const { groupKey, clubName, descuento } = req.body;

  const lock = getTournamentLock(tournamentId);
  const release = await lock.acquire();
  try {
    const tData = await loadTournament(tournamentId);
    if (!tData.descuentosEquipos) {
      tData.descuentosEquipos = {};
    }
    if (!tData.descuentosEquipos[groupKey]) {
      tData.descuentosEquipos[groupKey] = {};
    }

    tData.descuentosEquipos[groupKey][clubName] = parseFloat(descuento) || 0;

    await saveTournamentData(tournamentId, tData);

    // Notificar actualización instantánea a todos los clientes
    broadcast(tournamentId, { type: 'TOURNAMENT_RELOADED', gimnastas: tData.gimnastas });

    res.json({ success: true, descuentosEquipos: tData.descuentosEquipos });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar descuentos' });
  } finally {
    release();
  }
});

// 13. Guardar configuración de turnos (Admin)
app.put('/api/tournaments/:tournamentId/turnos-config', requireAdmin, async (req, res) => {
  const { tournamentId } = req.params;
  const { turnosConfig } = req.body;

  const lock = getTournamentLock(tournamentId);
  const release = await lock.acquire();
  try {
    const tData = await loadTournament(tournamentId);
    tData.turnosConfig = turnosConfig || [];

    await saveTournamentData(tournamentId, tData);

    res.json({ success: true, turnosConfig: tData.turnosConfig });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar configuración de turnos' });
  } finally {
    release();
  }
});

// 14. Asignación automática de turnos basada en configuración (Admin)
app.post('/api/tournaments/:tournamentId/auto-assign-turnos', requireAdmin, async (req, res) => {
  const { tournamentId } = req.params;

  const lock = getTournamentLock(tournamentId);
  const release = await lock.acquire();
  try {
    const tData = await loadTournament(tournamentId);

    if (!tData.turnosConfig || !Array.isArray(tData.turnosConfig) || tData.turnosConfig.length === 0) {
      return res.status(400).json({ error: 'No hay configuración de turnos definida' });
    }

    let updatedCount = 0;

    tData.gimnastas.forEach(g => {
      // Buscar la primera regla que coincida
      const matchedRule = tData.turnosConfig.find(rule => {
        const normalize = (s) => String(s || '').toLowerCase().trim();
        const ruleNiveles = (rule.niveles || []).map(normalize);
        const ruleCategorias = (rule.categorias || []).map(normalize);
        const gNivel = normalize(g.nivel);
        const gCategoria = normalize(g.categoria);

        const matchNivel = ruleNiveles.length === 0 || ruleNiveles.some(n => gNivel.includes(n) || n.includes(gNivel));
        const matchCategoria = ruleCategorias.length === 0 || ruleCategorias.some(c => gCategoria.includes(c) || c.includes(gCategoria));
        
        return matchNivel && matchCategoria;
      });

      if (matchedRule && matchedRule.nombre) {
        if (g.grupo !== matchedRule.nombre) {
          g.grupo = matchedRule.nombre;
          updatedCount++;
        }
      }
    });

    if (updatedCount > 0) {
      await saveTournamentData(tournamentId, tData);
      broadcast(tournamentId, { type: 'TOURNAMENT_RELOADED', gimnastas: tData.gimnastas });
    }

    res.json({ success: true, updatedCount });
  } catch (err) {
    res.status(500).json({ error: 'Error al asignar turnos automáticamente' });
  } finally {
    release();
  }
});

// 11. Descargar planilla Excel con resultados
app.get('/api/tournaments/:tournamentId/export', requireAuth, (req, res) => {
  const { tournamentId } = req.params;
  try {
    const buffer = exportTournamentToExcel(req.tournament, req.query.sortBy);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=resultados_${tournamentId}.xlsx`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: 'Error al exportar archivo de resultados: ' + e.message });
  }
});


// --- RED DE WEBSOCKETS PARA ACTUALIZACIÓN EN VIVO ---

// Clientes Websocket conectados agrupados por tournamentId
const clients = new Map();

wss.on('connection', (ws) => {
  let clientReg = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Evento de registro para asociar la conexión con un torneo y rol
      if (data.type === 'REGISTER') {
        const { tournamentId, role } = data;
        clientReg = { tournamentId, role };
        
        if (!clients.has(tournamentId)) {
          clients.set(tournamentId, new Set());
        }
        clients.get(tournamentId).add(ws);
      } else if (data.type === 'PROJECT_SCORE') {
        const { tournamentId, gymnast, aparato, score } = data;
        broadcast(tournamentId, {
          type: 'PROJECT_SCORE',
          gymnast,
          aparato,
          score
        });
      } else if (data.type === 'PROJECT_JUDGE_SCORE') {
        const { tournamentId, gymnast, aparato, score } = data;
        broadcast(tournamentId, {
          type: 'PROJECT_JUDGE_SCORE',
          gymnast,
          aparato,
          score
        });
      }
    } catch (e) {
      // Ignorar mensajes corruptos
    }
  });

  ws.on('close', () => {
    if (clientReg && clients.has(clientReg.tournamentId)) {
      clients.get(clientReg.tournamentId).delete(ws);
      if (clients.get(clientReg.tournamentId).size === 0) {
        clients.delete(clientReg.tournamentId);
      }
    }
  });
});

// Broadcast a los clientes de un torneo específico
const broadcast = (tournamentId, message) => {
  if (clients.has(tournamentId)) {
    const payload = JSON.stringify(message);
    clients.get(tournamentId).forEach(client => {
      if (client.readyState === 1) { // 1 = OPEN
        client.send(payload);
      }
    });
  }
};

// Integración del servidor HTTP y Websockets
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// --- INICIAR SERVIDOR ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 SERVIDOR DE TORNEOS INICIADO CORRECTAMENTE`);
  console.log(`💻 Acceso local: http://localhost:${PORT}`);
  
  // Imprimir las IPs de la red local para facilitar la conexión de tablets de jueces
  const interfaces = os.networkInterfaces();
  console.log(`\n📶 Conecta las computadoras/tablets de los jueces a:`);
  Object.keys(interfaces).forEach(ifName => {
    interfaces[ifName].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`👉 http://${iface.address}:${PORT}`);
      }
    });
  });
  console.log(`======================================================\n`);
});
