// Teacher Practice Fix - Proper event handling and error reporting
(function() {
  // Only run on teacher portal
  if (!document.title || !/Teacher Portal/i.test(document.title)) return;

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTeacherPractice);
  } else {
    initTeacherPractice();
  }

  function initTeacherPractice() {
    console.log('[Teacher Practice] Initializing...');
    
    // Check if Practice tab already exists
    const existingTab = document.querySelector('[data-tab="practice"]');
    if (!existingTab) {
      console.log('[Teacher Practice] Adding Practice tab...');
      addPracticeTab();
    }
    
    // Setup event delegation for dynamic elements
    setupEventDelegation();
    
    // Add global error handler for debugging
    window.addEventListener('error', function(e) {
      if (e.message && e.message.includes('practice')) {
        console.error('[Teacher Practice Error]', e);
      }
    });
  }

  function addPracticeTab() {
    // Add tab button
    const nav = document.querySelector('.nav-tabs');
    if (nav && !nav.querySelector('[data-tab="practice"]')) {
      const btn = document.createElement('button');
      btn.className = 'nav-tab';
      btn.dataset.tab = 'practice';
      btn.innerHTML = '<i class="fas fa-lightbulb mr-2"></i>Practice';
      
      // Insert before Classes tab
      const classesTab = nav.querySelector('[data-tab="classes"]');
      if (classesTab) {
        nav.insertBefore(btn, classesTab);
      } else {
        nav.appendChild(btn);
      }
      
      // Add click handler
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        switchToTab('practice');
      });
    }
    
    // Add tab content
    const main = document.querySelector('main');
    if (main && !document.getElementById('practice-tab')) {
      const practiceSection = createPracticeSection();
      main.appendChild(practiceSection);
    }
  }

  function createPracticeSection() {
    const section = document.createElement('section');
    section.id = 'practice-tab';
    section.className = 'tab-content hidden';
    section.innerHTML = `
      <div class="grid gap-6 md:grid-cols-12">
        <!-- Skills Panel -->
        <div class="md:col-span-4">
          <div class="card p-4">
            <div class="font-bold mb-2">Skills Management</div>
            <div class="text-sm text-slate-600 mb-2">Create and manage practice skills</div>
            
            <!-- Grade selector and load button -->
            <div class="grid gap-2 mb-3">
              <div class="flex gap-2">
                <label class="text-sm flex items-center">Grade 
                  <select id="tSkillGrade" class="rounded border px-2 py-1 ml-2">
                    <option value="7">7</option>
                    <option value="8">8</option>
                  </select>
                </label>
                <button id="loadSkillsBtn" class="bg-[#1d4ed8] text-white px-3 py-1 rounded text-sm">
                  Load Skills
                </button>
              </div>
              
              <!-- Skills list -->
              <div id="tSkillsList" class="space-y-2 max-h-[40vh] overflow-y-auto border rounded p-2">
                <div class="text-sm text-gray-500">Click "Load Skills" to view existing skills</div>
              </div>
            </div>
            
            <!-- Create new skill form -->
            <div class="border-t pt-3 mt-3">
              <div class="font-semibold mb-2">Create New Skill</div>
              <div class="grid gap-2">
                <input id="tSkillName" class="rounded border px-2 py-1" placeholder="Skill name (required)" />
                <input id="tSkillUnit" type="number" min="1" class="rounded border px-2 py-1" placeholder="Unit number (required)" />
                <textarea id="tSkillDesc" class="rounded border px-2 py-1" rows="2" placeholder="Description (optional)"></textarea>
                <button id="tCreateSkillBtn" class="bg-[#136f3a] text-white px-3 py-2 rounded hover:opacity-90">
                  <i class="fas fa-plus mr-1"></i> Create Skill
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Question Banks Panel -->
        <div class="md:col-span-8">
          <div class="card p-4">
            <div class="font-bold mb-2">Question Banks</div>
            <div id="tBanksHeader" class="flex gap-2 items-center mb-2">
              <button id="tCreateBankBtn" class="bg-[#1d4ed8] text-white px-3 py-1 rounded text-sm">
                New Bank
              </button>
              <span id="tBankMeta" class="text-sm text-slate-600">Select a skill first</span>
            </div>
            <div id="tBanksList" class="space-y-2 mb-3 min-h-[100px] border rounded p-2">
              <div class="text-sm text-gray-500">Banks will appear here after selecting a skill</div>
            </div>
            
            <!-- Add Question Form -->
            <div class="border-t pt-3">
              <div class="font-semibold mb-2">Add Question to Selected Bank</div>
              <div class="grid gap-2">
                <select id="tQType" class="rounded border px-2 py-1">
                  <option value="mcq">Multiple Choice</option>
                  <option value="true_false">True/False</option>
                  <option value="multi_select">Multi-select</option>
                  <option value="numeric">Numeric</option>
                  <option value="text">Text</option>
                </select>
                <textarea id="tQPrompt" class="rounded border px-2 py-1" rows="2" placeholder="Question text"></textarea>
                <textarea id="tQOptions" class="rounded border px-2 py-1" rows="2" placeholder="Options (one per line, for MCQ/Multi/TF)"></textarea>
                <input id="tQAnswer" class="rounded border px-2 py-1" placeholder="Answer (index for MCQ, indices for multi, number, or text)" />
                <textarea id="tQHints" class="rounded border px-2 py-1" rows="2" placeholder="Hints (one per line, optional)"></textarea>
                <textarea id="tQSteps" class="rounded border px-2 py-1" rows="2" placeholder="Solution steps (one per line, optional)"></textarea>
                <div class="grid grid-cols-3 gap-2">
                  <input id="tQDiff" type="number" min="1" max="5" value="3" class="rounded border px-2 py-1" placeholder="Difficulty 1-5" />
                  <input id="tQPoints" type="number" min="1" value="10" class="rounded border px-2 py-1" placeholder="Points" />
                  <button id="tAddQuestionBtn" class="bg-[#136f3a] text-white px-3 py-1 rounded text-sm">Add Question</button>
                </div>
              </div>
            </div>
            
            <!-- Questions List -->
            <div id="tQuestionsList" class="mt-4 space-y-2"></div>
          </div>
        </div>
      </div>
      
      <!-- Status messages -->
      <div id="practiceStatus" class="mt-4"></div>
    `;
    
    return section;
  }

  function switchToTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.add('hidden');
    });
    
    // Show selected tab
    const targetTab = document.getElementById(tabName + '-tab');
    if (targetTab) {
      targetTab.classList.remove('hidden');
    }
    
    // Update nav buttons
    document.querySelectorAll('.nav-tab').forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function setupEventDelegation() {
    // Use event delegation for dynamically created elements
    document.addEventListener('click', async function(e) {
      // Create Skill button
      if (e.target.id === 'tCreateSkillBtn' || e.target.closest('#tCreateSkillBtn')) {
        e.preventDefault();
        console.log('[Teacher Practice] Create skill clicked');
        await handleCreateSkill();
      }
      
      // Load Skills button
      if (e.target.id === 'loadSkillsBtn' || e.target.closest('#loadSkillsBtn')) {
        e.preventDefault();
        console.log('[Teacher Practice] Load skills clicked');
        await handleLoadSkills();
      }
      
      // Create Bank button
      if (e.target.id === 'tCreateBankBtn' || e.target.closest('#tCreateBankBtn')) {
        e.preventDefault();
        console.log('[Teacher Practice] Create bank clicked');
        await handleCreateBank();
      }
      
      // Add Question button
      if (e.target.id === 'tAddQuestionBtn' || e.target.closest('#tAddQuestionBtn')) {
        e.preventDefault();
        console.log('[Teacher Practice] Add question clicked');
        await handleAddQuestion();
      }
      
      // Skill selection
      if (e.target.closest('.skill-item')) {
        e.preventDefault();
        const skillItem = e.target.closest('.skill-item');
        await handleSelectSkill(skillItem);
      }
      
      // Bank selection
      if (e.target.closest('.bank-item')) {
        e.preventDefault();
        const bankItem = e.target.closest('.bank-item');
        await handleSelectBank(bankItem);
      }
    });
  }

  // State management
  const state = {
    selectedSkill: null,
    selectedBank: null,
    skills: [],
    banks: []
  };

  async function handleCreateSkill() {
    try {
      const name = document.getElementById('tSkillName')?.value.trim();
      const unit = parseInt(document.getElementById('tSkillUnit')?.value);
      const grade = parseInt(document.getElementById('tSkillGrade')?.value) || 7;
      const description = document.getElementById('tSkillDesc')?.value.trim();
      
      console.log('[Teacher Practice] Creating skill:', { name, unit, grade, description });
      
      // Validation
      if (!name) {
        showStatus('Please enter a skill name', 'error');
        return;
      }
      
      if (!unit || unit < 1) {
        showStatus('Please enter a valid unit number', 'error');
        return;
      }
      
      // Show loading state
      const btn = document.getElementById('tCreateSkillBtn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Creating...';
      btn.disabled = true;
      
      // Make API call
      const response = await fetch('/api/teacher/practice/skills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          unit,
          grade,
          description
        })
      });
      
      const data = await response.json();
      console.log('[Teacher Practice] Response:', data);
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create skill');
      }
      
      // Success
      showStatus(`Skill "${name}" created successfully!`, 'success');
      
      // Clear form
      document.getElementById('tSkillName').value = '';
      document.getElementById('tSkillUnit').value = '';
      document.getElementById('tSkillDesc').value = '';
      
      // Reload skills
      await handleLoadSkills();
      
    } catch (error) {
      console.error('[Teacher Practice] Error creating skill:', error);
      showStatus(`Error: ${error.message}`, 'error');
    } finally {
      // Reset button
      const btn = document.getElementById('tCreateSkillBtn');
      if (btn) {
        btn.innerHTML = '<i class="fas fa-plus mr-1"></i> Create Skill';
        btn.disabled = false;
      }
    }
  }

  async function handleLoadSkills() {
    try {
      const grade = parseInt(document.getElementById('tSkillGrade')?.value) || 7;
      console.log('[Teacher Practice] Loading skills for grade:', grade);
      
      const response = await fetch(`/api/teacher/practice/skills?grade=${grade}`);
      const data = await response.json();
      
      console.log('[Teacher Practice] Loaded skills:', data);
      
      const skills = data.skills || data || [];
      state.skills = skills;
      
      const listEl = document.getElementById('tSkillsList');
      if (!listEl) return;
      
      if (skills.length === 0) {
        listEl.innerHTML = '<div class="text-sm text-gray-500 p-2">No skills found. Create one above.</div>';
        return;
      }
      
      listEl.innerHTML = '';
      skills.forEach(skill => {
        const item = document.createElement('div');
        item.className = 'skill-item interactive-row cursor-pointer p-2 hover:bg-gray-50';
        item.dataset.skillId = skill.id;
        item.dataset.skill = JSON.stringify(skill);
        item.innerHTML = `
          <div>
            <div class="font-semibold">${skill.name}</div>
            <div class="text-xs text-gray-600">Unit ${skill.unit} ${skill.description ? '• ' + skill.description : ''}</div>
          </div>
        `;
        listEl.appendChild(item);
      });
      
      showStatus(`Loaded ${skills.length} skill(s)`, 'info');
      
    } catch (error) {
      console.error('[Teacher Practice] Error loading skills:', error);
      showStatus(`Error loading skills: ${error.message}`, 'error');
    }
  }

  async function handleSelectSkill(skillItem) {
    try {
      const skill = JSON.parse(skillItem.dataset.skill);
      state.selectedSkill = skill;
      
      console.log('[Teacher Practice] Selected skill:', skill);
      
      // Highlight selected skill
      document.querySelectorAll('.skill-item').forEach(item => {
        item.classList.remove('ring-2', 'ring-[#C7A34F]');
      });
      skillItem.classList.add('ring-2', 'ring-[#C7A34F]');
      
      // Update bank meta
      document.getElementById('tBankMeta').textContent = `Banks for "${skill.name}"`;
      
      // Load banks for this skill
      await loadBanks(skill.id);
      
    } catch (error) {
      console.error('[Teacher Practice] Error selecting skill:', error);
      showStatus(`Error: ${error.message}`, 'error');
    }
  }

  async function loadBanks(skillId) {
    try {
      console.log('[Teacher Practice] Loading banks for skill:', skillId);
      
      const response = await fetch(`/api/teacher/practice/banks?skill_id=${skillId}`);
      const data = await response.json();
      
      const banks = data.banks || data || [];
      state.banks = banks;
      
      const listEl = document.getElementById('tBanksList');
      if (!listEl) return;
      
      if (banks.length === 0) {
        listEl.innerHTML = '<div class="text-sm text-gray-500 p-2">No banks found. Create one using the button above.</div>';
        return;
      }
      
      listEl.innerHTML = '';
      banks.forEach(bank => {
        const item = document.createElement('div');
        item.className = 'bank-item interactive-row cursor-pointer p-2 hover:bg-gray-50';
        item.dataset.bankId = bank.id;
        item.dataset.bank = JSON.stringify(bank);
        item.innerHTML = `
          <div class="flex justify-between items-center">
            <div>
              <div class="font-semibold">${bank.title || bank.name}</div>
              <div class="text-xs text-gray-600">${bank.question_count || 0} questions • ${bank.difficulty || 'medium'}</div>
            </div>
            <span class="text-xs px-2 py-1 rounded ${bank.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">
              ${bank.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        `;
        listEl.appendChild(item);
      });
      
    } catch (error) {
      console.error('[Teacher Practice] Error loading banks:', error);
      showStatus(`Error loading banks: ${error.message}`, 'error');
    }
  }

  async function handleSelectBank(bankItem) {
    try {
      const bank = JSON.parse(bankItem.dataset.bank);
      state.selectedBank = bank;
      
      console.log('[Teacher Practice] Selected bank:', bank);
      
      // Highlight selected bank
      document.querySelectorAll('.bank-item').forEach(item => {
        item.classList.remove('ring-2', 'ring-[#C7A34F]');
      });
      bankItem.classList.add('ring-2', 'ring-[#C7A34F]');
      
      // Load questions for this bank
      await loadQuestions(bank.id);
      
    } catch (error) {
      console.error('[Teacher Practice] Error selecting bank:', error);
      showStatus(`Error: ${error.message}`, 'error');
    }
  }

  async function loadQuestions(bankId) {
    try {
      console.log('[Teacher Practice] Loading questions for bank:', bankId);
      
      const response = await fetch(`/api/teacher/practice/banks/${bankId}/questions`);
      const data = await response.json();
      
      const questions = data.questions || data || [];
      
      const listEl = document.getElementById('tQuestionsList');
      if (!listEl) return;
      
      if (questions.length === 0) {
        listEl.innerHTML = '<div class="text-sm text-gray-500 p-2">No questions in this bank yet.</div>';
        return;
      }
      
      listEl.innerHTML = '<div class="font-semibold mb-2">Questions in Bank:</div>';
      questions.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = 'card p-3 mb-2';
        item.innerHTML = `
          <div class="text-xs text-gray-600 mb-1">
            #${index + 1} • ${q.question_type} • Difficulty ${q.difficulty_level} • ${q.points} pts
          </div>
          <div class="font-semibold">${q.question_text || 'No text'}</div>
        `;
        listEl.appendChild(item);
      });
      
    } catch (error) {
      console.error('[Teacher Practice] Error loading questions:', error);
      showStatus(`Error loading questions: ${error.message}`, 'error');
    }
  }

  async function handleCreateBank() {
    try {
      if (!state.selectedSkill) {
        showStatus('Please select a skill first', 'error');
        return;
      }
      
      const title = prompt('Enter bank title:', `${state.selectedSkill.name} - Practice Bank`);
      if (!title) return;
      
      console.log('[Teacher Practice] Creating bank:', title);
      
      const response = await fetch('/api/teacher/practice/banks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          skill_id: state.selectedSkill.id,
          title: title
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create bank');
      }
      
      showStatus('Bank created successfully!', 'success');
      await loadBanks(state.selectedSkill.id);
      
    } catch (error) {
      console.error('[Teacher Practice] Error creating bank:', error);
      showStatus(`Error: ${error.message}`, 'error');
    }
  }

  async function handleAddQuestion() {
    try {
      if (!state.selectedSkill || !state.selectedBank) {
        showStatus('Please select a skill and bank first', 'error');
        return;
      }
      
      const qtype = document.getElementById('tQType')?.value;
      const prompt = document.getElementById('tQPrompt')?.value.trim();
      const rawOpts = document.getElementById('tQOptions')?.value;
      const rawAns = document.getElementById('tQAnswer')?.value.trim();
      const hints = document.getElementById('tQHints')?.value.trim().split('\n').filter(Boolean);
      const steps = document.getElementById('tQSteps')?.value.trim().split('\n').filter(Boolean);
      const diff = parseInt(document.getElementById('tQDiff')?.value) || 3;
      const points = parseInt(document.getElementById('tQPoints')?.value) || 10;
      
      if (!prompt) {
        showStatus('Please enter question text', 'error');
        return;
      }
      
      let question_data = {};
      let correct_answer = null;
      
      if (qtype === 'mcq' || qtype === 'true_false' || qtype === 'multi_select') {
        const options = rawOpts.split('\n').filter(Boolean);
        question_data.options = options;
        
        if (qtype === 'multi_select') {
          correct_answer = rawAns.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        } else {
          correct_answer = parseInt(rawAns);
        }
      } else if (qtype === 'numeric') {
        question_data = { format: 'number' };
        correct_answer = { value: parseFloat(rawAns), tolerance: 0 };
      } else if (qtype === 'text') {
        question_data = {};
        correct_answer = { accept: [rawAns] };
      }
      
      console.log('[Teacher Practice] Adding question:', { qtype, prompt, question_data, correct_answer });
      
      const response = await fetch('/api/teacher/practice/questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add question');
      }
      
      showStatus('Question added successfully!', 'success');
      
      // Clear form
      document.getElementById('tQPrompt').value = '';
      document.getElementById('tQOptions').value = '';
      document.getElementById('tQAnswer').value = '';
      document.getElementById('tQHints').value = '';
      document.getElementById('tQSteps').value = '';
      
      // Reload questions
      await loadQuestions(state.selectedBank.id);
      
    } catch (error) {
      console.error('[Teacher Practice] Error adding question:', error);
      showStatus(`Error: ${error.message}`, 'error');
    }
  }

  function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('practiceStatus');
    if (!statusEl) {
      console.log(`[Status ${type}] ${message}`);
      return;
    }
    
    const colors = {
      success: 'bg-green-100 text-green-800 border-green-300',
      error: 'bg-red-100 text-red-800 border-red-300',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      info: 'bg-blue-100 text-blue-800 border-blue-300'
    };
    
    const alert = document.createElement('div');
    alert.className = `p-3 rounded border ${colors[type] || colors.info} mb-2`;
    alert.innerHTML = `
      <div class="flex items-center justify-between">
        <span>${message}</span>
        <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-2xl leading-none">&times;</button>
      </div>
    `;
    
    statusEl.appendChild(alert);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      alert.remove();
    }, 5000);
  }

  // Initialize on load
  console.log('[Teacher Practice] Script loaded and ready');
})();
