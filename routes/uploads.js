const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const ensure = d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive:true }); };
const base = path.join(process.cwd(), 'uploads');
const videos = path.join(base, 'videos');
ensure(videos);

const storage = multer.diskStorage({
  destination: (req,file,cb)=> cb(null, videos),
  filename: (req,file,cb)=> cb(null, Date.now() + '_' + (file.originalname||'video').replace(/[^a-zA-Z0-9.\-_]/g,'_'))
});
const upload = multer({ storage });

router.post('/video', upload.single('video'), (req,res)=>{
  if (!req.file) return res.status(400).json({ error:'no file' });
  const url = '/uploads/videos/' + req.file.filename;
  res.json({ url });
});

module.exports = router;
