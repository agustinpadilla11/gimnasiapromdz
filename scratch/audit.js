import { loadTournament } from '../server/db.js';
import { exportTournamentToExcel } from '../server/excelProcessor.js';

const run = async () => {
  console.log('--- AUDITORIA DEL SISTEMA ---');
  console.time('Tiempo total de auditoria');
  
  try {
    const tId = 'ejemplo-regional-4874';
    console.time('1. Carga de base de datos');
    const tData = await loadTournament(tId);
    console.timeEnd('1. Carga de base de datos');
    
    if (!tData) {
      console.log('Torneo no encontrado');
      return;
    }
    
    console.log(`Gimnastas totales: ${tData.gimnastas ? tData.gimnastas.length : 0}`);
    
    console.time('2. Clculo de All-Around y Equipos (Simulado)');
    tData.gimnastas.forEach(g => {
      if (g.nivel && g.nivel.includes('1B')) {
        ['Viga', 'Paralelas Asim.'].forEach(ap => {
          if (g.notas && g.notas[ap]) {
            console.warn(`[WARNING] Gimnasta 1B (${g.nombre}) tiene nota en ${ap}!`);
          }
        });
      }
    });
    console.timeEnd('2. Clculo de All-Around y Equipos (Simulado)');
    
    console.time('3. Exportacion a Excel (Procesamiento completo)');
    try {
      const excelBuffer = exportTournamentToExcel(tData);
      console.log(`Excel generado correctamente. Tamano: ${excelBuffer.length} bytes`);
    } catch (e) {
      console.error('[ERROR CRITICO] Fallo en la exportacion de Excel:', e);
    }
    console.timeEnd('3. Exportacion a Excel (Procesamiento completo)');
    
  } catch (err) {
    console.error('Error general durante auditoria:', err);
  }
  
  console.timeEnd('Tiempo total de auditoria');
};

run();
