
/**
 * QLA Practice & Mastery Upgrade (client-side augmentation)
 * - Adds full Practice & Mastery experience to Student portal
 * - Adds Skills, Question Banks, Question authoring (manual + HTML) and basic Assessments builder to Teacher portal
 * - Adds "Enroll student" control in Teacher -> Classes tab
 * - Adds "Visible to students" toggle for Lessons in Teacher portal
 *
 * This script is safe to include at the end of both:
 *   /public/portal-student.html
 *   /public/portal-teacher.html
 *
 * It detects the current page and augments the DOM without removing existing functionality.
 * Requires backend endpoints already present in the repository (teacher-practice.js, practice.js, assessments.js, classes.js).
 */

(function(){
  const isStudent = document.title && /Student Portal/i.test(document.title);
  const isTeacher = document.title && /Teacher Portal/i.test(document.title);

  // ---------- Helpers ----------
  async function apiCall(path, opts) {
    const res = await fetch(path, Object.assign({ headers: {'Content-Type':'application/json'} }, opts || {}));
    if (!res.ok) {
      const msg = await res.text().catch(()=>String(res.status));
      throw new Error(msg);
    }
    return res.json();
  }
  function el(tag, attrs={}, ...children) {
    const node = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }
  function showToast(message, type='info') {
    // very lightweight toast
    const map = { info: '#1d4ed8', success:'#136f3a', error:'#b91c1c', warn:'#8a3d00' };
    const div = el('div', { class: 'fixed right-4 top-4 px-4 py-3 rounded text-white shadow-lg', style:`background:${map[type]||map.info}; z-index:99999` }, message);
    document.body.appendChild(div);
    setTimeout(()=>{ div.remove(); }, 2500);
  }
  function pill(text, tone='ok') {
    const colors = {
      ok: 'background:rgba(19,111,58,.1); color:#136f3a; border:1px solid rgba(19,111,58,.25)',
      warn: 'background:rgba(255,140,0,.08); color:#8a3d00; border:1px solid rgba(255,140,0,.25)',
      info: 'background:rgba(29,78,216,.08); color:#1d4ed8; border:1px solid rgba(29,78,216,.25)',
      bad: 'background:rgba(185,28,28,.08); color:#b91c1c; border:1px solid rgba(185,28,28,.25)'
    };
    return el('span', { class:'text-xs px-2 py-1 rounded-full', style: colors[tone]||colors.info }, text);
  }

  // ---------- Student Portal: Practice & Progress ----------
  if (isStudent) {
    // Replace the placeholder "Practice modules coming..." with full UI
    const practiceTab = document.getElementById('practice-tab');
    if (practiceTab) {
      practiceTab.innerHTML = ''; // clear placeholder

      const topBar = el('div', { class:'card p-4 mb-4' },
        el('div', { class:'flex items-center gap-3 flex-wrap' },
          el('label', { class:'text-sm' }, 'Mode: '),
          (()=>{
            const sel = el('select', { id:'stuPracticeMode', class:'rounded border px-2 py-1' },
              el('option', { value:'targeted' }, 'Targeted (by skill)'),
              el('option', { value:'adaptive' }, 'Adaptive Mix')
            );
            return sel;
          })(),
          el('div', { class:'grow' }),
          el('button', { id:'startPracticeBtn', class:'bg-[#136f3a] text-white px-4 py-2 rounded hover:opacity-90' }, 'Start Practice')
        )
      );

      const layout = el('div', { class:'grid gap-6 md:grid-cols-12' },
        // Left: skills catalog
        el('div', { class:'md:col-span-5' },
          el('div', { class:'card p-4' },
            el('div', { class:'flex items-center justify-between mb-3' },
              el('div', { class:'font-bold' }, 'Skills'),
              el('input', { id:'skillSearch', placeholder:'Search skill…', class:'rounded border px-2 py-1' })
            ),
            el('div', { id:'skillsList', class:'space-y-2 max-h-[60vh] overflow-y-auto' })
          )
        ),
        // Right: live session (question + hint)
        el('div', { class:'md:col-span-7' },
          el('div', { class:'card p-4' },
            el('div', { class:'font-bold mb-2' }, 'Practice Session'),
            el('div', { id:'sessionWrap', class:'text-slate-600' }, 'Select a skill and click Start Practice.')
          ),
          el('div', { class:'card p-4 mt-4' },
            el('div', { class:'font-bold mb-2' }, 'Mastery & Achievements'),
            el('div', { id:'studentProgressMini' }, '—')
          )
        )
      );

      practiceTab.appendChild(topBar);
      practiceTab.appendChild(layout);

      let userData = window.userData || { currentGrade: 7 };
      let selectedSkillId = null;
      let currentSession = null;
      let currentQuestion = null;
      let questionStart = null;
      let hintsUsed = 0;

      async function loadSkills() {
        const params = new URLSearchParams();
        params.set('grade', String(userData.currentGrade || 7));
        const data = await apiCall('/api/practice/skills?' + params.toString());
        const list = document.getElementById('skillsList');
        const searchBox = document.getElementById('skillSearch');

        function render(skills) {
          list.innerHTML = '';
          (skills || []).forEach(s => {
            const row = el('div', { class:'interactive-row', style:'display:flex; gap:12px; align-items:center' });
            row.appendChild(el('div', { class:'flex-1' },
              el('div', { class:'font-semibold' }, s.name),
              el('div', { class:'text-xs text-slate-600' }, `Unit ${s.unit} • Progress ${Math.round(s.progress_percentage||0)}% • ${s.available_questions||0} questions`)
            ));
            row.appendChild(pill(s.status || 'not started', (s.status==='mastered'?'ok': (s.status==='learning'?'info':(s.status==='practiced'?'warn':'bad')))));
            row.addEventListener('click', () => {
              selectedSkillId = s.id;
              document.querySelectorAll('#skillsList .interactive-row').forEach(n => n.classList.remove('ring-2'));
              row.classList.add('ring-2'); row.classList.add('ring-[#C7A34F]');
            });
            list.appendChild(row);
          });
        }
        render(data || []);

        searchBox.addEventListener('input', () => {
          const q = searchBox.value.toLowerCase();
          render((data||[]).filter(s => (s.name || '').toLowerCase().includes(q)));
        });
      }

      async function startPractice() {
        try {
          const mode = document.getElementById('stuPracticeMode').value;
          if (mode === 'targeted' && !selectedSkillId) {
            showToast('Please select a skill first', 'warn'); return;
          }
          const payload = mode === 'targeted'
              ? { session_type: 'targeted', skill_id: selectedSkillId, num_questions: 10 }
              : { session_type: 'adaptive', num_questions: 10 };
          const sess = await apiCall('/api/practice/session/start', { method:'POST', body: JSON.stringify(payload) });
          currentSession = sess;
          showNextQuestion();
          refreshMiniProgress();
        } catch (e) {
          showToast(`Could not start session: ${e.message}`, 'error');
        }
      }

      function renderQuestion(q) {
        const wrap = el('div', {},
          el('div', { class:'text-xs text-slate-600 mb-2' }, q.skill_name ? `Skill: ${q.skill_name}` : ''),
          el('div', { class:'font-semibold mb-2' }, q.question_text || 'Question'),
          el('div', { id:'answerArea', class:'space-y-2 mb-3' }),
          el('div', { class:'flex gap-2' },
            el('button', { id:'hintBtn', class:'bg-[#1d4ed8] text-white px-3 py-1 rounded' }, 'Hint'),
            el('button', { id:'submitBtn', class:'bg-[#136f3a] text-white px-3 py-1 rounded' }, 'Submit')
          ),
          el('div', { id:'feedback', class:'mt-3' })
        );

        const holder = wrap.querySelector('#answerArea');
        // Render by type
        const qtype = q.question_type;
        if (qtype === 'mcq' || qtype === 'true_false') {
          (q.question_data?.options || []).forEach((opt, i) => {
            const btn = el('button', { class:'interactive-row', 'data-value': String(i) }, opt);
            btn.addEventListener('click', () => {
              holder.querySelectorAll('button').forEach(b => b.classList.remove('completed'));
              btn.classList.add('completed'); btn.dataset.value = String(i);
            });
            holder.appendChild(btn);
          });
        } else if (qtype === 'multi_select') {
          (q.question_data?.options || []).forEach((opt, i) => {
            const btn = el('button', { class:'interactive-row', 'data-index': String(i) }, opt);
            btn.addEventListener('click', () => {
              btn.classList.toggle('completed');
            });
            holder.appendChild(btn);
          });
        } else if (qtype === 'numeric') {
          const inp = el('input', { class:'rounded border px-2 py-1', placeholder:'Enter number' });
          holder.appendChild(inp);
        } else if (qtype === 'text') {
          const inp = el('input', { class:'rounded border px-2 py-1', placeholder:'Enter answer' });
          holder.appendChild(inp);
        } else {
          holder.appendChild(el('div', { class:'text-slate-500 text-sm' }, 'Unsupported question type.'));
        }

        const hintBtn = wrap.querySelector('#hintBtn');
        const submitBtn = wrap.querySelector('#submitBtn');
        const feedback = wrap.querySelector('#feedback');

        hintsUsed = 0;
        hintBtn.addEventListener('click', () => {
          const hints = q.hints || [];
          if (hintsUsed < hints.length) {
            const h = hints[hintsUsed++];
            feedback.appendChild(el('div', { class:'mt-2 text-sm' }, '💡 ', h));
          } else {
            showToast('No more hints available for this question.', 'info');
          }
        });

        submitBtn.addEventListener('click', async () => {
          try {
            // collect answer
            let val = null;
            if (qtype === 'mcq' || qtype === 'true_false') {
              const chosen = holder.querySelector('button.completed');
              val = chosen ? Number(chosen.dataset.value) : null;
            } else if (qtype === 'multi_select') {
              val = Array.from(holder.querySelectorAll('button.completed')).map(b => Number(b.dataset.index));
            } else if (qtype === 'numeric' || qtype === 'text') {
              const inp = holder.querySelector('input');
              val = inp ? inp.value : null;
            }
            const timeSecs = Math.max(1, Math.floor((Date.now() - (questionStart||Date.now()))/1000));
            const result = await apiCall('/api/practice/answer', {
              method: 'POST',
              body: JSON.stringify({
                session_id: currentSession?.session_id,
                question_id: q.id,
                user_answer: val,
                hints_used: hintsUsed,
                time_taken_seconds: timeSecs
              })
            });
            feedback.innerHTML = '';
            feedback.appendChild(el('div', { class: result.is_correct ? 'text-[#136f3a] font-semibold' : 'text-[#b91c1c] font-semibold' },
              result.is_correct ? '✅ Correct!' : '❌ Not quite.'
            ));
            if (result.solution_steps && Array.isArray(result.solution_steps)) {
              const box = el('div', { class:'mt-2 p-3 rounded border' },
                el('div', { class:'font-semibold mb-1' }, 'Solution:'),
                ...result.solution_steps.map((s,i)=>el('div', {}, (i+1)+'. '+s))
              );
              feedback.appendChild(box);
            }
            // next
            setTimeout(showNextQuestion, 600);
            refreshMiniProgress();
          } catch (e) {
            showToast(`Submit failed: ${e.message}`, 'error');
          }
        });

        return wrap;
      }

      function showNextQuestion() {
        const wrap = document.getElementById('sessionWrap');
        const q = (currentSession?.questions || [])[0];
        if (!q) {
          wrap.innerHTML = 'No questions available. Please contact your teacher.';
          return;
        }
        currentQuestion = q;
        currentSession.questions = currentSession.questions.slice(1);
        wrap.innerHTML = '';
        wrap.appendChild(renderQuestion(q));
        questionStart = Date.now();
      }

      async function refreshMiniProgress() {
        try {
          const data = await apiCall('/api/practice/progress');
          const box = document.getElementById('studentProgressMini');
          box.innerHTML = '';
          const overall = data?.overall_stats || {};
          const streak = data?.streak || {};
          const units = data?.units_progress || [];
          const next = (data?.recommendations?.next || data?.nextSkills) || [];
          const ach = data?.achievements || [];

          const row1 = el('div', { class:'flex flex-wrap gap-3 items-center mb-2' },
            pill(`Accuracy ${overall.accuracy||0}%`,'ok'),
            pill(`Mastered ${overall.skills_mastered||0}`,'info'),
            pill(`Streak ${streak.current_streak||0}d`, 'warn'),
            pill(`Time ${(overall.total_time_seconds||0)}s`, 'info')
          );
          const row2 = el('div', { class:'text-sm text-slate-700 mb-1' }, 'Next skills: ',
            ...(next.slice(0,3).map(s=>pill(s.name || ('Skill '+(s.id||'')), 'info')))
          );
          const row3 = el('div', {}, 'Achievements: ',
            ...(ach.slice(0,5).map(a=>pill(a.display_name||a.name,'ok')))
          );
          const row4 = el('div', { class:'mt-1 text-xs text-slate-500' }, `Units tracked: ${units.length}`);

          box.appendChild(row1); box.appendChild(row2); box.appendChild(row3); box.appendChild(row4);
        } catch { /* ignore */ }
      }

      document.getElementById('startPracticeBtn').addEventListener('click', startPractice);
      loadSkills().then(refreshMiniProgress);
    }
  }

  // ---------- Teacher Portal: Practice management & Assessments ----------
  if (isTeacher) {
    // 1) Insert a "Practice" tab beside "Assignments"
    const nav = document.querySelector('.nav-tabs');
    if (nav && !nav.querySelector('[data-tab="practice"]')) {
      const btn = el('button', { class:'nav-tab', 'data-tab':'practice' },
        el('i', { class:'fas fa-lightbulb mr-2' }), 'Practice');
      nav.insertBefore(btn, nav.querySelector('[data-tab="classes"]'));
    }
    const main = document.querySelector('main');
    if (main && !document.getElementById('practice-tab')) {
      main.appendChild(el('section', { id:'practice-tab', class:'tab-content hidden' },
        el('div', { class:'grid gap-6 md:grid-cols-12' },
          el('div', { class:'md:col-span-4' },
            el('div', { class:'card p-4' },
              el('div', { class:'font-bold mb-2' }, 'Skills'),
              el('div', { class:'text-sm text-slate-600 mb-2' }, 'Create and manage skills (topics).'),
              el('div', { class:'grid gap-2 mb-3' },
                el('label', { class:'text-sm' }, 'Grade ', el('select', { id:'tSkillGrade', class:'rounded border px-2 py-1' },
                  el('option', { value:'7' }, '7'), el('option', { value:'8' }, '8'))),
                el('button', { id:'loadSkillsBtn', class:'bg-[#1d4ed8] text-white px-3 py-1 rounded' }, 'Load Skills'),
                el('div', { id:'tSkillsList', class:'space-y-2 max-h-[55vh] overflow-y-auto' })
              ),
              el('div', { class:'border-t pt-3 mt-3' },
                el('div', { class:'font-semibold mb-1' }, 'New Skill'),
                el('div', { class:'grid gap-2' },
                  el('input', { id:'tSkillName', class:'rounded border px-2 py-1', placeholder:'Skill name' }),
                  el('input', { id:'tSkillUnit', type:'number', min:'1', class:'rounded border px-2 py-1', placeholder:'Unit' }),
                  el('textarea', { id:'tSkillDesc', class:'rounded border px-2 py-1', placeholder:'Description (optional)' }),
                  el('button', { id:'tCreateSkill', class:'bg-[#136f3a] text-white px-3 py-1 rounded' }, 'Create')
                )
              )
            )
          ),
          el('div', { class:'md:col-span-8' },
            el('div', { class:'card p-4' },
              el('div', { class:'font-bold mb-2' }, 'Question Banks'),
              el('div', { id:'tBanksHeader', class:'flex gap-2 items-center mb-2' },
                el('button', { id:'tCreateBank', class:'bg-[#1d4ed8] text-white px-3 py-1 rounded' }, 'New Bank'),
                el('span', { id:'tBankMeta', class:'text-sm text-slate-600' }, '—')
              ),
              el('div', { id:'tBanksList', class:'space-y-2 mb-3' }),
              el('div', { class:'grid gap-2 border-t pt-3' },
                el('div', { class:'font-semibold' }, 'Add Question'),
                el('select', { id:'tQType', class:'rounded border px-2 py-1' },
                  el('option', { value:'mcq' }, 'MCQ'), el('option', { value:'multi_select' }, 'Multi-select'),
                  el('option', { value:'numeric' }, 'Numeric'), el('option', { value:'true_false' }, 'True/False'),
                  el('option', { value:'text' }, 'Text')
                ),
                el('textarea', { id:'tQPrompt', class:'rounded border px-2 py-1', placeholder:'Question prompt' }),
                el('textarea', { id:'tQOptions', class:'rounded border px-2 py-1', placeholder:'Options (one per line, MCQ / Multi-select / T/F)' }),
                el('input', { id:'tQAnswer', class:'rounded border px-2 py-1', placeholder:'Answer (e.g., 1 for MCQ, 0/1 for T/F, comma separated for Multi-select; number for numeric; text)' }),
                el('textarea', { id:'tQHints', class:'rounded border px-2 py-1', placeholder:'Hints (one per line, optional)' }),
                el('textarea', { id:'tQSteps', class:'rounded border px-2 py-1', placeholder:'Solution steps (one per line, optional)' }),
                el('div', { class:'grid grid-cols-3 gap-2' },
                  el('input', { id:'tQDiff', type:'number', min:'1', max:'5', value:'3', class:'rounded border px-2 py-1', placeholder:'Difficulty 1-5' }),
                  el('input', { id:'tQPoints', type:'number', min:'1', value:'10', class:'rounded border px-2 py-1', placeholder:'Points' }),
                  el('button', { id:'tAddQ', class:'bg-[#136f3a] text-white px-3 py-1 rounded' }, 'Add to Selected Bank')
                ),
                el('div', { class:'border-t pt-3' },
                  el('div', { class:'font-semibold mb-1' }, 'Import from HTML'),
                  el('textarea', { id:'tQHtml', class:'rounded border px-2 py-1', placeholder:'Paste simple HTML with <div class="q">...'}, ),
                  el('button', { id:'tImportHtml', class:'bg-[#8a3d00] text-white px-3 py-1 rounded' }, 'Import into Selected Bank')
                )
              ),
              el('div', { id:'tQuestionsList', class:'mt-4 space-y-2' })
            ),
            el('div', { class:'card p-4 mt-4' },
              el('div', { class:'font-bold mb-2' }, 'Quick Assessment Builder'),
              el('div', { class:'grid md:grid-cols-3 gap-2 mb-2' },
                el('input', { id:'asmtTitle', class:'rounded border px-2 py-1', placeholder:'Assessment title' }),
                el('input', { id:'asmtLessonId', type:'number', class:'rounded border px-2 py-1', placeholder:'Lesson ID (optional)' }),
                el('input', { id:'asmtPass', type:'number', value:'70', class:'rounded border px-2 py-1', placeholder:'Pass %' })
              ),
              el('button', { id:'asmtFromBank', class:'bg-[#1d4ed8] text-white px-3 py-1 rounded' }, 'Create Assessment From Selected Bank')
            )
          )
        )
      ));
    }

    // 2) Wire tab switching
    function switchTab(tab) {
      document.querySelectorAll('.nav-tab').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
      document.querySelectorAll('.tab-content').forEach(n => n.classList.toggle('hidden', n.id !== (tab + '-tab')));
    }
    document.querySelectorAll('.nav-tab').forEach(b=>{
      b.addEventListener('click', ()=>switchTab(b.dataset.tab));
    });

    // 3) Add controls in existing Edit Lesson modal for is_public
    const editModal = document.getElementById('editModal');
    if (editModal && !document.getElementById('edit-is-public')) {
      const target = editModal.querySelector('.space-y-4');
      target && target.appendChild(el('div', {},
        el('label', { class:'text-sm font-semibold flex items-center gap-2' },
          el('input', { id:'edit-is-public', type:'checkbox' }), 'Visible to students'
        )
      ));
      // Hook saveEdit to include is_public if present
      const saveBtn = Array.from(editModal.querySelectorAll('button')).find(b=>/Save/i.test(b.textContent||''));
      if (saveBtn && typeof window.saveEdit === 'function') {
        const orig = window.saveEdit;
        window.saveEdit = async function() {
          const id = document.getElementById('edit-id')?.value;
          const isPublic = document.getElementById('edit-is-public')?.checked;
          if (id) {
            try { await apiCall('/api/lessons/'+id, { method:'PUT', body: JSON.stringify({ is_public: !!isPublic }) }); }
            catch(e){ console.warn('is_public update failed:', e.message); }
          }
          return orig();
        };
      }
    }

    // 4) Classes tab — add "Enroll student" inline control
    (function augmentClasses(){
      const container = document.getElementById('myClasses');
      if (!container) return;
      const observer = new MutationObserver(()=>{
        // add controls to any row that lacks it
        container.querySelectorAll('.interactive-row').forEach(row => {
          if (row.querySelector('.enroll-box')) return;
          const codeText = row.querySelector('.text-xs')?.textContent || '';
          const m = codeText.match(/^\s*([A-Z0-9\-]+)\s*•/i);
          const classCode = m ? m[1] : null;
          const box = el('div', { class:'enroll-box mt-2 flex gap-2' },
            el('input', { class:'rounded border px-2 py-1', placeholder:'student@school.org' }),
            el('button', { class:'bg-[#1d4ed8] text-white px-2 py-1 rounded' , onclick: async (ev)=>{
              const email = ev.target.previousSibling.value.trim().toLowerCase();
              if (!email) return;
              try {
                // Find class id via /api/classes and matching code
                const classes = await apiCall('/api/classes');
                const cls = (classes||[]).find(c => String(c.code).toLowerCase() === String(classCode).toLowerCase());
                if (!cls) return showToast('Class not found', 'error');
                await apiCall(`/api/classes/${cls.id}/enroll`, { method:'POST', body: JSON.stringify({ student_email: email }) });
                showToast('Student enrolled', 'success');
              } catch (e) { showToast('Enroll failed: '+e.message, 'error'); }
            }}, 'Enroll')
          );
          row.appendChild(box);
        });
      });
      observer.observe(container, { childList:true, subtree:true });
    })();

    // 5) Practice UI handlers (skills, banks, questions, assessments)
    const state = { skills:[], selectedSkill:null, banks:[], selectedBank:null };

    async function tLoadSkills() {
      const grade = Number(document.getElementById('tSkillGrade').value||7);
      const data = await apiCall('/api/teacher/practice/skills?grade='+grade);
      state.skills = data || [];
      const list = document.getElementById('tSkillsList');
      list.innerHTML='';
      (state.skills||[]).forEach(s => {
        const row = el('div', { class:'interactive-row' },
          el('div', {}, el('div', { class:'font-semibold' }, s.name), el('div', { class:'text-xs text-slate-600' }, `Unit ${s.unit}`)),
          pill('Select','info')
        );
        row.addEventListener('click', () => {
          state.selectedSkill = s;
          // load banks for this skill
          tLoadBanks();
          list.querySelectorAll('.interactive-row').forEach(n=>n.classList.remove('ring-2'));
          row.classList.add('ring-2'); row.classList.add('ring-[#C7A34F]');
        });
        list.appendChild(row);
      });
    }
    async function tCreateSkill() {
      const name = document.getElementById('tSkillName').value.trim();
      const grade = Number(document.getElementById('tSkillGrade').value||7);
      const unit  = Number(document.getElementById('tSkillUnit').value||1);
      const description = document.getElementById('tSkillDesc').value.trim();
      if (!name || !grade || !unit) return showToast('Name, grade and unit are required','warn');
      const s = await apiCall('/api/teacher/practice/skills', { method:'POST', body: JSON.stringify({ name, description, grade, unit }) });
      showToast('Skill created','success'); await tLoadSkills();
    }
    async function tLoadBanks() {
      const skillId = state.selectedSkill?.id;
      if (!skillId) return;
      const data = await apiCall('/api/teacher/practice/banks?skill_id='+skillId);
      state.banks = data || [];
      const headerMeta = document.getElementById('tBankMeta');
      const list = document.getElementById('tBanksList');
      const qList = document.getElementById('tQuestionsList');
      headerMeta.textContent = `${state.banks.length} bank(s) for "${state.selectedSkill.name}"`;
      list.innerHTML=''; qList.innerHTML='';
      (state.banks||[]).forEach(b => {
        const row = el('div', { class:'interactive-row' },
          el('div', {}, el('div', { class:'font-semibold' }, b.title), el('div', { class:'text-xs text-slate-600' }, `${b.question_count||0} Q • ${b.difficulty||'medium'}`)),
          pill(b.is_active ? 'Active' : 'Inactive', b.is_active?'ok':'warn')
        );
        row.addEventListener('click', async () => {
          state.selectedBank = b;
          list.querySelectorAll('.interactive-row').forEach(n=>n.classList.remove('ring-2'));
          row.classList.add('ring-2'); row.classList.add('ring-[#C7A34F]');
          const qs = await apiCall(`/api/teacher/practice/banks/${b.id}/questions`);
          qList.innerHTML='';
          (qs||[]).forEach(q => {
            const qRow = el('div', { class:'card p-3' },
              el('div', { class:'text-xs text-slate-600' }, `Type ${q.question_type} • Diff ${q.difficulty_level} • ${q.points} pts`),
              el('div', { class:'font-semibold mb-1' }, q.question_text || '—')
            );
            qList.appendChild(qRow);
          });
        });
        list.appendChild(row);
      });
    }
    async function tCreateBank() {
      if (!state.selectedSkill) return showToast('Select a skill first','warn');
      const title = prompt('Bank title', `${state.selectedSkill.name} Practice`);
      if (!title) return;
      const b = await apiCall('/api/teacher/practice/banks', { method:'POST', body: JSON.stringify({ skill_id: state.selectedSkill.id, title }) });
      showToast('Bank created','success'); await tLoadBanks();
    }
    async function tAddQuestion() {
      if (!state.selectedSkill || !state.selectedBank) return showToast('Select a skill and a bank first','warn');
      const qtype = document.getElementById('tQType').value;
      const prompt = document.getElementById('tQPrompt').value.trim();
      const rawOpts = document.getElementById('tQOptions').value;
      const rawAns  = document.getElementById('tQAnswer').value.trim();
      const hints   = document.getElementById('tQHints').value.trim().split('\n').filter(Boolean);
      const steps   = document.getElementById('tQSteps').value.trim().split('\n').filter(Boolean);
      const diff    = Number(document.getElementById('tQDiff').value || 3);
      const points  = Number(document.getElementById('tQPoints').value || 10);

      let question_data = {};
      let correct_answer = null;
      if (qtype === 'mcq' || qtype === 'true_false' || qtype === 'multi_select') {
        const options = rawOpts.split('\n').filter(Boolean);
        question_data.options = options;
        if (qtype === 'multi_select') {
          correct_answer = rawAns.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
        } else {
          correct_answer = Number(rawAns);
        }
      } else if (qtype === 'numeric') {
        question_data = { format: 'number' };
        correct_answer = { value: Number(rawAns), tolerance: 0 };
      } else if (qtype === 'text') {
        question_data = {};
        correct_answer = { accept: [rawAns] };
      }

      await apiCall('/api/teacher/practice/questions', {
        method:'POST',
        body: JSON.stringify({
          bank_id: state.selectedBank.id,
          skill_id: state.selectedSkill.id,
          question_type: qtype,
          question_text: prompt,
          question_data,
          correct_answer,
          solution_steps: steps,
          hints,
          difficulty_level: diff,
          points
        })
      });
      showToast('Question added','success');
      await tLoadBanks();
    }
    async function tImportHtml() {
      if (!state.selectedBank) return showToast('Select a bank first','warn');
      const html = document.getElementById('tQHtml').value.trim();
      if (!html) return showToast('Paste HTML first','warn');
      await apiCall(`/api/teacher/practice/banks/${state.selectedBank.id}/import-html`, {
        method:'POST',
        body: JSON.stringify({ html })
      });
      document.getElementById('tQHtml').value = '';
      showToast('Imported questions from HTML','success');
      await tLoadBanks();
    }
    async function tCreateAssessmentFromBank() {
      if (!state.selectedBank) return showToast('Select a bank first','warn');
      const title = document.getElementById('asmtTitle').value || (state.selectedBank.title + ' Assessment');
      const lesson_id = Number(document.getElementById('asmtLessonId').value || 0) || null;
      const pass_pct  = Number(document.getElementById('asmtPass').value || 70);
      await apiCall('/api/teacher/practice/create-assessment', {
        method:'POST',
        body: JSON.stringify({ bank_id: state.selectedBank.id, title, lesson_id, pass_pct })
      });
      showToast('Assessment created','success');
    }

    // Bind events
    document.getElementById('loadSkillsBtn')?.addEventListener('click', tLoadSkills);
    document.getElementById('tCreateSkill')?.addEventListener('click', tCreateSkill);
    document.getElementById('tCreateBank')?.addEventListener('click', tCreateBank);
    document.getElementById('tAddQ')?.addEventListener('click', tAddQuestion);
    document.getElementById('tImportHtml')?.addEventListener('click', tImportHtml);
    document.getElementById('asmtFromBank')?.addEventListener('click', tCreateAssessmentFromBank);
  }
})();


  // Student: enrich Progress tab with mastery breakdown and "what's left"
  if (isStudent) {
    async function renderFullProgress() {
      const cont = document.getElementById('progressChart');
      if (!cont) return;
      try {
        const data = await fetch('/api/practice/progress', { headers: { 'Content-Type': 'application/json' } }).then(r=>r.json());
        const units = data?.units_progress || [];
        const skills = data?.skills_progress || [];
        const next = (data?.recommendations?.next || data?.nextSkills) || [];
        cont.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'grid gap-3 md:grid-cols-2';
        cont.appendChild(grid);

        units.forEach(u => {
          const box = document.createElement('div');
          box.className = 'card p-3';
          const pct = Math.round(u.avg_mastery || 0);
          box.innerHTML = `
            <div class="font-semibold">Grade ${u.grade} • Unit ${u.unit}</div>
            <div class="text-xs text-slate-600 mb-1">${u.mastered_skills}/${u.total_skills} skills mastered</div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          `;
          grid.appendChild(box);
        });

        const nextBox = document.createElement('div');
        nextBox.className = 'card p-3 md:col-span-2';
        nextBox.innerHTML = `<div class="font-semibold mb-1">Next up (recommended)</div>`;
        const wrap = document.createElement('div'); wrap.className = 'flex gap-2 flex-wrap';
        next.slice(0,8).forEach(s => {
          const span = document.createElement('span');
          span.className = 'text-xs px-2 py-1 rounded-full';
          span.style = 'background:rgba(29,78,216,.08); color:#1d4ed8; border:1px solid rgba(29,78,216,.25)';
          span.textContent = s.name || ('Skill '+(s.id||''));
          wrap.appendChild(span);
        });
        nextBox.appendChild(wrap);
        cont.appendChild(nextBox);
      } catch (e) {
        cont.innerHTML = '<p class="text-slate-500">Progress data unavailable.</p>';
      }
    }

    // Hook nav tab
    const progressTabBtn = Array.from(document.querySelectorAll('.nav-tab')).find(b => b.dataset.tab === 'progress');
    if (progressTabBtn) progressTabBtn.addEventListener('click', renderFullProgress);
  }
