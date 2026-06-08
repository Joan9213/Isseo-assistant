const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json({limit:'20mb'}));
app.use(express.static(path.join(__dirname, 'public')));

// Route proxy Claude — utilisée par le RI v7 pour scan plaque, reformulation IA, import Odoo
app.post('/api/claude', async (req, res) => {
  if (!API_KEY) return res.status(500).json({error:'Clé API manquante'});
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':API_KEY,
        'anthropic-version':'2023-06-01'
      },
      body:JSON.stringify({
        model: req.body.model || 'claude-sonnet-4-20250514',
        max_tokens: req.body.max_tokens || 1000,
        system: req.body.system,
        messages: req.body.messages
      })
    });
    const data = await r.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({error:'Erreur API: '+e.message});
  }
});

// Route chat existante
app.post('/api/chat', async (req, res) => {
  if (!API_KEY) return res.status(500).json({error:'Clé API manquante'});
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':API_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:req.body.max_tokens||1000,system:req.body.system,messages:req.body.messages})
    });
    res.json(await r.json());
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log('ISSEO port ' + PORT));
