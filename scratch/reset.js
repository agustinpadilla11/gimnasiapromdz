import { loadTournament, saveTournamentData } from '../server/db.js';

const run = async () => {
  try {
    const tId = 'ejemplo-regional-4874';
    const tData = await loadTournament(tId);
    if (!tData) {
      console.log('Torneo no encontrado');
      return;
    }
    
    // Filtrar para eliminar las gimnastas de prueba
    const originalCount = tData.gimnastas ? tData.gimnastas.length : 0;
    tData.gimnastas = tData.gimnastas.filter(g => !g.id.startsWith('test_1a_') && !g.id.startsWith('test_1b_'));
    const currentCount = tData.gimnastas.length;
    
    await saveTournamentData(tId, tData);
    console.log(`Se eliminaron ${originalCount - currentCount} gimnastas de prueba.`);
    console.log(`Gimnastas restantes: ${currentCount}`);
    
  } catch (err) {
    console.error(err);
  }
};

run();
