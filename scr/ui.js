import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder
} from 'discord.js';
import sharp from 'sharp';

// DOMINION UI: current production-safe UI module.

export function mainPanel() {
  const embed = new EmbedBuilder()
    .setTitle('⚔️ DOMINION | STANDOFF 2')
    .setDescription('**Турнирная система нового поколения.**\n\nВыбирай действие кнопками — команды знать не нужно.')
    .addFields(
      { name: '🏆 Турниры', value: 'Регистрация, сетки и матчи', inline: true },
      { name: '👤 Профиль', value: 'Твой рейтинг и статистика', inline: true },
      { name: '🎮 Матчи', value: 'Текущие и завершённые игры', inline: true },
      { name: '🤖 AI', value: 'Скоро будет доступен', inline: true }
    )
    .setColor(0x8b0000)
    .setFooter({ text: 'DOMINION · Skill. Discipline. Domination.' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('nav:profile').setLabel('👤 Профиль').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('nav:tournaments').setLabel('🏆 Турниры').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('nav:custom').setLabel('⚔️ Кастом').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('nav:matches').setLabel('🎮 Мои матчи').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nav:ai').setLabel('🤖 AI (скоро)').setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('nav:help').setLabel('❓ Как это работает').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nav:admin').setLabel('⚙️ Управление').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row1, row2] };
}


