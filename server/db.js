import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Faltan SUPABASE_URL o SUPABASE_KEY en las variables de entorno.');
}

const supabase = createClient(supabaseUrl || 'https://mock.supabase.co', supabaseKey || 'mock');

export const getTournaments = async () => {
  try {
    const { data, error } = await supabase.from('tournaments').select('data');
    if (error || !data) return [];
    
    // Devolvemos el resumen para la lista
    return data.map(row => ({
      id: row.data.id,
      nombre: row.data.nombre,
      modalidad: row.data.modalidad,
      adminPin: row.data.adminPin,
      juezPin: row.data.juezPin,
      fechaCreacion: row.data.fechaCreacion
    }));
  } catch (e) {
    console.error('Error fetching tournaments from Supabase', e);
    return [];
  }
};

export const createTournament = async (id, nombre, modalidad, adminPin = '1111', juezPin = '5555') => {
  const { data: existing } = await supabase.from('tournaments').select('id').eq('id', id).maybeSingle();
  if (existing) {
    throw new Error('El ID de torneo ya existe');
  }

  // Definir aparatos según la modalidad
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

  const { error } = await supabase.from('tournaments').insert([{ id, data: nuevoTorneoData }]);
  if (error) throw new Error('Error al guardar en Supabase: ' + error.message);

  return nuevoTorneoData;
};

export const loadTournament = async (id) => {
  const { data, error } = await supabase.from('tournaments').select('data').eq('id', id).maybeSingle();
  if (error || !data) {
    throw new Error('Torneo no encontrado');
  }
  return data.data;
};

export const saveTournamentData = async (id, dataToSave) => {
  const { error } = await supabase.from('tournaments').update({ data: dataToSave }).eq('id', id);
  if (error) throw new Error('Error al guardar datos en Supabase: ' + error.message);
};

export const deleteTournament = async (id) => {
  const { error } = await supabase.from('tournaments').delete().eq('id', id);
  if (error) throw new Error('Error al eliminar torneo: ' + error.message);
};
