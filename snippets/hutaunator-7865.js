import readline from 'readline';

const BASE = 'https://hutaonator.satriadeveloperz.workers.dev';
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function startGame() {
  const data = await apiPost('/api/game/start', { childMode: false });
  console.log(JSON.stringify(data, null, 2));
  return data.game;
}

async function answerGame(gameId, answer) {
  const data = await apiPost(`/api/game/${gameId}/answer`, { answer });
  console.log(JSON.stringify(data, null, 2));
  return data.game;
}

async function getState(gameId) {
  const data = await fetch(`${BASE}/api/game/${gameId}`).then(r => r.json());
  console.log(JSON.stringify(data, null, 2));
  return data.game;
}

async function rejectGuess(gameId) {
  const data = await apiPost(`/api/game/${gameId}/reject`);
  console.log(JSON.stringify(data, null, 2));
  return data.game;
}

async function confirmGuess(gameId) {
  const data = await apiPost(`/api/game/${gameId}/confirm`);
  console.log(JSON.stringify(data, null, 2));
  return data.game;
}

async function reveal(gameId, name) {
  const data = await apiPost(`/api/game/${gameId}/reveal`, { name });
  console.log(JSON.stringify(data, null, 2));
  return data.game;
}

async function abandon(gameId) {
  const data = await apiPost(`/api/game/${gameId}/abandon`);
  console.log(JSON.stringify(data, null, 2));
  return data.game;
}

async function play() {
  console.log('=== Hutaonator CLI ===\n');
  
  let game = await startGame();
  
  while (game && ['playing', 'guessing'].includes(game.status)) {
    if (game.status === 'playing') {
      console.log(`\nPertanyaan #${game.step + 1}: ${game.question}`);
      console.log(`Keyakinan: ${game.progression}%`);
      console.log('\n1. Iya  2. Tidak  3. Tidak tahu  4. Mungkin  5. Mungkin tidak');
      
      const map = { '1':'yes', '2':'no', '3':'idk', '4':'probably', '5':'probably not' };
      let ch;
      while (true) {
        ch = (await ask('>> ')).toLowerCase().trim();
        if (map[ch]) break;
      }
      game = await answerGame(game.id, map[ch]);
      
    } else if (game.status === 'guessing') {
      console.log('\n=== TEBAKAN HU TAO ===');
      console.log(`Nama    : ${game.guess?.name}`);
      console.log(`Foto    : ${game.guess?.photo || 'tidak ada'}`);
      console.log(`Deskripsi: ${game.guess?.description || '-'}`);
      console.log('=====================');
      console.log('\n1. Benar  2. Salah');
      
      let ch;
      while (true) {
        ch = (await ask('>> ')).toLowerCase().trim();
        if (ch === '1' || ch === 'y') { game = await confirmGuess(game.id); break; }
        if (ch === '2' || ch === 'n') { game = await rejectGuess(game.id); break; }
      }
    }
  }
  
  if (game?.status === 'won') {
    console.log('\n=== HU TAO MENANG ===');
    console.log(`Nama  : ${game.guess?.name}`);
    console.log(`Foto  : ${game.guess?.photo || 'tidak ada'}`);
    console.log(`Detail: ${game.guess?.description || '-'}`);
    console.log(`Ditebak dalam ${game.step} pertanyaan`);
    if (game.wrongGuesses > 0) console.log(`${game.wrongGuesses} tebakan meleset`);
    
  } else if (game?.status === 'lost') {
    console.log('\n=== KAMU MENANG ===');
    console.log(`Hu Tao menyerah setelah ${game.step} pertanyaan`);
    if (!game.revealedName) {
      const name = (await ask('Siapa jawabannya? ')).trim();
      if (name) await reveal(game.id, name);
    }
  }
  
  rl.close();
}

play().catch(e => { console.error('Error:', e.message); rl.close(); });