export async function profileCard(player, discordUser) {
  const wins = Number(player.wins || 0);
  const losses = Number(player.losses || 0);
  const total = wins + losses;
  const winrate = total ? Math.round(wins / total * 100) : 0;
  const calibration = total < 5;
  const progress = Math.min(total, 5);
  const rating = Number(player.rating || 0);
  const rank = calibration ? 'КАЛИБРОВКА' : rating >= 1500 ? 'LEGEND' : rating >= 1300 ? 'ELITE' : rating >= 1150 ? 'VETERAN' : rating >= 1000 ? 'FIGHTER' : 'RECRUIT';

  const esc = (v = '') => String(v)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

  const rankRu = { LEGEND: 'Legend', ELITE: 'Elite', VETERAN: 'Veteran', FIGHTER: 'Fighter', RECRUIT: 'Recruit', КАЛИБРОВКА: 'Калибровка' }[rank] || rank;
  const avatarUrl = discordUser.displayAvatarURL({ extension: 'png', size: 256 });
  let avatarData = '';
  try {
    const response = await fetch(avatarUrl);
    if (response.ok) avatarData = `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
  } catch (error) {
    console.warn('[DOMINION] Could not load Discord avatar:', error.message);
  }

  const avatar = avatarData
    ? `<clipPath id="av"><circle cx="145" cy="145" r="105"/></clipPath><image href="${avatarData}" x="40" y="40" width="210" height="210" preserveAspectRatio="xMidYMid slice" clip-path="url(#av)"/>`
    : '<circle cx="145" cy="145" r="105" fill="#171c24"/><text x="145" y="160" text-anchor="middle" fill="#d7a947" font-size="54" font-family="DejaVu Sans">D</text>';

  const progressWidth = 420 * progress / 5;

  const svg = `<svg width="1536" height="900" viewBox="0 0 1536 900" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#030508"/><stop offset=".55" stop-color="#111820"/><stop offset="1" stop-color="#050608"/></linearGradient>
      <linearGradient id="red" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#ff202d"/><stop offset="1" stop-color="#7b0008"/></linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0b0"/><stop offset=".5" stop-color="#d7a947"/><stop offset="1" stop-color="#76501a"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <clipPath id="av"><circle cx="145" cy="145" r="105"/></clipPath>
    </defs>
    <rect width="1536" height="900" fill="url(#bg)"/>
    <path d="M0 250L250 0h250L0 500z" fill="#5c0008" opacity=".16"/>
    <path d="M1536 150L1330 0h-250l456 360z" fill="#65000a" opacity=".13"/>
    <path d="M0 20H360M0 20V250M1536 20H1176M1536 20V250M0 880H360M0 880V650M1536 880H1176M1536 880V650" stroke="url(#red)" stroke-width="4" fill="none"/>
    <rect x="28" y="28" width="1480" height="844" rx="26" fill="none" stroke="#252d36" stroke-width="2"/>
    <text x="60" y="76" fill="#fff" font-size="34" font-family="DejaVu Sans" font-weight="700">DOMINION</text>
    <text x="62" y="105" fill="#aab1ba" font-size="15" font-family="DejaVu Sans" letter-spacing="5">STANDOFF 2</text>
    <text x="60" y="145" fill="#727b85" font-size="13" font-family="DejaVu Sans">ОРДЕН ИГРОКОВ · ПРОФИЛЬ БОЙЦА</text>

    <rect x="58" y="180" width="290" height="610" rx="22" fill="#080b10" stroke="url(#red)" stroke-width="3"/>
    <circle cx="145" cy="145" r="112" fill="#07090c" stroke="url(#gold)" stroke-width="5" filter="url(#glow)"/>
    ${avatar}
    <circle cx="219" cy="219" r="14" fill="#1bd760" stroke="#071008" stroke-width="6"/>
    <text x="205" y="292" text-anchor="middle" fill="#e9c66f" font-size="20" font-family="DejaVu Sans" font-weight="700">DOMINION OPERATIVE</text>
    <text x="203" y="332" text-anchor="middle" fill="#fff" font-size="30" font-family="DejaVu Sans" font-weight="700">${esc(player.standoff_nick || 'Игрок')}</text>
    <text x="203" y="360" text-anchor="middle" fill="#87909a" font-size="17" font-family="DejaVu Sans">Discord · ${esc(discordUser.username || discordUser.tag || 'player')}</text>
    <rect x="88" y="390" width="230" height="58" rx="15" fill="#10151b" stroke="#363e47"/>
    <text x="203" y="416" text-anchor="middle" fill="#89929c" font-size="13" font-family="DejaVu Sans">STANDOFF ID</text>
    <text x="203" y="438" text-anchor="middle" fill="#fff" font-size="19" font-family="DejaVu Sans" font-weight="700">${esc(player.standoff_id || 'Не указан')}</text>
    <text x="86" y="495" fill="#7f8993" font-size="14" font-family="DejaVu Sans">СТАТУС</text>
    <text x="86" y="522" fill="#fff" font-size="18" font-family="DejaVu Sans">${player.verified ? '✓ Верифицирован' : '◷ Не верифицирован'}</text>
    <text x="86" y="570" fill="#7f8993" font-size="14" font-family="DejaVu Sans">РОЛЬ</text>
    <text x="86" y="597" fill="#fff" font-size="18" font-family="DejaVu Sans">Игрок Standoff 2</text>
    <text x="86" y="645" fill="#7f8993" font-size="14" font-family="DejaVu Sans">СПЕЦИАЛИЗАЦИЯ</text>
    <text x="86" y="672" fill="#fff" font-size="18" font-family="DejaVu Sans">Не указана</text>
    <text x="86" y="740" fill="#a9b1ba" font-size="13" font-family="DejaVu Sans">SKILL · DISCIPLINE · DOMINATION</text>

    <text x="390" y="205" fill="#fff" font-size="48" font-family="DejaVu Sans" font-weight="700">${esc(player.standoff_nick || 'Игрок')}</text>
    <text x="392" y="240" fill="#8e98a2" font-size="18" font-family="DejaVu Sans">Discord · ${esc(discordUser.username || discordUser.tag || 'player')}   •   Standoff ID · ${esc(player.standoff_id || 'Не указан')}</text>

    <rect x="390" y="270" width="1090" height="150" rx="22" fill="#0b1016" stroke="#6c5225" stroke-width="2"/>
    <text x="425" y="308" fill="#d8aa4e" font-size="15" font-family="DejaVu Sans" font-weight="700">RANK</text>
    <text x="425" y="353" fill="#fff" font-size="36" font-family="DejaVu Sans" font-weight="700">${rankRu}</text>
    <text x="425" y="387" fill="#9ca5ae" font-size="17" font-family="DejaVu Sans">${calibration ? `Калибровка · матчи ${progress}/5` : `MMR · ${rating}`}</text>
    <path d="M700 300l45 45-45 45-45-45z" fill="#121922" stroke="url(#gold)" stroke-width="4"/>
    <path d="M700 315l28 30-28 30-28-30z" fill="#d7a947"/>
    <text x="790" y="312" fill="#8d969f" font-size="14" font-family="DejaVu Sans">ПРОГРЕСС КАЛИБРОВКИ</text>
    <rect x="790" y="330" width="420" height="16" rx="8" fill="#252c33"/>
    <rect x="790" y="330" width="${progressWidth}" height="16" rx="8" fill="url(#red)"/>
    <text x="1230" y="346" fill="#e2bb61" font-size="19" font-family="DejaVu Sans" font-weight="700">${progress}/5</text>
    <text x="790" y="382" fill="#8d969f" font-size="14" font-family="DejaVu Sans">${calibration ? 'Сыграй 5 матчей, чтобы получить звание' : 'Звание рассчитано по текущему рейтингу'}</text>

    <g>
      <rect x="390" y="450" width="250" height="130" rx="18" fill="#0b1016" stroke="#303942"/>
      <rect x="660" y="450" width="250" height="130" rx="18" fill="#0b1016" stroke="#303942"/>
      <rect x="930" y="450" width="250" height="130" rx="18" fill="#0b1016" stroke="#303942"/>
      <rect x="1200" y="450" width="280" height="130" rx="18" fill="#0b1016" stroke="#303942"/>
      <text x="420" y="485" fill="#8c969f" font-size="14" font-family="DejaVu Sans">МАТЧИ</text><text x="420" y="540" fill="#fff" font-size="39" font-family="DejaVu Sans" font-weight="700">${total}</text>
      <text x="690" y="485" fill="#8c969f" font-size="14" font-family="DejaVu Sans">ПОБЕДЫ</text><text x="690" y="540" fill="#fff" font-size="39" font-family="DejaVu Sans" font-weight="700">${wins}</text>
      <text x="960" y="485" fill="#8c969f" font-size="14" font-family="DejaVu Sans">WINRATE</text><text x="960" y="540" fill="#fff" font-size="39" font-family="DejaVu Sans" font-weight="700">${winrate}%</text>
      <text x="1230" y="485" fill="#8c969f" font-size="14" font-family="DejaVu Sans">W / L · ТУРНИРЫ</text><text x="1230" y="540" fill="#fff" font-size="30" font-family="DejaVu Sans" font-weight="700">${wins} / ${losses} · ${Number(player.tournaments || 0)}</text>
    </g>

    <rect x="390" y="610" width="1090" height="180" rx="22" fill="#080c11" stroke="#252d36"/>
    <text x="425" y="650" fill="#fff" font-size="21" font-family="DejaVu Sans" font-weight="700">ПРОФИЛЬ DOMINION</text>
    <text x="425" y="687" fill="#8f98a2" font-size="16" font-family="DejaVu Sans">Игрок зарегистрирован в системе и готов участвовать в матчах и турнирах.</text>
    <text x="425" y="727" fill="#d7a947" font-size="14" font-family="DejaVu Sans">RANK</text><text x="425" y="754" fill="#fff" font-size="19" font-family="DejaVu Sans">${rankRu}</text>
    <text x="680" y="727" fill="#d7a947" font-size="14" font-family="DejaVu Sans">РЕЙТИНГ</text><text x="680" y="754" fill="#fff" font-size="19" font-family="DejaVu Sans">${calibration ? 0 : rating}</text>
    <text x="930" y="727" fill="#d7a947" font-size="14" font-family="DejaVu Sans">СТАТУС</text><text x="930" y="754" fill="#fff" font-size="19" font-family="DejaVu Sans">${player.verified ? 'Верифицирован' : 'Не верифицирован'}</text>
    <text x="1210" y="727" fill="#d7a947" font-size="14" font-family="DejaVu Sans">ТУРНИРЫ</text><text x="1210" y="754" fill="#fff" font-size="19" font-family="DejaVu Sans">${Number(player.tournaments || 0)}</text>

    <text x="60" y="845" fill="#a0a8b1" font-size="16" font-family="DejaVu Sans">DOMINION · Skill. Discipline. Domination.</text>
    <text x="1250" y="845" fill="#e41b2b" font-size="18" font-family="DejaVu Sans" font-weight="700">ИГРАЕМ · РАЗВИВАЕМ · ПОБЕЖДАЕМ</text>
  </svg>`;

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const attachment = new AttachmentBuilder(buffer, { name: 'dominion-profile.png' });
  const embed = new EmbedBuilder().setColor(0x8b0000)
    .setImage('attachment://dominion-profile.png')
    .setFooter({ text: 'DOMINION · Skill. Discipline. Domination.' });
  return { embeds: [embed], files: [attachment], components: profileButtons() };
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
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('nav:profile').setLabel('👤 Профиль').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('nav:stats').setLabel('📊 Статистика').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('nav:matches').setLabel('⚔️ Матчи').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('nav:achievements').setLabel('🏆 Достижения').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('nav:history').setLabel('🕘 История').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('profile:edit').setLabel('✏️ Изменить профиль').setStyle(ButtonStyle.Primary)
    )
  ];
}

export function profileStatsEmbed(player) {
  const total = Number(player.wins || 0) + Number(player.losses || 0);
  const winrate = total ? Math.round(Number(player.wins || 0) / total * 100) : 0;
  return new EmbedBuilder().setTitle('📊 Статистика игрока').setColor(0x8b0000).addFields(
    { name: '⭐ Рейтинг', value: String(player.rating || 0), inline: true },
    { name: '📈 Winrate', value: winrate + '%', inline: true },
    { name: '⚔️ W / L', value: (player.wins || 0) + ' / ' + (player.losses || 0), inline: true },
    { name: '🏆 Турниры', value: String(player.tournaments || 0), inline: true }
  );
}

export function profileSimpleSection(title, description) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x8b0000);
}

export function customFormatButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('custom:format:1v1').setLabel('1v1').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('custom:format:2v2').setLabel('2v2').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('custom:format:3v3').setLabel('3v3').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('custom:format:4v4').setLabel('4v4').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('custom:format:5v5').setLabel('5v5').setStyle(ButtonStyle.Primary)
  )];
}

export function customPlayerSelection(format, players, creatorId) {
  const size = Number(format.split('v')[0]);
  const rows = [];

  if (size > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('custom:team1')
        .setPlaceholder(`Команда 1: выбери ещё ${size - 1} игрок(а)`)
        .setMinValues(size - 1).setMaxValues(size - 1)
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('custom:team2')
      .setPlaceholder(`Команда 2: выбери ${size} игрок(а)`)
      .setMinValues(size).setMaxValues(size)
  ));

  return rows;
}

export function customGameModal() {
  return new ModalBuilder().setCustomId('custom:create').setTitle('Кастомная игра на звание').addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('format').setLabel('Формат: 1v1 / 2v2 / 3v3 / 4v4 / 5v5').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)
    )
  );
}
export function roundVoteButtons(matchId, prefix = 'round') {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}:vote:${matchId}:10`).setLabel('10 раундов').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${prefix}:vote:${matchId}:12`).setLabel('12 раундов').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${prefix}:vote:${matchId}:14`).setLabel('14 раундов').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${prefix}:vote:${matchId}:16`).setLabel('16 раундов').setStyle(ButtonStyle.Secondary)
  )];
}

export function customGameButtons(game) {
  const rows = [];
  if (game?.veto_status === 'active') rows.push(...vetoButtons(game, game.bans || [], game.votes || [], 'custom'));
  if (game?.veto_status === 'finished') rows.push(...customResultButtons(game));
  return rows;
}

export function customResultButtons(game) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`custom:win:${game.id}:team:1`).setLabel('🏆 Победила команда 1').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`custom:win:${game.id}:team:2`).setLabel('🏆 Победила команда 2').setStyle(ButtonStyle.Success)
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

export function adminPanel(canCreateTournament = false) {
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Управление DOMINION')
    .setDescription('Админские действия доступны кнопками.\n\n🛡️ **Модерация:** предупреждение, тайм-аут, кик и бан.')
    .setColor(0x8b0000);
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin:moderation').setLabel('🛡️ Модерация').setStyle(ButtonStyle.Danger),
        ...(canCreateTournament ? [new ButtonBuilder().setCustomId('admin:create_tournament').setLabel('➕ Создать турнир').setStyle(ButtonStyle.Success)] : []),
        new ButtonBuilder().setCustomId('nav:tournaments').setLabel('🏆 Список турниров').setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

export function moderationUserSelect() {
  return [new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('mod:user')
      .setPlaceholder('Выбери участника для модерации')
      .setMinValues(1).setMaxValues(1)
  )];
}

export function moderationActions(userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mod:warnings:${userId}`).setLabel('📋 Предупреждения').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`mod:warn:${userId}`).setLabel('⚠️ Выдать').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`mod:timeout:${userId}`).setLabel('🔇 Тайм-аут 10м').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`mod:kick:${userId}`).setLabel('👢 Кик').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`mod:ban:${userId}`).setLabel('🔨 Бан').setStyle(ButtonStyle.Danger)
    )
  ];
}

