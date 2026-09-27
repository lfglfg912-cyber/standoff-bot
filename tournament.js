import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getTournament, getTournamentPlayers, listTournaments, getPlayerMatches } from './db.js';

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
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${t.name}`)
    .setDescription(`Формат: **1v1 Single Elimination**\nУчастники: **${players.length}/${t.slots}**\nПризовой фонд: **${t.prize_gold} G**\nСтатус: **${t.status === 'registration' ? 'Регистрация' : t.status === 'running' ? 'В процессе' : 'Завершён'}**`)
    .setColor(0x8b0000);
  if (players.length) embed.addFields({ name: 'Участники', value: players.slice(0, 20).map((p, i) => `${i + 1}. ${p.standoff_nick}`).join('\n') });
  const row = new ActionRowBuilder();
  if (t.status === 'registration' && players.length < t.slots) row.addComponents(new ButtonBuilder().setCustomId(`t:join:${id}`).setLabel('🎮 Участвовать').setStyle(ButtonStyle.Success));
  if (t.status === 'registration' && players.length === t.slots) row.addComponents(new ButtonBuilder().setCustomId(`t:start:${id}`).setLabel('⚔️ Запустить').setStyle(ButtonStyle.Danger));
  row.addComponents(new ButtonBuilder().setCustomId(`t:refresh:${id}`).setLabel('🔄 Обновить').setStyle(ButtonStyle.Secondary));
  return { embeds: [embed], components: [row] };
}

export async function matchesEmbed(discordId) {
  const matches = await getPlayerMatches(discordId);
  const embed = new EmbedBuilder().setTitle('🎮 Мои матчи').setColor(0x8b0000);
  if (!matches.length) return embed.setDescription('Матчей пока нет.');
  embed.setDescription(matches.map(m => {
    const opponent = m.player1_id === discordId ? m.player2_id : m.player1_id;
    const status = m.status === 'pending' ? '⏳ ожидает' : m.winner_id === discordId ? '✅ победа' : '❌ поражение';
    return `**${m.tournament_name}** · раунд ${m.round}, матч ${m.match_no}\nСоперник: <@${opponent}> · ${status}`;
  }).join('\n\n'));
  return embed;
}
