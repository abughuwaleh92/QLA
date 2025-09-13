/**
 * Teacher Practice UI - Complete Rewrite
 * Handles skills, question banks, and questions management for teachers
 */

class TeacherPracticeUI {
  constructor() {
    this.initialized = false;
    this.selectedSkill = null;
    this.selectedBank = null;
    this.skills = [];
    this.banks = [];
    this.currentGrade = 7;
    
    // Bind methods to maintain context
    this.init = this.init.bind(this);
    this.createSkill = this.createSkill.bind(this);
    this.loadSkills = this.loadSkills.bind(this);
    this.selectSkill = this.selectSkill.bind(this);
    this.createBank = this.createBank.bind(this);
    this.loadBanks = this.loadBanks.bind(this);
    this.selectBank = this.selectBank.bind(this);
    this.addQuestion = this.addQuestion.bind(this);
    this.importHTML = this.importHTML.bind(this);
  }

  // Initialize the practice UI
  async init() {
    console.log('Initializing Teacher Practice UI...');
    
    // Check if practice tab exists
    const practiceTab = document.getElementById('practice-tab');
    if (!practiceTab) {
      console.log('Practice tab not found, waiting...');
      return false;
    }
    
    // Add CSS if not already added
    this.addStyles();
    
    // Attach event handlers
    this.attachEventHandlers();
    
    // Load initial data
    await this.loadSkills();
    
    this.initialized = true;
    console.log('Teacher Practice UI initialized successfully');
    return true;
  }