export function moderationReasonModal(action, userId) {
  return new ModalBuilder()
    .setCustomId(`mod:reason:${action}:${userId}`)
    .setTitle('Причина модерации')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Причина').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
    ));
}

export function tournamentCancelConfirm(tournamentId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`t:cancel:confirm:${tournamentId}`).setLabel('🛑 Да, отменить турнир').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`t:cancel:back:${tournamentId}`).setLabel('↩️ Вернуться').setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function tournamentCreateModal() {
  return new ModalBuilder().setCustomId('admin:create_tournament_modal').setTitle('Создать турнир').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Название').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('format').setLabel('Формат: 1v1 / 2v2 / 3v3 / 4v4 / 5v5').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('slots').setLabel('Команд/участников: 4 / 8 / 16 / 32').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prize').setLabel('Призовой фонд в Gold').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rounds').setLabel('Раундов: 10 / 12 / 14 / 16').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2))
  );
}

export function tournamentTeamNameModal(tournamentId) {
  return new ModalBuilder()
    .setCustomId(`team:name:${tournamentId}`)
    .setTitle('Регистрация команды')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('team_name')
          .setLabel('Название команды')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32)
      )
    );
}

export function tournamentTeamSelection(tournamentId, teamSize) {
  const count = Math.max(1, Number(teamSize) - 1);
  return [new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`t:teamselect:${tournamentId}`)
      .setPlaceholder(`Выбери ещё ${count} игрок(а) команды`)
      .setMinValues(count)
      .setMaxValues(count)
  )];
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

