import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3001; // Usar puerto diferente para evitar conflictos si ya hay algo ejecutándose

async function runTests() {
  console.log('🧪 Iniciando pruebas de integración automatizadas...');

  // 1. Importar dinámicamente el servidor Express
  const { default: express } = await import('express');
  const { WebSocketServer } = await import('ws');
  const { default: cors } = await import('cors');
  const { default: multer } = await import('multer');
  const { default: os } = await import('os');
  
  // Utilidades locales
  const { createTournament, loadTournament, deleteTournament } = await import('./db.js');
  const { importGimnastasFromExcel, exportTournamentToExcel } = await import('./excelProcessor.js');

  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  app.use(cors());
  app.use(express.json());

  // Clonar las mismas rutas del server.js para pruebas
  app.post('/api/tournaments', async (req, res) => {
    const { id, nombre, modalidad, adminPin, juezPin } = req.body;
    try {
      const nuevoTorneo = await createTournament(id, nombre, modalidad, adminPin, juezPin);
      res.status(201).json({ success: true, torneo: nuevoTorneo });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/tournaments/:tournamentId/auth', (req, res) => {
    const { tournamentId } = req.params;
    const { pin } = req.body;
    try {
      const tournament = loadTournament(tournamentId);
      if (tournament.adminPin === pin) {
        return res.json({ success: true, role: 'computos' });
      } else if (tournament.juezPin === pin) {
        return res.json({ success: true, role: 'jueces' });
      }
      res.status(401).json({ error: 'PIN incorrecto' });
    } catch (e) {
      res.status(404).json({ error: 'Torneo no encontrado' });
    }
  });

  app.post('/api/tournaments/:tournamentId/score', async (req, res) => {
    const { tournamentId } = req.params;
    const { gymnastId, aparato, jueces, dtos } = req.body;
    try {
      const tData = loadTournament(tournamentId);
      const idx = tData.gimnastas.findIndex(g => g.id === gymnastId);
      
      const validJueces = jueces.filter(v => v !== null && v !== undefined);
      const promedio = validJueces.reduce((a, b) => a + b, 0) / validJueces.length;
      const notaB = 10.00 - promedio;
      const finalScore = notaB - (dtos || 0);

      const scoreObj = {
        jueces,
        notaB: parseFloat(notaB.toFixed(3)),
        dtos: dtos || 0,
        final: parseFloat(finalScore.toFixed(3))
      };

      tData.gimnastas[idx].notas[aparato] = scoreObj;
      // Guardar en disco
      const filePath = path.join(__dirname, 'data', `torneo_${tournamentId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(tData, null, 2));

      // Broadcast WS
      const payload = JSON.stringify({ type: 'SCORE_SUBMITTED', gymnast: tData.gimnastas[idx], aparato, score: scoreObj });
      wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(payload);
      });

      res.json({ success: true, gymnast: tData.gimnastas[idx] });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Websocket handshake
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  // Levantar servidor de pruebas
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`📡 Servidor de pruebas escuchando en http://localhost:${PORT}`);

  try {
    // A. Limpiar torneos de prueba viejos si existen
    try { await deleteTournament('test-regional'); } catch(e) {}

    // B. Crear torneo de prueba
    console.log('\nPrueba 1: Crear torneo...');
    const createRes = await fetch(`http://localhost:${PORT}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test-regional',
        nombre: 'Torneo Test Regional GAF',
        modalidad: 'GAF',
        adminPin: '9999',
        juezPin: '8888'
      })
    });
    const createData = await createRes.json();
    if (createRes.status !== 201 || !createData.success) {
      throw new Error('No se pudo crear el torneo');
    }
    console.log('✅ Torneo creado con éxito:', createData.torneo.nombre);

    // C. Verificar Autenticación
    console.log('\nPrueba 2: Autenticación con PIN...');
    const authRes = await fetch(`http://localhost:${PORT}/api/tournaments/test-regional/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '9999' })
    });
    const authData = await authRes.json();
    if (authRes.status !== 200 || authData.role !== 'computos') {
      throw new Error('Fallo al autenticar PIN de admin');
    }
    console.log('✅ Autenticación exitosa como Cómputos');

    // D. Probar importación desde Excel en memoria
    console.log('\nPrueba 3: Procesador de Excel de Inscripciones...');
    const excelBuffer = fs.readFileSync(path.join(__dirname, '..', 'gimnastas_prueba.xlsx'));
    const gimnastasImportadas = importGimnastasFromExcel(excelBuffer);
    if (gimnastasImportadas.length === 0) {
      throw new Error('No se pudo importar ninguna gimnasta del Excel de prueba.');
    }
    console.log(`✅ Importación simulada exitosa: ${gimnastasImportadas.length} gimnastas cargadas`);
    
    // Guardar gimnastas importadas en el torneo
    const torneoCargado = loadTournament('test-regional');
    torneoCargado.gimnastas = gimnastasImportadas;
    // Inicializar notas vacías
    torneoCargado.gimnastas.forEach(g => {
      g.notas = { Salto: null, Paralelas: null, Viga: null, Suelo: null };
    });
    // Guardar
    fs.writeFileSync(path.join(__dirname, 'data', `torneo_test-regional.json`), JSON.stringify(torneoCargado, null, 2));

    // E. WebSocket e Ingreso de notas
    console.log('\nPrueba 4: WebSocket e Ingreso de Notas en vivo...');
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    
    // Esperar a que abra la conexión del socket
    await new Promise((resolve) => {
      ws.once('open', () => {
        console.log('🔌 WebSocket abierto y registrado');
        ws.send(JSON.stringify({ type: 'REGISTER', tournamentId: 'test-regional', role: 'publico' }));
        resolve();
      });
    });
    
    const wsMessagePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout esperando mensaje de WebSocket.'));
      }, 5000);

      ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.type === 'SCORE_SUBMITTED') {
          clearTimeout(timeout);
          ws.close();
          resolve(msg);
        }
      });
    });

    // Enviar una nota
    const gymnastId = gimnastasImportadas[0].id;
    console.log(`Enviando nota para gimnasta ${gimnastasImportadas[0].nombre}...`);
    
    const scoreRes = await fetch(`http://localhost:${PORT}/api/tournaments/test-regional/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gymnastId,
        aparato: 'Salto',
        jueces: [0.55, 0.45], // Promedio = 0.50. Nota B = 9.50
        dtos: 0.1 // Nota final = 9.40
      })
    });

    const scoreData = await scoreRes.json();
    if (scoreRes.status !== 200) {
      throw new Error('Fallo al cargar la nota');
    }

    const wsMsg = await wsMessagePromise;
    console.log('✅ WS recibió el evento SCORE_SUBMITTED:', wsMsg.score);

    // F. Verificar la matemática
    console.log('\nPrueba 5: Validación matemática de la nota...');
    const notaGuardada = wsMsg.score;
    if (notaGuardada.notaB !== 9.50) {
      throw new Error(`Nota B incorrecta: esperado 9.50, obtenido ${notaGuardada.notaB}`);
    }
    if (notaGuardada.final !== 9.40) {
      throw new Error(`Nota final incorrecta: esperado 9.40, obtenido ${notaGuardada.final}`);
    }
    console.log('✅ Lógica matemática de descuento y promedio validada');

    // G. Exportar planilla final
    console.log('\nPrueba 6: Exportador de resultados a Excel...');
    const torneoFinal = loadTournament('test-regional');
    const outBuffer = exportTournamentToExcel(torneoFinal);
    if (!outBuffer || outBuffer.length === 0) {
      throw new Error('El buffer del Excel exportado está vacío');
    }
    console.log(`✅ Excel exportado correctamente (${outBuffer.length} bytes)`);

    console.log('\n🎉 ¡TODAS LAS PRUEBAS DE INTEGRACIÓN PASARON EXITOSAMENTE! 🎉\n');
  } catch (err) {
    console.error('\n❌ ERROR EN LAS PRUEBAS:', err.message);
    process.exit(1);
  } finally {
    // Cerrar servidor y limpiar datos de prueba
    await new Promise((resolve) => server.close(resolve));
    try { await deleteTournament('test-regional'); } catch(e) {}
    process.exit(0);
  }
}

runTests();
