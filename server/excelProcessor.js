import XLSX from 'xlsx';

// Helper para extraer el año de nacimiento en formato de 4 dígitos
const extractYear = (value) => {
  if (!value) return '';
  
  // Si ya es un número o string de 4 dígitos
  const strVal = String(value).trim();
  if (/^\d{4}$/.test(strVal)) return strVal;

  // Si viene en formato fecha DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY o YYYY-MM-DD
  const parts = strVal.split(/[-/.]/);
  if (parts.length === 3) {
    // Si el primer elemento es de 4 dígitos, asumimos YYYY-MM-DD
    if (parts[0].length === 4) return parts[0];
    // Si el último es de 4 dígitos, asumimos DD/MM/YYYY o DD-MM-YYYY
    if (parts[2].length === 4) return parts[2];
    // Si el último es de 2 dígitos (ej: 13 para 2013)
    if (parts[2].length === 2) {
      const yr = parseInt(parts[2], 10);
      return String(yr > 30 ? 1900 + yr : 2000 + yr);
    }
  }

  // Si SheetJS leyó una fecha serial de Excel
  if (typeof value === 'number' && value > 10000 && value < 60000) {
    // Convertir fecha serial de Excel usando UTC para evitar desfases de huso horario
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      return String(date.getUTCFullYear());
    }
  }
  
  // Si es un objeto Date
  if (value instanceof Date && !isNaN(value.getTime())) {
    return String(value.getUTCFullYear());
  }

  // Si tiene un formato de fecha textual en español, intentar buscar un número de 4 dígitos
  const yearMatch = strVal.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) return yearMatch[1];

  return '';
};

// Formatear fechas en formato legible DD/MM/YYYY
const formatBirthdate = (value) => {
  if (!value) return '';
  if (typeof value === 'number' && value > 10000 && value < 60000) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const d = String(date.getUTCDate()).padStart(2, '0');
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const y = date.getUTCFullYear();
      return `${d}-${m}-${y}`;
    }
  }
  return String(value).trim();
};

/**
 * Procesa un archivo Excel cargado y retorna la lista de gimnastas normalizada.
 */
