import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events, PermissionsBitField, EmbedBuilder,
  REST, Routes
} from 'discord.js';
import { initDb, getPlayer, upsertPlayer, listPlayers, getLeaderboard, getRatingHistory, listTournaments, addModerationWarning, getModerationWarnings, clearModerationWarnings, createTournament, joinTournament, startTournament, getTournament, getOpenMatchForPlayer, reportMatch } from './db.js';
import { mainPanel, profileCard, profileButtons, profileModal, aiModal, adminPanel, tournamentCreateModal, tournamentTeamNameModal, tournamentTeamSelection, resultButtons, resultScoreModal, profileStatsEmbed, profileSimpleSection, leaderboardEmbed, playMenuButtons, customFormatButtons, customPlayerSelection, customGameButtons, moderationUserSelect, moderationActions, moderationReasonModal, warningListButtons, tournamentCancelConfirm, roundVoteButtons } from './ui.js';
import { tournamentsEmbed, tournamentButtons, tournamentView, matchesEmbed } from './tournament.js';
import { initTournamentV2Db, listTournamentsV2, createTournamentV2, registerTournamentTeam, startTournamentV2, cancelTournamentV2, castMapVote, reportMatchV2, getTournamentV2, TEAM_FORMATS, createCustomGame, getRoundVoteState, castRoundVote, getCustomRoundVoteState, castCustomRoundVote, getCustomGameState, castCustomMapVote, reportCustomGame, listCustomGamesForPlayer, getReadyCustomGamesForPlayer } from './tournament-v2.js';

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID', 'PANEL_CHANNEL_ID', 'ADMIN_ROLE_ID'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

function isAdmin(interaction) {
  if (!interaction.inGuild()) return false;
  return interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function isModerator(interaction) {
  if (!interaction.inGuild()) return false;
  const hasModeratorRole = interaction.member.roles.cache.some(role =>
    role.name === 'Moderator' || role.name === '🛡 Moderator'
  );
  return isAdmin(interaction)
    || hasModeratorRole
    || interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
    || interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)
    || interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers);
}

async function ensurePlayer(interaction) {
  return getPlayer(interaction.user.id);
}

const customDrafts = new Map();
const tournamentTeamDrafts = new Map();
const SECONDARY_PANEL_CHANNEL_ID = '1464922042624249877';

async function showProfile(interaction) {
  const player = await ensurePlayer(interaction);
  if (!player) {
    await interaction.showModal(profileModal());
    return;
  }
  await interaction.reply({ ...(await profileCard(player, interaction.user)), ephemeral: true });
}


async function customGameView(id) {
  const state = await getCustomGameState(id);
  const m = state.match;
  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Кастом на звание #${m.id}`)
    .setDescription(`Формат: **${m.format}**\\nСтатус: **${m.status === 'completed' ? 'Завершён' : m.veto_status === 'finished' ? 'Матч готов' : 'Бан карт'}**\\nКарта: **${m.selected_map || 'ещё не выбрана'}**\\nКоманда 1: ${m.team1_ids.map(x => `<@${x}>`).join(', ')}\\nКоманда 2: ${m.team2_ids.map(x => `<@${x}>`).join(', ')}`)
    .setColor(0x8b0000);
  if (!m.rounds_selected) {
    const rv = await getCustomRoundVoteState(id);
    const majority = Math.floor(rv.participants.length / 2) + 1;
    embed.addFields({ name: '🗳️ Количество раундов', value: `Игроков: **${rv.participants.length}** · большинство: **${majority}**\\nПроголосовали: **${rv.votedPlayers.length}/${rv.participants.length}**\\nВарианты: **10 / 12 / 14 / 16**` });
    return { embeds: [embed], components: roundVoteButtons(id, 'cround') };
  }
  if (m.veto_status === 'active') {
    const majority = Math.floor(state.participants.length / 2) + 1;
    embed.addFields({ name: '🗳️ Голосование карт', value: `Игроков: **${state.participants.length}** · большинство: **${majority}**\\nПроголосовали: **${state.votedPlayers.length}/${state.participants.length}**\\nОсталось: **${(m.map_pool || []).filter(x => !state.bans.some(b => b.map_name === x)).join(', ')}**` });
  }
  return { embeds: [embed], components: customGameButtons({ ...m, bans: state.bans, votes: state.votes }) };
}

async function sendMainPanel(channel) {
  const messages = await channel.messages.fetch({ limit: 30 });
  const old = messages.find(m => m.author.id === client.user.id && m.components.some(row => row.components.some(c => c.customId === 'nav:profile')));
  if (old) return old.edit(mainPanel());
  return channel.send(mainPanel());
}

async function clearChannel(channel) {
  if (!channel?.isTextBased() || !channel.messages) return;
  let deleted = 0;

  while (true) {
    const messages = await channel.messages.fetch({ limit: 100 });
    if (!messages.size) break;

    const recent = [];
    const old = [];

    for (const message of messages.values()) {
      if (Date.now() - message.createdTimestamp < 14 * 24 * 60 * 60 * 1000) recent.push(message);
      else old.push(message);
    }

    if (recent.length) {
      await channel.bulkDelete(recent, true);
      deleted += recent.length;
    }

    for (const message of old) {
      await message.delete().catch(() => {});
      deleted++;
    }

    if (messages.size < 100) break;
  }

  return deleted;
}

