import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const LIST_FILE = path.join(DATA_DIR, 'tournaments_list.json');

// Crear directorio de datos si no existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Inicializar lista de torneos si no existe
if (!fs.existsSync(LIST_FILE)) {
  fs.writeFileSync(LIST_FILE, JSON.stringify([], null, 2));
}

// Bloqueo de escritura para evitar corrupción en accesos concurrentes
let isWriting = false;
const queue = [];

const processQueue = async () => {
  if (isWriting || queue.length === 0) return;
  isWriting = true;
  const { filePath, data, resolve, reject } = queue.shift();
  try {
    const tempPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tempPath, filePath);
    resolve();
  } catch (err) {
    reject(err);
  } finally {
    isWriting = false;
    processQueue();
  }
};

const writeJsonAtomic = (filePath, data) => {
  return new Promise((resolve, reject) => {
    queue.push({ filePath, data, resolve, reject });
    processQueue();
  });
};

export const getTournaments = () => {
  try {
    const data = fs.readFileSync(LIST_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
};

export const saveTournamentsList = async (list) => {
  await writeJsonAtomic(LIST_FILE, list);
};

export const createTournament = async (id, nombre, modalidad, adminPin = '1111', juezPin = '5555') => {
  const tournaments = getTournaments();
  if (tournaments.some(t => t.id === id)) {
    throw new Error('El ID de torneo ya existe');
  }

  // Definir aparatos según la modalidad
  // GAF: Salto, Paralelas, Viga, Suelo
  // GAM: Suelo, Arzones, Anillas, Salto, Paralelas, Barra Fija
  const aparatos = modalidad === 'GAF' 
    ? ['Salto', 'Paralelas', 'Viga', 'Suelo'] 
    : ['Suelo', 'Arzones', 'Anillas', 'Salto', 'Paralelas', 'Barra Fija'];

  const nuevoTorneoInfo = {
    id,
    nombre,
    modalidad,
    adminPin,
    juezPin,
    fechaCreacion: new Date().toISOString()
  };

  const nuevoTorneoData = {
    ...nuevoTorneoInfo,
    aparatos,
    gimnastas: []
  };

  // Guardar archivo del torneo
  const tournamentFile = path.join(DATA_DIR, `torneo_${id}.json`);
  await writeJsonAtomic(tournamentFile, nuevoTorneoData);

  // Actualizar lista general
  tournaments.push(nuevoTorneoInfo);
  await saveTournamentsList(tournaments);

  return nuevoTorneoData;
};

export const loadTournament = (id) => {
  const tournamentFile = path.join(DATA_DIR, `torneo_${id}.json`);
  if (!fs.existsSync(tournamentFile)) {
    throw new Error('Torneo no encontrado');
  }
  try {
    const data = fs.readFileSync(tournamentFile, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    throw new Error('Error al leer el archivo de torneo');
  }
};

export const saveTournamentData = async (id, data) => {
  const tournamentFile = path.join(DATA_DIR, `torneo_${id}.json`);
  await writeJsonAtomic(tournamentFile, data);
};

export const deleteTournament = async (id) => {
  let tournaments = getTournaments();
  tournaments = tournaments.filter(t => t.id !== id);
  await saveTournamentsList(tournaments);

  const tournamentFile = path.join(DATA_DIR, `torneo_${id}.json`);
  if (fs.existsSync(tournamentFile)) {
    fs.unlinkSync(tournamentFile);
  }
};
