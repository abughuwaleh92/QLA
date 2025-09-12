// routes/lesson-plan-export.js
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Export lesson plan as Word document
router.post('/export-docx', express.json(), async (req, res) => {
  try {
    const { lessonPlan } = req.body;
    
    if (!lessonPlan) {
      return res.status(400).json({ error: 'Lesson plan data is required' });
    }
    
    // Create the docx generation script
    const docxScript = generateDocxScript(lessonPlan);
    
    // Save the script to a temporary file
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const scriptPath = path.join(tempDir, `lesson-plan-${Date.now()}.js`);
    const outputPath = path.join(tempDir, `lesson-plan-${Date.now()}.docx`);
    
    await fs.writeFile(scriptPath, docxScript);
    
    // Execute the script to generate the docx
    try {
      await execAsync(`node ${scriptPath} ${outputPath}`);
      
      // Read the generated file
      const fileBuffer = await fs.readFile(outputPath);
      
      // Clean up temporary files
      await fs.unlink(scriptPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
      
      // Send the file to the client
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="lesson-plan-${lessonPlan.lessonTitle.replace(/[^a-z0-9]/gi, '_')}.docx"`,
        'Content-Length': fileBuffer.length
      });
      
      res.send(fileBuffer);
      
    } catch (execError) {
      console.error('Error executing docx generation:', execError);
      throw new Error('Failed to generate Word document');
    }
    
  } catch (error) {
    console.error('Error exporting lesson plan:', error);
    res.status(500).json({ error: 'Failed to export lesson plan' });
  }
});

// Generate the docx creation script
function generateDocxScript(lessonPlan) {
  return `
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, BorderStyle, WidthType } = require('docx');
const fs = require('fs');

const outputPath = process.argv[2];

// Create the document
const doc = new Document({
  sections: [{
    properties: {},
    children: [
      // Title
      new Paragraph({
        children: [
          new TextRun({
            text: "LESSON PLANNING SHEET",
            bold: true,
            size: 32,
          }),
        ],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      
      // Header Table
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ 
                  children: [new TextRun({ text: "Subject: ", bold: true }), new TextRun("${lessonPlan.subject}")],
                })],
                width: { size: 25, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph({ 
                  children: [new TextRun({ text: "Teacher: ", bold: true }), new TextRun("${lessonPlan.teacher}")],
                })],
                width: { size: 25, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph({ 
                  children: [new TextRun({ text: "Date: ", bold: true }), new TextRun("${lessonPlan.date}")],
                })],
                width: { size: 25, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph({ 
                  children: [new TextRun({ text: "Block: ", bold: true }), new TextRun("${lessonPlan.block}")],
                })],
                width: { size: 25, type: WidthType.PERCENTAGE },
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ 
                  children: [new TextRun({ text: "Lesson Title: ", bold: true }), new TextRun("${lessonPlan.lessonTitle}")],
                })],
                columnSpan: 2,
              }),
              new TableCell({
                children: [new Paragraph({ 
                  children: [new TextRun({ text: "Class: ", bold: true }), new TextRun("${lessonPlan.grade}")],
                })],
              }),
              new TableCell({
                children: [new Paragraph({ 
                  children: [new TextRun({ text: "Duration: ", bold: true }), new TextRun("${lessonPlan.duration} mins")],
                })],
              }),
            ],
          }),
        ],
      }),
      
      // Learning Objectives
      new Paragraph({
        children: [new TextRun({ text: "Learning Objectives", bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [new TextRun("By the end of the lesson, students will be able to:")],
        spacing: { after: 200 },
      }),
      ${lessonPlan.learningObjectives.map(obj => `
      new Paragraph({
        children: [new TextRun("• ${obj}")],
        spacing: { after: 100 },
      }),`).join('')}
      
      // Lesson Sections Table
      new Paragraph({
        children: [new TextRun({ text: "Lesson Structure", bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: "Timing", bold: true })] })],
                width: { size: 15, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: "Section", bold: true })] })],
                width: { size: 20, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: "Student Activity", bold: true })] })],
                width: { size: 32.5, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: "Teacher Activity", bold: true })] })],
                width: { size: 32.5, type: WidthType.PERCENTAGE },
              }),
            ],
          }),
          ${lessonPlan.sections.map(section => `
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun("${section.timing}")] })],
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: "${section.title}", bold: true })] })],
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun("${section.studentActivity.replace(/"/g, '\\"')}")] })],
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun("${section.teacherActivity.replace(/"/g, '\\"')}")] })],
              }),
            ],
          }),`).join('')}
        ],
      }),
      
      // Differentiation
      new Paragraph({
        children: [new TextRun({ text: "Differentiation", bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Low/Medium Ability:", bold: true })],
        spacing: { after: 100 },
      }),
      ${lessonPlan.differentiation.lowMedium.map(item => `
      new Paragraph({
        children: [new TextRun("• ${item}")],
        spacing: { after: 100 },
      }),`).join('')}
      new Paragraph({
        children: [new TextRun({ text: "High Ability:", bold: true })],
        spacing: { before: 200, after: 100 },
      }),
      ${lessonPlan.differentiation.highAbility.map(item => `
      new Paragraph({
        children: [new TextRun("• ${item}")],
        spacing: { after: 100 },
      }),`).join('')}
      
      // Assessment Focus
      new Paragraph({
        children: [new TextRun({ text: "Assessment Focus", bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [new TextRun("${lessonPlan.assessmentFocus.join(', ')}")],
        spacing: { after: 200 },
      }),
      
      // Resources
      new Paragraph({
        children: [new TextRun({ text: "Resources", bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [new TextRun("${lessonPlan.resources.join(', ')}")],
        spacing: { after: 200 },
      }),
      
      // Key Vocabulary
      new Paragraph({
        children: [new TextRun({ text: "Key Vocabulary", bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [new TextRun("${lessonPlan.keyVocabulary.join(', ')}")],
        spacing: { after: 200 },
      }),
      
      // Homework
      new Paragraph({
        children: [new TextRun({ text: "Homework", bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [new TextRun("${lessonPlan.homework}")],
        spacing: { after: 200 },
      }),
    ],
  }],
});

// Generate the document
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputPath, buffer);
  console.log('Document created successfully');
  process.exit(0);
}).catch((error) => {
  console.error('Error creating document:', error);
  process.exit(1);
});
`;
}

module.exports = router;
