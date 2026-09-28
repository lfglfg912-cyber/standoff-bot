import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getTournamentV2, getTournamentTeams, getTournamentMatchesV2, getPlayerOrCaptainMatches, getVetoState, TEAM_FORMATS } from './tournament-v2.js';
import { resultButtons, vetoButtons } from './ui.js';

export function tournamentsEmbed(tournaments) {
  const embed = new EmbedBuilder().setTitle('🏆 Турниры DOMINION').setDescription(tournaments.length ? 'Выбери турнир ниже.' : 'Сейчас активных турниров нет.').setColor(0x8b0000);
  for (const t of tournaments) embed.addFields({ name:`#${t.id} · ${t.name}`, value:`Формат: **${t.format || '1v1'}** · ${t.status === 'registration' ? 'Регистрация' : 'Идёт'}\\nУчастники: **${t.registered}/${t.slots}** · Приз: **${t.prize_gold} G**` });
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
  if(teams.length) embed.addFields({name:'👥 Команды',value:teams.slice(0,20).map((x,i)=>`${i+1}. **${x.name}** — капитан <@${x.captain_id}> — ${x.member_count}/${TEAM_FORMATS[format]}`).join('\n')});
  const components=[];
  if(matches.length){
    const active=matches.filter(m=>m.status!=='completed' && m.status!=='cancelled');
    if(active.length) embed.addFields({name:'🎮 Текущие матчи',value:active.slice(0,10).map(m=>`Раунд ${m.round}, матч ${m.match_no}: **${m.team1_name||m.player1_nick}** vs **${m.team2_name||m.player2_nick}** · ${m.selected_map?`🗺️ **${m.selected_map}**`:'🚫 Бан карт'}`).join('\n')});
    const done=matches.filter(m=>m.status==='completed');
    if(done.length) embed.addFields({name:'✅ Завершённые',value:done.slice(-8).reverse().map(m=>`Раунд ${m.round}, матч ${m.match_no}: **${m.winner_team_name||m.winner_nick||'победитель'}**`).join('\n')});
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
    const state=await getVetoState(m.id);
    if(state.match.veto_status==='active'){
      const banned=state.bans, remaining=(state.match.map_pool||[]).filter(x=>!banned.some(b=>b.map_name===x));
      const majority = Math.floor(Number(state.participants || 0) / 2) + 1;
      const voted = state.votedPlayers?.length || 0;
      const voteText = state.votes?.length ? state.votes.map(v=>`${v.map_name}: **${v.votes}**`).join(' · ') : 'голосов пока нет';
      embed.addFields({name:`🗳️ Голосование · матч ${m.match_no}`,value:`Игроков: **${state.participants}** · большинство: **${majority}**\\nПроголосовали: **${voted}/${state.participants}**\\nОсталось: **${remaining.join(', ')}**\\nГолоса: ${voteText}`});
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
  const components=[]; for(const m of ms.filter(x=>x.status!=='completed'&&x.status!=='cancelled'&&x.veto_status==='finished').slice(0,3)) components.push(...resultButtons(m));
  return {embeds:[embed],components};
}
