import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events, PermissionsBitField, EmbedBuilder,
  REST, Routes
} from 'discord.js';
import { initDb, getPlayer, upsertPlayer, listTournaments, createTournament, joinTournament, startTournament, getTournament, getOpenMatchForPlayer, reportMatch } from './db.js';
import { mainPanel, profileEmbed, profileButtons, profileModal, aiModal, adminPanel, tournamentCreateModal, teamRegistrationModal, resultButtons } from './ui.js';
import { tournamentsEmbed, tournamentButtons, tournamentView, matchesEmbed } from './tournament.js';
import { initTournamentV2Db, listTournamentsV2, createTournamentV2, registerTournamentTeam, startTournamentV2, castMapVote, reportMatchV2, getTournamentV2, TEAM_FORMATS } from './tournament-v2.js';
import { aiEnabled, askAI } from './ai.js';

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID', 'PANEL_CHANNEL_ID', 'ADMIN_ROLE_ID'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function isAdmin(interaction) {
  if (!interaction.inGuild()) return false;
  return interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
}

async function ensurePlayer(interaction) {
  return getPlayer(interaction.user.id);
}

async function showProfile(interaction) {
  const player = await ensurePlayer(interaction);
  if (!player) {
    await interaction.showModal(profileModal());
    return;
  }
  await interaction.reply({ embeds: [profileEmbed(player, interaction.user)], components: profileButtons(), ephemeral: true });
}

async function sendMainPanel(channel) {
  const messages = await channel.messages.fetch({ limit: 30 });
  const old = messages.find(m => m.author.id === client.user.id && m.components.some(row => row.components.some(c => c.customId === 'nav:profile')));
  if (old) return old.edit(mainPanel());
  return channel.send(mainPanel());
}

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
        if (action === 'tournaments') {
          const ts = await listTournamentsV2();
          return interaction.reply({ embeds: [tournamentsEmbed(ts)], components: tournamentButtons(ts), ephemeral: true });
        }
        if (action === 'matches') return interaction.reply({ ...(await matchesEmbed(interaction.user.id)), ephemeral: true });
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
        return interaction.reply({ embeds: [profileEmbed(player, interaction.user)], components: profileButtons(), ephemeral: true });
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
