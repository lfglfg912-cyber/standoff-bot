import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } from 'discord.js';

const RUMORS = [
  'Ходят слухи, что {user} видит сквозь стены.',
  'Говорят, {user} слышит шаги раньше, чем они происходят.',
  'А вы знали, что {user} думает пойти в киберспорт?',
  'Ходят слухи, что {user} тренирует аим по ночам.',
  'Говорят, {user} никогда не играет без разминки.',
  'По слухам, {user} знает все позиции на карте.',
  'Говорят, {user} способен выиграть раунд одним пистолетом.',
  'Ходят слухи, что {user} прячет настоящий ранг.',
  'А вы знали, что {user} уже ищет команду для турнира?',
  'Говорят, {user} делает хедшоты даже во сне.',
  'Ходят слухи, что {user} знает секрет идеального сенса.',
  'Говорят, {user} всегда прикрывает тиммейтов.',
  'По слухам, {user} готовится к большому турниру.',
  'Говорят, {user} хочет стать IGL.',
  'Ходят слухи, что {user} никогда не паникует в клатче.',
  'Говорят, {user} создан для роли Entry.',
  'По слухам, {user} прирождённый Support.',
  'Говорят, {user} любит неожиданные фланги.',
  'Ходят слухи, что {user} уже присматривает себе команду.',
  'А вы знали, что {user} хочет выиграть первый турнир DOMINION?',
  'Говорят, {user} охотится за высоким рейтингом.',
  'Ходят слухи, что {user} скоро появится в таблице лидеров.',
  'Говорят, {user} может стать следующим MVP.',
  'По слухам, {user} собирает лучшие клипы.',
  'Говорят, {user} создан для хайлайтов.',
  'Ходят слухи, что {user} знает секрет идеального тайминга.',
  'Говорят, {user} умеет читать игру соперника.',
  'А вы знали, что {user} любит кастомки?',
  'По слухам, {user} никогда не отказывается от 1v1.',
  'Говорят, {user} всегда просит реванш.',
  'Ходят слухи, что {user} способен выиграть ситуацию 1v2.',
  'Говорят, {user} особенно опасен в последних секундах раунда.',
  'По слухам, {user} никогда не сдаётся.',
  'Говорят, {user} после поражения становится сильнее.',
  'А вы знали, что {user} умеет учиться на своих ошибках?',
  'Ходят слухи, что {user} лучше всего играет ночью.',
  'Говорят, {user} способен провести ночной марафон.',
  'По слухам, {user} знает секрет ночного аима.',
  'Говорят, {user} любит усложнять себе игру.',
  'Ходят слухи, что {user} первым находит сильные позиции.',
  'Говорят, {user} знает мету раньше остальных.',
  'А вы знали, что {user} следит за новостями Standoff 2?',
  'По слухам, {user} замечает даже маленькие изменения.',
  'Говорят, {user} быстро адаптируется к противнику.',
  'Ходят слухи, что {user} меняет тактику прямо во время матча.',
  'Говорят, {user} играет на несколько раундов вперёд.',
  'По слухам, {user} редко идёт самым очевидным маршрутом.',
  'Говорят, {user} знает, когда нужно отступить.',
  'Ходят слухи, что {user} знает, когда пора идти вперёд.',
  'Говорят, {user} может стать легендой DOMINION.',
  'А вы знали, что {user} охотится за новым рангом?',
  'По слухам, {user} хочет попасть в топ рейтинга.',
  'Говорят, {user} хочет забрать первое место.',
  'Ходят слухи, что {user} уже придумал празднование победы.',
  'Говорят, {user} умеет красиво выигрывать.',
  'По слухам, {user} скоро выпустит хайлайт.',
  'Говорят, {user} способен устроить шоу из обычного раунда.',
  'Ходят слухи, что {user} однажды станет легендой DOMINION.',
  'Говорят, {user} только начинает показывать настоящий уровень.',
  'А вы знали, что {user} ещё не показал свой лучший аим?',
  'По слухам, {user} ждёт свой главный матч.',
  'Говорят, {user} создан для больших моментов.',
  'Ходят слухи, что {user} однажды выиграет турнир DOMINION.',
  'Говорят, {user} ещё заставит соперников запомнить свой ник.',
  'А вы знали, что {user} может стать одним из самых заметных игроков сервера?',
  'По слухам, история {user} в DOMINION только начинается.',
  'Говорят, {user} заходит в Discord ради одной кнопки — «Играть».',
  'Ходят слухи, что {user} нажимает «Кастом» быстрее всех.',
  'Говорят, {user} проверяет рейтинг чаще, чем погоду.',
  'По слухам, {user} уже знает DOMINION лучше админа.',
  'Говорят, {user} всегда говорит «последний матч».',
  'Ходят слухи, что последний матч {user} никогда не бывает последним.',
  'Говорят, {user} после победы обязательно хочет ещё одну.',
  'По слухам, {user} после поражения говорит «ещё одну».',
  'Говорят, {user} пришёл на один матч. Уже третий час играет.',
  'Ходят слухи, что {user} всегда говорит «это был миссклик».',
  'Говорят, {user} знает тысячу причин проиграть раунд.',
  'По слухам, {user} просто проверяет реакцию соперника.',
  'Говорят, {user} проиграл только потому, что «не разогрелся».',
  'Ходят слухи, что {user} может однажды возглавить DOMINION-команду.',
  'Говорят, {user} умеет находить сильных игроков.',
  'По слухам, {user} уже выбирает игроков для своей команды.',
  'Говорят, {user} создан для больших матчей.',
  'Ходят слухи, что {user} никогда не бросает тиммейта.',
  'Говорят, {user} знает, что команда важнее одного фрага.',
  'По слухам, {user} может собрать команду за пять минут.',
  'Говорят, {user} любит играть с проверенными людьми.',
  'Ходят слухи, что {user} способен удивить даже сильных игроков.',
  'Говорят, {user} ещё покажет всем, на что способен.',
  '🔥 ХОДЯТ СЛУХИ, ЧТО {user} — БУДУЩАЯ ЛЕГЕНДА DOMINION.'
];