async function refreshPanelChannels() {
  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID).catch(() => null);
  if (!guild) return;

  const channelIds = [...new Set([process.env.PANEL_CHANNEL_ID, SECONDARY_PANEL_CHANNEL_ID].filter(Boolean))];

  for (const channelId of channelIds) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) continue;

    try {
      await clearChannel(channel);
      await sendMainPanel(channel);
      console.log(`[DOMINION] Panel channel ${channelId} cleaned and refreshed.`);
    } catch (error) {
      console.error(`[DOMINION] Failed to clean panel channel ${channelId}:`, error);
    }
  }
}


client.once(Events.ClientReady, async ready => {
  console.log(`[DOMINION] Logged in as ${ready.user.tag}`);
  try {
    await initDb();
    await initTournamentV2Db();
    console.log('[DOMINION] Database ready. Main panel is available with /p.');
    setInterval(() => refreshPanelChannels(), 60 * 60 * 1000);
    console.log('[DOMINION] Panel channels will be cleaned and refreshed every 60 minutes.');
  } catch (error) {
    console.error('[DOMINION] Startup error:', error);
    process.exitCode = 1;
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'invite') {
        if (!interaction.inGuild()) return interaction.reply({ content: '❌ Команду нужно использовать на сервере DOMINION.', ephemeral: true });
        const channel = interaction.channel;
        const permissions = channel?.permissionsFor(client.user);
        if (!channel?.isTextBased() || !permissions?.has(PermissionsBitField.Flags.CreateInstantInvite)) {
          return interaction.reply({ content: '❌ Боту нужно право **Создавать приглашения** в этом канале.', ephemeral: true });
        }
        const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: true, reason: 'DOMINION recruitment' });
        return interaction.reply({
          content: `📢 **Приглашение в DOMINION**\\n\\n⚔️ Standoff 2 · турниры · кастомные матчи · рейтинг\\n\\n${invite.url}\\n\\nОтправь ссылку друзьям или игрокам, которых хочешь позвать на сервер.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === 'leaderboard') {
        const players = await getLeaderboard(10);
        return interaction.reply({ embeds: [leaderboardEmbed(players)], ephemeral: true });
      }

      if (interaction.commandName === 'stats') {
        const player = await getPlayer(interaction.user.id);
        if (!player) return interaction.reply({ content: '👋 Сначала создай профиль DOMINION через /p → 👤 Профиль.', ephemeral: true });
        return interaction.reply({ embeds: [profileStatsEmbed(player)], ephemeral: true });
      }

      if (interaction.commandName === 'p') {
        if (!interaction.inGuild()) {
          return interaction.reply({ content: '❌ Команду нужно использовать на сервере DOMINION.', ephemeral: true });
        }

        const channel = await interaction.guild.channels.fetch(process.env.PANEL_CHANNEL_ID).catch(() => null);
        if (!channel?.isTextBased()) {
          return interaction.reply({ content: '❌ Канал панели не найден. Проверь PANEL_CHANNEL_ID.', ephemeral: true });
        }

        await sendMainPanel(channel);

        const secondary = await interaction.guild.channels.fetch(SECONDARY_PANEL_CHANNEL_ID).catch(() => null);
        if (secondary?.isTextBased() && secondary.id !== channel.id) {
          await sendMainPanel(secondary);
        }

        const targets = secondary?.isTextBased() && secondary.id !== channel.id
          ? `<#${channel.id}> и <#${secondary.id}>`
          : `<#${channel.id}>`;

        return interaction.reply({
          content: `✅ Панель DOMINION опубликована в ${targets}.`,
          ephemeral: true
        });
      }
      return;
    }

    if (interaction.isUserSelectMenu()) {
      if (interaction.customId.startsWith('t:teamselect:')) {
        const tournamentId = interaction.customId.split(':')[2];
        const draft = tournamentTeamDrafts.get(interaction.user.id);
        if (!draft || String(draft.tournamentId) !== String(tournamentId)) {
          return interaction.reply({ content: '❌ Сессия регистрации команды устарела. Нажми регистрацию команды ещё раз.', ephemeral: true });
        }

        const selected = interaction.values.map(String);
        if (selected.includes(interaction.user.id)) {
          return interaction.reply({ content: '❌ Ты уже капитан команды и не можешь выбрать себя ещё раз.', ephemeral: true });
        }

        const unique = [...new Set([interaction.user.id, ...selected])];
        if (unique.length !== draft.teamSize) {
          return interaction.reply({ content: `❌ Для ${draft.format} нужна команда ровно из ${draft.teamSize} игроков.`, ephemeral: true });
        }

        const registered = new Set((await listPlayers()).map(p => String(p.discord_id)));
        if (unique.some(id => !registered.has(id))) {
          return interaction.reply({ content: '❌ Все участники должны сначала создать профиль DOMINION.', ephemeral: true });
        }

        try {
          const team = await registerTournamentTeam(
            tournamentId,
            interaction.user.id,
            draft.teamName,
            selected
          );
          tournamentTeamDrafts.delete(interaction.user.id);
          return interaction.update({
            content: `✅ **Команда ${team.name} зарегистрирована!**\\n\\nКапитан: <@${interaction.user.id}>\\nУчастники: ${unique.map(id => `<@${id}>`).join(', ')}`,
            components: []
          });
        } catch (error) {
          tournamentTeamDrafts.delete(interaction.user.id);
          throw error;
        }
      }

      if (interaction.customId === 'mod:user') {
        if (!isModerator(interaction)) return interaction.reply({ content: 'Недостаточно прав для модерации.', ephemeral: true });
        const targetId = interaction.values[0];
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ Участник не найден на сервере.', ephemeral: true });
        return interaction.update({
          content: `🛡️ **Модерация участника**\\n\\nУчастник: <@${targetId}>\\nВыбери действие:`,
          components: moderationActions(targetId)
        });
      }

      if (interaction.customId === 'custom:team1' || interaction.customId === 'custom:team2') {
        const draft = customDrafts.get(interaction.user.id);
        if (!draft) return interaction.reply({ content: 'Сессия создания кастома устарела. Нажми «Создать кастом» ещё раз.', ephemeral: true });

        const selected = interaction.values.map(String);
        const registered = new Set((await listPlayers()).map(p => String(p.discord_id)));
        if (selected.some(id => !registered.has(id))) {
          return interaction.reply({ content: '❌ Все выбранные игроки должны сначала создать профиль DOMINION.', ephemeral: true });
        }
        if (selected.includes(interaction.user.id)) {
          return interaction.reply({ content: '❌ Нельзя выбрать себя ещё раз — ты уже в Команде 1.', ephemeral: true });
        }

        const size = Number(draft.format.split('v')[0]);
        if (interaction.customId === 'custom:team1') {
          draft.team1 = [interaction.user.id, ...selected];
          return interaction.update({
            content: `⚔️ **${draft.format} — выбор игроков**\\n\\nКоманда 1: ${draft.team1.map(x => `<@${x}>`).join(', ')}\\n\\nТеперь выбери **Команду 2**.`,
            components: [new (await import('discord.js')).ActionRowBuilder().addComponents(
              new (await import('discord.js')).UserSelectMenuBuilder()
                .setCustomId('custom:team2')
                .setPlaceholder(`Команда 2: выбери ${size} игрок(а)`)
                .setMinValues(size).setMaxValues(size)
            )]
          });
        }

        if (selected.some(id => draft.team1.includes(id))) {
          return interaction.reply({ content: '❌ Один игрок не может быть сразу в двух командах.', ephemeral: true });
        }

        draft.team2 = selected;
        const game = await createCustomGame({
          format: draft.format,
          team1Ids: draft.team1,
          team2Ids: draft.team2,
          createdBy: interaction.user.id
        });
        customDrafts.delete(interaction.user.id);
        return interaction.update(await customGameView(game.match.id));
      }
    }

    if (interaction.isButton()) {
      const [scope, action, id, extra] = interaction.customId.split(':');

      if (scope === 'nav') {
        if (action === 'profile') return showProfile(interaction);
        if (action === 'play') {
          const player = await ensurePlayer(interaction);
          if (!player) {
            return interaction.reply({
              content: '👋 **Добро пожаловать в DOMINION!**\\n\\nСначала создай профиль. Это займёт меньше минуты: введи свой ник и ID Standoff 2.',
              components: [new (await import('discord.js')).ActionRowBuilder().addComponents(
                new (await import('discord.js')).ButtonBuilder().setCustomId('nav:profile').setLabel('👤 Создать профиль').setStyle((await import('discord.js')).ButtonStyle.Primary)
              )],
              ephemeral: true
            });
          }
          return interaction.reply({
            content: '🚀 **Готово! Что хочешь сделать?**\\n\\nВыбери один вариант:',
            components: playMenuButtons(),
            ephemeral: true
          });
        }
        if (action === 'custom') {
          const player = await ensurePlayer(interaction);
          if (!player) return interaction.showModal(profileModal());
          const games = await listCustomGamesForPlayer(interaction.user.id);
          const embed = new EmbedBuilder().setTitle('⚔️ Кастомные игры на звание').setDescription(games.length ? games.map(g => `#${g.id} · **${g.format}** · ${g.selected_map ? '🗺️ ' + g.selected_map : '🚫 Бан карт'} · ${g.status === 'completed' ? 'завершён' : 'активен'}`).join('\\n') : 'Активных кастомов нет. Создай первый матч.').setColor(0x8b0000);
          const components = [new (await import('discord.js')).ActionRowBuilder().addComponents(new (await import('discord.js')).ButtonBuilder().setCustomId('custom:new').setLabel('➕ Создать кастом').setStyle((await import('discord.js')).ButtonStyle.Success))];
          for (const g of games.slice(0, 5)) components[0].addComponents(new (await import('discord.js')).ButtonBuilder().setCustomId('custom:view:' + g.id).setLabel('#' + g.id).setStyle((await import('discord.js')).ButtonStyle.Secondary));
          return interaction.reply({ embeds: [embed], components, ephemeral: true });
        }
        if (action === 'tournaments') {
          const ts = await listTournamentsV2();
          return interaction.reply({ embeds: [tournamentsEmbed(ts)], components: tournamentButtons(ts), ephemeral: true });
        }
        if (action === 'matches') return interaction.reply({ ...(await matchesEmbed(interaction.user.id)), ephemeral: true });
        if (action === 'stats') {
          const player = await ensurePlayer(interaction);
          if (!player) return interaction.showModal(profileModal());
          return interaction.reply({ embeds: [profileStatsEmbed(player)], components: profileButtons(), ephemeral: true });
        }
        if (action === 'achievements') {
          const player = await ensurePlayer(interaction);
          if (!player) return interaction.showModal(profileModal());
          const wins = Number(player.wins || 0);
          const total = wins + Number(player.losses || 0);
          const achievements = [
            [total >= 1, '🎯 Первый матч', 'Сыгран первый матч.'],
            [wins >= 1, '🏆 Первая победа', 'Одержана первая победа.'],
            [wins >= 5, '🔥 5 побед', 'Набрано 5 побед.'],
            [wins >= 10, '⚔️ 10 побед', 'Набрано 10 побед.'],
            [Number(player.tournaments || 0) >= 1, '🏟️ Турнирный боец', 'Участие в турнире.'],
            [total >= 5, '🎖️ Калибровка пройдена', 'Сыграно 5 матчей и получено первое звание.']
          ];
          return interaction.reply({
            embeds: [new EmbedBuilder().setTitle('🏆 Достижения DOMINION').setDescription(achievements.map(x => `${x[0] ? '✅' : '🔒'} **${x[1]}** — ${x[2]}`).join('\\n')).setColor(0x8b0000)],
            components: profileButtons(), ephemeral: true
          });
        }
        if (action === 'history') {
          const history = await getRatingHistory(interaction.user.id, 10);
          const matches = await matchesEmbed(interaction.user.id);
          const ratingText = history.length
            ? history.map(h => {
                const delta = Number(h.delta);
                const sign = delta > 0 ? '+' : '';
                return `${delta > 0 ? '📈' : delta < 0 ? '📉' : '➖'} **${h.old_rating} → ${h.new_rating}** (${sign}${delta})`;
              }).join('\\n')
            : 'Изменений рейтинга пока нет. Во время первых 4 матчей калибровки рейтинг остаётся 0.';
          const embed = matches.embeds?.[0] || new EmbedBuilder().setTitle('🕘 История');
          embed.setTitle('🕘 История игрока').addFields({ name: '📊 Последние изменения рейтинга', value: ratingText });
          return interaction.reply({ embeds: [embed], components: profileButtons(), ephemeral: true });
        }
        if (action === 'ai') {
          return interaction.reply({ content: '🤖 **ИИ временно недоступен.**\nФункция находится в разработке. Остальные функции DOMINION работают штатно.', ephemeral: true });
        }
        if (action === 'invite') {
          const channel = interaction.channel;
          const permissions = channel?.permissionsFor(client.user);
          if (!channel?.isTextBased() || !permissions?.has(PermissionsBitField.Flags.CreateInstantInvite)) {
            return interaction.reply({ content: '❌ Боту нужно право **Создавать приглашения** в этом канале.', ephemeral: true });
          }
          const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: true, reason: 'DOMINION recruitment' });
          return interaction.reply({
            content: `📢 **Приглашение в DOMINION**\\n\\n⚔️ Standoff 2 · турниры · кастомные матчи · рейтинг\\n\\n${invite.url}\\n\\nОтправь ссылку друзьям или игрокам, которых хочешь позвать на сервер.`,
            ephemeral: true
          });
        }
        if (action === 'leaderboard') {
          const players = await getLeaderboard(10);
          return interaction.reply({ embeds: [leaderboardEmbed(players)], ephemeral: true });
        }
        if (action === 'help') return interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle('❓ Как играть в DOMINION')
            .setDescription(
              '**1. 👤 Профиль** — введи ник и ID Standoff 2.\\n' +
              '**2. 🚀 Играть** — выбери кастом или турнир.\\n' +
              '**3. ⚔️ Кастом** — выбери формат и игроков.\\n' +
              '**4. 🗳️ Раунды** — все игроки выбирают 10, 12, 14 или 16.\\n' +
              '**5. 🗺️ Карта** — все игроки голосуют, карта с большинством голосов банится.\\n' +
              '**6. 🎮 Матч** — после игры введи счёт.\\n\\n' +
              '⭐ Первые 5 матчей — калибровка. После неё появляется звание.'
            )
            .setColor(0x8b0000)],
          components: [new (await import('discord.js')).ActionRowBuilder().addComponents(
            new (await import('discord.js')).ButtonBuilder().setCustomId('nav:play').setLabel('🚀 Начать играть').setStyle((await import('discord.js')).ButtonStyle.Success)
          )],
          ephemeral: true
        });
        if (action === 'admin') {
          if (!isModerator(interaction)) return interaction.reply({ content: 'Эта панель доступна только администрации и модераторам.', ephemeral: true });
          return interaction.reply({ ...adminPanel(isAdmin(interaction)), ephemeral: true });
        }
      }

      if (scope === 'mod') {
        if (!isModerator(interaction)) return interaction.reply({ content: 'Недостаточно прав для модерации.', ephemeral: true });

        if (action === 'warnings') {
          const warnings = await getModerationWarnings(interaction.guild.id, id);
          const text = warnings.length
            ? warnings.slice(0, 10).map((w, i) => `**${i + 1}.** ${w.reason} — <@${w.moderator_id}>`).join('\\n')
            : 'У участника нет предупреждений.';
          return interaction.update({
            content: `📋 **Предупреждения <@${id}>**\\n\\n${text}\\n\\nВсего: **${warnings.length}**`,
            components: warningListButtons(id, warnings.length > 0)
          });
        }

        if (action === 'back') {
          return interaction.update({
            content: `🛡️ **Модерация участника**\\n\\nУчастник: <@${id}>\\nВыбери действие:`,
            components: moderationActions(id)
          });
        }

        if (action === 'clear') {
          const count = await clearModerationWarnings(interaction.guild.id, id);
          return interaction.update({
            content: `🧹 Предупреждения <@${id}> сброшены. Удалено: **${count}**.`,
            components: moderationActions(id)
          });
        }

        if (!['warn', 'timeout', 'kick', 'ban'].includes(action)) return interaction.reply({ content: 'Неизвестное действие модерации.', ephemeral: true });
        return interaction.showModal(moderationReasonModal(action, id));
      }

      if (scope === 'custom' && action === 'new') {
        return interaction.reply({
          content: '⚔️ **Создание кастома**\n\nВыбери формат:',
          components: customFormatButtons(),
          ephemeral: true
        });
      }
      if (scope === 'custom' && action === 'format') {
        const player = await ensurePlayer(interaction);
        if (!player) return interaction.reply({ content: 'Сначала создай профиль DOMINION.', ephemeral: true });
        const format = id;
        const size = Number(format.split('v')[0]);
        const players = await listPlayers();
        const available = players.filter(p => p.discord_id !== interaction.user.id);
        if (available.length < size * 2 - 1) return interaction.reply({ content: `❌ Недостаточно зарегистрированных игроков. Для ${format} нужно ${size * 2} игроков.`, ephemeral: true });
        customDrafts.set(interaction.user.id, { format, team1: [interaction.user.id], team2: [] });
        return interaction.update({
          content: `⚔️ **${format} — выбор игроков**\n\nТы автоматически в **Команде 1**. Выбери остальных игроков.`,
          components: customPlayerSelection(format, players, interaction.user.id)
        });
      }
      if (scope === 'custom' && action === 'view') return interaction.reply({ ...(await customGameView(id)), ephemeral: true });
      if (scope === 'custom' && action === 'team1') {
        const draft = customDrafts.get(interaction.user.id);
        if (!draft) return interaction.reply({ content: 'Сессия создания кастома устарела. Нажми «Создать кастом» ещё раз.', ephemeral: true });
        draft.team1 = [interaction.user.id, ...interaction.values];
        const players = await listPlayers();
        const filtered = players.filter(p => p.discord_id !== interaction.user.id && !draft.team1.includes(p.discord_id));
        const size = Number(draft.format.split('v')[0]);
        const options = filtered.map(p => ({
          label: `${String(p.standoff_nick || 'Игрок')} — ID: ${String(p.standoff_id || 'не указан')}`.slice(0, 100),
          value: p.discord_id,
          description: `Standoff ID: ${String(p.standoff_id || 'не указан')}`.slice(0, 100)
        }));
        const rows = [new (await import('discord.js')).ActionRowBuilder().addComponents(
          new (await import('discord.js')).StringSelectMenuBuilder()
            .setCustomId('custom:team2').setPlaceholder(`Команда 2: выбери ${size} игрок(а)`)
            .setMinValues(size).setMaxValues(size).addOptions(options)
        )];
        return interaction.update({
          content: `⚔️ **${draft.format} — выбор игроков**\n\nКоманда 1: ${draft.team1.map(x => `<@${x}>`).join(', ')}\n\nТеперь выбери **Команду 2**.`,
          components: rows
        });
      }
      if (scope === 'custom' && action === 'team2') {
        const draft = customDrafts.get(interaction.user.id);
        if (!draft) return interaction.reply({ content: 'Сессия создания кастома устарела. Нажми «Создать кастом» ещё раз.', ephemeral: true });
        draft.team2 = interaction.values;
        try {
          const game = await createCustomGame({ format: draft.format, team1Ids: draft.team1, team2Ids: draft.team2, createdBy: interaction.user.id });
          customDrafts.delete(interaction.user.id);
          return interaction.update(await customGameView(game.match.id));
        } catch (error) {
          customDrafts.delete(interaction.user.id);
          throw error;
        }
      }

      if (scope === 'custom' && action === 'vote') {
        await castCustomMapVote(id, interaction.user.id, decodeURIComponent(extra || ''));
        return interaction.update(await customGameView(id));
      }
      if (scope === 'custom' && action === 'score') {
        return interaction.showModal(resultScoreModal('custom', id, 'team', interaction.customId.split(':')[4]));
      }

      if (scope === 'profile') {
        if (action === 'edit') {
          const player = await getPlayer(interaction.user.id);
          return interaction.showModal(profileModal(player));
        }
      }
      if (scope === 't') {
        if (action === 'view') return interaction.reply({ ...(await tournamentView(id, isAdmin(interaction))), ephemeral: true });
        if (action === 'refresh') return interaction.update(await tournamentView(id, isAdmin(interaction)));
        if (action === 'join') {
          if (!await getPlayer(interaction.user.id)) return interaction.reply({ content: 'Сначала создай профиль через 👤 Профиль.', ephemeral: true });
          await joinTournament(id, interaction.user.id);
          return interaction.update(await tournamentView(id, isAdmin(interaction)));
        }
        if (action === 'team') {
          const t = await getTournamentV2(id);
          if (!t) return interaction.reply({ content: 'Турнир не найден.', ephemeral: true });
          const size = TEAM_FORMATS[t.format || '1v1'];
          if (!size || size <= 1) return interaction.reply({ content: 'Для этого турнира нужна обычная регистрация.', ephemeral: true });
          if (!await getPlayer(interaction.user.id)) return interaction.reply({ content: 'Сначала создай профиль через 👤 Профиль.', ephemeral: true });
          return interaction.showModal(tournamentTeamNameModal(id));
        }
        if (action === 'start') {
          if (!isAdmin(interaction)) return interaction.reply({ content: 'Запустить турнир может только администрация.', ephemeral: true });
          await startTournamentV2(id);
          return interaction.update(await tournamentView(id, isAdmin(interaction)));
        }
        if (action === 'cancel' && id === 'confirm') {
          if (!isAdmin(interaction)) return interaction.reply({ content: 'Отменить турнир может только администрация.', ephemeral: true });
          const tournamentId = extra;
          const t = await getTournamentV2(tournamentId);
          if (!t) return interaction.reply({ content: '❌ Турнир не найден.', ephemeral: true });
          if (!['registration', 'running'].includes(t.status)) return interaction.reply({ content: '❌ Этот турнир уже нельзя отменить.', ephemeral: true });
          await cancelTournamentV2(tournamentId, interaction.user.id, 'Отменён администрацией');
          return interaction.update({
            content: `🛑 **Турнир #${tournamentId} отменён.**\\n\\nВсе текущие матчи этого турнира больше не могут считаться активными.`,
            embeds: [],
            components: []
          });
        }
        if (action === 'cancel' && id === 'back') {
          const tournamentId = extra;
          return interaction.update(await tournamentView(tournamentId, isAdmin(interaction)));
        }
        if (action === 'cancel') {
          if (!isAdmin(interaction)) return interaction.reply({ content: 'Отменить турнир может только администрация.', ephemeral: true });
          const t = await getTournamentV2(id);
          if (!t) return interaction.reply({ content: '❌ Турнир не найден.', ephemeral: true });
          if (!['registration', 'running'].includes(t.status)) return interaction.reply({ content: '❌ Этот турнир уже нельзя отменить.', ephemeral: true });
          return interaction.update({
            content: `⚠️ **Отмена турнира #${id}**\\n\\nТы действительно хочешь отменить **${t.name}**?\\n\\nЭто действие остановит турнир и уберёт его из списка активных.`,
            embeds: [],
            components: tournamentCancelConfirm(id)
          });
        }
      }

      if (scope === 'admin' && action === 'moderation') {
        if (!isModerator(interaction)) return interaction.reply({ content: 'Недостаточно прав для модерации.', ephemeral: true });
        return interaction.reply({ content: '🛡️ **Модерация**\n\nВыбери участника:', components: moderationUserSelect(), ephemeral: true });
      }
      if (scope === 'admin' && action === 'create_tournament') {
        if (!isAdmin(interaction)) return interaction.reply({ content: 'Недостаточно прав.', ephemeral: true });
        return interaction.showModal(tournamentCreateModal());
      }

      if (scope === 'round' && action === 'vote') {
        const rounds = Number(extra);
        await castRoundVote(id, interaction.user.id, rounds);
        const state = await getRoundVoteState(id);
        if (state.match.rounds_selected) {
          return interaction.reply({ content: `✅ Игроки выбрали **${state.match.rounds_selected} раундов** для этого матча.`, ephemeral: true });
        }
        const majority = Math.floor(state.participants.length / 2) + 1;
        const votes = state.votes.length ? state.votes.map(v => `${v.rounds}: **${v.votes}**`).join(' · ') : 'голосов пока нет';
        return interaction.update({
          content: `🗳️ **Выбор количества раундов**\\nИгроков: **${state.participants.length}** · большинство: **${majority}**\\nПроголосовали: **${state.votedPlayers.length}/${state.participants.length}**\\nГолоса: ${votes}`,
          components: roundVoteButtons(id, 'round')
        });
      }

      if (scope === 'cround' && action === 'vote') {
        const rounds = Number(extra);
        await castCustomRoundVote(id, interaction.user.id, rounds);
        const state = await getCustomRoundVoteState(id);
        if (state.match.rounds_selected) return interaction.update(await customGameView(id));
        const majority = Math.floor(state.participants.length / 2) + 1;
        const votes = state.votes.length ? state.votes.map(v => `${v.rounds}: **${v.votes}**`).join(' · ') : 'голосов пока нет';
        return interaction.update({
          content: `🗳️ **Выбор количества раундов**\\nИгроков: **${state.participants.length}** · большинство: **${majority}**\\nПроголосовали: **${state.votedPlayers.length}/${state.participants.length}**\\nГолоса: ${votes}`,
          components: roundVoteButtons(id, 'cround')
        });
      }

      if (scope === 'veto' && action === 'vote') {
        const mapName = decodeURIComponent(extra || '');
        await castMapVote(id, interaction.user.id, mapName);
        return interaction.update(await tournamentView((await getTournamentV2(id)).id, isAdmin(interaction)));
      }

      if (scope === 'match' && action === 'score') {
        const matchId = id;
        const winnerType = extra;
        const winnerValue = interaction.customId.split(':')[4];
        return interaction.showModal(resultScoreModal('match', matchId, winnerType, winnerValue));
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('mod:reason:')) {
        if (!isModerator(interaction)) return interaction.reply({ content: 'Недостаточно прав для модерации.', ephemeral: true });
        const [, , action, targetId] = interaction.customId.split(':');
        const reason = interaction.fields.getTextInputValue('reason').trim();
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ Участник уже не находится на сервере.', ephemeral: true });
        if (targetId === interaction.user.id) return interaction.reply({ content: '❌ Нельзя применить модерацию к самому себе.', ephemeral: true });
        if (member.id === interaction.guild.ownerId) return interaction.reply({ content: '❌ Нельзя модерировать владельца сервера.', ephemeral: true });

        if (action === 'warn') {
          const warning = await addModerationWarning(interaction.guild.id, targetId, interaction.user.id, reason);
          const count = (await getModerationWarnings(interaction.guild.id, targetId)).length;
          await member.send(`⚠️ **Предупреждение на сервере ${interaction.guild.name}**\nПричина: ${reason}\nВсего предупреждений: ${count}`).catch(() => {});
          return interaction.reply({ content: `⚠️ <@${targetId}> получил предупреждение #${warning.id}.\nПричина: **${reason}**\nВсего предупреждений: **${count}**.`, ephemeral: true });
        }

        if (action === 'timeout') {
          if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) && !isAdmin(interaction)) return interaction.reply({ content: 'Нужны права Moderate Members.', ephemeral: true });
          await member.timeout(10 * 60 * 1000, reason);
          return interaction.reply({ content: `🔇 <@${targetId}> получил тайм-аут на **10 минут**.\nПричина: **${reason}**`, ephemeral: true });
        }

        if (action === 'kick') {
          if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers) && !isAdmin(interaction)) return interaction.reply({ content: 'Нужны права Kick Members.', ephemeral: true });
          await member.kick(reason);
          return interaction.reply({ content: `👢 <@${targetId}> кикнут.\nПричина: **${reason}**`, ephemeral: true });
        }

        if (action === 'ban') {
          if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers) && !isAdmin(interaction)) return interaction.reply({ content: 'Нужны права Ban Members.', ephemeral: true });
          await member.ban({ reason });
          return interaction.reply({ content: `🔨 <@${targetId}> забанен.\nПричина: **${reason}**`, ephemeral: true });
        }
      }

      
      if (interaction.customId === 'profile:save') {
        const nick = interaction.fields.getTextInputValue('nick').trim();
        const sid = interaction.fields.getTextInputValue('standoff_id').trim();
        if (!nick) return interaction.reply({ content: '❌ Введи свой ник в Standoff 2.', ephemeral: true });
        if (!sid) return interaction.reply({ content: '❌ Введи ID игрока Standoff 2.', ephemeral: true });
        if (nick.length < 2) return interaction.reply({ content: '❌ Ник слишком короткий.', ephemeral: true });
        const player = await upsertPlayer(interaction.user.id, nick, sid);
        return interaction.reply({
          content: '✅ **Профиль готов!** Теперь нажми **🚀 Играть**, чтобы найти матч или создать кастом.',
          ...(await profileCard(player, interaction.user)),
          ephemeral: true
        });
      }
      if (interaction.customId.startsWith('custom:score:') || interaction.customId.startsWith('match:score:')) {
        const [scope, , matchId, winnerType, winnerValue] = interaction.customId.split(':');
        const score1 = Number(interaction.fields.getTextInputValue('score1').trim());
        const score2 = Number(interaction.fields.getTextInputValue('score2').trim());
        if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0 || score1 === score2) {
          return interaction.reply({ content: '❌ Счёт должен быть целыми числами и не может быть ничьёй.', ephemeral: true });
        }
        if (scope === 'custom') await reportCustomGame(matchId, interaction.user.id, winnerValue, score1, score2);
        else if (winnerType === 'team') await reportMatchV2(matchId, interaction.user.id, null, winnerValue, score1, score2);
        else await reportMatchV2(matchId, interaction.user.id, winnerValue, null, score1, score2);
        return interaction.reply({ content: `✅ Результат сохранён: **${score1}:${score2}**. Рейтинг обновлён.`, ephemeral: true });
      }
      if (interaction.customId === 'ai:ask') {
        return interaction.reply({ content: '🤖 **ИИ временно недоступен.**\nФункция находится в разработке. Остальные функции DOMINION работают штатно.', ephemeral: true });
      }
      if (interaction.customId.startsWith('team:name:')) {
        const tournamentId = interaction.customId.split(':')[2];
        const teamName = interaction.fields.getTextInputValue('team_name').trim();
        const t = await getTournamentV2(tournamentId);
        if (!t) return interaction.reply({ content: '❌ Турнир не найден.', ephemeral: true });
        if (t.status !== 'registration') return interaction.reply({ content: '❌ Регистрация уже закрыта.', ephemeral: true });
        const teamSize = TEAM_FORMATS[t.format || '1v1'];
        if (!teamSize || teamSize <= 1) return interaction.reply({ content: '❌ Для этого турнира используется обычная регистрация.', ephemeral: true });
        tournamentTeamDrafts.set(interaction.user.id, {
          tournamentId: String(tournamentId),
          teamName,
          format: t.format,
          teamSize
        });
        return interaction.reply({
          content: `👑 **Команда ${teamName}**\\n\\nТы — капитан. Теперь выбери ещё **${teamSize - 1}** игроков.\\nВсе выбранные игроки должны иметь профиль DOMINION.`,
          components: tournamentTeamSelection(tournamentId, teamSize),
          ephemeral: true
        });
      }

      if (interaction.customId === 'admin:create_tournament_modal') {
        if (!isAdmin(interaction)) return interaction.reply({ content: 'Недостаточно прав.', ephemeral: true });
        const name = interaction.fields.getTextInputValue('name').trim();
        const format = interaction.fields.getTextInputValue('format').trim().toLowerCase();
        const slots = Number(interaction.fields.getTextInputValue('slots').trim());
        const prize = Number(interaction.fields.getTextInputValue('prize').trim());
        if (!TEAM_FORMATS[format] || ![4, 8, 16, 32].includes(slots) || !Number.isInteger(prize) || prize < 0) return interaction.reply({ content: 'Формат: 1v1/2v2/3v3/4v4/5v5. Слоты: 4/8/16/32. Раундов в матче: только 10, 12, 14 или 16. Приз — целое число.', ephemeral: true });
        const t = await createTournamentV2({ name, format, slots, prizeGold: prize, createdBy: interaction.user.id });
        return interaction.reply({ content: `✅ Турнир **${t.name}** создан (#${t.id}) в формате **${format}**.`, ephemeral: true });
      }
    }
  } catch (error) {
    console.error('[DOMINION] Interaction error:', error);
    const message = error.message === 'ALREADY_REGISTERED' ? 'Ты уже зарегистрирован.'
      : error.message === 'TOURNAMENT_FULL' ? 'Турнир уже заполнен.'
      : error.message === 'REGISTRATION_CLOSED' ? 'Регистрация уже закрыта.'
      : error.message === 'MATCH_ALREADY_DONE' ? 'Этот матч уже завершён.'
      : error.message === 'TOURNAMENT_NOT_ACTIVE' ? 'Этот турнир уже не активен. Действие отменено.'
      : error.message === 'TOURNAMENT_NOT_FOUND' ? 'Турнир не найден.'
      : error.message === 'INVALID_ROUNDS' ? 'Можно выбрать только 10, 12, 14 или 16 раундов.'
      : error.message === 'ROUNDS_NOT_SELECTED' ? 'Сначала проголосуйте за количество раундов.'
      : error.message === 'INVALID_SCORE' ? 'Неверный счёт: победитель должен иметь больше раундов.'
      : error.message === 'SCORE_EXCEEDS_ROUNDS' ? 'Сумма счёта не может превышать выбранное количество раундов.'
      : error.message === 'NOT_A_PLAYER' ? 'Ты не участник этого матча.'
      : error.message === 'ALREADY_VOTED' ? 'Ты уже проголосовал в этом раунде.'
      : error.message === 'VETO_NOT_FINISHED' ? 'Сначала завершите голосование по картам.'
      : error.message === 'INVALID_FORMAT' ? 'Формат должен быть 1v1, 2v2, 3v3, 4v4 или 5v5.'
      : error.message === 'NEED_CUSTOM_TEAM_SIZE' ? 'Количество игроков в каждой команде не соответствует формату.'
      : error.message === 'CUSTOM_DUPLICATE_PLAYER' ? 'Игрок не может находиться сразу в двух командах.'
      : error.message === 'CUSTOM_CREATOR_NOT_PLAYER' ? 'Ты должен находиться в одной из команд.'
      : error.message === 'CUSTOM_PROFILE_MISSING' ? 'У всех игроков должен быть профиль DOMINION.'
      : error.message === 'CUSTOM_NOT_FOUND' ? 'Кастомная игра не найдена.'
      : error.message === 'INVALID_MAP' ? 'Эта карта сейчас недоступна для голосования.'
      : error.message === 'MAP_ALREADY_BANNED' ? 'Эта карта уже забанена.'
      : error.message === 'TEAM_MEMBER_PROFILE_MISSING' ? 'У всех участников должен быть профиль DOMINION.'
      : error.message === 'TEAM_MEMBER_ALREADY_REGISTERED' ? 'Один из участников уже зарегистрирован в другой команде этого турнира.'
      : error.message === 'TEAM_NAME_OR_MEMBER_DUPLICATE' ? 'Такое название команды уже занято или участник указан дважды.'
      : error.message === 'SOLO_TOURNAMENT' ? 'Для 1v1 используется обычная регистрация.'
      : typeof error.message === 'string' && error.message.startsWith('NEED_TEAM_SIZE:') ? `Для этого формата нужно ровно ${error.message.split(':')[1]} игроков в команде.`
      : typeof error.message === 'string' && error.message.startsWith('NEED_EXACT_SLOTS:') ? `Нужно ровно ${error.message.split(':')[1]} участников.`
      : 'Произошла ошибка. Проверь логи бота.';
    if (interaction.replied || interaction.deferred) await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    else await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
  }
});

process.on('unhandledRejection', error => console.error('[DOMINION] Unhandled rejection:', error));
process.on('uncaughtException', error => console.error('[DOMINION] Uncaught exception:', error));

async function shutdown(signal) {
  console.log(`[DOMINION] ${signal}; shutting down.`);
  await client.destroy().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID), {
  body: [
    { name: 'p', description: 'Открыть панель DOMINION' },
    { name: 'invite', description: 'Получить приглашение на сервер DOMINION' },
    { name: 'leaderboard', description: 'Показать топ игроков DOMINION' },
    { name: 'stats', description: 'Показать свою статистику DOMINION' }
  ]
});

await client.login(process.env.DISCORD_TOKEN);
