import { EmbedBuilder } from 'discord.js';
import { getLeaderboard } from './db.js';

const DAY = 24 * 60 * 60 * 1000;

const POSTS = [
  ['⚔️ DOMINION', '**DOMINION | STANDOFF 2**\n\nЗдесь собираются игроки, которым надоели рандомы.\n\n🎯 Тиммейты\n🔥 Кастомки\n🏆 Турниры\n📊 Рейтинг\n🎙️ Голосовые комнаты\n\n**Не рандомы — тиммейты.**'],
  ['🎯 ВОПРОС ДНЯ', 'Какая твоя основная роль?\n\n🔫 Entry\n🎯 Sniper\n🧠 IGL\n🛡️ Support\n\nПиши свою роль в чате.'],
  ['🔎 ПОИСК КОМАНДЫ', '**Ищешь тиммейтов?**\n\nНапиши:\n🎮 Режим\n🏆 Ранг\n🎯 Роль\n⭐ Уровень игры\n\nСобираем DOMINION-пятёрку.'],
  ['🎙️ ГОЛОСОВЫЕ', '**Своя комната за один заход.**\n\nЗайди в 🎙️・Создать комнату — бот создаст личную голосовую комнату.\n\n✏️ Название · 👥 Лимит · 🔒 Доступ · 🚫 Блокировка · 👑 Владелец'],
  ['🎥 CLIP OF THE DAY', '**Покажи свой момент.**\n\nКидай вантапы, клатчи, смешные моменты и фейлы в 📸・клипы-и-скрины.\n\nЛучшие моменты можно использовать в контенте DOMINION.'],
  ['🔥 TEAM NIGHT', '**Сегодня собираем пати.**\n\nСоздавай голосовую комнату, зови тиммейтов и собирай состав.\n\n**DOMINION вечером живёт. ⚔️**'],
  ['🏆 DOMINION OPEN', '**Скоро турнир.**\n\n⚔️ Команды\n🎮 Кастомные матчи\n📊 Рейтинг\n👑 Победители\n\nСобирай состав заранее.'],
  ['🧠 СИТУАЦИЯ', '**1v2. 10 секунд. Бомба установлена.**\n\nЧто делаешь?\n\nПиши свой вариант — посмотрим, кто думает как IGL.'],
  ['😂 ФЕЙЛ ДНЯ', '**Рассказывай самый болезненный фейл в Standoff 2.**\n\nБез осуждения. 😂'],
  ['⚔️ КАСТОМКИ', '**Кто готов к кастомке?**\n\nПиши + в чат, если сегодня играешь.\n\nСобираем игроков DOMINION.'],
  ['📊 ПРОВЕРЬ СТАТИСТИКУ', '**А какой у тебя результат?**\n\nОткрой профиль DOMINION и проверь победы, поражения, рейтинг и серию побед.'],
  ['👑 WEEKLY TOP', '**Лучшие игроки недели уже близко.**\n\nИграйте, побеждайте и поднимайте рейтинг DOMINION.'],
];

function embed(title, description) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x8b0000).setFooter({ text: 'DOMINION · Skill. Discipline. Domination.' }).setTimestamp();
}

export async function buildDailyContent(dayIndex = 0) {
  const item = POSTS[((dayIndex % POSTS.length) + POSTS.length) % POSTS.length];
  return embed(item[0], item[1]);
}

export async function buildWeeklyTop() {
  const players = await getLeaderboard(10);
  const lines = players.length
    ? players.map((p, i) => {
        const rating = Number(p.rating || 0);
        const wins = Number(p.wins || 0);
        const losses = Number(p.losses || 0);
        return `**${i + 1}.** <@${p.discord_id}> — **${rating}** рейтинга · ${wins}W / ${losses}L`;
      })
    : ['Пока игроков нет. Как только появятся первые участники — здесь будет настоящий топ.'];
  return embed('🏆 DOMINION WEEKLY TOP', lines.join('\n'));
}

export function createContentScheduler(client, options = {}) {
  const { channelId, enabled = false, hour = 20 } = options;
  if (!enabled) {
    console.log('[DOMINION CONTENT] Scheduler prepared but DISABLED.');
    return null;
  }
  if (!channelId) throw new Error('DOMINION CONTENT: CONTENT_CHANNEL_ID is required when enabled.');

  let lastDay = -1;
  let lastWeekly = -1;

  const tick = async () => {
    const now = new Date();
    if (now.getHours() !== Number(hour)) return;
    const day = Math.floor(now.getTime() / DAY);
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    if (day !== lastDay) {
      lastDay = day;
      await channel.send({ embeds: [await buildDailyContent(day)] }).catch(error => console.error('[DOMINION CONTENT] Daily post failed:', error));
    }

    const weekday = now.getDay();
    if (weekday === 1 && day !== lastWeekly) {
      lastWeekly = day;
      await channel.send({ embeds: [await buildWeeklyTop()] }).catch(error => console.error('[DOMINION CONTENT] Weekly top failed:', error));
    }
  };

  tick();
  return setInterval(tick, 60 * 1000);
}
