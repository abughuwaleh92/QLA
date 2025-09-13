// Teacher Practice UI - Fixed Version
// This file properly handles the Practice tab functionality in the Teacher Portal

(function() {
  'use strict';
  
  // Only run on teacher portal
  if (!document.title || !document.title.includes('Teacher Portal')) return;

  // API helper
  async function apiCall(url, options = {}) {
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });
      
      const text = await response.text();
      
      if (!response.ok) {
        throw new Error(text || `HTTP ${response.status}`);
      }
      
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Show notification
  function showNotification(message, type = 'info') {
    console.log(`[${type}] ${message}`);
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      font-weight: 600;
      z-index: 9999;
      max-width: 400px;
      animation: slideIn 0.3s ease;
    `;
    
    const colors = {
      success: '#136f3a',
      error: '#dc2626',
      warning: '#f59e0b',
      info: '#3b82f6'
    };
    
    notification.style.backgroundColor = colors[type] || colors.info;
    notification.style.color = 'white';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // State management
  const state = {
    skills: [],
    selectedSkill: null,
    banks: [],
    selectedBank: null,
    questions: []
  };

  // Load skills
  async function loadSkills() {
    console.log('Loading skills...');
    const gradeSelect = document.getElementById('tSkillGrade');
    const grade = gradeSelect ? gradeSelect.value : '7';
    
    try {
      const response = await apiCall(`/api/teacher/practice/skills?grade=${grade}`);
      state.skills = response.skills || response || [];
      renderSkills();
      showNotification(`Loaded ${state.skills.length} skills`, 'success');
    } catch (error) {
      showNotification('Failed to load skills: ' + error.message, 'error');
      console.error('Load skills error:', error);
    }
  }

  // Render skills list
  function renderSkills() {
    const skillsList = document.getElementById('tSkillsList');
    if (!skillsList) return;
    
    skillsList.innerHTML = '';
    
    if (state.skills.length === 0) {
      skillsList.innerHTML = '<div class="text-gray-500 text-sm">No skills found. Create one to get started.</div>';
      return;
    }
    
    state.skills.forEach(skill => {
      const skillDiv = document.createElement('div');
      skillDiv.className = 'interactive-row cursor-pointer p-3 border rounded-lg mb-2 hover:bg-gray-50';
      skillDiv.innerHTML = `
        <div>
          <div class="font-semibold">${skill.name}</div>
          <div class="text-xs text-gray-600">Unit ${skill.unit}</div>
        </div>
      `;
      
      skillDiv.addEventListener('click', () => selectSkill(skill));
      skillsList.appendChild(skillDiv);
    });
  }

  // Select a skill
  async function selectSkill(skill) {
    state.selectedSkill = skill;
    console.log('Selected skill:', skill);
    
    // Highlight selected skill
    document.querySelectorAll('#tSkillsList .interactive-row').forEach(row => {
      row.classList.remove('ring-2', 'ring-[#C7A34F]');
    });
    event.currentTarget.classList.add('ring-2', 'ring-[#C7A34F]');
    
    // Update bank header
    const bankMeta = document.getElementById('tBankMeta');
    if (bankMeta) {
      bankMeta.textContent = `Banks for "${skill.name}"`;
    }
    
    // Load banks for this skill
    await loadBanks();
  }

  // Create new skill
  async function createSkill() {
    console.log('Creating skill...');
    
    const nameInput = document.getElementById('tSkillName');
    const unitInput = document.getElementById('tSkillUnit');
    const descInput = document.getElementById('tSkillDesc');
    const gradeSelect = document.getElementById('tSkillGrade');
    
    const name = nameInput ? nameInput.value.trim() : '';
    const unit = unitInput ? parseInt(unitInput.value) : null;
    const description = descInput ? descInput.value.trim() : '';
    const grade = gradeSelect ? parseInt(gradeSelect.value) : 7;
    
    // Validation
    if (!name) {
      showNotification('Please enter a skill name', 'warning');
      return;
    }
    
    if (!unit || isNaN(unit) || unit < 1 || unit > 20) {
      showNotification('Unit must be a number between 1 and 20', 'warning');
      return;
    }
    
    try {
      const payload = {
        name: name,
        unit: unit,
        grade: grade,
        description: description || null,
        default_bank_name: `${name} - Practice Bank`
      };
      
      console.log('Sending payload:', payload);
      
      const response = await apiCall('/api/teacher/practice/skills', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      console.log('Create response:', response);
      
      // Clear form
      if (nameInput) nameInput.value = '';
      if (unitInput) unitInput.value = '';
      if (descInput) descInput.value = '';
      
      showNotification(`Skill "${name}" created successfully!`, 'success');
      
      // Reload skills list
      await loadSkills();
      
    } catch (error) {
      showNotification('Failed to create skill: ' + error.message, 'error');
      console.error('Create skill error:', error);
    }
  }

  // Load banks for selected skill
  async function loadBanks() {
    if (!state.selectedSkill) {
      state.banks = [];
      renderBanks();
      return;
    }
    
    try {
      const response = await apiCall(`/api/teacher/practice/banks?skillId=${state.selectedSkill.id}`);
      state.banks = response.banks || response || [];
      renderBanks();
    } catch (error) {
      showNotification('Failed to load banks: ' + error.message, 'error');
      console.error('Load banks error:', error);
    }
  }

  // Render banks list
  function renderBanks() {
    const banksList = document.getElementById('tBanksList');
    if (!banksList) return;
    
    banksList.innerHTML = '';
    
    if (state.banks.length === 0) {
      banksList.innerHTML = '<div class="text-gray-500 text-sm">No banks found. Create one to add questions.</div>';
      return;
    }
    
    state.banks.forEach(bank => {
      const bankDiv = document.createElement('div');
      bankDiv.className = 'interactive-row cursor-pointer p-3 border rounded-lg mb-2 hover:bg-gray-50';
      bankDiv.innerHTML = `
        <div>
          <div class="font-semibold">${bank.name || bank.title}</div>
          <div class="text-xs text-gray-600">Bank ID: ${bank.id}</div>
        </div>
      `;
      
      bankDiv.addEventListener('click', () => selectBank(bank));
      banksList.appendChild(bankDiv);
    });
  }

  // Select a bank
  async function selectBank(bank) {
    state.selectedBank = bank;
    console.log('Selected bank:', bank);
    
    // Highlight selected bank
    document.querySelectorAll('#tBanksList .interactive-row').forEach(row => {
      row.classList.remove('ring-2', 'ring-[#C7A34F]');
    });
    event.currentTarget.classList.add('ring-2', 'ring-[#C7A34F]');
    
    // Load questions for this bank
    await loadQuestions();
  }

  // Create new bank
  async function createBank() {
    if (!state.selectedSkill) {
      showNotification('Please select a skill first', 'warning');
      return;
    }
    
    const name = prompt('Enter bank name:', `${state.selectedSkill.name} - Practice Bank`);
    if (!name) return;
    
    try {
      const response = await apiCall('/api/teacher/practice/banks', {
        method: 'POST',
        body: JSON.stringify({
          skill_id: state.selectedSkill.id,
          name: name
        })
      });
      
      showNotification(`Bank "${name}" created successfully!`, 'success');
      await loadBanks();
      
    } catch (error) {
      showNotification('Failed to create bank: ' + error.message, 'error');
      console.error('Create bank error:', error);
    }
  }

  // Load questions for selected bank
  async function loadQuestions() {
    if (!state.selectedBank) {
      state.questions = [];
      renderQuestions();
      return;
    }
    
    try {
      const response = await apiCall(`/api/teacher/practice/banks/${state.selectedBank.id}/questions`);
      state.questions = response.questions || response || [];
      renderQuestions();
    } catch (error) {
      showNotification('Failed to load questions: ' + error.message, 'error');
      console.error('Load questions error:', error);
    }
  }

  // Render questions list
  function renderQuestions() {
    const questionsList = document.getElementById('tQuestionsList');
    if (!questionsList) return;
    
    questionsList.innerHTML = '';
    
    if (state.questions.length === 0) {
      questionsList.innerHTML = '<div class="text-gray-500 text-sm">No questions in this bank yet.</div>';
      return;
    }
    
    state.questions.forEach((question, index) => {
      const questionDiv = document.createElement('div');
      questionDiv.className = 'card p-3 mb-2';
      questionDiv.innerHTML = `
        <div class="text-xs text-gray-600 mb-1">
          ${question.question_type.toUpperCase()} • Difficulty ${question.difficulty_level || 3} • ${question.points || 10} pts
        </div>
        <div class="font-semibold">${question.question_text}</div>
      `;
      questionsList.appendChild(questionDiv);
    });
  }

  // Add question
  async function addQuestion() {
    if (!state.selectedSkill || !state.selectedBank) {
      showNotification('Please select a skill and bank first', 'warning');
      return;
    }
    
    const typeSelect = document.getElementById('tQType');
    const promptInput = document.getElementById('tQPrompt');
    const optionsInput = document.getElementById('tQOptions');
    const answerInput = document.getElementById('tQAnswer');
    const hintsInput = document.getElementById('tQHints');
    const stepsInput = document.getElementById('tQSteps');
    const diffInput = document.getElementById('tQDiff');
    const pointsInput = document.getElementById('tQPoints');
    
    const type = typeSelect ? typeSelect.value : 'mcq';
    const prompt = promptInput ? promptInput.value.trim() : '';
    const optionsText = optionsInput ? optionsInput.value : '';
    const answerText = answerInput ? answerInput.value.trim() : '';
    const hintsText = hintsInput ? hintsInput.value : '';
    const stepsText = stepsInput ? stepsInput.value : '';
    const difficulty = diffInput ? parseInt(diffInput.value) : 3;
    const points = pointsInput ? parseInt(pointsInput.value) : 10;
    
    if (!prompt) {
      showNotification('Please enter a question prompt', 'warning');
      return;
    }
    
    // Parse options and answer based on type
    let question_data = {};
    let correct_answer = null;
    
    if (type === 'mcq' || type === 'true_false' || type === 'multi_select') {
      const options = optionsText.split('\n').filter(line => line.trim());
      question_data.options = options;
      
      if (type === 'multi_select') {
        // Multiple answers (comma-separated indices)
        correct_answer = answerText.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      } else {
        // Single answer (index)
        correct_answer = parseInt(answerText);
        if (isNaN(correct_answer)) {
          showNotification('Answer must be a number (0-based index)', 'warning');
          return;
        }
      }
    } else if (type === 'numeric') {
      correct_answer = { value: parseFloat(answerText), tolerance: 0 };
      if (isNaN(correct_answer.value)) {
        showNotification('Answer must be a number', 'warning');
        return;
      }
    } else if (type === 'text') {
      correct_answer = { accept: [answerText] };
    }
    
    const hints = hintsText.split('\n').filter(line => line.trim());
    const steps = stepsText.split('\n').filter(line => line.trim());
    
    try {
      const payload = {
        bank_id: state.selectedBank.id,
        skill_id: state.selectedSkill.id,
        question_type: type,
        question_text: prompt,
        question_data: question_data,
        correct_answer: correct_answer,
        hints: hints,
        solution_steps: steps,
        difficulty_level: difficulty,
        points: points
      };
      
      console.log('Adding question:', payload);
      
      const response = await apiCall('/api/teacher/practice/questions', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      // Clear form
      if (promptInput) promptInput.value = '';
      if (optionsInput) optionsInput.value = '';
      if (answerInput) answerInput.value = '';
      if (hintsInput) hintsInput.value = '';
      if (stepsInput) stepsInput.value = '';
      
      showNotification('Question added successfully!', 'success');
      await loadQuestions();
      
    } catch (error) {
      showNotification('Failed to add question: ' + error.message, 'error');
      console.error('Add question error:', error);
    }
  }

  // Import HTML
  async function importHtml() {
    if (!state.selectedBank) {
      showNotification('Please select a bank first', 'warning');
      return;
    }
    
    const htmlInput = document.getElementById('tQHtml');
    const html = htmlInput ? htmlInput.value.trim() : '';
    
    if (!html) {
      showNotification('Please paste HTML content', 'warning');
      return;
    }
    
    try {
      const response = await apiCall(`/api/teacher/practice/banks/${state.selectedBank.id}/import-html`, {
        method: 'POST',
        body: JSON.stringify({ html: html })
      });
      
      if (htmlInput) htmlInput.value = '';
      showNotification(`Imported ${response.inserted || 0} questions successfully!`, 'success');
      await loadQuestions();
      
    } catch (error) {
      showNotification('Failed to import HTML: ' + error.message, 'error');
      console.error('Import HTML error:', error);
    }
  }

  // Create assessment from bank
  async function createAssessmentFromBank() {
    if (!state.selectedBank) {
      showNotification('Please select a bank first', 'warning');
      return;
    }
    
    const titleInput = document.getElementById('asmtTitle');
    const lessonIdInput = document.getElementById('asmtLessonId');
    const passInput = document.getElementById('asmtPass');
    
    const title = titleInput ? titleInput.value.trim() : `${state.selectedBank.name} Assessment`;
    const lessonId = lessonIdInput ? parseInt(lessonIdInput.value) : null;
    const passPct = passInput ? parseInt(passInput.value) : 70;
    
    try {
      const response = await apiCall('/api/teacher/practice/create-assessment', {
        method: 'POST',
        body: JSON.stringify({
          bank_id: state.selectedBank.id,
          title: title,
          lesson_id: lessonId,
          pass_pct: passPct
        })
      });
      
      if (titleInput) titleInput.value = '';
      if (lessonIdInput) lessonIdInput.value = '';
      
      showNotification('Assessment created successfully!', 'success');
      
    } catch (error) {
      showNotification('Failed to create assessment: ' + error.message, 'error');
      console.error('Create assessment error:', error);
    }
  }

  // Initialize when DOM is ready
  function initialize() {
    console.log('Initializing Teacher Practice UI...');
    
    // Check if we're on the practice tab
    const practiceTab = document.getElementById('practice-tab');
    if (!practiceTab) {
      console.log('Practice tab not found, skipping initialization');
      return;
    }
    
    // Bind event listeners
    const loadSkillsBtn = document.getElementById('loadSkillsBtn');
    if (loadSkillsBtn) {
      loadSkillsBtn.addEventListener('click', loadSkills);
      console.log('Bound loadSkills');
    }
    
    const createSkillBtn = document.getElementById('tCreateSkill');
    if (createSkillBtn) {
      createSkillBtn.addEventListener('click', createSkill);
      console.log('Bound createSkill to button');
    }
    
    const createBankBtn = document.getElementById('tCreateBank');
    if (createBankBtn) {
      createBankBtn.addEventListener('click', createBank);
      console.log('Bound createBank');
    }
    
    const addQuestionBtn = document.getElementById('tAddQ');
    if (addQuestionBtn) {
      addQuestionBtn.addEventListener('click', addQuestion);
      console.log('Bound addQuestion');
    }
    
    const importHtmlBtn = document.getElementById('tImportHtml');
    if (importHtmlBtn) {
      importHtmlBtn.addEventListener('click', importHtml);
      console.log('Bound importHtml');
    }
    
    const createAssessmentBtn = document.getElementById('asmtFromBank');
    if (createAssessmentBtn) {
      createAssessmentBtn.addEventListener('click', createAssessmentFromBank);
      console.log('Bound createAssessmentFromBank');
    }
    
    // Auto-load skills on grade change
    const gradeSelect = document.getElementById('tSkillGrade');
    if (gradeSelect) {
      gradeSelect.addEventListener('change', loadSkills);
    }
    
    // Initial load
    loadSkills();
    
    console.log('Teacher Practice UI initialized successfully');
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    // DOM is already ready
    setTimeout(initialize, 100); // Small delay to ensure other scripts have run
  }

  // Also reinitialize when switching to practice tab
  document.addEventListener('click', function(e) {
    if (e.target.closest('[data-tab="practice"]')) {
      setTimeout(initialize, 100);
    }
  });

  // Add CSS for animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    .interactive-row.ring-2 {
      border: 2px solid #C7A34F !important;
    }
  `;
  document.head.appendChild(style);

})();
