import { loadTournament, saveTournamentData } from '../server/db.js';

const run = async () => {
  try {
    const tId = 'ejemplo-regional-4874';
    const tData = await loadTournament(tId);
    if (!tData) {
      console.log('Torneo no encontrado');
      return;
    }

    console.log('Torneo cargado:', tData.nombre);
    
    // Crear 20 gimnastas para Akros Gym
    const gymnasts = [];
    const aparatos = tData.aparatos || ['Salto', 'Paralelas Asim.', 'Viga', 'Suelo'];
    
    // Generar 10 de Nivel 1A (4 aparatos)
    for (let i = 1; i <= 10; i++) {
      const g = {
        id: `test_1a_${i}`,
        nombre: `Gimnasta 1A ${i}`,
        institucion: 'Akros Gym',
        nivel: 'Nivel 1A',
        categoria: 'Infantil',
        nacimiento: '2016',
        sexo: 'GAF',
        grupo: 'Turno 1',
        notas: {}
      };
      
      aparatos.forEach(ap => {
        const score = (Math.random() * (10 - 7) + 7).toFixed(3); // Entre 7 y 10
        g.notas[ap] = { final: score, jueces: [], dtos: 0 };
      });
      
      gymnasts.push(g);
    }
    
    // Generar 10 de Nivel 1B (solo Salto y Suelo)
    for (let i = 1; i <= 10; i++) {
      const g = {
        id: `test_1b_${i}`,
        nombre: `Gimnasta 1B ${i}`,
        institucion: 'Akros Gym',
        nivel: 'Nivel 1B',
        categoria: 'Infantil',
        nacimiento: '2016',
        sexo: 'GAF',
        grupo: 'Turno 1',
        notas: {}
      };
      
      aparatos.forEach(ap => {
        if (ap.toLowerCase().includes('salto') || ap.toLowerCase().includes('suelo')) {
          const score = (Math.random() * (10 - 7) + 7).toFixed(3);
          g.notas[ap] = { final: score, jueces: [], dtos: 0 };
        }
      });
      
      gymnasts.push(g);
    }

    tData.gimnastas = gymnasts;
    await saveTournamentData(tId, tData);
    console.log('20 gimnastas de prueba inyectadas exitosamente');
    
  } catch (err) {
    console.error(err);
  }
};

run();
