import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events, PermissionsBitField, EmbedBuilder,
  REST, Routes
} from 'discord.js';
import { initDb, getPlayer, upsertPlayer, listPlayers, listTournaments, createTournament, joinTournament, startTournament, getTournament, getOpenMatchForPlayer, reportMatch } from './db.js';
import { mainPanel, profileCard, profileButtons, profileModal, aiModal, adminPanel, tournamentCreateModal, teamRegistrationModal, resultButtons, profileStatsEmbed, profileSimpleSection, customFormatButtons, customPlayerSelection, customGameButtons } from './ui.js';
import { tournamentsEmbed, tournamentButtons, tournamentView, matchesEmbed } from './tournament.js';
import { initTournamentV2Db, listTournamentsV2, createTournamentV2, registerTournamentTeam, startTournamentV2, castMapVote, reportMatchV2, getTournamentV2, TEAM_FORMATS, createCustomGame, getCustomGameState, castCustomMapVote, reportCustomGame, listCustomGamesForPlayer, getReadyCustomGamesForPlayer } from './tournament-v2.js';
import { aiEnabled, askAI } from './ai.js';
import { analyzeCustomResultScreenshotOCR } from './ocr.js';

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID', 'PANEL_CHANNEL_ID', 'ADMIN_ROLE_ID'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

function isAdmin(interaction) {
  if (!interaction.inGuild()) return false;
  return interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
}

async function ensurePlayer(interaction) {
  return getPlayer(interaction.user.id);
}

const customDrafts = new Map();

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