export function vetoButtons(match, bans, votes = [], scope = 'veto') {
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
        .setCustomId(`${scope}:vote:${match.id}:${encodeURIComponent(map)}`)
        .setLabel(`🗳️ ${map}${count ? ` · ${count}` : ''}`)
        .setStyle(ButtonStyle.Danger)
    );
  }
  if (row.components.length) rows.push(row);
  return rows;
}

export function resultButtons(match, scope = 'match') {
  const isTeam = Boolean(match.team1_id && match.team2_id);
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(isTeam
      ? `${scope}:win:${match.id}:team:${match.team1_id}`
      : `match:win:${match.id}:player:${match.player1_id}`).setLabel(isTeam ? '🏆 Победила команда 1' : '🏆 Победил игрок 1').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(isTeam
      ? `${scope}:win:${match.id}:team:${match.team2_id}`
      : `match:win:${match.id}:player:${match.player2_id}`).setLabel(isTeam ? '🏆 Победила команда 2' : '🏆 Победил игрок 2').setStyle(ButtonStyle.Success)
  )];
}

export function warningListButtons(userId, hasWarnings = true) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod:back:${userId}`).setLabel('↩️ Назад').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod:clear:${userId}`).setLabel('🧹 Сбросить предупреждения').setStyle(ButtonStyle.Danger).setDisabled(!hasWarnings)
  )];
}