const MIN_DELAY = 30 * 60 * 1000;
const MAX_DELAY = 2 * 60 * 60 * 1000;
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function active() {
  const m = new Date().getHours() * 60 + new Date().getMinutes();
  return m >= 1110 || m < 360;
}

function nightKey() {
  const d = new Date();
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  return d.toDateString();
}

async function chooseMember(guild, recent) {
  const members = await guild.members.fetch();
  const list = members.filter(m => !m.user.bot && !recent.includes(m.id));
  return list.size ? list.random() : null;
}

function buttons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rumor:join')
      .setLabel('🎲 Участвовать в слухах')
      .setStyle(ButtonStyle.Secondary)
  )];
}

export function createRumorScheduler(client, options = {}) {
  const channelId = options.channelId;
  if (options.enabled !== true || !channelId) {
    console.log('[DOMINION RUMORS] Scheduler prepared but DISABLED.');
    return;
  }

  let running = false;
  let lastNight = null;

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton() || interaction.customId !== 'rumor:join') return;
    try {
      if (!interaction.inGuild()) return interaction.reply({ content: '❌ Только на сервере DOMINION.', ephemeral: true });
      await interaction.reply({
        content: '✅ **Ты участвуешь в слухах DOMINION!**\\n\\nТеперь бот сможет случайно выбрать тебя для ночного слуха.',
        ephemeral: true
      });
    } catch (e) {
      console.error('[DOMINION RUMORS] Button error:', e);
    }
  });

  async function runNight() {
    if (running || !active() || lastNight === nightKey()) return;
    running = true;
    lastNight = nightKey();

    try {
      const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased()) return;

      const count = randomInt(options.minPosts || 5, options.maxPosts || 10);
      const recent = [];
      const used = new Set();

      for (let i = 0; i < count; i++) {
        if (!active()) break;
        if (i) await sleep(randomInt(MIN_DELAY, MAX_DELAY));
        if (!active()) break;

        const member = await chooseMember(guild, recent.slice(-2));
        if (!member) break;
        recent.push(member.id);

        let pool = RUMORS.map((_, n) => n).filter(n => !used.has(n));
        if (!pool.length) { used.clear(); pool = RUMORS.map((_, n) => n); }
        const text = RUMORS[pool[randomInt(0, pool.length - 1)]].replaceAll('{user}', '<@' + member.id + '>');

        await channel.send({ content: '🌙 **СЛУХ DOMINION**\\n\\n' + text, components: buttons() });
      }
    } catch (error) {
      console.error('[DOMINION RUMORS] Scheduler error:', error);
    } finally {
      running = false;
    }
  }

  client.once(Events.ClientReady, () => {
    console.log('[DOMINION RUMORS] Enabled: 5–10 random posts, 18:30–06:00.');
    runNight();
    setInterval(runNight, 5 * 60 * 1000);
  });
}
