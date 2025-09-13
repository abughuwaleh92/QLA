// Teacher Practice UI - Complete Fix for Skill Creation
(function() {
  console.log('Loading Teacher Practice UI v2...');
  
  // Global state
  let practiceInitialized = false;
  
  // API helper with better error handling
  async function apiCall(url, options = {}) {
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

  // Enhanced notification system
  function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Remove any existing notifications
    const existing = document.querySelector('.practice-notification');
    if (existing) existing.remove();
    
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
    
    notification.style.cssText = `
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
      background: ${type === 'success' ? '#136f3a' : type === 'error' ? '#dc2626' : type === 'warning' ? '#8a3d00' : '#1D4ED8'};
      color: white;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  // Create skill with proper validation
  async function createSkill() {
    console.log('Create skill triggered');
    
    // Wait for elements to be available
    const nameInput = document.getElementById('tSkillName');
    const unitInput = document.getElementById('tSkillUnit');
    const gradeSelect = document.getElementById('tSkillGrade');
    const descInput = document.getElementById('tSkillDesc');

    if (!nameInput || !unitInput || !gradeSelect) {
      console.error('Required form elements not found');
      showNotification('Practice form not ready. Please try again.', 'error');
      return;
    }

    const name = nameInput.value.trim();
    const unit = parseInt(unitInput.value);
    const grade = parseInt(gradeSelect.value || 7);
    const description = descInput?.value.trim() || '';

    console.log('Creating skill with:', { name, unit, grade, description });

    // Validation
    if (!name) {
      showNotification('Please enter a skill name', 'warning');
      nameInput.focus();
      return;
    }

    if (!unit || isNaN(unit) || unit < 1 || unit > 20) {
      showNotification('Please enter a valid unit number (1-20)', 'warning');
      unitInput.focus();
      return;
    }

    try {
      showNotification('Creating skill...', 'info');

      const response = await apiCall('/api/teacher/practice/skills', {
        method: 'POST',
        body: JSON.stringify({
          name: name,
          description: description,
          grade: grade,
          unit: unit
        })
      });

      console.log('Skill created:', response);

      if (response.ok || response.skill) {
        showNotification(`Skill "${name}" created successfully!`, 'success');
        
        // Clear the form
        nameInput.value = '';
        unitInput.value = '';
        if (descInput) descInput.value = '';
        
        // Reload skills list
        await loadSkills();
      } else {
        throw new Error(response.error || 'Failed to create skill');
      }

    } catch (error) {
      console.error('Error creating skill:', error);
      showNotification(`Failed to create skill: ${error.message}`, 'error');
    }
  }

  // Load skills for selected grade
  async function loadSkills() {
    console.log('Loading skills...');
    
    const gradeSelect = document.getElementById('tSkillGrade');
    const skillsList = document.getElementById('tSkillsList');
    
    if (!gradeSelect || !skillsList) {
      console.warn('Skills UI elements not found');
      return;
    }
    
    const grade = parseInt(gradeSelect.value || 7);
    
    try {
      const response = await apiCall(`/api/teacher/practice/skills?grade=${grade}`);
      console.log('Skills loaded:', response);
      
      const skills = response.skills || response || [];
      skillsList.innerHTML = '';
      
      if (skills.length === 0) {
        skillsList.innerHTML = '<div class="text-gray-500 text-sm p-3">No skills found. Create your first skill above!</div>';
      } else {
        skills.forEach(skill => {
          const skillDiv = document.createElement('div');
          skillDiv.className = 'interactive-row p-3 mb-2 border rounded-lg hover:bg-gray-50 cursor-pointer transition-all';
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
          skillDiv.addEventListener('click', () => selectSkill(skill));
          skillsList.appendChild(skillDiv);
        });
      }
      
    } catch (error) {
      console.error('Error loading skills:', error);
      skillsList.innerHTML = '<div class="text-red-600 text-sm p-3">Failed to load skills</div>';
    }
  }

  // Select a skill for managing questions
  function selectSkill(skill) {
    console.log('Selected skill:', skill);
    showNotification(`Selected: ${skill.name}`, 'info');
    
    // Update UI to show selected skill
    const skillsList = document.getElementById('tSkillsList');
    if (skillsList) {
      skillsList.querySelectorAll('.interactive-row').forEach(row => {
        row.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50');
      });
      event.currentTarget.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
    }
    
    // Store selected skill
    window.selectedSkill = skill;
    
    // Load banks for this skill
    loadBanks(skill.id);
  }

  // Load question banks for a skill
  async function loadBanks(skillId) {
    console.log('Loading banks for skill:', skillId);
    
    const banksList = document.getElementById('tBanksList');
    if (!banksList) return;
    
    try {
      const response = await apiCall(`/api/teacher/practice/banks?skillId=${skillId}`);
      const banks = response.banks || response || [];
      
      banksList.innerHTML = '';
      
      if (banks.length === 0) {
        banksList.innerHTML = '<div class="text-gray-500 text-sm">No question banks yet.</div>';
      } else {
        banks.forEach(bank => {
          const bankDiv = document.createElement('div');
          bankDiv.className = 'p-2 border rounded mb-2 hover:bg-gray-50 cursor-pointer';
          bankDiv.innerHTML = `
            <div class="font-semibold">${bank.name}</div>
            <div class="text-xs text-gray-600">Bank ID: ${bank.id}</div>
          `;
          banksList.appendChild(bankDiv);
        });
      }
    } catch (error) {
      console.error('Error loading banks:', error);
    }
  }

  // Initialize practice UI
  function initializePractice() {
    if (practiceInitialized) {
      console.log('Practice already initialized, refreshing...');
      attachEventHandlers();
      return;
    }
    
    console.log('Initializing Practice UI...');
    
    // Add CSS for animations
    if (!document.querySelector('#practice-ui-styles')) {
      const style = document.createElement('style');
      style.id = 'practice-ui-styles';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .practice-notification {
          transition: all 0.3s ease;
        }
        .interactive-row {
          transition: all 0.3s ease;
        }
        .interactive-row:hover {
          transform: translateX(4px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
      `;
      document.head.appendChild(style);
    }
    
    attachEventHandlers();
    practiceInitialized = true;
  }

  // Attach event handlers to practice UI elements
  function attachEventHandlers() {
    console.log('Attaching event handlers...');
    
    // Create skill button
    const createBtn = document.getElementById('tCreateSkill');
    if (createBtn) {
      // Remove any existing handlers
      createBtn.replaceWith(createBtn.cloneNode(true));
      const newCreateBtn = document.getElementById('tCreateSkill');
      
      newCreateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Create button clicked');
        createSkill();
      });
      console.log('Attached handler to create button');
    } else {
      console.warn('Create button not found');
    }
    
    // Load skills button
    const loadBtn = document.getElementById('loadSkillsBtn');
    if (loadBtn) {
      loadBtn.replaceWith(loadBtn.cloneNode(true));
      const newLoadBtn = document.getElementById('loadSkillsBtn');
      
      newLoadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Load button clicked');
        loadSkills();
      });
      console.log('Attached handler to load button');
    }
    
    // Grade select change
    const gradeSelect = document.getElementById('tSkillGrade');
    if (gradeSelect) {
      gradeSelect.addEventListener('change', () => {
        console.log('Grade changed to:', gradeSelect.value);
        loadSkills();
      });
    }
    
    // Load initial skills
    loadSkills();
  }

  // Watch for Practice tab activation
  document.addEventListener('click', (e) => {
    // Check if Practice tab was clicked
    const tab = e.target.closest('[data-tab="practice"]');
    if (tab) {
      console.log('Practice tab activated');
      // Wait for content to render
      setTimeout(() => {
        initializePractice();
      }, 100);
    }
  });

  // Also initialize on DOM ready if practice tab is already visible
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, checking for practice tab...');
    
    // Check if practice tab exists and is visible
    setTimeout(() => {
      const practiceTab = document.getElementById('practice-tab');
      if (practiceTab && !practiceTab.classList.contains('hidden')) {
        initializePractice();
      }
    }, 500);
  });

  // Export functions for debugging
  window.teacherPractice = {
    createSkill,
    loadSkills,
    loadBanks,
    showNotification,
    initializePractice
  };

  console.log('Teacher Practice UI v2 loaded. Debug with: window.teacherPractice');
})();
