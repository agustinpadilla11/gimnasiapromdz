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

const PORT = 3000;

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
const requireAdmin = (req, res, next) => {
  const { tournamentId } = req.params;
  const adminPin = req.headers['x-admin-pin'];

  if (!tournamentId) {
    return res.status(400).json({ error: 'Se requiere ID del torneo' });
  }

  try {
    const tournament = loadTournament(tournamentId);
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
const requireAuth = (req, res, next) => {
  const { tournamentId } = req.params;
  const adminPin = req.headers['x-admin-pin'];
  const juezPin = req.headers['x-juez-pin'];

  if (!tournamentId) {
    return res.status(400).json({ error: 'Se requiere ID del torneo' });
  }

  try {
    const tournament = loadTournament(tournamentId);
    const isAdmin = tournament.adminPin && tournament.adminPin === adminPin;
    const isJuez = tournament.juezPin && tournament.juezPin === juezPin;

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
app.get('/api/tournaments', (req, res) => {
  try {
    const list = getTournaments();
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
  const { id, nombre, modalidad, adminPin, juezPin } = req.body;

  if (!id || !nombre || !modalidad) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const nuevoTorneo = await createTournament(id, nombre, modalidad, adminPin || '1111', juezPin || '5555');
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
app.post('/api/tournaments/:tournamentId/auth', (req, res) => {
  const { tournamentId } = req.params;
  const { pin } = req.body;

  try {
    const tournament = loadTournament(tournamentId);
    if (tournament.adminPin === pin) {
      return res.json({ success: true, role: 'computos', nombre: tournament.nombre, modalidad: tournament.modalidad });
    } else if (tournament.juezPin === pin) {
      return res.json({ success: true, role: 'jueces', nombre: tournament.nombre, modalidad: tournament.modalidad });
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
app.post('/api/tournaments/:tournamentId/import', requireAdmin, upload.single('file'), async (req, res) => {
  const { tournamentId } = req.params;
  const { turno, niveles } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }

  try {
    const nuevasGimnastas = importGimnastasFromExcel(req.file.buffer);
    const tData = req.tournament;

    if (turno) {
      // Asignar el nombre del turno a cada gimnasta
      nuevasGimnastas.forEach(g => {
        g.grupo = turno;
      });

      // Filtrar gimnastas preexistentes de este mismo turno para evitar duplicaciones si vuelven a importar
      const filtradas = (tData.gimnastas || []).filter(g => g.grupo !== turno);
      tData.gimnastas = [...filtradas, ...nuevasGimnastas];
    } else {
      // Reemplazo total (comportamiento anterior)
      tData.gimnastas = nuevasGimnastas;
    }

    await saveTournamentData(tournamentId, tData);
    
    // Notificar a todos por WebSocket
    broadcast(tournamentId, { type: 'TOURNAMENT_RELOADED', gimnastas: tData.gimnastas });

    res.json({ success: true, count: nuevasGimnastas.length });
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

  const tData = req.tournament;
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
});

// 8. Modificar gimnasta individualmente (Admin)
app.put('/api/tournaments/:tournamentId/gymnasts/:gymnastId', requireAdmin, async (req, res) => {
  const { tournamentId, gymnastId } = req.params;
  const updatedFields = req.body;

  const tData = req.tournament;
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
});

// 9. Eliminar gimnasta (Admin)
app.delete('/api/tournaments/:tournamentId/gymnasts/:gymnastId', requireAdmin, async (req, res) => {
  const { tournamentId, gymnastId } = req.params;

  const tData = req.tournament;
  const initialLength = tData.gimnastas.length;
  tData.gimnastas = tData.gimnastas.filter(g => g.id !== gymnastId);

  if (tData.gimnastas.length === initialLength) {
    return res.status(404).json({ error: 'Gimnasta no encontrada' });
  }

  await saveTournamentData(tournamentId, tData);

  broadcast(tournamentId, { type: 'GYMNAST_DELETED', gymnastId });

  res.json({ success: true });
});

// 10. Registrar o editar nota de un aparato (Juez o Admin)
app.post('/api/tournaments/:tournamentId/score', requireAuth, async (req, res) => {
  const { tournamentId } = req.params;
  const { gymnastId, aparato, jueces, dtos, baseScore } = req.body;

  if (!gymnastId || !aparato || !jueces) {
    return res.status(400).json({ error: 'Campos requeridos faltantes' });
  }

  const tData = req.tournament;
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

  // Verificar que el aparato exista en el torneo
  if (!tData.aparatos.includes(aparato)) {
    return res.status(400).json({ error: `Aparato ${aparato} no es parte del torneo` });
  }

  // Filtrar notas nulas o vacías de los jueces para calcular promedio
  const validJueces = jueces
    .map(val => val !== null && val !== undefined && val !== '' ? parseFloat(val) : null)
    .filter(val => val !== null && !isNaN(val));

  let averageDeduction = 0;
  let notaB = 0;
  let finalScore = 0;
  const base = baseScore !== undefined ? parseFloat(baseScore) : 10.00;
  const discount = dtos !== undefined && dtos !== '' ? parseFloat(dtos) : 0.0;

  if (validJueces.length > 0) {
    const averageVal = validJueces.reduce((a, b) => a + b, 0) / validJueces.length;
    if (tData.modalidad === 'GAM') {
      notaB = averageVal;
      averageDeduction = base - notaB;
    } else {
      averageDeduction = averageVal;
      notaB = base - averageDeduction;
    }
    finalScore = notaB - discount;

    // Redondear a 3 decimales para evitar problemas de flotantes en ranking
    averageDeduction = parseFloat(averageDeduction.toFixed(3));
    notaB = parseFloat(notaB.toFixed(3));
    finalScore = parseFloat(finalScore.toFixed(3));
  } else {
    // Si no hay jueces cargados, se limpia la nota
    tData.gimnastas[idx].notas[aparato] = null;
    await saveTournamentData(tournamentId, tData);
    broadcast(tournamentId, { type: 'GYMNAST_UPDATED', gymnast: tData.gimnastas[idx] });
    return res.json({ success: true, gymnast: tData.gimnastas[idx] });
  }

  // Guardar puntuación
  tData.gimnastas[idx].notas[aparato] = {
    jueces: jueces.map(v => v !== null && v !== undefined && v !== '' ? parseFloat(v) : null),
    notaB,
    dtos: discount,
    final: finalScore,
    baseScore: base,
    fechaRegistro: new Date().toISOString()
  };

  await saveTournamentData(tournamentId, tData);

  // Notificar actualización instantánea a Mesa de Cómputos y Público
  broadcast(tournamentId, { 
    type: 'SCORE_SUBMITTED', 
    gymnast: tData.gimnastas[idx],
    aparato,
    score: tData.gimnastas[idx].notas[aparato]
  });

  res.json({ success: true, gymnast: tData.gimnastas[idx] });
});

// 12. Actualizar descuentos de equipos (Admin)
app.put('/api/tournaments/:tournamentId/team-discounts', requireAdmin, async (req, res) => {
  const { tournamentId } = req.params;
  const { groupKey, clubName, descuento } = req.body;

  const tData = req.tournament;
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
