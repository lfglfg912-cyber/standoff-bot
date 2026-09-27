import { createWorker } from 'tesseract.js';
import sharp from 'sharp';

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng+rus', 1, {
        logger: message => {
          if (message.status === 'recognizing text' && Number.isFinite(message.progress)) {
            const pct = Math.round(message.progress * 100);
            if (pct % 25 === 0) console.log('[DOMINION OCR] Recognizing:', pct + '%');
          }
        }
      });
      return worker;
    })().catch(error => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ё]/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '');
}

function nickMatches(expected, text) {
  const a = normalizeText(expected);
  const b = normalizeText(text);
  if (!a || !b) return false;
  return b.includes(a) || a.includes(b);
}

function extractScore(text) {
  const source = String(text || '').replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
  const patterns = [
    /\b(\d{1,2})\\s*[:xX-]\\s*(\d{1,2})\b/g,
    /\b(\d{1,2})\\s*[—–-]\\s*(\d{1,2})\b/g
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      const a = Number(m[1]), b = Number(m[2]);
      if (a !== b && a <= 99 && b <= 99) return [a, b];
    }
  }
  return null;
}

export async function analyzeCustomResultScreenshotOCR(imageUrl, game) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('OCR_IMAGE_DOWNLOAD_FAILED');
  const input = Buffer.from(await response.arrayBuffer());

  const prepared = await sharp(input)
    .rotate()
    .resize({ width: 2200, withoutEnlargement: false })
    .sharpen()
    .png()
    .toBuffer();

  const worker = await getWorker();
  const result = await worker.recognize(prepared);
  const text = result.data.text || '';

  const team1 = game.team1_ids || [];
  const team2 = game.team2_ids || [];

  const found1 = team1.filter(nick => false);
  const found2 = team2.filter(nick => false);

  // The database stores Discord IDs; resolve their Standoff nicks before OCR matching.
  const { query } = await import('./db.js');
  const { rows } = await query(
    'SELECT discord_id, standoff_nick FROM players WHERE discord_id = ANY($1::text[])',
    [[...new Set([...team1, ...team2])]]
  );
  const nicks = new Map(rows.map(row => [row.discord_id, row.standoff_nick]));
  const team1Nicks = team1.map(id => nicks.get(id)).filter(Boolean);
  const team2Nicks = team2.map(id => nicks.get(id)).filter(Boolean);

  const matchedTeam1 = team1Nicks.filter(nick => nickMatches(nick, text));
  const matchedTeam2 = team2Nicks.filter(nick => nickMatches(nick, text));
  const score = extractScore(text);

  // Require every registered player to be visible in OCR and a non-tied score.
  const valid = Boolean(
    score &&
    matchedTeam1.length === team1Nicks.length &&
    matchedTeam2.length === team2Nicks.length &&
    team1Nicks.length > 0 &&
    team2Nicks.length > 0
  );

  const winnerTeam = score ? (score[0] > score[1] ? 1 : 2) : 0;

  return {
    valid,
    winner_team: winnerTeam,
    score_team1: score?.[0] ?? null,
    score_team2: score?.[1] ?? null,
    matched_team1: matchedTeam1,
    matched_team2: matchedTeam2,
    missing_players: [
      ...team1Nicks.filter(nick => !matchedTeam1.includes(nick)),
      ...team2Nicks.filter(nick => !matchedTeam2.includes(nick))
    ],
    ocr_text: text
  };
}
