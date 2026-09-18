// Prepara o limpia los datos de demostración en una instancia desplegada.
//
//   node scripts/demo-remote.js seed  https://<dominio> <STAFF_PIN> [cuantos]
//   node scripts/demo-remote.js clear https://<dominio> <STAFF_PIN>
//
// "seed" coloca familias ficticias en las franjas justo anteriores a tu
// primera cita real de hoy (o en las próximas libres si aún no has reservado).

const [action, baseUrl, pin, countArg] = process.argv.slice(2);

if (!['seed', 'clear'].includes(action) || !baseUrl || !pin) {
  console.error('Uso: node scripts/demo-remote.js <seed|clear> <url> <STAFF_PIN> [cuantos]');
  process.exit(1);
}

const url = `${baseUrl.replace(/\/$/, '')}/api/demo${action === 'seed' ? '/seed' : ''}`;
const res = await fetch(url, {
  method: action === 'seed' ? 'POST' : 'DELETE',
  headers: { 'Content-Type': 'application/json', 'X-Staff-Pin': pin },
  body: action === 'seed' ? JSON.stringify({ count: Number(countArg) || 4 }) : undefined,
});
const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`Error ${res.status}: ${body.error || 'sin detalle'}`);
  process.exit(1);
}

if (action === 'seed') {
  if (!body.created.length) {
    console.log('No había franjas libres donde colocar la demo.');
  } else {
    console.log(`Creadas ${body.created.length} citas de demo:`);
    for (const a of body.created) console.log(`  ${a.time}  ${a.code}  ${a.name}`);
  }
} else {
  console.log(`Eliminadas ${body.removed} citas de demo.`);
}
