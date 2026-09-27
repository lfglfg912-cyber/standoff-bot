import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder
} from 'discord.js';

export function mainPanel() {
  const embed = new EmbedBuilder()
    .setTitle('⚔️ DOMINION | STANDOFF 2')
    .setDescription('**Турнирная система нового поколения.**\n\nВыбирай действие кнопками — команды знать не нужно.')
    .addFields(
      { name: '🏆 Турниры', value: 'Регистрация, сетки и матчи', inline: true },
      { name: '👤 Профиль', value: 'Твой рейтинг и статистика', inline: true },
      { name: '🎮 Матчи', value: 'Текущие и завершённые игры', inline: true },
      { name: '🤖 AI', value: 'Помощник DOMINION', inline: true }
    )
    .setColor(0x8b0000)
    .setFooter({ text: 'DOMINION · Skill. Discipline. Domination.' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('nav:profile').setLabel('👤 Профиль').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('nav:tournaments').setLabel('🏆 Турниры').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('nav:matches').setLabel('🎮 Мои матчи').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nav:ai').setLabel('🤖 AI-помощник').setStyle(ButtonStyle.Success)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('nav:help').setLabel('❓ Как это работает').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nav:admin').setLabel('⚙️ Управление').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row1, row2] };
}

export function profileEmbed(player, discordUser) {
  const total = player.wins + player.losses;
  const winrate = total ? Math.round(player.wins / total * 100) : 0;
  return new EmbedBuilder()
    .setTitle(`👤 ${player.standoff_nick}`)
    .setDescription(`Discord: <@${discordUser.id}>\n${player.verified ? '✅ Верифицирован' : '🕓 Профиль не верифицирован'}`)
    .setThumbnail(discordUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '⭐ Рейтинг', value: String(player.rating), inline: true },
      { name: '📈 Winrate', value: `${winrate}%`, inline: true },
      { name: '⚔️ W / L', value: `${player.wins} / ${player.losses}`, inline: true },
      { name: '🏆 Турниры', value: String(player.tournaments), inline: true },
      { name: '🆔 Standoff ID', value: player.standoff_id || 'Не указан', inline: true }
    )
    .setColor(0x8b0000)
    .setFooter({ text: 'Карточка DOMINION · расширенная графическая версия подключается отдельным модулем' });
}

export function profileButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('profile:edit').setLabel('✏️ Изменить профиль').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('nav:tournaments').setLabel('🏆 Турниры').setStyle(ButtonStyle.Danger)
  )];
}

export function profileModal(player = null) {
  return new ModalBuilder()
    .setCustomId('profile:save')
    .setTitle('Профиль DOMINION')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nick').setLabel('Ник в Standoff 2').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32).setValue(player?.standoff_nick || '')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('standoff_id').setLabel('ID игрока Standoff 2').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(64).setValue(player?.standoff_id || ''))
    );
}

export function aiModal() {
  return new ModalBuilder()
    .setCustomId('ai:ask')
    .setTitle('🤖 AI DOMINION')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('prompt').setLabel('Что хочешь узнать?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
    ));
}

export function adminPanel() {
  const embed = new EmbedBuilder().setTitle('⚙️ Управление DOMINION').setDescription('Админские действия доступны кнопками.').setColor(0x8b0000);
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin:create_tournament').setLabel('➕ Создать турнир').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('nav:tournaments').setLabel('🏆 Список турниров').setStyle(ButtonStyle.Secondary)
    )]
  };
}

export function tournamentCreateModal() {
  return new ModalBuilder().setCustomId('admin:create_tournament_modal').setTitle('Создать турнир').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Название').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('format').setLabel('Формат: 1v1 / 2v2 / 3v3 / 4v4 / 5v5').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('slots').setLabel('Команд/участников: 4 / 8 / 16 / 32').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prize').setLabel('Призовой фонд в Gold').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8))
  );
}

export function teamRegistrationModal(tournamentId, teamSize) {
  const help = teamSize === 2
    ? 'ID напарника (Discord ID или @упоминание)'
    : `ID ${teamSize - 1} участников через запятую`;
  return new ModalBuilder().setCustomId(`team:register:${tournamentId}`).setTitle(`Регистрация команды ${teamSize}×${teamSize}`).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('team_name').setLabel('Название команды').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('members').setLabel(help).setStyle(TextInputStyle.Paragraph).setRequired(teamSize > 1).setMaxLength(400))
  );
}

export function vetoButtons(match, bans, votes = []) {
  const pool = match.map_pool?.length ? match.map_pool : [];
  const banned = new Set(bans.map(x => x.map_name));
  const counts = new Map(votes.map(x => [x.map_name, x.votes]));
  const rows = [];
  let row = new ActionRowBuilder();
  for (const map of pool) {
    if (banned.has(map)) continue;
    if (row.components.length >= 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    const count = counts.get(map) || 0;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`veto:vote:${match.id}:${encodeURIComponent(map)}`)
        .setLabel(`🗳️ ${map}${count ? ` · ${count}` : ''}`)
        .setStyle(ButtonStyle.Danger)
    );
  }
  if (row.components.length) rows.push(row);
  return rows;
}

export function resultButtons(match) {
  const isTeam = Boolean(match.team1_id && match.team2_id);
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(isTeam
      ? `match:win:${match.id}:team:${match.team1_id}`
      : `match:win:${match.id}:player:${match.player1_id}`).setLabel(isTeam ? '🏆 Победила команда 1' : '🏆 Победил игрок 1').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(isTeam
      ? `match:win:${match.id}:team:${match.team2_id}`
      : `match:win:${match.id}:player:${match.player2_id}`).setLabel(isTeam ? '🏆 Победила команда 2' : '🏆 Победил игрок 2').setStyle(ButtonStyle.Success)
  )];
}