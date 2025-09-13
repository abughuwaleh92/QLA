// Fixed Teacher Practice UI Script
// This script fixes the skill creation functionality in the Teacher Portal

(function() {
  console.log('Loading fixed teacher practice UI...');
  
  // Wait for DOM to be ready
  function onReady(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

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
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Remove any existing notifications
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
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
      z-index: 9999;
      max-width: 400px;
      background: ${type === 'success' ? '#136f3a' : type === 'error' ? '#dc2626' : type === 'warning' ? '#8a3d00' : '#1D4ED8'};
      color: white;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Create skill function
  async function createSkill() {
    console.log('Create skill button clicked');
    
    // Find the input elements - check multiple possible IDs
    const nameInput = document.getElementById('tSkillName') || 
                     document.querySelector('input[placeholder*="Skill name"]') ||
                     document.querySelector('#practice-tab input[placeholder*="name"]');
    
    const unitInput = document.getElementById('tSkillUnit') || 
                     document.querySelector('input[placeholder*="Unit"]') ||
                     document.querySelector('#practice-tab input[type="number"][placeholder*="Unit"]');
    
    const gradeSelect = document.getElementById('tSkillGrade') || 
                       document.querySelector('#practice-tab select') ||
                       document.getElementById('gradeSelect');
    
    const descInput = document.getElementById('tSkillDesc') || 
                     document.querySelector('textarea[placeholder*="Description"]') ||
                     document.querySelector('#practice-tab textarea');

    if (!nameInput || !unitInput) {
      console.error('Could not find input elements:', {
        nameInput: !!nameInput,
        unitInput: !!unitInput,
        gradeSelect: !!gradeSelect
      });
      showNotification('Form elements not found. Please refresh the page.', 'error');
      return;
    }

    const name = nameInput.value.trim();
    const unit = parseInt(unitInput.value);
    const grade = parseInt(gradeSelect?.value || 7);
    const description = descInput?.value.trim() || '';

    console.log('Form values:', { name, unit, grade, description });

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

    if (!grade || isNaN(grade)) {
      showNotification('Please select a grade', 'warning');
      return;
    }

    try {
      console.log('Sending API request to create skill...');
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

      console.log('API Response:', response);

      if (response.ok) {
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

  // Load skills function
  async function loadSkills() {
    console.log('Loading skills...');
    
    const gradeSelect = document.getElementById('tSkillGrade') || 
                       document.querySelector('#practice-tab select') ||
                       document.getElementById('gradeSelect');
    
    const grade = parseInt(gradeSelect?.value || 7);
    
    try {
      const response = await apiCall(`/api/teacher/practice/skills?grade=${grade}`);
      console.log('Loaded skills:', response);
      
      const skillsList = document.getElementById('tSkillsList') || 
                        document.querySelector('#practice-tab .space-y-2');
      
      if (skillsList && response.skills) {
        skillsList.innerHTML = '';
        
        if (response.skills.length === 0) {
          skillsList.innerHTML = '<div class="text-gray-500 text-sm">No skills found. Create your first skill!</div>';
        } else {
          response.skills.forEach(skill => {
            const skillDiv = document.createElement('div');
            skillDiv.className = 'interactive-row p-2 mb-2 border rounded hover:bg-gray-50 cursor-pointer';
            skillDiv.innerHTML = `
              <div class="font-semibold">${skill.name}</div>
              <div class="text-xs text-gray-600">Unit ${skill.unit} • Grade ${skill.grade}</div>
            `;
            skillsList.appendChild(skillDiv);
          });
        }
        
        showNotification(`Loaded ${response.skills.length} skills`, 'success');
      }
    } catch (error) {
      console.error('Error loading skills:', error);
      showNotification(`Failed to load skills: ${error.message}`, 'error');
    }
  }

  // Initialize when DOM is ready
  onReady(() => {
    console.log('DOM ready, initializing teacher practice UI...');
    
    // Wait a bit for dynamic content to be created
    setTimeout(() => {
      // Find and attach to create button
      const createButton = document.getElementById('tCreateSkill') || 
                          document.querySelector('#practice-tab button:contains("Create")') ||
                          Array.from(document.querySelectorAll('#practice-tab button')).find(b => b.textContent.includes('Create'));
      
      if (createButton) {
        console.log('Found create button, attaching handler');
        createButton.removeEventListener('click', createSkill); // Remove any existing
        createButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          createSkill();
        });
      } else {
        console.warn('Create button not found, trying alternative approach');
        
        // Try to find button by class and text
        const buttons = document.querySelectorAll('.bg-\\[\\#136f3a\\]');
        buttons.forEach(btn => {
          if (btn.textContent.includes('Create')) {
            console.log('Found create button by class, attaching handler');
            btn.removeEventListener('click', createSkill);
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              createSkill();
            });
          }
        });
      }
      
      // Find and attach to load button
      const loadButton = document.getElementById('loadSkillsBtn') || 
                        document.querySelector('#practice-tab button:contains("Load")') ||
                        Array.from(document.querySelectorAll('#practice-tab button')).find(b => b.textContent.includes('Load Skills'));
      
      if (loadButton) {
        console.log('Found load button, attaching handler');
        loadButton.removeEventListener('click', loadSkills);
        loadButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          loadSkills();
        });
      }
      
      // Add CSS for animations if not present
      if (!document.querySelector('#practice-ui-styles')) {
        const style = document.createElement('style');
        style.id = 'practice-ui-styles';
        style.textContent = `
          @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          .interactive-row {
            transition: all 0.3s ease;
          }
          .interactive-row:hover {
            transform: translateX(4px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
        `;
        document.head.appendChild(style);
      }
      
      // Load skills on initialization
      loadSkills();
      
    }, 500); // Give dynamic content time to load
  });

  // Also try to attach handlers when Practice tab is clicked
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-tab="practice"]')) {
      console.log('Practice tab clicked, re-initializing handlers in 500ms...');
      setTimeout(() => {
        const createButton = document.getElementById('tCreateSkill') || 
                            Array.from(document.querySelectorAll('#practice-tab button')).find(b => b.textContent === 'Create');
        
        if (createButton && !createButton.hasAttribute('data-fixed')) {
          createButton.setAttribute('data-fixed', 'true');
          createButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            createSkill();
          });
          console.log('Re-attached create handler');
        }
      }, 500);
    }
  });

  // Export functions to window for debugging
  window.teacherPractice = {
    createSkill,
    loadSkills,
    showNotification
  };

  console.log('Fixed teacher practice UI loaded. Functions available at window.teacherPractice');
})();
