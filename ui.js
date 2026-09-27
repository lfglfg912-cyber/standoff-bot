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
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('standoff_id').setLabel('ID игрока (необязательно)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(64).setValue(player?.standoff_id || ''))
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
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('slots').setLabel('Слоты: 4 / 8 / 16 / 32').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prize').setLabel('Призовой фонд в Gold').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8))
  );
}

export function resultButtons(match) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`match:win:${match.id}:${match.player1_id}`).setLabel('🏆 Победил игрок 1').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`match:win:${match.id}:${match.player2_id}`).setLabel('🏆 Победил игрок 2').setStyle(ButtonStyle.Success)
  )];
}
