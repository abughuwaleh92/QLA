// Teacher Practice UI (FULL REWRITE)
// Wires the Create Skill, Load Skills, New Bank, Add Question, and Import HTML actions.

(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const api = {
    async listSkills(grade) {
      const r = await fetch(`/api/teacher/practice/skills?grade=${encodeURIComponent(grade)}`);
      if (!r.ok) throw new Error(`GET /skills ${r.status}`);
      return r.json();
    },
    async createSkill({ name, unit, grade, default_bank_name }) {
      const r = await fetch('/api/teacher/practice/skills', {
        method: 'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name, unit, grade, default_bank_name })
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `POST /skills ${r.status}`);
      return j;
    },
    async listBanks(skillId) {
      const r = await fetch(`/api/teacher/practice/banks?skillId=${encodeURIComponent(skillId)}`);
      if (!r.ok) throw new Error(`GET /banks ${r.status}`);
      return r.json();
    },
    async createBank(skill_id, name) {
      const r = await fetch('/api/teacher/practice/banks', {
        method: 'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ skill_id, name })
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `POST /banks ${r.status}`);
      return j;
    },
    async listQuestions(bankId) {
      const r = await fetch(`/api/teacher/practice/banks/${encodeURIComponent(bankId)}/questions`);
      if (!r.ok) throw new Error(`GET /questions ${r.status}`);
      return r.json();
    },
    async addQuestion(payload) {
      const r = await fetch('/api/teacher/practice/questions', {
        method: 'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `POST /questions ${r.status}`);
      return j;
    },
    async importHtml(bankId, html) {
      const r = await fetch(`/api/teacher/practice/banks/${encodeURIComponent(bankId)}/import-html`, {
        method: 'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ html })
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || j.fix || `POST /import-html ${r.status}`);
      return j;
    }
  };

  // --- State
  const state = { currentSkillId: null, currentBankId: null };

  // --- Elements
  const gradeEl   = $('#gradeSelect');
  const loadBtn   = $('#btn-load-skills');
  const skillsUl  = $('#skillsList');

  const nameEl    = $('#new-skill-name');
  const unitEl    = $('#new-skill-unit');
  const bankEl    = $('#new-skill-bank');
  const createBtn = $('#btn-create-skill');

  const bankNameEl = $('#new-bank-name');
  const newBankBtn = $('#btn-new-bank');
  const banksUl    = $('#banksList');

  const qType   = $('#questionType');
  const qPrompt = $('#questionPrompt');
  const qOpts   = $('#questionOptions');
  const qAns    = $('#questionAnswer');
  const qHints  = $('#questionHints');
  const qSteps  = $('#questionSteps');
  const addQBtn = $('#btn-add-question');
  const qList   = $('#questionsList');

  const importText = $('#importHtmlText');
  const importBtn  = $('#btn-import-html');

  const toast = (msg, ok=true) => {
    console[ok ? 'log' : 'warn'](msg);
    // Optional: replace with your toast UI
    // alert(msg);
  };

  // --- Rendering helpers
  function renderSkills(skills) {
    skillsUl.innerHTML = '';
    skills.forEach(s => {
      const li = document.createElement('li');
      li.textContent = `Unit ${s.unit ?? ''} — ${s.name}`;
      li.style.cursor = 'pointer';
      li.onclick = async () => {
        state.currentSkillId = s.id;
        toast(`Selected skill: ${s.name}`);
        await refreshBanks();
      };
      skillsUl.appendChild(li);
    });
  }

  function renderBanks(banks) {
    banksUl.innerHTML = '';
    banks.forEach(b => {
      const li = document.createElement('li');
      li.textContent = b.name;
      li.style.cursor = 'pointer';
      li.onclick = async () => {
        state.currentBankId = b.id;
        toast(`Selected bank: ${b.name}`);
        await refreshQuestions();
      };
      banksUl.appendChild(li);
    });
  }

  function renderQuestions(questions) {
    qList.innerHTML = '';
    questions.forEach(q => {
      const div = document.createElement('div');
      div.className = 'card';
      const type = q.question_type.toUpperCase();
      div.innerHTML = `
        <div class="p-2">
          <div class="text-xs text-slate-500">${type}</div>
          <div class="font-medium">${q.question_text}</div>
        </div>`;
      qList.appendChild(div);
    });
  }

  // --- Refreshers
  async function refreshSkills() {
    const g = Number(gradeEl?.value || 7);
    const data = await api.listSkills(g);
    renderSkills(data.skills || []);
  }

  async function refreshBanks() {
    if (!state.currentSkillId) { banksUl.innerHTML = ''; qList.innerHTML = ''; return; }
    const data = await api.listBanks(state.currentSkillId);
    renderBanks(data.banks || []);
  }

  async function refreshQuestions() {
    if (!state.currentBankId) { qList.innerHTML = ''; return; }
    const data = await api.listQuestions(state.currentBankId);
    renderQuestions(data.questions || []);
  }

  // --- Bind actions
  loadBtn?.addEventListener('click', async () => {
    try { await refreshSkills(); }
    catch (e) { console.error(e); toast(`Load skills failed: ${e.message}`, false); }
  });

  createBtn?.addEventListener('click', async (ev) => {
    ev.preventDefault();
    const name  = (nameEl?.value || '').trim();
    const unit  = Number(unitEl?.value || NaN);
    const bank  = (bankEl?.value || '').trim();
    const grade = Number(gradeEl?.value || NaN);

    if (!name || !Number.isFinite(unit) || !Number.isFinite(grade)) {
      toast('Enter: Skill name, numeric Unit, and select Grade.', false);
      return;
    }
    try {
      await api.createSkill({ name, unit, grade, default_bank_name: bank || null });
      nameEl && (nameEl.value = '');
      bankEl && (bankEl.value = '');
      toast('Skill created.');
      await refreshSkills();
    } catch (e) {
      console.error(e);
      toast(`Create failed: ${e.message}`, false);
    }
  });

  newBankBtn?.addEventListener('click', async () => {
    const nm = (bankNameEl?.value || '').trim();
    if (!state.currentSkillId) return toast('Select a skill first.', false);
    if (!nm) return toast('Enter a bank name.', false);
    try {
      await api.createBank(state.currentSkillId, nm);
      bankNameEl.value = '';
      toast('Bank created.');
      await refreshBanks();
    } catch (e) {
      console.error(e);
      toast(`Bank create failed: ${e.message}`, false);
    }
  });

  addQBtn?.addEventListener('click', async () => {
    if (!state.currentBankId || !state.currentSkillId) return toast('Select a skill and a bank first.', false);

    const type = (qType?.value || 'MCQ').toLowerCase().replace(/\s+/g, '_');
    const prompt = (qPrompt?.value || '').trim();
    const options = (qOpts?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    const ans = (qAns?.value || '').trim();
    const hints = (qHints?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    const steps = (qSteps?.value || '').split('\n').map(s => s.trim()).filter(Boolean);

    if (!prompt) return toast('Enter a question prompt.', false);

    let payload = {
      bank_id: state.currentBankId,
      skill_id: state.currentSkillId,
      question_type: type,
      question_text: prompt,
      question_data: {},
      correct_answer: null,
      hints, solution_steps: steps,
      difficulty_level: 3, points: 10
    };

    if (['mcq','true/false','true_false','multi-select','multi_select'].includes(type)) {
      payload.question_type = type.replace('/','_').replace('-','_');
      payload.question_data.options = options;
      if (payload.question_type === 'multi_select') {
        payload.correct_answer = ans.split(',').map(s => Number(s.trim())).filter(Number.isFinite);
      } else {
        const idx = Number(ans);
        if (!Number.isFinite(idx)) return toast('Answer must be option index (0-based).', false);
        payload.correct_answer = idx;
      }
    } else if (type === 'numeric') {
      const num = Number(ans);
      if (!Number.isFinite(num)) return toast('Numeric answer must be a number.', false);
      payload.correct_answer = { value: num, tolerance: 0 };
    } else if (type === 'text') {
      payload.correct_answer = { accept: [ans] };
    } else {
      return toast('Unknown question type.', false);
    }

    try {
      await api.addQuestion(payload);
      toast('Question added.');
      qPrompt.value = qOpts.value = qAns.value = qHints.value = qSteps.value = '';
      await refreshQuestions();
    } catch (e) {
      console.error(e);
      toast(`Add question failed: ${e.message}`, false);
    }
  });

  importBtn?.addEventListener('click', async () => {
    if (!state.currentBankId) return toast('Select a bank first.', false);
    const html = (importText?.value || '').trim();
    if (!html) return toast('Paste HTML first.', false);
    try {
      const r = await api.importHtml(state.currentBankId, html);
      toast(`Imported ${r.inserted} question(s).`);
      importText.value = '';
      await refreshQuestions();
    } catch (e) {
      console.error(e);
      toast(`Import failed: ${e.message}`, false);
    }
  });

  // Auto-load once (optional)
  if (loadBtn) loadBtn.click();
})();
