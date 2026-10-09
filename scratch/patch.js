const fs = require('fs');
let code = fs.readFileSync('client/src/views/AdminDashboard.jsx', 'utf-8');

// 1. Add buffers state
code = code.replace(
  "const [turnosConfig, setTurnosConfig] = useState([]);",
  "const [turnosConfig, setTurnosConfig] = useState([]);\n  const [buffers, setBuffers] = useState({});"
);

// 2. Set buffers in fetchTournamentData
code = code.replace(
  "setTurnosConfig(data.turnosConfig || []);",
  "setTurnosConfig(data.turnosConfig || []);\n        setBuffers(data.bufferNotas || {});"
);

// 3. Update ws.onmessage to handle BUFFER events
code = code.replace(
  "showFlashNotification(`🔥 Nueva nota: ${msg.gymnast.nombre} (${nivelTxt}) en ${msg.aparato}: ${msg.score?.final !== undefined ? Number(msg.score.final).toFixed(3) : ''}`);",
  `showFlashNotification(\`🔥 Nueva nota: \${msg.gymnast.nombre} (\${nivelTxt}) en \${msg.aparato}: \${msg.score?.final !== undefined ? Number(msg.score.final).toFixed(3) : ''}\`);
        } else if (msg.type === 'BUFFER_UPDATED') {
          setBuffers(prev => {
            const next = { ...prev };
            if (!next[msg.gymnastId]) next[msg.gymnastId] = {};
            next[msg.gymnastId] = { ...next[msg.gymnastId], [msg.aparato]: msg.buffer };
            return next;
          });
          showFlashNotification(\`ℹ️ Jueza cargó nota en \${msg.aparato}\`);
        } else if (msg.type === 'BUFFER_CLEARED') {
          setBuffers(prev => {
            const next = { ...prev };
            if (next[msg.gymnastId]) {
              const newAparatos = { ...next[msg.gymnastId] };
              delete newAparatos[msg.aparato];
              next[msg.gymnastId] = newAparatos;
            }
            return next;
          });`
);

// 4. Update the "Cargar" button to handle buffers
const loadButtonRegex = /<button[\s\S]*?onClick=\{\(\) => \{\s*setScoringGymnast\(g\);\s*setScoringApparatus\(ap\);\s*setScoringForm\([^}]*\}\);\s*\}\}[\s\S]*?className="btn"[\s\S]*?>\s*Cargar\s*<\/button>/g;

const newLoadButton = `
                              {(() => {
                                const bufferAp = buffers[g.id] && buffers[g.id][ap];
                                const hasBuffer = bufferAp && Object.keys(bufferAp).length > 0;
                                const juecesConNota = hasBuffer ? Object.keys(bufferAp).filter(k => k.startsWith('Juez') && bufferAp[k]?.nota !== null).length : 0;
                                
                                return (
                                  <button
                                    onClick={() => {
                                      setScoringGymnast(g);
                                      setScoringApparatus(ap);
                                      
                                      // Pre-fill form from buffer if available
                                      const newJudges = Array(6).fill('');
                                      let newNotaD = '';
                                      let newDtos = '';
                                      let newDtosAp = '';
                                      
                                      if (hasBuffer) {
                                        Object.keys(bufferAp).forEach(k => {
                                          if (k.startsWith('Juez ')) {
                                            const idx = parseInt(k.split(' ')[1]) - 1;
                                            if (idx >= 0 && idx < 6 && bufferAp[k]?.nota !== null && bufferAp[k]?.nota !== undefined) {
                                              newJudges[idx] = bufferAp[k].nota;
                                            }
                                          }
                                        });
                                        const sample = Object.values(bufferAp).find(v => v);
                                        if (sample) {
                                          if (sample.notaD !== null && sample.notaD !== undefined) newNotaD = sample.notaD;
                                          if (sample.dtos !== null && sample.dtos !== undefined) newDtos = sample.dtos;
                                          if (sample.dtosAparato !== null && sample.dtosAparato !== undefined) newDtosAp = sample.dtosAparato;
                                        }
                                      }
                                      
                                      setScoringForm({ judges: newJudges, notaD: newNotaD, dtos: newDtos, dtosAparato: newDtosAp });
                                    }}
                                    className="btn"
                                    style={{
                                      padding: '6px 10px',
                                      fontSize: '0.85rem',
                                      background: hasBuffer ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-btn-secondary)',
                                      color: hasBuffer ? '#f59e0b' : 'var(--text-secondary)',
                                      border: \`1px solid \${hasBuffer ? '#f59e0b' : 'var(--border-color)'}\`,
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontWeight: hasBuffer ? 'bold' : 'normal',
                                      animation: hasBuffer ? 'pulseDot 2s infinite' : 'none'
                                    }}
                                    title={hasBuffer ? "Revisar notas enviadas por las juezas" : "Cargar nota manualmente"}
                                  >
                                    {hasBuffer ? \`\${juecesConNota} Jueza\${juecesConNota !== 1 ? 's' : ''}\` : 'Cargar'}
                                  </button>
                                );
                              })()}
`;

code = code.replace(loadButtonRegex, newLoadButton);

fs.writeFileSync('client/src/views/AdminDashboard.jsx', code);
console.log('Patched AdminDashboard.jsx');
