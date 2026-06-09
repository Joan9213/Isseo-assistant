const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
const ISSEO_EMAIL = 'contact@isseochariot.fr';

app.use(express.json({limit:'25mb'}));
app.use(express.static(path.join(__dirname, 'public')));

// ── PROXY CLAUDE ──
app.post('/api/claude', async (req, res) => {
  if(!ANTHROPIC_KEY) return res.status(500).json({error:'Clé API Claude manquante'});
  try{
    const r = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:req.body.model||'claude-sonnet-4-20250514',max_tokens:req.body.max_tokens||1000,messages:req.body.messages})
    });
    res.json(await r.json());
  }catch(e){res.status(500).json({error:e.message});}
});

// ── GÉNÉRATION PDF + ENVOI EMAIL ──
app.post('/api/envoyer', async (req, res) => {
  const data = req.body;
  
  try{
    // 1. Générer HTML du rapport
    const htmlRapport = genererHTMLRapport(data);
    
    // 2. Générer HTML du devis si travaux à prévoir
    const htmlDevis = data.a_prevoir ? genererHTMLDevis(data) : null;
    
    // 3. Envoyer par email
    if(SENDGRID_KEY){
      await envoyerEmailSendGrid(data, htmlRapport, htmlDevis);
      res.json({status:'ok', message:'Rapport envoyé par email'});
    } else {
      // SendGrid pas encore configuré — sauvegarder quand même
      res.json({status:'ok_local', message:'Rapport sauvegardé — email en attente SendGrid'});
    }
  }catch(e){
    console.error('Erreur envoi:', e);
    res.status(500).json({error:e.message});
  }
});

