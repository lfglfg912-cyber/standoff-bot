import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getTournament, getTournamentPlayers, getTournamentMatches, getPlayerMatches } from './db.js';
import { resultButtons } from './ui.js';

export function tournamentsEmbed(tournaments) {
  const embed = new EmbedBuilder()
    .setTitle('🏆 Турниры DOMINION')
    .setDescription(tournaments.length ? 'Выбери турнир ниже.' : 'Сейчас активных турниров нет.')
    .setColor(0x8b0000);

  for (const t of tournaments) {
    embed.addFields({
      name: `#${t.id} · ${t.name}`,
      value: `Статус: **${t.status === 'registration' ? 'Регистрация' : 'Идёт'}**\nУчастники: **${t.registered}/${t.slots}** · Приз: **${t.prize_gold} G**`,
      inline: false
    });
  }
  return embed;
}

export function tournamentButtons(tournaments) {
  const row = new ActionRowBuilder();
  for (const t of tournaments.slice(0, 5)) {
    row.addComponents(new ButtonBuilder().setCustomId(`t:view:${t.id}`).setLabel(`#${t.id}`).setStyle(ButtonStyle.Secondary));
  }
  return row.components.length ? [row] : [];
}

export async function tournamentView(id) {
  const t = await getTournament(id);
  if (!t) return { content: 'Турнир не найден.', components: [] };

  const players = await getTournamentPlayers(id);
  const matches = t.status === 'registration' ? [] : await getTournamentMatches(id);

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${t.name}`)
    .setDescription(
      `Формат: **1v1 Single Elimination**\nУчастники: **${players.length}/${t.slots}**\nПризовой фонд: **${t.prize_gold} G**\nСтатус: **${t.status === 'registration' ? 'Регистрация' : t.status === 'running' ? 'В процессе' : 'Завершён'}**`
    )
    .setColor(0x8b0000);

  if (players.length) {
    embed.addFields({
      name: 'Участники',
      value: players.slice(0, 20).map((p, i) => `${i + 1}. ${p.standoff_nick}`).join('\n')
    });
  }

  if (matches.length) {
    const active = matches.filter(m => m.status === 'pending');
    const completed = matches.filter(m => m.status === 'completed');

    if (active.length) {
      embed.addFields({
        name: '🎮 Текущие матчи',
        value: active.slice(0, 10).map(m =>
          `Раунд ${m.round}, матч ${m.match_no}: **${m.player1_nick}** vs **${m.player2_nick}**`
        ).join('\n')
      });
    }

    if (completed.length) {
      embed.addFields({
        name: '✅ Завершённые матчи',
        value: completed.slice(-10).reverse().map(m =>
          `Раунд ${m.round}, матч ${m.match_no}: **${m.winner_nick || 'неизвестно'}** победил`
        ).join('\n')
      });
    }
  }

  const components = [];
  const row = new ActionRowBuilder();

  if (t.status === 'registration' && players.length < t.slots) {
    row.addComponents(new ButtonBuilder().setCustomId(`t:join:${id}`).setLabel('🎮 Участвовать').setStyle(ButtonStyle.Success));
  }
  if (t.status === 'registration' && players.length === t.slots) {
    row.addComponents(new ButtonBuilder().setCustomId(`t:start:${id}`).setLabel('⚔️ Запустить').setStyle(ButtonStyle.Danger));
  }
  row.addComponents(new ButtonBuilder().setCustomId(`t:refresh:${id}`).setLabel('🔄 Обновить').setStyle(ButtonStyle.Secondary));

  if (row.components.length) components.push(row);
  return { embeds: [embed], components };
}

export async function matchesEmbed(discordId) {
  const matches = await getPlayerMatches(discordId);
  const embed = new EmbedBuilder().setTitle('🎮 Мои матчи').setColor(0x8b0000);

  if (!matches.length) {
    return { embeds: [embed.setDescription('Матчей пока нет.')], components: [] };
  }

  const lines = matches.map(m => {
    const opponent = m.player1_id === discordId ? m.player2_id : m.player1_id;
    const status = m.status === 'pending'
      ? '⏳ ожидает результата'
      : m.winner_id === discordId
        ? '✅ победа'
        : '❌ поражение';

    return `**${m.tournament_name}** · раунд ${m.round}, матч ${m.match_no}\nСоперник: <@${opponent}> · ${status}`;
  });

  embed.setDescription(lines.join('\n\n'));

  const components = [];
  for (const match of matches.filter(m => m.status === 'pending').slice(0, 5)) {
    components.push(...resultButtons(match));
  }

  return { embeds: [embed], components };
}