client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot || !message.inGuild()) return;
    const image = message.attachments.find(a => {
      const type = String(a.contentType || '').toLowerCase();
      const name = String(a.name || '').toLowerCase();
      return type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name);
    });
    if (!image) return;
    const games = await getReadyCustomGamesForPlayer(message.author.id);
    if (!games.length) return;
    const idFromText = message.content.match(/#(\d+)/)?.[1];
    let game;
    if (idFromText) game = games.find(g => String(g.id) === idFromText);
    else if (games.length === 1) game = games[0];
    if (!game) return message.reply('📸 Скрин получен. У тебя несколько активных кастомов. Укажи номер матча, например **#12**, чтобы бот проверил именно его.');
    await message.react('🔎').catch(() => {});
    const result = await analyzeCustomResultScreenshotOCR(image.url, game);
    if (!result.valid) {
      await message.react('❌').catch(() => {});
      return message.reply({ content: '❌ **Результат не подтверждён.**\nБот не смог надёжно подтвердить скриншот: нужен экран результата Standoff 2, читаемый счёт и все игроки этого кастома. **Рейтинг не изменён.**' + (result.missing_players?.length ? '\nНе распознаны: ' + result.missing_players.join(', ') : '') });
    }
    await reportCustomGame(game.id, message.author.id, result.winner_team);
    await message.react('✅').catch(() => {});
    const winner = result.winner_team === 1 ? 'Команда 1' : 'Команда 2';
    return message.reply('✅ **Кастом #' + game.id + ' подтверждён автоматически по скриншоту.**\n🏆 Победитель: **' + winner + '**\n📊 Счёт: **' + result.score_team1 + ':' + result.score_team2 + '**\n🗺️ Карта: **' + (game.selected_map || 'не указана') + '**\n⭐ Победителям **+15 рейтинга**, проигравшим **−10 рейтинга**.');
  } catch (error) {
    console.error('[DOMINION] Screenshot result error:', error);
    await message.reply('⚠️ Не удалось автоматически проверить скриншот. Рейтинг не изменён.').catch(() => {});
  }
});
client.once(Events.ClientReady, async ready => {
  console.log(`[DOMINION] Logged in as ${ready.user.tag}`);
  try {
    await initDb();
    await initTournamentV2Db();
    const channel = await ready.channels.fetch(process.env.PANEL_CHANNEL_ID);
    if (!channel?.isTextBased()) throw new Error('PANEL_CHANNEL_ID is not a text channel');
    await sendMainPanel(channel);
    console.log('[DOMINION] Database ready; main panel ready.');
  } catch (error) {
    console.error('[DOMINION] Startup error:', error);
    process.exitCode = 1;
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'panel') {
        if (!isAdmin(interaction)) return interaction.reply({ content: 'Недостаточно прав.', ephemeral: true });
        await interaction.reply({ content: 'Панель опубликована.', ephemeral: true });
        await sendMainPanel(interaction.channel);
      }
      return;
    }

    if (interaction.isButton()) {
      const [scope, action, id, extra] = interaction.customId.split(':');

      if (scope === 'nav') {
        if (action === 'profile') return showProfile(interaction);
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
        if (action === 'achievements') return interaction.reply({ embeds: [profileSimpleSection('🏆 Достижения', 'Система достижений подключается следующим модулем. Здесь будут MVP, серии побед и награды турниров.')], components: profileButtons(), ephemeral: true });
        if (action === 'history') return interaction.reply({ embeds: [profileSimpleSection('🕘 История', 'Здесь будет история матчей, изменения рейтинга и полученные звания.')], components: profileButtons(), ephemeral: true });
        if (action === 'ai') {
          if (!aiEnabled()) return interaction.reply({ content: '🤖 AI пока не подключён. Администратору нужно добавить OPENAI_API_KEY.', ephemeral: true });
          return interaction.showModal(aiModal());
        }
        if (action === 'help') return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❓ DOMINION').setDescription('1. Создай профиль.\n2. Открой турниры.\n3. Нажми «Участвовать».\n4. После заполнения сетки администратор запускает турнир.\n5. После матча победитель подтверждается кнопкой.\n6. Следующий раунд создаётся автоматически.').setColor(0x8b0000)], ephemeral: true });
        if (action === 'admin') {
          if (!isAdmin(interaction)) return interaction.reply({ content: 'Эта панель доступна только администрации.', ephemeral: true });
          return interaction.reply({ ...adminPanel(), ephemeral: true });
        }
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
      if (scope === 'custom' && action === 'win') {
        await reportCustomGame(id, interaction.user.id, interaction.customId.split(':')[4]);
        return interaction.reply({ content: '✅ Результат кастома сохранён. Рейтинг и звание игроков обновлены.', ephemeral: true });
      }

      if (scope === 'profile') {
        if (action === 'edit') {
          const player = await getPlayer(interaction.user.id);
          return interaction.showModal(profileModal(player));
        }
      }
      if (scope === 't') {
        if (action === 'view') return interaction.reply({ ...(await tournamentView(id)), ephemeral: true });
        if (action === 'refresh') return interaction.update(await tournamentView(id));
        if (action === 'join') {
          if (!await getPlayer(interaction.user.id)) return interaction.reply({ content: 'Сначала создай профиль через 👤 Профиль.', ephemeral: true });
          await joinTournament(id, interaction.user.id);
          return interaction.update(await tournamentView(id));
        }
        if (action === 'team') {
          const t = await getTournamentV2(id);
          if (!t) return interaction.reply({ content: 'Турнир не найден.', ephemeral: true });
          const size = TEAM_FORMATS[t.format || '1v1'];
          if (!size || size <= 1) return interaction.reply({ content: 'Для этого турнира нужна обычная регистрация.', ephemeral: true });
          if (!await getPlayer(interaction.user.id)) return interaction.reply({ content: 'Сначала создай профиль через 👤 Профиль.', ephemeral: true });
          return interaction.showModal(teamRegistrationModal(id, size));
        }
        if (action === 'start') {
          if (!isAdmin(interaction)) return interaction.reply({ content: 'Запустить турнир может только администрация.', ephemeral: true });
          await startTournamentV2(id);
          return interaction.update(await tournamentView(id));
        }
      }

      if (scope === 'admin' && action === 'create_tournament') {
        if (!isAdmin(interaction)) return interaction.reply({ content: 'Недостаточно прав.', ephemeral: true });
        return interaction.showModal(tournamentCreateModal());
      }

      if (scope === 'veto' && action === 'vote') {
        const mapName = decodeURIComponent(extra || '');
        await castMapVote(id, interaction.user.id, mapName);
        return interaction.update(await tournamentView((await getTournamentV2(id)).id));
      }

      if (scope === 'match' && action === 'win') {
        const matchId = id;
        const winnerType = extra;
        const winnerValue = interaction.customId.split(':')[4];
        if (winnerType === 'team') await reportMatchV2(matchId, interaction.user.id, null, winnerValue);
        else await reportMatchV2(matchId, interaction.user.id, winnerValue, null);
        return interaction.reply({ content: '✅ Результат сохранён. Следующий раунд создастся автоматически после завершения раунда.', ephemeral: true });
      }
    }

    if (interaction.isModalSubmit()) {
      
      if (interaction.customId === 'profile:save') {
        const nick = interaction.fields.getTextInputValue('nick').trim();
        const sid = interaction.fields.getTextInputValue('standoff_id').trim();
        if (!sid) return interaction.reply({ content: '❌ ID игрока Standoff 2 обязателен.', ephemeral: true });
        const player = await upsertPlayer(interaction.user.id, nick, sid);
        return interaction.reply({ ...(await profileCard(player, interaction.user)), ephemeral: true });
      }
      if (interaction.customId === 'ai:ask') {
        await interaction.deferReply({ ephemeral: true });
        const prompt = interaction.fields.getTextInputValue('prompt').trim();
        const answer = await askAI(interaction.user.id, prompt);
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🤖 DOMINION AI').setDescription(answer).setColor(0x8b0000)] });
      }
      if (interaction.customId.startsWith('team:register:')) {
        const tournamentId = interaction.customId.split(':')[2];
        const teamName = interaction.fields.getTextInputValue('team_name').trim();
        const members = interaction.fields.getTextInputValue('members').trim();
        await registerTournamentTeam(tournamentId, interaction.user.id, teamName, members);
        return interaction.reply({ content: `✅ Команда **${teamName}** зарегистрирована. Капитан: <@${interaction.user.id}>.`, ephemeral: true });
      }

      if (interaction.customId === 'admin:create_tournament_modal') {
        if (!isAdmin(interaction)) return interaction.reply({ content: 'Недостаточно прав.', ephemeral: true });
        const name = interaction.fields.getTextInputValue('name').trim();
        const format = interaction.fields.getTextInputValue('format').trim().toLowerCase();
        const slots = Number(interaction.fields.getTextInputValue('slots').trim());
        const prize = Number(interaction.fields.getTextInputValue('prize').trim());
        if (!TEAM_FORMATS[format] || ![4, 8, 16, 32].includes(slots) || !Number.isInteger(prize) || prize < 0) return interaction.reply({ content: 'Формат: 1v1/2v2/3v3/4v4/5v5. Слоты: 4/8/16/32. Приз — целое число.', ephemeral: true });
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
  body: [{ name: 'panel', description: 'Опубликовать/обновить панель DOMINION (админ)' }]
});

await client.login(process.env.DISCORD_TOKEN);
