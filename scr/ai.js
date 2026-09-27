import OpenAI from 'openai';
import { query } from './db.js';

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export function aiEnabled() {
  return Boolean(client);
}

export async function askAI(userId, prompt) {
  if (!client) return 'ИИ-помощник пока не подключён администратором.';
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5',
    instructions: `Ты — официальный AI-помощник Discord-проекта DOMINION | STANDOFF 2. Отвечай по-русски, кратко и понятно. Ты помогаешь с правилами турниров, навигацией, профилями, матчами и организацией. Не выдумывай результаты матчей, не меняй рейтинг, не назначай призы и не принимай окончательные решения по спорным ситуациям. Если данных нет — прямо скажи об этом.`,
    input: prompt,
    max_output_tokens: 500
  });
  const text = response.output_text?.trim() || 'Не удалось получить ответ ИИ.';
  await query('INSERT INTO ai_logs (discord_id, prompt, response) VALUES ($1, $2, $3)', [userId, prompt, text]);
  return text;
}
