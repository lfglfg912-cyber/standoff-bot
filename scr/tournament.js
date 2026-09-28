import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getTournamentV2, getTournamentTeams, getTournamentTeamMembersWithStats, getTournamentMatchesV2, getPlayerOrCaptainMatches, getVetoState, getRoundVoteState, TEAM_FORMATS } from './tournament-v2.js';
import { resultButtons, vetoButtons, roundVoteButtons } from './ui.js';

function roundLabel(round, totalSlots) {
  const rounds = Math.max(1, Math.ceil(Math.log2(Number(totalSlots) || 1)));
  const fromFinal = rounds - Number(round) + 1;
  if (fromFinal === 1) return '🏆 Финал';
  if (fromFinal === 2) return '🥈 Полуфинал';
  if (fromFinal === 3) return '⚔️ Четвертьфинал';
  return `🔹 Раунд ${round}`;
}

function matchLine(m) {
  const a = m.team1_name || m.player1_nick || (m.player1_id ? `<@${m.player1_id}>` : 'Ожидание');
  const b = m.team2_name || m.player2_nick || (m.player2_id ? `<@${m.player2_id}>` : 'Ожидание');
  const status = m.status === 'completed'
    ? `🏆 ${m.winner_team_name || m.winner_nick || 'победитель'}`
    : m.status === 'cancelled'
      ? '🛑 отменён'
      : m.selected_map
        ? `🗺️ ${m.selected_map}`
        : '🗳️ Бан карт';
  return `Матч ${m.match_no}: **${a}** vs **${b}** · ${status}`;
}

