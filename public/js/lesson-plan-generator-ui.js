(function () {
  // Utilities
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }
  function notify(msg, type) {
    if (typeof window.showNotification === 'function') {
      window.showNotification(msg, type || 'info');
    } else {
      console.log(`[${type || 'info'}] ${msg}`);
    }
  }
  async function defaultApiCall(url, options) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options && options.headers || {}) },
      ...(options || {})
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    try { return JSON.parse(text); } catch { return text; }
  }
  const apiCall = (typeof window.apiCall === 'function') ? window.apiCall : defaultApiCall;

  function pill(text) {
    const span = document.createElement('span');
    span.className = 'inline-block px-2 py-1 text-xs rounded-full bg-gray-100 border';
    span.textContent = text;
    return span;
  }
  function list(items) {
    const ul = document.createElement('ul');
    ul.className = 'list-disc pl-5 space-y-1';
    (items || []).forEach(i => {
      const li = document.createElement('li');
      li.textContent = i;
      ul.appendChild(li);
    });
    return ul;
  }

  function renderPlan(container, plan) {
    if (!plan) { container.innerHTML = '<div class="text-gray-500">No plan to display yet.</div>'; return; }
    // Normalize: plan may be wrapped under lessonPlan or plan_data
    const lp = plan.lessonTitle ? plan : (plan.lessonPlan || plan.plan_data || plan);

    const wrapper = document.createElement('div');
    wrapper.className = 'space-y-6';

    // Header card
    const hdr = document.createElement('div');
    hdr.className = 'card p-6';
    hdr.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-xl font-bold">${lp.lessonTitle || lp.topic || 'Lesson Plan'}</h3>
          <p class="text-sm opacity-80">${lp.subject || 'Mathematics'} • ${lp.grade || ''} • ${lp.duration || 55} mins</p>
          ${lp.schemeOfWork ? `<p class="text-sm mt-1">${lp.schemeOfWork}</p>` : ''}
        </div>
        <div class="text-right">
          <div class="text-sm"><span class="font-semibold">Teacher:</span> ${lp.teacher || '—'}</div>
          <div class="text-sm"><span class="font-semibold">Date:</span> ${lp.date || '—'}</div>
          <div class="text-sm"><span class="font-semibold">Block:</span> ${lp.block || '—'}</div>
        </div>
      </div>
    `;
    wrapper.appendChild(hdr);

    // Learning objectives
    const lo = document.createElement('div');
    lo.className = 'card p-6';
    lo.innerHTML = `<h4 class="font-semibold text-lg mb-2">Learning Objectives</h4>`;
    lo.appendChild(list(lp.learningObjectives || []));
    wrapper.appendChild(lo);

    // Lesson structure
    const struct = document.createElement('div');
    struct.className = 'card p-6';
    struct.innerHTML = `<h4 class="font-semibold text-lg mb-3">Lesson Structure</h4>`;
    const table = document.createElement('table');
    table.className = 'w-full text-sm border';
    table.innerHTML = `
      <thead class="bg-gray-50">
        <tr>
          <th class="p-2 text-left border">Timing</th>
          <th class="p-2 text-left border">Section</th>
          <th class="p-2 text-left border">Student Activity</th>
          <th class="p-2 text-left border">Teacher Activity</th>
        </tr>
      </thead>
      <tbody></tbody>`;
    const tbody = $('tbody', table);
    (lp.sections || []).forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="align-top p-2 border">${s.timing || ''}</td>
        <td class="align-top p-2 border font-semibold">${s.title || ''}</td>
        <td class="align-top p-2 border">${s.studentActivity || ''}</td>
        <td class="align-top p-2 border">${s.teacherActivity || ''}</td>
      `;
      tbody.appendChild(tr);
    });
    struct.appendChild(table);
    wrapper.appendChild(struct);

    // Differentiation
    const diff = document.createElement('div');
    diff.className = 'card p-6';
    diff.innerHTML = `<h4 class="font-semibold text-lg mb-3">Differentiation</h4>`;
    const lowWrap = document.createElement('div');
    lowWrap.innerHTML = `<div class="font-semibold mb-1">Low/Medium Ability</div>`;
    lowWrap.appendChild(list((lp.differentiation && lp.differentiation.lowMedium) || []));
    const highWrap = document.createElement('div');
    highWrap.className = 'mt-4';
    highWrap.innerHTML = `<div class="font-semibold mb-1">High Ability</div>`;
    highWrap.appendChild(list((lp.differentiation && lp.differentiation.highAbility) || []));
    diff.appendChild(lowWrap);
    diff.appendChild(highWrap);
    wrapper.appendChild(diff);

    // Assessment Focus + Resources + Vocabulary
    const meta = document.createElement('div');
    meta.className = 'grid md:grid-cols-3 gap-4';
    const assess = document.createElement('div');
    assess.className = 'card p-6';
    assess.innerHTML = `<h4 class="font-semibold text-lg mb-2">Assessment Focus</h4>`;
    (lp.assessmentFocus || []).forEach(x => assess.appendChild(pill(x)));
    const res = document.createElement('div');
    res.className = 'card p-6';
    res.innerHTML = `<h4 class="font-semibold text-lg mb-2">Resources</h4>`;
    (lp.resources || []).forEach(x => res.appendChild(pill(x)));
    const kv = document.createElement('div');
    kv.className = 'card p-6';
    kv.innerHTML = `<h4 class="font-semibold text-lg mb-2">Key Vocabulary</h4>`;
    (lp.keyVocabulary || []).forEach(x => kv.appendChild(pill(x)));
    meta.appendChild(assess); meta.appendChild(res); meta.appendChild(kv);
    wrapper.appendChild(meta);

    // Homework
    const hw = document.createElement('div');
    hw.className = 'card p-6';
    hw.innerHTML = `<h4 class="font-semibold text-lg mb-2">Homework</h4><p>${lp.homework || '—'}</p>`;
    wrapper.appendChild(hw);

    container.innerHTML = '';
    container.appendChild(wrapper);
  }

  async function init() {
    const main = document.querySelector('main');
    const tabsBar = document.querySelector('.nav-tabs');
    if (!main || !tabsBar) return console.warn('Teacher Portal shell not found');

    // Insert the new tab button (before Sign out if present)
    const btn = document.createElement('button');
    btn.className = 'nav-tab';
    btn.dataset.tab = 'plan-gen';
    btn.innerHTML = '<i class="fas fa-lightbulb mr-2"></i>Plan Generator';
    const signOutBtn = $('#logoutBtn', tabsBar);
    tabsBar.insertBefore(btn, signOutBtn || null);

    // Create the tab content section
    const section = document.createElement('section');
    section.id = 'plan-gen-tab';
    section.className = 'tab-content hidden';
    section.innerHTML = `
      <div class="grid gap-6 md:grid-cols-2">
        <div class="space-y-6">
          <div class="card p-6">
            <h3 class="font-bold text-lg mb-4"><i class="fas fa-magic mr-2 text-[var(--gold)]"></i>Create Lesson Plan</h3>
            <div class="grid gap-3">
              <label class="text-sm">
                Topic <span class="text-red-500">*</span>
                <input id="lp-topic" class="rounded-lg border px-3 py-2 w-full" placeholder="e.g., Linear Equations in One Variable"/>
              </label>
              <label class="text-sm">
                Learning Outcomes <span class="text-red-500">*</span>
                <textarea id="lp-outcomes" rows="4" class="rounded-lg border px-3 py-2 w-full" placeholder="One outcome per line&#10;E.g. Solve linear equations with integer coefficients&#10;Interpret solutions in context"></textarea>
              </label>
              <div class="grid grid-cols-3 gap-3">
                <label class="text-sm">
                  Grade
                  <select id="lp-grade" class="rounded-lg border px-3 py-2 w-full">
                    <option>7</option><option>8</option><option>9</option><option>10</option><option>11</option><option>12</option>
                  </select>
                </label>
                <label class="text-sm">
                  Duration (min)
                  <input id="lp-duration" type="number" min="30" max="120" value="55" class="rounded-lg border px-3 py-2 w-full"/>
                </label>
                <label class="text-sm">
                  Teacher
                  <input id="lp-teacher" class="rounded-lg border px-3 py-2 w-full" placeholder="Auto-filled"/>
                </label>
              </div>
              <div class="flex items-center gap-3">
                <button id="lp-generate" class="bg-[var(--gold)] text-white px-4 py-2 rounded-lg hover:opacity-90">
                  <i class="fas fa-wand-magic-sparkles mr-2"></i>Generate Plan
                </button>
                <button id="lp-download" class="bg-[var(--maroon)] text-white px-4 py-2 rounded-lg hover:opacity-90" disabled>
                  <i class="fas fa-file-word mr-2"></i>Download DOCX
                </button>
              </div>
              <p class="text-xs text-gray-500">The generated plan is student-centered and follows the QLA template. Your plans are saved to your history automatically.</p>
            </div>
          </div>

          <div class="card p-6">
            <h3 class="font-bold text-lg mb-4"><i class="fas fa-clock-rotate-left mr-2 text-[var(--gold)]"></i>Recent Plans</h3>
            <div id="lp-history" class="space-y-2"></div>
          </div>
        </div>

        <div class="space-y-6">
          <div class="card p-6">
            <h3 class="font-bold text-lg mb-4"><i class="fas fa-eye mr-2 text-[var(--gold)]"></i>Preview</h3>
            <div id="lp-preview" class="space-y-4 text-sm"></div>
          </div>
        </div>
      </div>
    `;
    main.appendChild(section);

    function activateTab() {
      // Deactivate existing
      $all('.nav-tab').forEach(b => b.classList.remove('active'));
      $all('.tab-content').forEach(s => s.classList.add('hidden'));
      // Activate ours
      btn.classList.add('active');
      section.classList.remove('hidden');
    }
    btn.addEventListener('click', activateTab);

    // Autofill teacher name/email
    try {
      const me = await apiCall('/api/auth/me');
      const t = $('#lp-teacher', section);
      t.value = (me && me.user && me.user.email) ? me.user.email : 'Teacher';
    } catch { /* ignore */ }

    // Wire up actions
    const previewEl = $('#lp-preview', section);
    const historyEl = $('#lp-history', section);
    const genBtn = $('#lp-generate', section);
    const dlBtn = $('#lp-download', section);
    let currentPlan = null;

    async function loadHistory() {
      try {
        const items = await apiCall('/api/lesson-plan-generator/history');
        historyEl.innerHTML = '';
        if (!items || !items.length) {
          historyEl.innerHTML = '<div class="text-gray-500 text-sm">No generated plans yet.</div>';
          return;
        }
        items.forEach(row => {
          const card = document.createElement('div');
          card.className = 'border rounded-lg p-3 hover:bg-gray-50 cursor-pointer';
          const when = new Date(row.created_at || row.createdAt || Date.now());
          card.innerHTML = `
            <div class="flex items-center justify-between">
              <div>
                <div class="font-semibold">${row.topic}</div>
                <div class="text-xs opacity-70">Grade ${row.grade} • ${when.toLocaleString()}</div>
              </div>
              <div class="text-[var(--gold)]"><i class="fas fa-arrow-right"></i></div>
            </div>`;
          card.addEventListener('click', async () => {
            try {
              const full = await apiCall(`/api/lesson-plan-generator/${row.id}`);
              const plan = full.plan_data || full.lessonPlan || full;
              currentPlan = plan;
              renderPlan(previewEl, plan);
              dlBtn.disabled = false;
              activateTab(); // stay on our tab
              notify('Loaded plan from history', 'success');
            } catch (e) {
              console.error(e);
              notify('Failed to load saved plan', 'error');
            }
          });
          historyEl.appendChild(card);
        });
      } catch (e) {
        console.error(e);
        historyEl.innerHTML = '<div class="text-red-600 text-sm">Failed to load history.</div>';
      }
    }

    genBtn.addEventListener('click', async () => {
      const topic = ($('#lp-topic', section).value || '').trim();
      const outcomesText = ($('#lp-outcomes', section).value || '').trim();
      const grade = parseInt($('#lp-grade', section).value || '7', 10);
      const duration = parseInt($('#lp-duration', section).value || '55', 10);
      const teacherName = ($('#lp-teacher', section).value || '').trim() || 'Teacher';

      if (!topic) { notify('Topic is required', 'error'); return; }
      if (!outcomesText) { notify('Please enter at least one learning outcome', 'error'); return; }

      genBtn.disabled = true;
      genBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
      try {
        const payload = { topic, learningOutcomes: outcomesText, grade, duration, teacherName };
        const res = await apiCall('/api/lesson-plan-generator/generate', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const plan = res.lessonPlan || res.plan_data || res;
        currentPlan = plan;
        renderPlan(previewEl, plan);
        dlBtn.disabled = false;
        await loadHistory();
        notify('Lesson plan generated successfully', 'success');
      } catch (e) {
        console.error(e);
        notify('Generation failed', 'error');
      } finally {
        genBtn.disabled = false;
        genBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles mr-2"></i>Generate Plan';
      }
    });

    dlBtn.addEventListener('click', async () => {
      if (!currentPlan) { notify('Nothing to download yet', 'error'); return; }
      try {
        dlBtn.disabled = true;
        dlBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Preparing DOCX...';
        const res = await fetch('/api/lesson-plan-export/export-docx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonPlan: currentPlan })
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safe = (currentPlan.lessonTitle || currentPlan.topic || 'lesson-plan').replace(/[^a-z0-9]+/gi, '_');
        a.href = url; a.download = `lesson-plan-${safe}.docx`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        notify('Download started', 'success');
      } catch (e) {
        console.error(e);
        notify('Export failed', 'error');
      } finally {
        dlBtn.disabled = false;
        dlBtn.innerHTML = '<i class="fas fa-file-word mr-2"></i>Download DOCX';
      }
    });

    // Initial load
    await loadHistory();
    console.log('Lesson Plan Generator tab ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();