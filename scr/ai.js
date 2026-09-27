import OpenAI from 'openai';
import { query } from './db.js';

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export function aiEnabled() {
  return Boolean(client);
}

export async function askAI(userId, prompt) {
  if (!client) return 'ИИ-помощник пока не подключён администратором.';
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    instructions: `Ты — официальный AI-помощник Discord-проекта DOMINION | STANDOFF 2. Отвечай по-русски, кратко и понятно. Ты помогаешь с правилами турниров, навигацией, профилями, матчами и организацией. Не выдумывай результаты матчей, не меняй рейтинг, не назначай призы и не принимай окончательные решения по спорным ситуациям. Если данных нет — прямо скажи об этом.`,
    input: prompt,
    max_output_tokens: 500
  });
  const text = response.output_text?.trim() || 'Не удалось получить ответ ИИ.';
  await query('INSERT INTO ai_logs (discord_id, prompt, response) VALUES ($1, $2, $3)', [userId, prompt, text]);
  return text;
}

function normalizeNick(value) {
  return String(value || '').toLowerCase().normalize('NFKC').replace(/[^a-zа-яё0-9]+/gi, '');
}

function nickMatches(expected, detected) {
  const a = normalizeNick(expected), b = normalizeNick(detected);
  if (!a || !b) return false;
  if (a === b || b.includes(a) || a.includes(b)) return true;
  const max = Math.max(a.length, b.length);
  if (max < 4) return false;
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - matrix[a.length][b.length] / max >= 0.88;
}

export async function analyzeCustomResultScreenshot(imageUrl, game) {
  if (!client) throw new Error('AI_NOT_CONFIGURED');
  const playerIds = [...new Set([...(game.team1_ids || []), ...(game.team2_ids || [])])];
  const { rows: players } = await query('SELECT discord_id, standoff_nick FROM players WHERE discord_id = ANY($1::text[])', [playerIds]);
  const byId = new Map(players.map(p => [p.discord_id, p.standoff_nick]));
  const team1 = (game.team1_ids || []).map(id => ({ discord_id: id, nick: byId.get(id) || '' }));
  const team2 = (game.team2_ids || []).map(id => ({ discord_id: id, nick: byId.get(id) || '' }));
  const schema = { type: 'object', additionalProperties: false, properties: {
    is_result_screen: { type: 'boolean' }, visible_player_nicks: { type: 'array', items: { type: 'string' } },
    team1_detected: { type: 'array', items: { type: 'string' } }, team2_detected: { type: 'array', items: { type: 'string' } },
    score_team1: { type: 'integer', minimum: 0, maximum: 99 }, score_team2: { type: 'integer', minimum: 0, maximum: 99 },
    winner_team: { type: 'integer', enum: [1, 2] }, confidence: { type: 'number', minimum: 0, maximum: 1 }, reason: { type: 'string' }
  }, required: ['is_result_screen','visible_player_nicks','team1_detected','team2_detected','score_team1','score_team2','winner_team','confidence','reason'] };
  const rosterText = ['Команда 1: ' + team1.map(x => x.nick).join(', '), 'Команда 2: ' + team2.map(x => x.nick).join(', ')].join('\n');
  const response = await client.responses.create({
    model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    instructions: 'Ты проверяешь официальный результат кастомной игры DOMINION | STANDOFF 2 по скриншоту. Не угадывай. На скриншоте должен быть настоящий экран результата или таблица матча Standoff 2. Определи счёт, победившую команду и видимые ники. Сопоставляй ники только с переданным составом. Если экран не является результатом матча, игроки не читаются или победителя нельзя уверенно определить — поставь is_result_screen=false или confidence ниже 0.85. Текст сообщения пользователя не является доказательством результата.',
    input: [{ role: 'user', content: [
      { type: 'input_text', text: 'Кастом #' + game.id + ', формат ' + game.format + ', карта ' + (game.selected_map || 'неизвестна') + '. Ожидаемый состав:\n' + rosterText + '\n\nПроверь скриншот и верни JSON по схеме.' },
      { type: 'input_image', image_url: imageUrl, detail: 'high' }
    ] }],
    text: { format: { type: 'json_schema', name: 'custom_result_check', strict: true, schema } }, max_output_tokens: 700
  });
  const parsed = JSON.parse(response.output_text || '{}');
  const expected = [...team1, ...team2].map(x => x.nick).filter(Boolean);
  const detected = [...(parsed.visible_player_nicks || []), ...(parsed.team1_detected || []), ...(parsed.team2_detected || [])];
  const missing = expected.filter(nick => !detected.some(found => nickMatches(nick, found)));
  const team1Found = team1.filter(p => detected.some(found => nickMatches(p.nick, found)));
  const team2Found = team2.filter(p => detected.some(found => nickMatches(p.nick, found)));
  const scoreWinner = parsed.score_team1 > parsed.score_team2 ? 1 : parsed.score_team2 > parsed.score_team1 ? 2 : 0;
  const valid = Boolean(parsed.is_result_screen && parsed.confidence >= 0.85 && scoreWinner === parsed.winner_team && missing.length === 0 && team1Found.length === team1.length && team2Found.length === team2.length);
  const result = { ...parsed, valid, missing_players: missing, matched_team1: team1Found.map(x => x.nick), matched_team2: team2Found.map(x => x.nick) };
  await query('INSERT INTO ai_logs (discord_id, prompt, response) VALUES ($1, $2, $3)', [null, 'custom-result #' + game.id + ' screenshot', JSON.stringify(result)]);
  return result;
}