  // Add required CSS styles
  addStyles() {
    if (document.getElementById('teacher-practice-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'teacher-practice-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      .practice-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: slideIn 0.3s ease;
        z-index: 99999;
        max-width: 400px;
        color: white;
      }
      
      .practice-notification.success { background: #136f3a; }
      .practice-notification.error { background: #dc2626; }
      .practice-notification.warning { background: #d97706; }
      .practice-notification.info { background: #1e40af; }
      
      .skill-item, .bank-item {
        transition: all 0.3s ease;
        cursor: pointer;
      }
      
      .skill-item:hover, .bank-item:hover {
        transform: translateX(4px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      }
      
      .skill-item.selected, .bank-item.selected {
        background: #f0f9ff;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
      }
    `;
    document.head.appendChild(style);
  }

  // Show notification
  showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Remove existing notifications
    document.querySelectorAll('.practice-notification').forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `practice-notification ${type}`;
    
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };
    
    notification.innerHTML = `
      <i class="fas ${icons[type] || icons.info}"></i>
      <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // API helper
  async apiCall(url, options = {}) {
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        credentials: 'same-origin',
        ...options
      });
      
      const text = await response.text();
      
      if (!response.ok) {
        const errorMsg = text || `HTTP ${response.status}`;
        console.error('API Error:', errorMsg);
        throw new Error(errorMsg);
      }
      
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (error) {
      console.error('API Call Failed:', error);
      throw error;
    }
  }

  // Attach event handlers
  attachEventHandlers() {
    console.log('Attaching event handlers...');
    
    // Create skill button
    const createSkillBtn = document.getElementById('tCreateSkill');
    if (createSkillBtn) {
      createSkillBtn.addEventListener('click', this.createSkill);
    }
    
    // Load skills button
    const loadSkillsBtn = document.getElementById('loadSkillsBtn');
    if (loadSkillsBtn) {
      loadSkillsBtn.addEventListener('click', this.loadSkills);
    }
    
    // Grade select
    const gradeSelect = document.getElementById('tSkillGrade');
    if (gradeSelect) {
      gradeSelect.addEventListener('change', (e) => {
        this.currentGrade = parseInt(e.target.value);
        this.loadSkills();
      });
    }
    
    // Create bank button
    const createBankBtn = document.getElementById('tCreateBank');
    if (createBankBtn) {
      createBankBtn.addEventListener('click', this.createBank);
    }
    
    // Add question button
    const addQuestionBtn = document.getElementById('tAddQ');
    if (addQuestionBtn) {
      addQuestionBtn.addEventListener('click', this.addQuestion);
    }
    
    // Import HTML button
    const importHTMLBtn = document.getElementById('tImportHtml');
    if (importHTMLBtn) {
      importHTMLBtn.addEventListener('click', this.importHTML);
    }
    
    // Create assessment button
    const createAssessmentBtn = document.getElementById('asmtFromBank');
    if (createAssessmentBtn) {
      createAssessmentBtn.addEventListener('click', () => this.createAssessment());
    }
  }

  // Create a new skill
  async createSkill(e) {
    if (e) e.preventDefault();
    console.log('Creating skill...');
    
    const nameInput = document.getElementById('tSkillName');
    const unitInput = document.getElementById('tSkillUnit');
    const gradeSelect = document.getElementById('tSkillGrade');
    const descInput = document.getElementById('tSkillDesc');
    
    if (!nameInput || !unitInput || !gradeSelect) {
      this.showNotification('Form elements not found', 'error');
      return;
    }
    
    const name = nameInput.value.trim();
    const unit = parseInt(unitInput.value);
    const grade = parseInt(gradeSelect.value || 7);
    const description = descInput?.value.trim() || '';
    
    // Validation
    if (!name) {
      this.showNotification('Please enter a skill name', 'warning');
      nameInput.focus();
      return;
    }
    
    if (!unit || isNaN(unit) || unit < 1 || unit > 20) {
      this.showNotification('Unit must be between 1 and 20', 'warning');
      unitInput.focus();
      return;
    }
    
    try {
      const response = await this.apiCall('/api/teacher/practice/skills', {
        method: 'POST',
        body: JSON.stringify({ name, description, grade, unit })
      });
      
      this.showNotification(`Skill "${name}" created successfully!`, 'success');
      
      // Clear form
      nameInput.value = '';
      unitInput.value = '';
      if (descInput) descInput.value = '';
      
      // Reload skills
      await this.loadSkills();
      
    } catch (error) {
      this.showNotification(`Failed to create skill: ${error.message}`, 'error');
    }
  }

  // Load skills
  async loadSkills() {
    console.log('Loading skills...');
    
    const skillsList = document.getElementById('tSkillsList');
    if (!skillsList) {
      console.warn('Skills list element not found');
      return;
    }
    
    try {
      const response = await this.apiCall(`/api/teacher/practice/skills?grade=${this.currentGrade}`);
      this.skills = response.skills || response || [];
      
      skillsList.innerHTML = '';
      
      if (this.skills.length === 0) {
        skillsList.innerHTML = '<div class="text-gray-500 text-sm p-3">No skills found. Create your first skill above!</div>';
      } else {
        this.skills.forEach(skill => {
          const skillDiv = document.createElement('div');
          skillDiv.className = 'skill-item interactive-row p-3 mb-2 border rounded-lg';
          skillDiv.dataset.skillId = skill.id;
          
          skillDiv.innerHTML = `
            <div class="flex justify-between items-center">
              <div>
                <div class="font-semibold">${skill.name}</div>
                <div class="text-xs text-gray-600">Unit ${skill.unit} • Grade ${skill.grade}</div>
                ${skill.description ? `<div class="text-xs text-gray-500 mt-1">${skill.description}</div>` : ''}
              </div>
              <i class="fas fa-chevron-right text-gray-400"></i>
            </div>
          `;
          
          skillDiv.addEventListener('click', () => this.selectSkill(skill));
          skillsList.appendChild(skillDiv);
        });
      }
      
    } catch (error) {
      console.error('Error loading skills:', error);
      skillsList.innerHTML = '<div class="text-red-600 text-sm p-3">Failed to load skills</div>';
    }
  }

  // Select a skill
  selectSkill(skill) {
    console.log('Selected skill:', skill);
    this.selectedSkill = skill;
    
    // Update UI
    document.querySelectorAll('.skill-item').forEach(item => {
      item.classList.remove('selected');
      if (item.dataset.skillId == skill.id) {
        item.classList.add('selected');
      }
    });
    
    // Update bank meta
    const bankMeta = document.getElementById('tBankMeta');
    if (bankMeta) {
      bankMeta.textContent = `Banks for "${skill.name}"`;
    }
    
    this.showNotification(`Selected: ${skill.name}`, 'info');
    
    // Load banks for this skill
    this.loadBanks(skill.id);
  }

  // Create a new bank
  async createBank() {
    if (!this.selectedSkill) {
      this.showNotification('Please select a skill first', 'warning');
      return;
    }
    
    const title = prompt('Bank title:', `${this.selectedSkill.name} Practice`);
    if (!title) return;
    
    try {
      await this.apiCall('/api/teacher/practice/banks', {
        method: 'POST',
        body: JSON.stringify({
          skill_id: this.selectedSkill.id,
          title: title,
          difficulty: 'medium'
        })
      });
      
      this.showNotification('Bank created successfully', 'success');
      await this.loadBanks(this.selectedSkill.id);
      
    } catch (error) {
      this.showNotification(`Failed to create bank: ${error.message}`, 'error');
    }
  }

  // Load banks for a skill
  async loadBanks(skillId) {
    console.log('Loading banks for skill:', skillId);
    
    const banksList = document.getElementById('tBanksList');
    if (!banksList) return;
    
    try {
      const response = await this.apiCall(`/api/teacher/practice/banks?skill_id=${skillId}`);
      this.banks = response.banks || response || [];
      
      banksList.innerHTML = '';
      
      if (this.banks.length === 0) {
        banksList.innerHTML = '<div class="text-gray-500 text-sm p-3">No question banks yet. Click "New Bank" to create one.</div>';
      } else {
        this.banks.forEach(bank => {
          const bankDiv = document.createElement('div');
          bankDiv.className = 'bank-item p-3 border rounded mb-2';
          bankDiv.dataset.bankId = bank.id;
          
          bankDiv.innerHTML = `
            <div class="flex justify-between items-center">
              <div>
                <div class="font-semibold">${bank.title}</div>
                <div class="text-xs text-gray-600">${bank.question_count || 0} questions • ${bank.difficulty || 'medium'}</div>
              </div>
              <span class="text-xs px-2 py-1 rounded-full ${bank.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">
                ${bank.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          `;
          
          bankDiv.addEventListener('click', () => this.selectBank(bank));
          banksList.appendChild(bankDiv);
        });
      }
      
    } catch (error) {
      console.error('Error loading banks:', error);
      banksList.innerHTML = '<div class="text-red-600 text-sm p-3">Failed to load banks</div>';
    }
  }

  // Select a bank
  async selectBank(bank) {
    console.log('Selected bank:', bank);
    this.selectedBank = bank;
    
    // Update UI
    document.querySelectorAll('.bank-item').forEach(item => {
      item.classList.remove('selected');
      if (item.dataset.bankId == bank.id) {
        item.classList.add('selected');
      }
    });
    
    this.showNotification(`Selected bank: ${bank.title}`, 'info');
    
    // Load questions for this bank
    await this.loadQuestions(bank.id);
  }

  // Load questions for a bank
  async loadQuestions(bankId) {
    const questionsList = document.getElementById('tQuestionsList');
    if (!questionsList) return;
    
    try {
      const response = await this.apiCall(`/api/teacher/practice/banks/${bankId}/questions`);
      const questions = response.questions || response || [];
      
      questionsList.innerHTML = '';
      
      if (questions.length === 0) {
        questionsList.innerHTML = '<div class="text-gray-500 text-sm p-3">No questions yet. Add questions using the form below.</div>';
      } else {
        questions.forEach((q, index) => {
          const qDiv = document.createElement('div');
          qDiv.className = 'card p-4 mb-3';
          
          qDiv.innerHTML = `
            <div class="flex justify-between items-start mb-2">
              <div class="text-xs text-gray-600">
                #${index + 1} • ${q.question_type} • Difficulty ${q.difficulty_level || 3}/5 • ${q.points || 10} pts
              </div>
              <button class="text-red-500 hover:text-red-700 text-sm" onclick="teacherPracticeUI.deleteQuestion(${q.id})">
                <i class="fas fa-trash"></i>
              </button>
            </div>
            <div class="font-semibold mb-2">${q.question_text || 'No question text'}</div>
            ${q.question_data?.options ? `
              <div class="text-sm text-gray-600">
                Options: ${q.question_data.options.map((opt, i) => `<span class="inline-block px-2 py-1 bg-gray-100 rounded mr-1 mb-1">${opt}</span>`).join('')}
              </div>
            ` : ''}
          `;
          
          questionsList.appendChild(qDiv);
        });
      }
      
    } catch (error) {
      console.error('Error loading questions:', error);
    }
  }

  // Add a question
  async addQuestion() {
    if (!this.selectedSkill || !this.selectedBank) {
      this.showNotification('Please select a skill and bank first', 'warning');
      return;
    }
    
    const qtype = document.getElementById('tQType')?.value;
    const prompt = document.getElementById('tQPrompt')?.value.trim();
    const rawOpts = document.getElementById('tQOptions')?.value;
    const rawAns = document.getElementById('tQAnswer')?.value.trim();
    const hints = document.getElementById('tQHints')?.value.trim().split('\n').filter(Boolean);
    const steps = document.getElementById('tQSteps')?.value.trim().split('\n').filter(Boolean);
    const diff = parseInt(document.getElementById('tQDiff')?.value || 3);
    const points = parseInt(document.getElementById('tQPoints')?.value || 10);
    
    if (!prompt) {
      this.showNotification('Please enter a question prompt', 'warning');
      return;
    }
    
    let question_data = {};
    let correct_answer = null;
    
    if (qtype === 'mcq' || qtype === 'true_false' || qtype === 'multi_select') {
      const options = rawOpts?.split('\n').filter(Boolean) || [];
      if (options.length < 2) {
        this.showNotification('Please provide at least 2 options', 'warning');
        return;
      }
      question_data.options = options;
      
      if (qtype === 'multi_select') {
        correct_answer = rawAns.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      } else {
        correct_answer = parseInt(rawAns);
        if (isNaN(correct_answer)) {
          this.showNotification('Please provide a valid answer index', 'warning');
          return;
        }
      }
    } else if (qtype === 'numeric') {
      question_data = { format: 'number' };
      correct_answer = { value: parseFloat(rawAns), tolerance: 0 };
    } else if (qtype === 'text') {
      question_data = {};
      correct_answer = { accept: [rawAns] };
    }
    
    try {
      await this.apiCall('/api/teacher/practice/questions', {
        method: 'POST',
        body: JSON.stringify({
          bank_id: this.selectedBank.id,
          skill_id: this.selectedSkill.id,
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
      
      this.showNotification('Question added successfully', 'success');
      
      // Clear form
      document.getElementById('tQPrompt').value = '';
      document.getElementById('tQOptions').value = '';
      document.getElementById('tQAnswer').value = '';
      document.getElementById('tQHints').value = '';
      document.getElementById('tQSteps').value = '';
      
      // Reload questions
      await this.loadQuestions(this.selectedBank.id);
      
    } catch (error) {
      this.showNotification(`Failed to add question: ${error.message}`, 'error');
    }
  }

  // Delete a question
  async deleteQuestion(questionId) {
    if (!confirm('Are you sure you want to delete this question?')) return;
    
    try {
      await this.apiCall(`/api/teacher/practice/questions/${questionId}`, {
        method: 'DELETE'
      });
      
      this.showNotification('Question deleted', 'success');
      
      if (this.selectedBank) {
        await this.loadQuestions(this.selectedBank.id);
      }
      
    } catch (error) {
      this.showNotification(`Failed to delete question: ${error.message}`, 'error');
    }
  }

  // Import questions from HTML
  async importHTML() {
    if (!this.selectedBank) {
      this.showNotification('Please select a bank first', 'warning');
      return;
    }
    
    const html = document.getElementById('tQHtml')?.value.trim();
    if (!html) {
      this.showNotification('Please paste HTML content first', 'warning');
      return;
    }
    
    try {
      await this.apiCall(`/api/teacher/practice/banks/${this.selectedBank.id}/import-html`, {
        method: 'POST',
        body: JSON.stringify({ html })
      });
      
      document.getElementById('tQHtml').value = '';
      this.showNotification('Questions imported from HTML', 'success');
      
      await this.loadQuestions(this.selectedBank.id);
      
    } catch (error) {
      this.showNotification(`Import failed: ${error.message}`, 'error');
    }
  }

  // Create assessment from bank
  async createAssessment() {
    if (!this.selectedBank) {
      this.showNotification('Please select a bank first', 'warning');
      return;
    }
    
    const title = document.getElementById('asmtTitle')?.value || `${this.selectedBank.title} Assessment`;
    const lesson_id = parseInt(document.getElementById('asmtLessonId')?.value || 0) || null;
    const pass_pct = parseInt(document.getElementById('asmtPass')?.value || 70);
    
    try {
      await this.apiCall('/api/teacher/practice/create-assessment', {
        method: 'POST',
        body: JSON.stringify({
          bank_id: this.selectedBank.id,
          title,
          lesson_id,
          pass_pct
        })
      });
      
      this.showNotification('Assessment created successfully', 'success');
      
      // Clear form
      document.getElementById('asmtTitle').value = '';
      document.getElementById('asmtLessonId').value = '';
      
    } catch (error) {
      this.showNotification(`Failed to create assessment: ${error.message}`, 'error');
    }
  }
}

// Create global instance
const teacherPracticeUI = new TeacherPracticeUI();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, setting up teacher practice UI...');
  
  // Watch for practice tab clicks
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab="practice"]');
    if (tab) {
      console.log('Practice tab clicked');
      setTimeout(() => {
        if (!teacherPracticeUI.initialized) {
          teacherPracticeUI.init();
        }
      }, 100);
    }
  });
  
  // Check if practice tab is already visible
  setTimeout(() => {
    const practiceTab = document.getElementById('practice-tab');
    if (practiceTab && !practiceTab.classList.contains('hidden')) {
      teacherPracticeUI.init();
    }
  }, 500);
});

// Export for global access
window.teacherPracticeUI = teacherPracticeUI;

console.log('Teacher Practice UI loaded. Access via: window.teacherPracticeUI');