export function tournamentsEmbed(tournaments) {
  const embed = new EmbedBuilder().setTitle('🏆 Турниры DOMINION').setDescription(tournaments.length ? 'Выбери турнир ниже.' : 'Сейчас активных турниров нет.').setColor(0x8b0000);
  for (const t of tournaments) embed.addFields({ name:`#${t.id} · ${t.name}`, value:`Формат: **${t.format || '1v1'}** · ${t.status === 'registration' ? 'Регистрация' : 'Идёт'}\\n${(t.format || '1v1') === '1v1' ? 'Участники' : 'Команды'}: **${t.registered}/${t.slots}** · Раунды: **10 / 12 / 14 / 16 (голосование игроков)** · Приз: **${t.prize_gold} G**` });
  return embed;
}
export function tournamentButtons(ts) {
  const row=new ActionRowBuilder();
  for(const t of ts.slice(0,5)) row.addComponents(new ButtonBuilder().setCustomId(`t:view:${t.id}`).setLabel(`#${t.id}`).setStyle(ButtonStyle.Secondary));
  return row.components.length?[row]:[];
}
export async function tournamentView(id, canManage = false) {
  const t=await getTournamentV2(id); if(!t) return {content:'Турнир не найден.',components:[]};
  const format=t.format||'1v1', teams=format==='1v1'?[]:await getTournamentTeams(id), matches=t.status==='registration'?[]:await getTournamentMatchesV2(id);
  const statusLabel = t.status === 'registration' ? 'Регистрация' : t.status === 'running' ? 'В процессе' : t.status === 'cancelled' ? 'Отменён' : 'Завершён';
  const embed=new EmbedBuilder().setTitle(`🏆 ${t.name}`).setDescription(`Формат: **${format}**\\nУчастники: **${t.registered}/${t.slots}**\\nПриз: **${t.prize_gold} G**\\nСтатус: **${statusLabel}**`).setColor(0x8b0000);
  if(teams.length) {
    const members = await getTournamentTeamMembersWithStats(id);
    const teamLines = teams.slice(0,10).map((team,i) => {
      const roster = members.filter(m => String(m.team_id) === String(team.id));
      const players = roster.map(m => {
        const captain = String(m.discord_id) === String(team.captain_id) ? ' 👑' : '';
        const total = Number(m.wins || 0) + Number(m.losses || 0);
        const rank = total < 5 ? '🎯' : Number(m.rating || 0) >= 1500 ? '🏆' : Number(m.rating || 0) >= 1300 ? '⚔️' : Number(m.rating || 0) >= 1150 ? '🧠' : Number(m.rating || 0) >= 1000 ? '🔫' : '🔰';
        return `${rank} <@${m.discord_id}>${captain}`;
      }).join(', ');
      return `${i + 1}. **${team.name}** — ${team.member_count}/${TEAM_FORMATS[format]}\\n   ${players || 'участники не указаны'}`;
    }).join('\\n');
    embed.addFields({name:'👥 Команды',value:teamLines});
  }
  const components=[];
  if(matches.length){
    const active=matches.filter(m=>m.status!=='completed' && m.status!=='cancelled');
    if(active.length) {
      embed.addFields({
        name:'🎮 Текущие матчи',
        value:active.slice(0,10).map(matchLine).join('\\n')
      });
    }

    const rounds = [...new Set(matches.map(m => Number(m.round)).filter(Number.isFinite))].sort((a,b)=>a-b);
    for (const round of rounds) {
      const roundMatches = matches.filter(m => Number(m.round) === round);
      if (!roundMatches.length) continue;
      const value = roundMatches.map(matchLine).join('\\n');
      embed.addFields({
        name: roundLabel(round, t.slots),
        value: value.slice(0, 1024)
      });
    }
  }
  if(t.status==='registration'){
    const row=new ActionRowBuilder();
    if(format==='1v1') row.addComponents(new ButtonBuilder().setCustomId(`t:join:${id}`).setLabel('🎮 Участвовать').setStyle(ButtonStyle.Success));
    else row.addComponents(new ButtonBuilder().setCustomId(`t:team:${id}`).setLabel(`👑 Зарегистрировать команду ${format}`).setStyle(ButtonStyle.Success));
    if(t.registered===t.slots) row.addComponents(new ButtonBuilder().setCustomId(`t:start:${id}`).setLabel('⚔️ Запустить').setStyle(ButtonStyle.Danger));
    if(canManage) row.addComponents(new ButtonBuilder().setCustomId(`t:cancel:${id}`).setLabel('🛑 Отменить').setStyle(ButtonStyle.Danger));
    row.addComponents(new ButtonBuilder().setCustomId(`t:refresh:${id}`).setLabel('🔄').setStyle(ButtonStyle.Secondary)); components.push(row);
  } else if(t.status==='running' && canManage){
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`t:cancel:${id}`).setLabel('🛑 Отменить турнир').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`t:refresh:${id}`).setLabel('🔄 Обновить').setStyle(ButtonStyle.Secondary)
    ));
  }
  for(const m of matches.filter(x=>x.status!=='completed' && x.status!=='cancelled').slice(0,3)){
    const roundState = await getRoundVoteState(m.id);
    if (!roundState.match.rounds_selected) {
      const majority = Math.floor(roundState.participants.length / 2) + 1;
      const voteText = roundState.votes.length ? roundState.votes.map(v => `${v.rounds}: **${v.votes}**`).join(' · ') : 'голосов пока нет';
      embed.addFields({
        name: `🗳️ Раунды · матч ${m.match_no}`,
        value: `Игроков: **${roundState.participants.length}** · большинство: **${majority}**\\nПроголосовали: **${roundState.votedPlayers.length}/${roundState.participants.length}**\\nГолоса: ${voteText}\\nВарианты: **10 / 12 / 14 / 16**`
      });
      components.push(...roundVoteButtons(m.id, 'round'));
      continue;
    }

    const state=await getVetoState(m.id);
    if(state.match.veto_status==='active'){
      const banned=state.bans, remaining=(state.match.map_pool||[]).filter(x=>!banned.some(b=>b.map_name===x));
      const majority = Math.floor(Number(state.participants || 0) / 2) + 1;
      const voted = state.votedPlayers?.length || 0;
      const voteText = state.votes?.length ? state.votes.map(v=>`${v.map_name}: **${v.votes}**`).join(' · ') : 'голосов пока нет';
      embed.addFields({name:`🗳️ Голосование · матч ${m.match_no}`,value:`Игроков: **${state.participants}** · большинство: **${majority}**\nПроголосовали: **${voted}/${state.participants}**\nОсталось: **${remaining.join(', ')}**\nГолоса: ${voteText}`});
      components.push(...vetoButtons(state.match,banned,state.votes));
    }
    if(state.match.veto_status==='finished') components.push(...resultButtons(state.match));
  }
  return {embeds:[embed],components};
}
export async function matchesEmbed(discordId){
  const ms=await getPlayerOrCaptainMatches(discordId), embed=new EmbedBuilder().setTitle('🎮 Мои матчи').setColor(0x8b0000);
  if(!ms.length) return {embeds:[embed.setDescription('Матчей пока нет.')],components:[]};
  embed.setDescription(ms.map(m=>`**${m.tournament_name}** · раунд ${m.round}, матч ${m.match_no}\\n**${m.team1_name||m.player1_id}** vs **${m.team2_name||m.player2_id}** · ${m.status==='completed'?'завершён':m.status==='cancelled'?'🛑 отменён':m.selected_map?`карта ${m.selected_map}`:'бан карт'}`).join('\n\n'));
  const components=[]; for(const m of ms.filter(x=>x.status!=='completed'&&x.status!=='cancelled').slice(0,3)) { if(!m.rounds_selected) components.push(...roundVoteButtons(m.id,'round')); else if(m.veto_status==='finished') components.push(...resultButtons(m)); }
  return {embeds:[embed],components};
}
