import dns from 'node:dns';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Configurar fallback DNS para resolver dominios en caso de que el ISP local tenga cacheado NXDOMAIN tras pausar/restaurar Supabase
const resolver = new dns.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);
const origLookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  origLookup(hostname, options, (err, address, family) => {
    if (!err) return callback(null, address, family);

    resolver.resolve4(hostname, (resErr, addresses) => {
      if (resErr || !addresses || addresses.length === 0) {
        return callback(err);
      }
      if (options && options.all) {
        return callback(null, addresses.map(addr => ({ address: addr, family: 4 })));
      }
      return callback(null, addresses[0], 4);
    });
  });
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://dhhfwpmxllmmatojqlao.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_x28NoMh8Hqbq9peQZ8UUsA_l4wbgPML';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.warn('Usando credenciales por defecto (fallback) para Supabase.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

export const createTournament = async (id, nombre, modalidad, adminPin = '1111', juezPin = '5555', juezPinGam = '6666', opciones = {}) => {
  const { data: existing } = await supabase.from('tournaments').select('id').eq('id', id).maybeSingle();
  if (existing) {
    throw new Error('El ID de torneo ya existe');
  }

  // Definir aparatos según la modalidad
  let aparatos = [];
  if (modalidad === 'GAF') {
    aparatos = ['Salto', 'Paralelas', 'Viga', 'Suelo'];
  } else if (modalidad === 'GAM') {
    aparatos = ['Suelo', 'Arzones', 'Anillas', 'Salto', 'Paralelas', 'Barra Fija'];
  } else if (modalidad === 'Ambos') {
    aparatos = ['Salto (F)', 'Paralelas Asim.', 'Viga', 'Suelo (F)', 'Suelo (M)', 'Arzones', 'Anillas', 'Salto (M)', 'Paralelas (M)', 'Barra Fija'];
  }

  // Opciones por defecto si no vienen
  const defaultOpcionesGAM = {
    sistemaPuntuacion: 'Directa',
    premioEquipos: true,
    premioAparatos: true,
    premioAllAround: true
  };

  const defaultOpcionesGAF = {
    sistemaPuntuacion: 'Ambas',
    premioEquipos: false,
    premioAparatos: false,
    premioAllAround: true
  };

  const configFinal = modalidad === 'GAM' ? { ...defaultOpcionesGAM, ...opciones } :
                      modalidad === 'GAF' ? { ...defaultOpcionesGAF, ...opciones } :
                      { ...defaultOpcionesGAF, ...opciones };

  const nuevoTorneoInfo = {
    id,
    nombre,
    modalidad,
    adminPin,
    juezPin,
    juezPinGam: modalidad === 'Ambos' ? juezPinGam : undefined,
    fechaCreacion: new Date().toISOString(),
    configuracion: configFinal
  };

  const nuevoTorneoData = {
    ...nuevoTorneoInfo,
    aparatos,
    gimnastas: [],
    bufferNotas: {} // Aquí se guardarán las notas pendientes (por idGimnasta -> aparato -> juezX)
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
