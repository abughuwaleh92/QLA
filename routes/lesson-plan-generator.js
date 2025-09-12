// routes/lesson-plan-generator.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
});

function parseOutcomes(input) {
  if (Array.isArray(input)) return input.map(s => String(s).trim()).filter(Boolean);
  if (!input) return [];
  return String(input)
    .split(/\r?\n|;|•|-/)
    .map(s => s.replace(/^\s*(\d+\.|\*|\u2022)?\s*/, '').trim())
    .filter(Boolean);
}

function toSuccessCriteria(outcomes) {
  // simple, deterministic transformation
  return outcomes.map(o => {
    let s = o.replace(/^students? (will\s+be\s+able\s+to|can)\s*/i, '').trim();
    if (!/^I can/i.test(s)) s = 'I can ' + s.replace(/\.$/, '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
}

function allocateMinutes(total, weights) {
  const keys = Object.keys(weights);
  const sum = keys.reduce((a,k)=>a+weights[k],0);
  let used = 0, out = {};
  keys.forEach((k, i) => {
    const m = Math.round((weights[k]/sum)*total);
    out[k] = m; used += m;
  });
  // fix rounding drift on the last block
  const last = keys[keys.length-1];
  out[last] += (total - used);
  return out;
}

function defaultMaterials(topic) {
  return [
    'Whiteboard/markers',
    'Student notebooks',
    'Projector/visuals',
    `${topic} worksheet (differentiated)`,
    'Exit‑ticket slips'
  ];
}

function defaultVocabulary(topic) {
  // crude placeholders; adjust for your bank per grade/topic
  return ['Key term 1', 'Key term 2', `${topic}`];
}

function nowDDMMYYYY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Core generator: builds a student‑centered, timed plan skeleton
function generateLessonPlan({ topic, learningOutcomes, grade = 7, duration = 55, teacherName = '' }) {
  const los = parseOutcomes(learningOutcomes);
  const success = toSuccessCriteria(los.length ? los : [`explain core ideas about ${topic}`, `solve basic problems about ${topic}`]);

  // Time distribution: tweak weights to match your instructional cadence
  const minutes = allocateMinutes(duration, {
    hook: 5,          // Do Now / Hook
    tps: 8,           // Think‑Pair‑Share
    mini: 10,         // Mini‑Lesson
    guided: 12,       // Guided Practice
    collab: 8,        // Collaborative/Stations
    indep: 8,         // Independent Practice
    exit: 4           // Exit ticket + reflection
  });

  const plan = {
    meta: {
      subject: 'Mathematics',
      topic: topic,
      date: nowDDMMYYYY(),
      grade: grade,
      duration: duration,
      teacherName: teacherName || null,
      format: 'QLA Lesson Plan v1'
    },

    learningOutcomes: los,
    successCriteria: success,
    vocabulary: defaultVocabulary(topic),
    materials: defaultMaterials(topic),

    agenda: [
      {
        block: 'Do Now / Hook',
        minutes: minutes.hook,
        studentActivity: `Individually, students attempt a quick warm‑up related to ${topic}; prompt surfaces prior knowledge and misconceptions.`,
        teacherActivity: 'Circulate, observe, and note misconceptions for brief share‑out.',
        checksForUnderstanding: ['Collect 2–3 sample responses to display for discussion.']
      },
      {
        block: 'Think‑Pair‑Share',
        minutes: minutes.tps,
        studentActivity: `Pairs discuss an inquiry prompt about ${topic}; each pair prepares one sentence or example to share.`,
        teacherActivity: 'Facilitate norms, cold‑call a few pairs, synthesize key ideas on board.',
        checksForUnderstanding: ['Randomized share‑outs; quick thumbs/hold‑ups on key claim.']
      },
      {
        block: 'Mini‑Lesson',
        minutes: minutes.mini,
        studentActivity: 'Listen actively, annotate examples, ask clarifying questions.',
        teacherActivity: `Model core procedure/representation for ${topic}, contrasting a common error vs. correct reasoning.`,
        checksForUnderstanding: ['2–3 hinge questions with show‑of‑hands or mini whiteboards.']
      },
      {
        block: 'Guided Practice',
        minutes: minutes.guided,
        studentActivity: 'Solve 2–3 scaffolded items in small groups; show reasoning.',
        teacherActivity: 'Coach groups, prompt for representations, ask “Why?” and “What if…?”.',
        checksForUnderstanding: ['Targeted conferencing notes; quick sample work share on visualizer.']
      },
      {
        block: 'Collaborative / Stations',
        minutes: minutes.collab,
        studentActivity: `Rotate through short tasks (conceptual, procedural, application) about ${topic}.`,
        teacherActivity: 'Run one station for feedback; monitor pacing signal.',
        checksForUnderstanding: ['Station check cards; brief peer‑assessment rubric.']
      },
      {
        block: 'Independent Practice',
        minutes: minutes.indep,
        studentActivity: 'Work individually on mixed problems aligned to success criteria.',
        teacherActivity: 'Support individuals; note students for extension/support next lesson.',
        checksForUnderstanding: ['Collect 1–2 items per student for quick mark.']
      },
      {
        block: 'Exit Ticket & Reflection',
        minutes: minutes.exit,
        studentActivity: 'Complete exit ticket; write brief reflection (“Today I learned… / I’m still unsure about…”).',
        teacherActivity: 'Collect and skim for grouping in next lesson.',
        checksForUnderstanding: ['Exit‑ticket responses tagged by success criterion.']
      }
    ],

    assessment: {
      formative: [
        'Hinge questions during mini‑lesson',
        'Anecdotal notes in guided practice',
        'Station check cards',
        'Exit‑ticket tagged to success criteria'
      ],
      summative: `Short quiz next session on ${topic} (selected response + one constructed response).`
    },

    differentiation: {
      lowMedium: [
        'Clarify vocabulary with visuals and sentence frames',
        'Provide worked examples next to practice questions',
        'Chunk tasks; allow think time before pair discussion'
      ],
      highAbility: [
        'Extension problems requiring generalization/proof idea',
        'Ask for multiple solution strategies and efficiency comparison',
        'Offer challenge station with non‑routine item'
      ],
      accommodations: [
        'Preferential seating; reduced item counts with same criteria',
        'Alternative response modes (oral explanation with scribe)'
      ]
    },

    udl_and_wellbeing: [
      'Multiple representations (verbal, algebraic, visual)',
      'Opportunities for movement (stations) and voice',
      'Explicit norms for respectful collaboration'
    ]
  };

  return plan;
}

// ------- Routes --------

// Create & persist a lesson plan
router.post('/generate', express.json(), async (req, res) => {
  try {
    const { topic, learningOutcomes, grade, duration, teacherName } = req.body || {};
    if (!topic || !String(topic).trim()) {
      return res.status(400).json({ error: 'Topic is required.' });
    }

    const plan = generateLessonPlan({ topic, learningOutcomes, grade, duration, teacherName });
    const createdBy = req.user?.email || null;

    const { rows } = await pool.query(
      `INSERT INTO generated_lesson_plans(topic, grade, learning_outcomes, plan_data, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [ String(topic).trim(), parseInt(grade||7), JSON.stringify(parseOutcomes(learningOutcomes)), plan, createdBy ]
    );

    res.json({ id: rows[0].id, created_at: rows[0].created_at, plan });
  } catch (e) {
    console.error('generate error:', e);
    res.status(500).json({ error: 'Failed to generate lesson plan.' });
  }
});

// List my generated plans
router.get('/', async (req, res) => {
  try {
    const user = req.user?.email;
    const { rows } = await pool.query(
      `SELECT id, topic, grade, created_at
         FROM generated_lesson_plans
        WHERE ($1::text IS NULL OR created_by = $1)
        ORDER BY created_at DESC LIMIT 100`,
      [user || null]
    );
    res.json(rows);
  } catch (e) {
    console.error('list error:', e);
    res.status(500).json({ error: 'Failed to list plans.' });
  }
});

// Get a specific plan
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, topic, grade, learning_outcomes, plan_data, created_by, created_at
         FROM generated_lesson_plans
        WHERE id = $1`,
      [parseInt(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    // Optionally restrict to owner: if owner‑only visibility is required uncomment:
    // if (rows[0].created_by && rows[0].created_by !== req.user?.email) return res.status(403).json({ error: 'Forbidden' });
    res.json(rows[0]);
  } catch (e) {
    console.error('get error:', e);
    res.status(500).json({ error: 'Failed to fetch plan.' });
  }
});

module.exports = router;
