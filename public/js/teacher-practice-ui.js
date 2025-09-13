<!-- Skills panel (left) -->
<select id="gradeSelect"></select>
<button id="btn-load-skills">Load Skills</button>

<input id="new-skill-name" placeholder="Skill name">
<input id="new-skill-unit" placeholder="Unit (number)">
<input id="new-skill-bank" placeholder="Default Bank (optional)">
<button id="btn-create-skill" class="btn btn-success">Create</button>

<ul id="skillsList"></ul>

<!-- Banks & Questions (right) -->
<button id="btn-new-bank">New Bank</button>
<input id="new-bank-name" placeholder="Bank name">
<ul id="banksList"></ul>

<select id="questionType">
  <option>MCQ</option><option>Multi-select</option><option>True/False</option><option>Numeric</option><option>Text</option>
</select>
<textarea id="questionPrompt" placeholder="Question prompt"></textarea>
<textarea id="questionOptions" placeholder="Options (one per line)"></textarea>
<input id="questionAnswer" placeholder="Answer (index/CSV/number/text)">
<textarea id="questionHints" placeholder="Hint lines (optional)"></textarea>
<textarea id="questionSteps" placeholder="Solution steps (optional)"></textarea>
<button id="btn-add-question">Add Question</button>

<textarea id="importHtmlText" placeholder="Paste question HTML here…"></textarea>
<button id="btn-import-html">Import HTML</button>

<div id="questionsList"></div>