// ── GÉNÉRATION HTML RAPPORT ──
function genererHTMLRapport(d){
  const fmt = n => n ? parseFloat(n).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+'€' : '—';
  const val = v => v||'—';
  const prixMode = d.prix_mode||'show-all';
  const showDetail = prixMode==='show-all';
  const showTotal = prixMode!=='hide-all';

  const piecesRows = (d.pieces||[]).map(p=>{
    const tot = (parseFloat(p.qte)||0)*(parseFloat(p.pu)||0);
    return `<tr>
      <td>${val(p.ref)}</td>
      <td>${val(p.designation)}</td>
      <td style="text-align:center">${val(p.qte)}</td>
      ${showDetail?`<td style="text-align:right">${fmt(p.pu)}</td><td style="text-align:right">${fmt(tot)}</td>`:''}
      <td><span style="background:${p.provenance==='SAV'?'#fde8cc':p.provenance==='VEH'?'#cce8f4':p.provenance==='ATL'?'#ccf0ee':'#e8ccf4'};padding:2px 6px;border-radius:3px;font-size:9px;font-weight:bold">${p.provenance||'SAV'}</span></td>
    </tr>`;
  }).join('');

  const duree = d.pointage?.tps_inter ? 
    Math.floor(d.pointage.tps_inter)+'h'+String(Math.round((d.pointage.tps_inter%1)*60)).padStart(2,'0') : '—';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;font-size:11px;color:#222;margin:0;padding:20px;max-width:800px}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #EA7807;padding-bottom:12px;margin-bottom:14px}
  .logo{font-size:28px;font-weight:900;letter-spacing:4px;color:#4A4A4A}.logo span{color:#EA7807}
  .logo-sub{font-size:8px;letter-spacing:2px;text-transform:uppercase;color:#999}
  .logo-contact{font-size:9px;color:#666;margin-top:4px;line-height:1.7}
  .ri-num{text-align:right}.ri-num-v{font-size:22px;font-weight:900;color:#EA7807;font-family:monospace}
  .type-badge{display:inline-block;padding:3px 10px;border-radius:4px;background:#EA7807;color:white;font-weight:bold;font-size:11px;margin-top:4px}
  .section{margin-bottom:10px;border:1px solid #ddd;border-radius:4px;overflow:hidden}
  .sec-title{background:#f5f4f0;padding:6px 10px;font-weight:bold;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#4A4A4A;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:6px}
  .bar{width:4px;height:14px;border-radius:2px;background:#EA7807;flex-shrink:0}
  .bar.t{background:#3AB6AD}
  .sec-body{padding:10px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px}
  .field label{font-size:8px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#999;display:block;margin-bottom:2px}
  .field .v{border-bottom:1px solid #ddd;padding:3px 2px;min-height:18px;font-size:11px}
  .field .v.big{min-height:36px}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th{background:#f5f4f0;padding:5px 6px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#666;border-bottom:2px solid #ddd}
  td{padding:5px 6px;border-bottom:1px solid #f0f0f0}
  .tot-box{margin-top:8px;border:1px solid #ddd;border-radius:4px;overflow:hidden}
  .tot-row{display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:11px}
  .tot-row.final{background:#4A4A4A;color:white;font-weight:bold;border:none}
  .tot-row.final span:last-child{color:#EA7807;font-size:15px}
  .h-boxes{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px}
  .h-box{border:1px solid #ddd;border-radius:4px;padding:6px;text-align:center}
  .h-box .hl{font-size:8px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#999;display:block;margin-bottom:2px}
  .h-box .hv{font-size:16px;font-weight:900;color:#4A4A4A}
  .h-box.teal .hv{color:#3AB6AD}
  .sig-notice{font-size:10px;color:#666;font-style:italic;padding:8px;background:#f9f8f6;border-left:3px solid #EA7807;margin-bottom:10px;line-height:1.5}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .sig-box{border:1px solid #ddd;border-radius:4px;overflow:hidden}
  .sig-box-hd{background:#f5f4f0;padding:5px 8px;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#666;border-bottom:1px solid #ddd}
  .sig-area{height:70px;background:white;display:flex;align-items:center;justify-content:center}
  .sig-area img{max-height:65px;max-width:100%}
  .sig-name{font-size:9px;color:#666;padding:4px 8px;border-top:1px solid #f0f0f0}
  .footer{margin-top:14px;padding-top:8px;border-top:2px solid #EA7807;text-align:center;font-size:9px;color:#888;line-height:1.8}
  .photos-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .photos-grid img{width:100%;border-radius:4px;border:1px solid #ddd}
</style></head><body>

<div class="hdr">
  <div>
    <div class="logo">ISS<span>É</span>O</div>
    <div class="logo-sub">Chariots Élévateurs · Vente Location Maintenance</div>
    <div class="logo-contact">20 Allée Marie Curie – ZA Lavalduc – 13270 Fos-sur-Mer<br>Tél : 06 07 08 69 58 · 04 42 06 70 14 · contact@isseochariot.fr</div>
  </div>
  <div class="ri-num">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#999">Avis N°</div>
    <div class="ri-num-v">${val(d.numero)}</div>
    <div style="font-size:10px;color:#666">${val(d.date)}</div>
    <div><span class="type-badge">${val(d.type)}</span></div>
  </div>
</div>

<div class="section">
  <div class="sec-title"><div class="bar"></div>Identification</div>
  <div class="sec-body grid2">
    <div class="field"><label>Client</label><div class="v">${val(d.client)}</div></div>
    <div class="field"><label>Technicien</label><div class="v">${val(d.technicien)}</div></div>
    <div class="field" style="grid-column:1/-1"><label>Site</label><div class="v">${val(d.site)}</div></div>
    ${d.num_contrat?`<div class="field"><label>N° Contrat</label><div class="v">${d.num_contrat}</div></div>`:''}
  </div>
</div>

<div class="section">
  <div class="sec-title"><div class="bar t"></div>Matériel</div>
  <div class="sec-body grid4">
    <div class="field"><label>Type</label><div class="v">${val(d.materiel?.type)}</div></div>
    <div class="field"><label>N° Série</label><div class="v">${val(d.materiel?.serie)}</div></div>
    <div class="field"><label>N° Parc</label><div class="v">${val(d.materiel?.interne)}</div></div>
    <div class="field"><label>Horamètre</label><div class="v">${val(d.materiel?.horametre)} h</div></div>
  </div>
</div>

<div class="section">
  <div class="sec-title"><div class="bar"></div>Diagnostic & Travaux</div>
  <div class="sec-body">
    <div class="field" style="margin-bottom:8px"><label>Objet / Diagnostic</label><div class="v big">${val(d.objet)}</div></div>
    <div class="field" style="margin-bottom:8px"><label>Travaux réalisés</label><div class="v big">${val(d.travaux)}</div></div>
    ${d.a_prevoir?`<div class="field"><label>Travaux à prévoir</label><div class="v" style="color:#EA7807">${d.a_prevoir}</div></div>`:''}
  </div>
</div>

${d.photos_data&&d.photos_data.length?`
<div class="section">
  <div class="sec-title"><div class="bar t"></div>Photos</div>
  <div class="sec-body">
    <div class="photos-grid">${d.photos_data.map(p=>`<div><img src="${p.data}"><div style="font-size:9px;color:#666;text-align:center;margin-top:2px">${p.caption||''}</div></div>`).join('')}</div>
  </div>
</div>`:''}

<div class="section">
  <div class="sec-title"><div class="bar t"></div>Fournitures & Pièces</div>
  <div class="sec-body">
    <table>
      <thead><tr>
        <th>Référence</th><th>Désignation</th><th style="text-align:center">Qté</th>
        ${showDetail?'<th style="text-align:right">PU HT</th><th style="text-align:right">Total HT</th>':''}
        <th>Provenance</th>
      </tr></thead>
      <tbody>${piecesRows||'<tr><td colspan="6" style="color:#999;font-style:italic;text-align:center">Aucune pièce</td></tr>'}</tbody>
    </table>
    ${showTotal?`<div class="tot-box">
      ${showDetail?`
        <div class="tot-row"><span style="color:#666">Pièces HT</span><span>${fmt(d.totaux_detail?.pieces)}</span></div>
        <div class="tot-row"><span style="color:#666">Main d'œuvre HT</span><span>${fmt(d.totaux_detail?.mo)}</span></div>
        <div class="tot-row"><span style="color:#666">Déplacement HT</span><span>${fmt(d.totaux_detail?.dep)}</span></div>
        <div class="tot-row"><span style="color:#666">Total HT</span><span>${fmt(d.totaux?.ht)}</span></div>
        <div class="tot-row"><span style="color:#666">TVA 20%</span><span>${fmt((d.totaux?.ht||0)*0.20)}</span></div>`:''}
      <div class="tot-row final"><span>TOTAL TTC</span><span>${fmt(d.totaux?.ttc)}</span></div>
    </div>`:''}
  </div>
</div>

<div class="section">
  <div class="sec-title"><div class="bar"></div>Temps & Déplacement</div>
  <div class="sec-body">
    <div class="h-boxes">
      <div class="h-box"><span class="hl">Arrivée</span><span class="hv">${val(d.temps?.arrivee)}</span></div>
      <div class="h-box"><span class="hl">Départ</span><span class="hv">${val(d.temps?.depart_client)}</span></div>
      <div class="h-box teal"><span class="hl">Durée</span><span class="hv">${duree}</span></div>
      <div class="h-box"><span class="hl">Km</span><span class="hv">${val(d.temps?.km)}</span></div>
    </div>
    <div style="font-size:10px;color:#666">Déplacement facturé : <strong>${d.deplacement_facture?'Oui':'Non'}</strong></div>
    ${d.remarques?`<div style="margin-top:8px;font-size:10px;color:#666"><strong>Remarques :</strong> ${d.remarques}</div>`:''}
  </div>
</div>

<div class="section">
  <div class="sec-title"><div class="bar t"></div>Validation & Signatures</div>
  <div class="sec-body">
    <div class="sig-notice">Les travaux ont été exécutés conformément à la demande du client, qui confirme leur bonne exécution. Par sa signature, le client accepte sans réserve les conditions générales d'intervention ISSEO figurant au dos du présent document.</div>
    <div class="sig-grid">
      <div class="sig-box">
        <div class="sig-box-hd">Signature Client</div>
        <div class="sig-area">${d.sig_client?`<img src="${d.sig_client}">`:'<span style="color:#ccc;font-size:10px">Non signé</span>'}</div>
        <div class="sig-name">${val(d.signataire?.nom)} — ${val(d.signataire?.fonction)}</div>
      </div>
      <div class="sig-box">
        <div class="sig-box-hd">Responsable ISSEO</div>
        <div class="sig-area">${d.sig_isseo?`<img src="${d.sig_isseo}">`:'<span style="color:#ccc;font-size:10px">ISSEO</span>'}</div>
        <div class="sig-name">ISSEO Chariots Élévateurs</div>
      </div>
    </div>
  </div>
</div>

<div class="footer">
  <strong>ISSEO CHARIOTS ÉLÉVATEURS</strong> – SASU au capital de 3 000 € – SIRET 911 977 809 00019 – APE 3312Z – TVA FR36 911 977 809<br>
  20 Allée Marie Curie – ZA Lavalduc – 13270 Fos-sur-Mer &nbsp;|&nbsp; 37d chemin de Margaillan – 13200 Arles<br>
  Paiement à 30 jours date de facture – Tribunal de Commerce de Tarascon
</div>

</body></html>`;
}

// ── GÉNÉRATION HTML DEVIS ──
function genererHTMLDevis(d){
  const fmt = n => n ? parseFloat(n).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+'€' : '—';
  const val = v => v||'—';
  const now = new Date();
  const devisNum = 'DEV-'+now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0');
  const validity = new Date(now.getTime()+30*24*60*60*1000).toLocaleDateString('fr-FR');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;font-size:11px;color:#222;margin:0;padding:20px;max-width:800px}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #3AB6AD;padding-bottom:12px;margin-bottom:14px}
  .logo{font-size:28px;font-weight:900;letter-spacing:4px;color:#4A4A4A}.logo span{color:#EA7807}
  .logo-sub{font-size:8px;letter-spacing:2px;text-transform:uppercase;color:#999}
  .logo-contact{font-size:9px;color:#666;margin-top:4px;line-height:1.7}
  .dev-num{text-align:right}.dev-num-v{font-size:22px;font-weight:900;color:#3AB6AD;font-family:monospace}
  .section{margin-bottom:10px;border:1px solid #ddd;border-radius:4px;overflow:hidden}
  .sec-title{background:#f5f4f0;padding:6px 10px;font-weight:bold;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#4A4A4A;border-bottom:1px solid #ddd}
  .sec-body{padding:10px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .field label{font-size:8px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#999;display:block;margin-bottom:2px}
  .field .v{border-bottom:1px solid #ddd;padding:3px 2px;min-height:18px}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th{background:#f5f4f0;padding:5px 6px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#666;border-bottom:2px solid #ddd}
  td{padding:6px;border-bottom:1px solid #f0f0f0}
  .tot-box{margin-top:8px;border:1px solid #ddd;border-radius:4px;overflow:hidden}
  .tot-row{display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #f0f0f0}
  .tot-row.final{background:#3AB6AD;color:white;font-weight:bold;border:none}
  .validity{background:#fff8e6;border:1px solid #ffd87a;border-radius:4px;padding:8px 12px;font-size:10px;color:#886600;margin-top:10px}
  .footer{margin-top:14px;padding-top:8px;border-top:2px solid #3AB6AD;text-align:center;font-size:9px;color:#888;line-height:1.8}
</style></head><body>

<div class="hdr">
  <div>
    <div class="logo">ISS<span>É</span>O</div>
    <div class="logo-sub">Chariots Élévateurs · Vente Location Maintenance</div>
    <div class="logo-contact">20 Allée Marie Curie – ZA Lavalduc – 13270 Fos-sur-Mer<br>Tél : 06 07 08 69 58 · 04 42 06 70 14 · contact@isseochariot.fr</div>
  </div>
  <div class="dev-num">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#999">Devis N°</div>
    <div class="dev-num-v">${devisNum}</div>
    <div style="font-size:9px;color:#666">Suite à RI ${val(d.numero)}</div>
    <div style="font-size:9px;color:#666">Date : ${now.toLocaleDateString('fr-FR')}</div>
  </div>
</div>

<div class="section">
  <div class="sec-title">Client & Matériel</div>
  <div class="sec-body grid2">
    <div class="field"><label>Client</label><div class="v">${val(d.client)}</div></div>
    <div class="field"><label>Site</label><div class="v">${val(d.site)}</div></div>
    <div class="field"><label>Matériel</label><div class="v">${val(d.materiel?.type)} — ${val(d.materiel?.serie)}</div></div>
    <div class="field"><label>Horamètre</label><div class="v">${val(d.materiel?.horametre)} h</div></div>
  </div>
</div>

<div class="section">
  <div class="sec-title">Travaux Proposés</div>
  <div class="sec-body">
    <p style="margin-bottom:10px;font-size:11px;color:#555">Suite à notre intervention du ${val(d.date)}, nous vous proposons les travaux suivants :</p>
    <p style="padding:8px;background:#fff8f5;border-left:3px solid #EA7807;font-size:11px">${val(d.a_prevoir)}</p>
    <table style="margin-top:10px">
      <thead><tr><th>Désignation</th><th style="text-align:center">Qté</th><th style="text-align:right">PU HT</th><th style="text-align:right">Total HT</th></tr></thead>
      <tbody>
        <tr><td>Main d'œuvre (estimation)</td><td style="text-align:center">—</td><td style="text-align:right">Sur devis</td><td style="text-align:right">—</td></tr>
        <tr><td>Pièces détachées (estimation)</td><td style="text-align:center">—</td><td style="text-align:right">Sur devis</td><td style="text-align:right">—</td></tr>
        <tr><td>Déplacement</td><td style="text-align:center">1</td><td style="text-align:right">Forfait</td><td style="text-align:right">—</td></tr>
      </tbody>
    </table>
    <div class="validity">⏱ Ce devis préliminaire est valable 30 jours jusqu'au ${validity}. Un devis détaillé vous sera transmis sur demande.</div>
  </div>
</div>

<div class="footer">
  <strong>ISSEO CHARIOTS ÉLÉVATEURS</strong> – SIRET 911 977 809 00019 – TVA FR36 911 977 809<br>
  Pour accepter ce devis, répondez à cet email ou appelez le 06 07 08 69 58
</div>

</body></html>`;
}

// ── ENVOI EMAIL BREVO (SMTP) ──
async function envoyerEmailSendGrid(d, htmlRapport, htmlDevis){
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    auth: { user: 'contact@isseochariot.fr', pass: SENDGRID_KEY }
  });

  const clientEmail = d.client_email||null;
  const sujet = `Rapport d'intervention ISSEO – ${d.numero||'RI'} – ${d.client||'Client'}`;

  // Email à ISSEO avec rapport complet
  await transporter.sendMail({
    from: `ISSEO Rapports <${ISSEO_EMAIL}>`,
    to: ISSEO_EMAIL,
    subject: sujet,
    html: htmlRapport,
    attachments:[{
      content: Buffer.from(htmlRapport).toString('utf-8'),
      filename: `${d.numero||'RI'}_${(d.client||'client').replace(/\s/g,'_')}.html`,
      contentType: 'text/html'
    }]
  });

  // Email au client (version sans prix confidentiels)
  if(clientEmail){
    await transporter.sendMail({
      from: `ISSEO Chariots Élévateurs <${ISSEO_EMAIL}>`,
      to: clientEmail,
      subject: sujet,
      html: htmlRapport
    });
  }

  // Email devis si travaux à prévoir
  if(htmlDevis){
    await transporter.sendMail({
      from: `ISSEO Rapports <${ISSEO_EMAIL}>`,
      to: ISSEO_EMAIL,
      subject: `⚡ DEVIS à valider – ${d.client||'Client'} – Suite RI ${d.numero||''}`,
      html: htmlDevis
    });
    if(clientEmail){
      await transporter.sendMail({
        from: `ISSEO Chariots Élévateurs <${ISSEO_EMAIL}>`,
        to: clientEmail,
        subject: `Devis ISSEO – Travaux à prévoir – ${d.client||'Client'}`,
        html: htmlDevis
      });
    }
  }
}

// ── PROXY CHAT (existant) ──
app.post('/api/chat', async (req, res) => {
  if(!ANTHROPIC_KEY) return res.status(500).json({error:'Clé API manquante'});
  try{
    const r = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:req.body.max_tokens||1000,system:req.body.system,messages:req.body.messages})
    });
    res.json(await r.json());
  }catch(e){res.status(500).json({error:'Erreur'});}
});

app.get('*',(req,res)=>{res.sendFile(path.join(__dirname,'public','index.html'));});
app.listen(PORT,()=>console.log('ISSEO v2 port '+PORT));
