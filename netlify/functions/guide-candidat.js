// Netlify Function : inscrit un contact dans Brevo quand il demande le Guide du candidat.
// Variables d'environnement à définir dans Netlify (Site configuration > Environment variables) :
//   BREVO_API_KEY   : clé API Brevo (Brevo > SMTP & API > Clés API)
//   BREVO_LIST_ID   : identifiant numérique de la liste Brevo « Guide du candidat »
//   BREVO_FIRSTNAME_ATTR (optionnel) : nom de l'attribut prénom dans Brevo, PRENOM par défaut

exports.handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });

  let data;
  try { data = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'json' }); }

  // Champ piège anti-robots : s'il est rempli, on fait semblant que tout va bien.
  if (data.website) return json(200, { ok: true });

  const email = String(data.email || '').trim().toLowerCase();
  const prenom = String(data.prenom || '').trim().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'email' });

  const apiKey = process.env.BREVO_API_KEY;
  const listId = parseInt(process.env.BREVO_LIST_ID, 10);
  if (!apiKey || !listId) return json(500, { error: 'config' });

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
    // Si l'attribut prénom n'existe pas dans Brevo, on réessaie sans lui.
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
