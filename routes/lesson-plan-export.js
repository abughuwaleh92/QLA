// routes/lesson-plan-export.js
const express = require('express');
const router = express.Router();

/** ---------- helpers (string safety & small DSL) ---------- **/
const asStr = (v) => (v === undefined || v === null) ? '' : String(v);

const normList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(asStr).filter(Boolean);
  // allow newline/semicolon/bullet-separated strings
  return String(value)
    .split(/\r?\n|;|•|-\s(?=\S)/)
    .map(s => s.replace(/^\s*(\d+\.|\*|\u2022)?\s*/, '').trim())
    .filter(Boolean);
};

/** Build a DOCX document out of a canonical plan object */
async function buildDocx(lessonPlan) {
  // Lazy-load docx to prevent boot crash when dependency is missing.
  let docx;
  try {
    docx = require('docx');
  } catch (err) {
    const e = new Error(
      "The 'docx' package is not installed. Add it to dependencies: npm i docx --save"
    );
    e.cause = err;
    e.expose = true;
    throw e;
  }

  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    AlignmentType,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
  } = docx;

  // Normalize incoming structure (tolerant to slight schema variations)
  const lp = lessonPlan || {};
  const meta = lp.meta || lp.header || {};
  const topic       = asStr(meta.topic || meta.title || 'Lesson Plan');
  const subject     = asStr(meta.subject || '');
  const grade       = asStr(meta.grade || meta.gradeLevel || '');
  const duration    = asStr(meta.duration || '');
  const date        = asStr(meta.date || meta.when || '');
  const teacher     = asStr(meta.teacher || meta.instructor || '');
  const school      = asStr(meta.school || '');
  const standards   = normList(lp.standards || lp.alignedStandards);
  const outcomes    = normList(lp.learningOutcomes || lp.outcomes || lp.objectives);
  const successCrit = normList(lp.successCriteria || lp.success || lp.criteria);
  const vocabulary  = normList(lp.vocabulary || lp.keyTerms);
  const materials   = normList(lp.materials);
  const assessment  = normList(lp.assessment || lp.checksForUnderstanding);
  const differentiation = normList(lp.differentiation || lp.supports);
  const homework    = asStr(lp.homework || '');
  const notes       = asStr(lp.notes || '');
  const wellBeing   = normList(lp.safety_and_wellbeing || lp.safety || lp.wellBeing);

  // Sections table (timing, title, student activity, teacher activity)
  const sections = Array.isArray(lp.sections) ? lp.sections : [];
  const secRows = sections.map(s => ([
    asStr(s.timing || s.time || (s.minutes ? `${s.minutes} min` : '')),
    asStr(s.title || s.block || ''),
    asStr(s.studentActivity || s.students || ''),
    asStr(s.teacherActivity || s.teacher || ''),
  ]));

  // Small node builders
  const H2 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { after: 160 } });
  const H3 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { after: 140 } });
  const P  = (text, opts = {}) =>
    new Paragraph({
      children: [new TextRun({ text: asStr(text), ...opts })],
      spacing: { after: 120 },
    });
  const Bullet = (text) =>
    new Paragraph({
      text: asStr(text),
      bullet: { level: 0 },
      spacing: { after: 60 },
    });

  const KV = (label, value) => new TableRow({
    children: [
      new TableCell({ children: [P(label, { bold: true })] }),
      new TableCell({ children: [P(value)] }),
    ],
    tableHeader: false,
  });

  const MetaTable = new Table({
    width: { size: 100 * 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      left:   { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      right:  { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideH:{ style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
      insideV:{ style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
    },
    rows: [
      KV('Subject', subject),
      KV('Topic', topic),
      KV('Grade', grade),
      KV('Duration', duration),
      KV('Date', date),
      KV('Teacher', teacher),
      ...(school ? [KV('School', school)] : []),
    ],
  });

  const SectionsHeader = new TableRow({
    children: ['Timing', 'Section', 'Student Activity', 'Teacher Activity'].map(t =>
      new TableCell({ children: [P(t, { bold: true })] })
    )
  });

  const SectionsTable = new Table({
    width: { size: 100 * 100, type: WidthType.PERCENTAGE },
    rows: [
      SectionsHeader,
      ...secRows.map(cols =>
        new TableRow({
          children: cols.map(c => new TableCell({ children: [P(c)] })),
        })
      ),
    ],
  });

  const children = [
    new Paragraph({
      children: [new TextRun({ text: 'Lesson Plan', bold: true, size: 32 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),

    MetaTable,

    H2('Learning Outcomes'),
    ...(outcomes.length ? outcomes.map(Bullet) : [P('—')]),

    H2('Success Criteria'),
    ...(successCrit.length ? successCrit.map(Bullet) : [P('—')]),

    H2('Vocabulary'),
    ...(vocabulary.length ? vocabulary.map(Bullet) : [P('—')]),

    H2('Materials'),
    ...(materials.length ? materials.map(Bullet) : [P('—')]),

    H2('Lesson Flow'),
    SectionsTable,

    H2('Assessment / Checks for Understanding'),
    ...(assessment.length ? assessment.map(Bullet) : [P('—')]),

    H2('Differentiation & Support'),
    ...(differentiation.length ? differentiation.map(Bullet) : [P('—')]),

    ...(homework ? [H2('Homework'), P(homework)] : []),

    ...(notes ? [H2('Notes'), P(notes)] : []),

    ...(wellBeing.length ? [H2('Safety & Well‑being'), ...wellBeing.map(Bullet)] : []),
  ];

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } }, // 0.5"
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}

/** ----------- Route: POST /api/lesson-plan-export/export-docx ----------- **/
router.post('/export-docx', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const lessonPlan = req.body?.lessonPlan;
    if (!lessonPlan || typeof lessonPlan !== 'object') {
      return res.status(400).json({ error: 'Invalid payload: { lessonPlan: {...} } is required.' });
    }

    const buf = await buildDocx(lessonPlan);
    const rawTitle = asStr(lessonPlan?.meta?.topic || lessonPlan?.meta?.title || 'lesson-plan');
    const safeTitle = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'lesson_plan';

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeTitle}.docx"`,
      'Content-Length': buf.length,
      'X-Export-Engine': 'docx',
    });
    return res.send(buf);
  } catch (err) {
    // If docx cannot be required, provide a clear message without crashing the process.
    const explain = (err && err.expose) ? err.message : 'Failed to generate DOCX';
    console.error('Lesson Plan export error:', err);
    return res.status(500).json({ error: explain });
  }
});

module.exports = router;
