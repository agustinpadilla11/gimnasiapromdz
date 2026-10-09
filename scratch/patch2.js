const fs = require('fs');
let code = fs.readFileSync('client/src/views/AdminDashboard.jsx', 'utf-8');

// 1. Modify handleOpenScoreModal to pull from buffer
const origHandleOpen = `    const handleOpenScoreModal = (g, apparatus) => {
      setScoringGymnast(g);
      setScoringApparatus(apparatus);
      
      const notaObj = g.notas?.[apparatus];
      const initialJueces = ['', '', '', '', '', ''];
      if (notaObj && notaObj.jueces) {
        notaObj.jueces.forEach((v, i) => {
          if (i < 6) initialJueces[i] = v !== null && v !== undefined ? String(v) : '';
        });
      }`;

const newHandleOpen = `    const handleOpenScoreModal = (g, apparatus) => {
      setScoringGymnast(g);
      setScoringApparatus(apparatus);
      
      const notaObj = g.notas?.[apparatus];
      const initialJueces = ['', '', '', '', '', ''];
      if (notaObj && notaObj.jueces) {
        notaObj.jueces.forEach((v, i) => {
          if (i < 6) initialJueces[i] = v !== null && v !== undefined ? String(v) : '';
        });
      }

      // Merge pending buffer if it exists
      const bufferAp = buffers[g.id] && buffers[g.id][apparatus];
      let bufDtos = null;
      let bufDtosAp = null;
      let bufNotaD = null;
      if (bufferAp) {
        Object.keys(bufferAp).forEach(k => {
          if (k.startsWith('Juez ')) {
            const idx = parseInt(k.split(' ')[1]) - 1;
            if (idx >= 0 && idx < 6 && bufferAp[k]?.nota !== null && bufferAp[k]?.nota !== undefined) {
              initialJueces[idx] = String(bufferAp[k].nota);
            }
          }
        });
        const sample = Object.values(bufferAp).find(v => v);
        if (sample) {
          if (sample.notaD !== null && sample.notaD !== undefined) bufNotaD = String(sample.notaD);
          if (sample.dtos !== null && sample.dtos !== undefined) bufDtos = String(sample.dtos);
          if (sample.dtosAparato !== null && sample.dtosAparato !== undefined) bufDtosAp = String(sample.dtosAparato);
        }
      }`;

code = code.replace(origHandleOpen, newHandleOpen);

// 2. We need to handle dtos initialization taking buffers into account
const origSetScoringForm = `      setScoringForm({
        jueces: initialJueces,
        dtos: notaObj?.dtos !== undefined ? String(notaObj.dtos) : '0.00',
        dtosAparato: notaObj?.dtosAparato !== undefined ? String(notaObj.dtosAparato) : '0.00',
        notaD: notaObj?.notaD !== undefined ? String(notaObj.notaD) : '0.00'
      });
    };`;

const newSetScoringForm = `      setScoringForm({
        jueces: initialJueces,
        dtos: bufDtos !== null ? bufDtos : (notaObj?.dtos !== undefined ? String(notaObj.dtos) : '0.00'),
        dtosAparato: bufDtosAp !== null ? bufDtosAp : (notaObj?.dtosAparato !== undefined ? String(notaObj.dtosAparato) : '0.00'),
        notaD: bufNotaD !== null ? bufNotaD : (notaObj?.notaD !== undefined ? String(notaObj.notaD) : '0.00')
      });
    };`;
code = code.replace(origSetScoringForm, newSetScoringForm);


// 3. Add visual indicator in the <td>
const origTdContent = `                                  <td
                                    key={ap}
                                    onClick={() => handleOpenScoreModal(g, ap)}
                                    className={isFlashing ? 'flash-update' : ''}
                                    style={{
                                      textAlign: 'center',
                                      fontFamily: 'var(--font-mono)',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      color: scoreVal !== undefined ? 'var(--text-primary)' : 'var(--text-muted)',
                                      background: scoreVal !== undefined ? 'rgba(59, 130, 246, 0.05)' : 'none',
                                      borderRight: '1px solid rgba(255,255,255,0.02)',
                                      transition: 'all 0.3s',
                                      position: 'relative',
                                      padding: '12px 8px'
                                    }}
                                    title="Haz clic para modificar la nota"
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <span>{scoreVal !== undefined ? parseFloat(scoreVal).toFixed(3) : '-'}</span>
                                    </div>
                                  </td>`;

const newTdContent = `                                  <td
                                    key={ap}
                                    onClick={() => handleOpenScoreModal(g, ap)}
                                    className={isFlashing ? 'flash-update' : ''}
                                    style={{
                                      textAlign: 'center',
                                      fontFamily: 'var(--font-mono)',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      color: scoreVal !== undefined ? 'var(--text-primary)' : 'var(--text-muted)',
                                      background: (buffers[g.id] && buffers[g.id][ap]) ? 'rgba(245, 158, 11, 0.15)' : (scoreVal !== undefined ? 'rgba(59, 130, 246, 0.05)' : 'none'),
                                      borderRight: '1px solid rgba(255,255,255,0.02)',
                                      border: (buffers[g.id] && buffers[g.id][ap]) ? '1px solid rgba(245, 158, 11, 0.4)' : 'none',
                                      transition: 'all 0.3s',
                                      position: 'relative',
                                      padding: '12px 8px'
                                    }}
                                    title={(buffers[g.id] && buffers[g.id][ap]) ? "Juezas cargaron notas, haz clic para revisarlas" : "Haz clic para modificar la nota"}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                      <span>{scoreVal !== undefined ? parseFloat(scoreVal).toFixed(3) : '-'}</span>
                                      {(() => {
                                        const buf = buffers[g.id] && buffers[g.id][ap];
                                        if (buf && Object.keys(buf).length > 0) {
                                          const numJudges = Object.keys(buf).filter(k => k.startsWith('Juez') && buf[k]?.nota !== null).length;
                                          return (
                                            <span style={{
                                              fontSize: '0.65rem',
                                              background: 'rgba(245, 158, 11, 0.2)',
                                              color: '#f59e0b',
                                              padding: '2px 6px',
                                              borderRadius: '4px',
                                              animation: 'pulseDot 1.5s infinite',
                                              whiteSpace: 'nowrap'
                                            }}>
                                              \${numJudges} Juez\${numJudges !== 1 ? 'as' : ''}
                                            </span>
                                          );
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  </td>`;

code = code.replace(origTdContent, newTdContent);

fs.writeFileSync('client/src/views/AdminDashboard.jsx', code);
console.log('Patched AdminDashboard.jsx successfully');