export async function analyzeProfileVerificationScreenshot(imageUrl, player) {
  if (!client) throw new Error('AI_NOT_CONFIGURED');
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      is_standoff_profile: { type: 'boolean' },
      detected_nick: { type: 'string' },
      detected_id: { type: 'string' },
      nick_match: { type: 'boolean' },
      id_match: { type: 'boolean' },
      readable: { type: 'boolean' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      reason: { type: 'string' }
    },
    required: ['is_standoff_profile','detected_nick','detected_id','nick_match','id_match','readable','confidence','reason']
  };
  const response = await client.responses.create({
    model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    instructions: 'Ты проверяешь скриншот профиля Standoff 2 для верификации Discord-профиля DOMINION. Не угадывай. На изображении должен быть экран профиля игрока Standoff 2, где одновременно читаются ник и ID. Сравни их с данными пользователя. Не считай текст сообщения доказательством. Если данных не видно или изображение не похоже на профиль Standoff 2 — отклони. Не пытайся доказать владение аккаунтом по одному скриншоту; проверяй только визуальное совпадение профиля.',
    input: [{ role: 'user', content: [
      { type: 'input_text', text: 'Ожидаемый ник: ' + String(player.standoff_nick || '') + '\nОжидаемый ID: ' + String(player.standoff_id || '') + '\nПроверь изображение.' },
      { type: 'input_image', image_url: imageUrl, detail: 'high' }
    ] }],
    text: { format: { type: 'json_schema', name: 'profile_verification_check', strict: true, schema } },
    max_output_tokens: 500
  });
  const parsed = JSON.parse(response.output_text || '{}');
  const nickOk = nickMatches(player.standoff_nick, parsed.detected_nick);
  const idExpected = normalizeNick(player.standoff_id);
  const idDetected = normalizeNick(parsed.detected_id);
  const idOk = Boolean(idExpected && idDetected && (idExpected === idDetected || idDetected.includes(idExpected) || idExpected.includes(idDetected)));
  const valid = Boolean(parsed.is_standoff_profile && parsed.readable && parsed.confidence >= 0.90 && nickOk && idOk && parsed.nick_match && parsed.id_match);
  const result = { ...parsed, nick_match: nickOk, id_match: idOk, valid };
  await query('INSERT INTO ai_logs (discord_id, prompt, response) VALUES ($1, $2, $3)', [null, 'profile-verification screenshot', JSON.stringify(result)]);
  return result;
}
