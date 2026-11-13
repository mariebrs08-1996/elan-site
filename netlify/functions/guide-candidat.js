// Netlify Function : inscrit un contact dans Brevo quand il demande une ressource gratuite.
// Variables d'environnement Netlify :
//   BREVO_API_KEY             : clé API Brevo
//   BREVO_LIST_ID             : liste Brevo du Guide du candidat
//   BREVO_LIST_ID_LIVRE_BLANC : liste Brevo du livre blanc managers (optionnelle)
//   BREVO_FIRSTNAME_ATTR      : attribut prénom, PRENOM par défaut

exports.handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });

  let data;
  try { data = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'json' }); }

  if (data.website) return json(200, { ok: true });

  const email = String(data.email || '').trim().toLowerCase();
  const prenom = String(data.prenom || '').trim().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'email' });

  const livreBlanc = data.ressource === 'livre-blanc';
  const apiKey = process.env.BREVO_API_KEY;
  const listId = parseInt(livreBlanc ? process.env.BREVO_LIST_ID_LIVRE_BLANC : process.env.BREVO_LIST_ID, 10);

  // Livre blanc sans liste configurée : on laisse télécharger, sans inscrire le contact.
  if (livreBlanc && !listId) {
    console.warn('BREVO_LIST_ID_LIVRE_BLANC manquant : contact non enregistré');
    return json(200, { ok: true, stored: false });
  }

  const missing = [];
  if (!apiKey) missing.push('BREVO_API_KEY');
  if (!listId) missing.push(livreBlanc ? 'BREVO_LIST_ID_LIVRE_BLANC' : 'BREVO_LIST_ID');
  if (missing.length) return json(500, { error: 'config', missing });

  const attr = process.env.BREVO_FIRSTNAME_ATTR || 'PRENOM';
  const send = (withAttributes) => fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      email,
      listIds: [listId],
      updateEnabled: true,
      ...(withAttributes && prenom ? { attributes: { [attr]: prenom } } : {}),
    }),
  });

  try {
    let res = await send(true);
    if (res.status === 400 && prenom) res = await send(false);
    if (res.ok) return json(200, { ok: true });
    const txt = await res.text();
    console.error('Brevo error', res.status, txt);
    return json(502, { error: 'brevo' });
  } catch (e) {
    console.error('Brevo fetch failed', e);
    return json(502, { error: 'network' });
  }
};
