import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder
} from 'discord.js';
import sharp from 'sharp';

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
    new ButtonBuilder().setCustomId('nav:custom').setLabel('⚔️ Кастом').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('nav:custom').setLabel('⚔️ Кастом').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('nav:matches').setLabel('🎮 Мои матчи').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nav:ai').setLabel('🤖 AI-помощник').setStyle(ButtonStyle.Success)
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

  const svg = '<svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
      '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#05070a"/><stop offset=".55" stop-color="#111820"/><stop offset="1" stop-color="#050608"/></linearGradient>' +
      '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".45" stop-color="#d7a947"/><stop offset="1" stop-color="#76501a"/></linearGradient>' +
    '</defs>' +
    '<rect width="1200" height="675" rx="28" fill="url(#bg)"/>' +
    '<path d="M20 105V25h80M1100 25h80v80M20 570v80h80M1100 650h80v-80" fill="none" stroke="url(#gold)" stroke-width="3"/>' +
    '<text x="58" y="62" fill="#f3d27c" font-size="28" font-family="Arial" font-weight="700">DOMINION</text>' +
    '<text x="58" y="90" fill="#a9b0b8" font-size="15" font-family="Arial" letter-spacing="4">STANDOFF 2</text>' +
    '<rect x="52" y="125" width="285" height="360" rx="20" fill="#0b0e12" stroke="url(#gold)" stroke-width="3"/>' +
    '<path d="M82 445L155 175h127l23 270z" fill="#171d24"/>' +
    '<circle cx="205" cy="255" r="70" fill="#202933" stroke="#b88b36" stroke-width="2"/>' +
    '<path d="M140 235q65-70 130 0l-20 25h-90z" fill="#090b0e"/>' +
    '<path d="M155 278q50-33 100 0l15 72q-65 40-130 0z" fill="#080b0e"/>' +
    '<path d="M118 430l37-105 50 50 50-50 37 105z" fill="#141b22"/>' +
    '<text x="72" y="462" fill="#e8c46a" font-size="17" font-family="Arial" font-weight="700">DOMINION OPERATIVE</text>' +
    '<text x="375" y="160" fill="#fff" font-size="38" font-family="Arial" font-weight="700">' + esc(player.standoff_nick || 'Игрок') + '</text>' +
    '<text x="378" y="190" fill="#aeb7c0" font-size="18" font-family="Arial">Discord • ' + esc(discordUser.username || discordUser.tag || 'player') + '</text>' +
    '<text x="378" y="222" fill="#aeb7c0" font-size="18" font-family="Arial">Standoff ID • ' + esc(player.standoff_id || 'Не указан') + '</text>' +
    '<rect x="375" y="245" width="745" height="110" rx="18" fill="#11161c" stroke="#6f5728"/>' +
    '<text x="405" y="278" fill="#f2c66d" font-size="16" font-family="Arial" font-weight="700">' + rank + '</text>' +
    '<text x="405" y="315" fill="#fff" font-size="28" font-family="Arial" font-weight="700">' + (calibration ? ('Матчи ' + progress + '/5') : ('Рейтинг ' + rating)) + '</text>' +
    '<text x="405" y="340" fill="#929aa3" font-size="15" font-family="Arial">' + (calibration ? 'Сыграй 5 матчей, чтобы получить звание' : 'Звание игрока') + '</text>' +
    '<rect x="720" y="287" width="300" height="14" rx="7" fill="#242b32"/>' +
    '<rect x="720" y="287" width="' + (300 * progress / 5) + '" height="14" rx="7" fill="url(#gold)"/>' +
    '<text x="1040" y="302" fill="#f2c66d" font-size="18" font-family="Arial" font-weight="700">' + progress + '/5</text>' +
    '<rect x="375" y="385" width="175" height="105" rx="16" fill="#11161c" stroke="#303941"/>' +
    '<rect x="565" y="385" width="175" height="105" rx="16" fill="#11161c" stroke="#303941"/>' +
    '<rect x="755" y="385" width="175" height="105" rx="16" fill="#11161c" stroke="#303941"/>' +
    '<rect x="945" y="385" width="175" height="105" rx="16" fill="#11161c" stroke="#303941"/>' +
    '<text x="400" y="415" fill="#929aa3" font-size="14" font-family="Arial">МАТЧИ</text><text x="400" y="457" fill="#fff" font-size="30" font-family="Arial" font-weight="700">' + total + '</text>' +
    '<text x="585" y="415" fill="#929aa3" font-size="14" font-family="Arial">WINRATE</text><text x="585" y="457" fill="#fff" font-size="30" font-family="Arial" font-weight="700">' + winrate + '%</text>' +
    '<text x="775" y="415" fill="#929aa3" font-size="14" font-family="Arial">W / L</text><text x="775" y="457" fill="#fff" font-size="30" font-family="Arial" font-weight="700">' + wins + ' / ' + losses + '</text>' +
    '<text x="965" y="415" fill="#929aa3" font-size="14" font-family="Arial">ТУРНИРЫ</text><text x="965" y="457" fill="#fff" font-size="30" font-family="Arial" font-weight="700">' + Number(player.tournaments || 0) + '</text>' +
    '<rect x="375" y="525" width="745" height="82" rx="16" fill="#0a0d11" stroke="#6f5728"/>' +
    '<text x="405" y="557" fill="#f2c66d" font-size="14" font-family="Arial">СТАТУС</text>' +
    '<text x="405" y="584" fill="#fff" font-size="18" font-family="Arial">' + (player.verified ? '✓ Верифицирован' : '◷ Профиль не верифицирован') + '</text>' +
    '<text x="760" y="557" fill="#f2c66d" font-size="14" font-family="Arial">ЗВАНИЕ</text>' +
    '<text x="760" y="584" fill="#fff" font-size="18" font-family="Arial">' + rank + '</text>' +
    '</svg>';

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const attachment = new AttachmentBuilder(buffer, { name: 'dominion-profile.png' });
  const embed = new EmbedBuilder().setColor(0x8b0000).setImage('attachment://dominion-profile.png')
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

export function customGameModal() {
  return new ModalBuilder().setCustomId('custom:create').setTitle('⚔️ Кастомная игра на звание').addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('format').setLabel('Формат: 1v1 / 2v2 / 3v3 / 4v4 / 5v5').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('team1').setLabel('Команда 1: Discord ID через запятую').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(400)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('team2').setLabel('Команда 2: Discord ID через запятую').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(400)
    )
  );
}

export function customGameButtons(game) {
  const rows = [];
  if (game?.veto_status === 'active') rows.push(...vetoButtons(game, game.bans || [], game.votes || [], 'custom'));
  if (game?.veto_status === 'finished') rows.push(...resultButtons(game));
  return rows;
}

export function customGameModal() {
  return new ModalBuilder().setCustomId('custom:create').setTitle('⚔️ Кастомная игра на звание').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('format').setLabel('Формат: 1v1 / 2v2 / 3v3 / 4v4 / 5v5').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('team1').setLabel('Команда 1: Discord ID через запятую').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(400)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('team2').setLabel('Команда 2: Discord ID через запятую').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(400))
  );
}

export function customGameButtons(game) {
  const rows = [];
  if (game?.veto_status === 'active') rows.push(...vetoButtons(game, game.bans || [], game.votes || [], 'custom'));
  if (game?.veto_status === 'finished') rows.push(...resultButtons(game));
  return rows;
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