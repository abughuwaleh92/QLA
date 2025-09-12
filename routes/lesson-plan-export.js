// routes/lesson-plan-export.js
const express = require('express');
const router = express.Router();
const { Document, Packer, Paragraph, HeadingLevel, AlignmentType, TextRun, Table, TableRow, TableCell } = require('docx');

function h2(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_2 }); }
function h3(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_3 }); }
function h4(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_4 }); }
function p(text)  { return new Paragraph({ children: [new TextRun(String(text || ''))] }); }
function bullet(text) { return new Paragraph({ text: String(text || ''), bullet: { level: 0 } }); }

function tableKV(pairs) {
  return new Table({
    width: { size: 100, type: 'pct' },
    rows: pairs.map(([k, v]) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(k), bold: true })] })] }),
        new TableCell({ children: [p(v)] })
      ]
    }))
  });
}

async function buildDocx(lessonPlan) {
  const meta = lessonPlan.meta || {};
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: 'Lesson Plan', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
        tableKV([
          ['Subject', meta.subject || 'Mathematics'],
          ['Topic', meta.topic || ''],
          ['Grade', meta.grade != null ? `Grade ${meta.grade}` : ''],
          ['Duration', meta.duration ? `${meta.duration} minutes` : ''],
          ['Date', meta.date || ''],
          ['Teacher', meta.teacherName || '']
        ]),

        h2('Learning Outcomes'),
        ...((lessonPlan.learningOutcomes || []).map(bullet)),

        h2('Success Criteria'),
        ...((lessonPlan.successCriteria || []).map(bullet)),

        h2('Vocabulary'),
        ...((lessonPlan.vocabulary || []).map(bullet)),

        h2('Materials'),
        ...((lessonPlan.materials || []).map(bullet)),

        h2('Agenda (Student‑Centered)'),
        ...((lessonPlan.agenda || []).flatMap(block => ([
          h3(`${block.block} — ${block.minutes} min`),
          h4('Student Activity'),
          p(block.studentActivity),
          h4('Teacher Activity'),
          p(block.teacherActivity),
          h4('Checks for Understanding'),
          ...((block.checksForUnderstanding || []).map(bullet))
        ]))),

        h2('Assessment'),
        h3('Formative'),
        ...((lessonPlan.assessment?.formative) || []).map(bullet),
        h3('Summative'),
        p(lessonPlan.assessment?.summative || ''),

        h2('Differentiation'),
        h3('Low/Medium'),
        ...((lessonPlan.differentiation?.lowMedium) || []).map(bullet),
        h3('High Ability'),
        ...((lessonPlan.differentiation?.highAbility) || []).map(bullet),
        h3('Accommodations'),
        ...((lessonPlan.differentiation?.accommodations) || []).map(bullet),

        h2('UDL & Wellbeing'),
        ...((lessonPlan.udl_and_wellbeing || []).map(bullet))
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

router.post('/export-docx', express.json(), async (req, res) => {
  try {
    const { lessonPlan } = req.body || {};
    if (!lessonPlan || !lessonPlan.meta) {
      return res.status(400).json({ error: 'lessonPlan payload is required' });
    }
    const buf = await buildDocx(lessonPlan);
    const safeTitle = String(lessonPlan.meta?.topic || 'lesson-plan').replace(/[^a-z0-9-_]+/ig,'_');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeTitle}.docx"`,
      'Content-Length': buf.length
    });
    res.send(buf);
  } catch (e) {
    console.error('export docx error:', e);
    res.status(500).json({ error: 'Failed to generate DOCX' });
  }
});

module.exports = router;