export const importGimnastasFromExcel = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rawData.length === 0) {
    throw new Error('El archivo Excel está vacío.');
  }

  // Normalizar encabezados a mayúsculas y limpiar espacios
  const headers = rawData[0].map(h => String(h).toUpperCase().trim());
  
  // Buscar índices de las columnas deseadas
  const findIndex = (aliases) => {
    return headers.findIndex(h => aliases.some(alias => h.includes(alias)));
  };

  const colIdx = {
    nombre: findIndex(['GIMNASTA', 'NOMBRE', 'APELLIDO', 'ATLETA']),
    nacimiento: findIndex(['FECHA DE NACIMIENTO', 'FECHA NACIMIENTO', 'FECHA DE NAC', 'FECHA NAC', 'F. NAC', 'F.NAC', 'F_NAC', 'NACIMIENTO', 'NAC', 'AÑO', 'FECHA_NAC', 'EDAD', 'ANIO']),
    institucion: findIndex(['INSTITUCIÓN', 'INSTITUCION', 'CLUB', 'PROVINCIA', 'SELECCIÓN', 'SELECCION', 'ENTIDAD']),
    categoria: findIndex(['CATEGORÍA', 'CATEGORIA', 'CAT']),
    nivel: findIndex(['NIVEL', 'NIV', 'DIVISIÓN', 'DIVISION']),
    sexo: findIndex(['SEXO', 'RAMA', 'GENERO', 'GÉNERO', 'MODALIDAD'])
  };

  // Validaciones mínimas
  if (colIdx.nombre === -1) {
    throw new Error('No se encontró la columna de "GIMNASTA" o "NOMBRE" en el Excel.');
  }

  const gimnastas = [];

  // Recorrer filas de datos (a partir de la fila index 1)
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0 || !row[colIdx.nombre]) continue;

    const rawNac = colIdx.nacimiento !== -1 ? row[colIdx.nacimiento] : '';
    const año = extractYear(rawNac);
    const fechaFormateada = formatBirthdate(rawNac);

    const gimnasta = {
      id: `g_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
      nombre: String(row[colIdx.nombre]).trim(),
      fechaNacimiento: fechaFormateada,
      nacimiento: año,
      institucion: colIdx.institucion !== -1 && row[colIdx.institucion] ? String(row[colIdx.institucion]).trim() : 'Independiente',
      categoria: colIdx.categoria !== -1 && row[colIdx.categoria] ? String(row[colIdx.categoria]).trim() : 'Única',
      nivel: colIdx.nivel !== -1 && row[colIdx.nivel] ? String(row[colIdx.nivel]).trim() : 'Nivel 1',
      sexo: colIdx.sexo !== -1 && row[colIdx.sexo] ? String(row[colIdx.sexo]).trim().toUpperCase() : '',
      grupo: 'Turno 1', // Grupo/Turno inicial por defecto
      notas: {} // Inicialmente vacío
    };

    gimnastas.push(gimnasta);
  }

  return gimnastas;
};

/**
 * Genera un archivo Excel con todos los resultados del torneo
 */
export const exportTournamentToExcel = (tournament, sortBy = 'grupo') => {
  const { nombre, modalidad, aparatos, gimnastas } = tournament;
  const workbook = XLSX.utils.book_new();

  // Ordenar gimnastas para un mejor flujo visual en las hojas
  const sortedGimnastas = [...gimnastas].sort((a, b) => {
    if (sortBy === 'nivel') {
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

    const catA = String(a.categoria || '');
    const catB = String(b.categoria || '');
    const cmpCat = catA.localeCompare(catB, undefined, { numeric: true, sensitivity: 'base' });
    if (cmpCat !== 0) return cmpCat;

    return a.nombre.localeCompare(b.nombre);
  });

  // 1. Generar hojas para cada aparato
  aparatos.forEach(aparato => {
    const rowData = [
      ['TURNO', 'GIMNASTA', 'FECHA DE NACIMIENTO', 'INSTITUCIÓN', 'CATEGORÍA', 'NIVEL', 'JUEZ 1', 'JUEZ 2', 'JUEZ 3', 'n° jueces', 'NOTA B', 'DTOS', 'N.FINAL']
    ];

    // Filtrar gimnastas que tengan nota o que correspondan al torneo
    sortedGimnastas.forEach(g => {
      const notaObj = g.notas && g.notas[aparato];
      const j1 = notaObj?.jueces?.[0] !== undefined ? parseFloat(notaObj.jueces[0]) : '';
      const j2 = notaObj?.jueces?.[1] !== undefined ? parseFloat(notaObj.jueces[1]) : '';
      const j3 = notaObj?.jueces?.[2] !== undefined ? parseFloat(notaObj.jueces[2]) : '';
      const numJueces = notaObj?.jueces ? notaObj.jueces.filter(j => j !== null && j !== undefined).length : 0;
      const notaB = notaObj?.notaB !== undefined ? parseFloat(notaObj.notaB) : '';
      const dtos = notaObj?.dtos !== undefined ? parseFloat(notaObj.dtos) : '';
      const nFinal = notaObj?.final !== undefined ? parseFloat(notaObj.final) : '';

      rowData.push([
        g.grupo || 'Turno 1',
        g.nombre,
        g.fechaNacimiento || g.nacimiento || '',
        g.institucion,
        g.categoria,
        g.nivel,
        j1,
        j2,
        j3,
        numJueces || '',
        notaB,
        dtos,
        nFinal
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(rowData);
    XLSX.utils.book_append_sheet(workbook, worksheet, aparato.substring(0, 30)); // Limite de 31 caracteres en Excel
  });

  // 2. Ranking General (Todos los aparatos y la sumatoria)
  const rankingHeaders = ['TURNO', 'GIMNASTA', 'INSTITUCIÓN', 'CATEGORÍA', 'NIVEL', 'AÑO'];
  aparatos.forEach(ap => rankingHeaders.push(ap.toUpperCase()));
  rankingHeaders.push('TOTAL', 'PUESTO');

  const rankingRows = [rankingHeaders];

  // Agrupar gimnastas por Nivel y Categoría para calcular puestos correctamente
  const groups = {};
  sortedGimnastas.forEach(g => {
    const key = `${g.nivel}_${g.categoria}`;
    if (!groups[key]) groups[key] = [];
    
    // Calcular sumatoria total
    let totalScore = 0;
    let hasScores = false;
    const scores = {};
    
    aparatos.forEach(ap => {
      const note = g.notas && g.notas[ap]?.final;
      if (note !== undefined && note !== null) {
        scores[ap] = parseFloat(note);
        totalScore += parseFloat(note);
        hasScores = true;
      } else {
        scores[ap] = null;
      }
    });

    groups[key].push({
      ...g,
      scores,
      totalScore: hasScores ? parseFloat(totalScore.toFixed(3)) : 0,
      hasScores
    });
  });

  // Ordenar cada grupo por puntuación de mayor a menor y asignar puestos
  Object.keys(groups).forEach(key => {
    // Solo ordenar y rankear a quienes tienen notas, o a todos
    groups[key].sort((a, b) => b.totalScore - a.totalScore);
    
    let rank = 1;
    for (let idx = 0; idx < groups[key].length; idx++) {
      if (idx > 0 && groups[key][idx].totalScore < groups[key][idx - 1].totalScore) {
        rank = idx + 1;
      }
      groups[key][idx].puesto = groups[key][idx].totalScore > 0 ? rank : '';
    }
  });

  // Aplanar la lista ordenada por Nivel, Categoría, Puesto
  const allGymnastsRanked = [];
  Object.keys(groups).sort().forEach(key => {
    allGymnastsRanked.push(...groups[key]);
  });

  allGymnastsRanked.forEach(g => {
    const row = [
      g.grupo || 'Turno 1',
      g.nombre,
      g.institucion,
      g.categoria,
      g.nivel,
      g.nacimiento
    ];
    aparatos.forEach(ap => {
      row.push(g.scores[ap] !== null ? g.scores[ap] : '');
    });
    row.push(g.totalScore > 0 ? g.totalScore : '');
    row.push(g.puesto);
    rankingRows.push(row);
  });

  const generalWS = XLSX.utils.aoa_to_sheet(rankingRows);
  XLSX.utils.book_append_sheet(workbook, generalWS, 'Ranking General');

  // 3. Podio por Año
  // Agrupar gimnastas por Nivel, Categoría y Año de nacimiento
  const podiumGroups = {};
  sortedGimnastas.forEach(g => {
    let totalScore = 0;
    let hasScores = false;
    aparatos.forEach(ap => {
      const note = g.notas && g.notas[ap]?.final;
      if (note !== undefined && note !== null) {
        totalScore += parseFloat(note);
        hasScores = true;
      }
    });
    
    const key = `${g.nivel}_${g.categoria}_${g.nacimiento}`;
    if (!podiumGroups[key]) podiumGroups[key] = [];
    
    podiumGroups[key].push({
      ...g,
      totalScore: hasScores ? parseFloat(totalScore.toFixed(3)) : 0
    });
  });

  const podiumRows = [
    ['POSICIÓN', 'MEDALLA', 'GIMNASTA', 'INSTITUCIÓN', 'CATEGORÍA', 'NIVEL', 'AÑO', 'TOTAL']
  ];

  Object.keys(podiumGroups).sort().forEach(key => {
    const [nivel, categoria, nacimiento] = key.split('_');
    const groupTitle = nacimiento ? `${nivel} - ${categoria} ${nacimiento}` : `${nivel} - ${categoria}`;

    // Fila de título para la división
    podiumRows.push([groupTitle.toUpperCase()]);

    // Ordenar de mayor a menor total
    podiumGroups[key].sort((a, b) => b.totalScore - a.totalScore);

    let rank = 1;
    for (let idx = 0; idx < podiumGroups[key].length; idx++) {
      if (idx > 0 && podiumGroups[key][idx].totalScore < podiumGroups[key][idx - 1].totalScore) {
        rank = idx + 1;
      }
      
      const gym = podiumGroups[key][idx];
      let medalla = '';
      if (rank === 1) medalla = '🥇 Oro';
      else if (rank === 2) medalla = '🥈 Plata';
      else if (rank === 3) medalla = '🥉 Bronce';
      else medalla = 'Mención';

      podiumRows.push([
        rank,
        medalla,
        gym.nombre,
        gym.institucion,
        gym.categoria,
        gym.nivel,
        gym.nacimiento,
        gym.totalScore > 0 ? gym.totalScore : ''
      ]);
    }
    // Fila vacía separadora
    podiumRows.push([]);
  });

  const podiumWS = XLSX.utils.aoa_to_sheet(podiumRows);
  XLSX.utils.book_append_sheet(workbook, podiumWS, 'Podio por Año');

  // 4. Equipo Podio (Mejores 3 notas por club en cada aparato)
  // Agrupar gimnastas por Nivel, Categoría y Club
  const clubGroups = {};
  sortedGimnastas.forEach(g => {
    const key = `${g.nivel}_${g.categoria}`;
    if (!clubGroups[key]) clubGroups[key] = {};
    if (!clubGroups[key][g.institucion]) clubGroups[key][g.institucion] = [];
    clubGroups[key][g.institucion].push(g);
  });

  const teamRows = [
    ['NIVEL', 'CATEGORÍA', 'CLUB / INSTITUCIÓN']
  ];
  aparatos.forEach(ap => teamRows[0].push(ap.toUpperCase()));
  teamRows[0].push('TOTAL EQUIPO', 'PUESTO');

  Object.keys(clubGroups).sort().forEach(groupKey => {
    const [nivel, categoria] = groupKey.split('_');
    const clubs = clubGroups[groupKey];
    const clubResults = [];

    Object.keys(clubs).forEach(clubName => {
      const members = clubs[clubName];
      let totalEquipo = 0;
      const scoresPorAparato = {};

      aparatos.forEach(ap => {
        // Obtener notas de todos los miembros en este aparato y ordenar de mayor a menor
        const notes = members
          .map(m => m.notas && m.notas[ap]?.final !== undefined ? parseFloat(m.notas[ap].final) : null)
          .filter(n => n !== null)
          .sort((a, b) => b - a);
        
        // Sumar las 3 mejores notas
        const best3 = notes.slice(0, 3);
        const sumAparato = best3.reduce((acc, curr) => acc + curr, 0);
        scoresPorAparato[ap] = sumAparato > 0 ? parseFloat(sumAparato.toFixed(3)) : 0;
        totalEquipo += scoresPorAparato[ap];
      });

      // Restar descuento de equipo si existe
      const descuento = tournament.descuentosEquipos?.[`${nivel} - ${categoria}`]?.[clubName] || 0;
      const totalConDescuento = parseFloat(Math.max(0, totalEquipo - descuento).toFixed(3));

      clubResults.push({
        clubName,
        scoresPorAparato,
        totalEquipo: totalConDescuento
      });
    });

    // Ordenar clubes por total
    clubResults.sort((a, b) => b.totalEquipo - a.totalEquipo);

    let rank = 1;
    for (let idx = 0; idx < clubResults.length; idx++) {
      if (idx > 0 && clubResults[idx].totalEquipo < clubResults[idx - 1].totalEquipo) {
        rank = idx + 1;
      }
      
      const club = clubResults[idx];
      const row = [
        nivel,
        categoria,
        club.clubName
      ];
      aparatos.forEach(ap => {
        row.push(club.scoresPorAparato[ap] > 0 ? club.scoresPorAparato[ap] : '');
      });
      row.push(club.totalEquipo > 0 ? club.totalEquipo : '');
      row.push(club.totalEquipo > 0 ? rank : '');
      teamRows.push(row);
    }
    // Fila vacía separadora
    teamRows.push([]);
  });

  const teamWS = XLSX.utils.aoa_to_sheet(teamRows);
  XLSX.utils.book_append_sheet(workbook, teamWS, 'Podio por Equipos');

  // Retornar buffer de escritura
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
