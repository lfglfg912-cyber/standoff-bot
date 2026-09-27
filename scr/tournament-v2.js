import { query } from './db.js';

export async function initTournamentV2Db() {
  await query(`
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT '1v1';
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS team1_id BIGINT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS team2_id BIGINT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS winner_team_id BIGINT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS map_pool TEXT[];
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS veto_step INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS veto_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS selected_map TEXT;

    CREATE TABLE IF NOT EXISTS tournament_teams (
      id BIGSERIAL PRIMARY KEY,
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      captain_id TEXT NOT NULL REFERENCES players(discord_id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tournament_id, name)
    );

    CREATE TABLE IF NOT EXISTS tournament_team_members (
      team_id BIGINT REFERENCES tournament_teams(id) ON DELETE CASCADE,
      discord_id TEXT NOT NULL REFERENCES players(discord_id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (team_id, discord_id)
    );

    CREATE TABLE IF NOT EXISTS match_map_veto (
      id BIGSERIAL PRIMARY KEY,
      match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      step INTEGER NOT NULL,
      team_id BIGINT NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
      action TEXT NOT NULL DEFAULT 'ban',
      map_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (match_id, step),
      UNIQUE (match_id, map_name)
    );
  `);
}

export const MAP_POOL = [
  'Sandstone',
  'Rust',
  'Province',
  'Zone 9',
  'Breeze',
  'Sakura',
  'Dune'
];

export const TEAM_FORMATS = {
  '1v1': 1,
  '2v2': 2,
  '3v3': 3,
  '4v4': 4,
  '5v5': 5
};

function normalizeFormat(format) {
  if (TEAM_FORMATS[format]) return format;
  if (format === '1v1-single-elimination') return '1v1';
  return '1v1';
}

export async function createTournamentV2({ name, slots, prizeGold, createdBy, format }) {
  const normalized = normalizeFormat(format);
  if (![4, 8, 16, 32].includes(slots)) throw new Error('INVALID_SLOTS');
  const { rows } = await query(`
    INSERT INTO tournaments (name, slots, prize_gold, format, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [name, slots, prizeGold, normalized, createdBy]);
  return rows[0];
}

export async function listTournamentsV2() {
  const { rows } = await query(`
    SELECT t.*,
      CASE WHEN t.format = '1v1' THEN
        (SELECT COUNT(*)::int FROM tournament_players tp WHERE tp.tournament_id = t.id)
      ELSE
        (SELECT COUNT(*)::int FROM tournament_teams tt WHERE tt.tournament_id = t.id)
      END AS registered
    FROM tournaments t
    WHERE t.status IN ('registration', 'running')
    ORDER BY t.created_at DESC
    LIMIT 10
  `);
  return rows;
}

export async function getTournamentV2(id) {
  const { rows } = await query(`
    SELECT t.*,
      CASE WHEN t.format = '1v1' THEN
        (SELECT COUNT(*)::int FROM tournament_players tp WHERE tp.tournament_id = t.id)
      ELSE
        (SELECT COUNT(*)::int FROM tournament_teams tt WHERE tt.tournament_id = t.id)
      END AS registered
    FROM tournaments t WHERE t.id = $1
  `, [id]);
  return rows[0] ?? null;
}

export async function getTournamentTeams(tournamentId) {
  const { rows } = await query(`
    SELECT tt.*, p.standoff_nick AS captain_nick,
      COUNT(tm.discord_id)::int AS member_count
    FROM tournament_teams tt
    JOIN players p ON p.discord_id = tt.captain_id
    LEFT JOIN tournament_team_members tm ON tm.team_id = tt.id
    WHERE tt.tournament_id = $1
    GROUP BY tt.id, p.standoff_nick
    ORDER BY tt.created_at
  `, [tournamentId]);
  return rows;
}

export async function getTeamMembers(teamId) {
  const { rows } = await query(`
    SELECT p.* FROM tournament_team_members tm
    JOIN players p ON p.discord_id = tm.discord_id
    WHERE tm.team_id = $1
    ORDER BY tm.joined_at
  `, [teamId]);
  return rows;
}

function extractIds(raw) {
  return raw.split(/[,
; ]+/).map(v => v.trim().replace(/^<@!?(d+)>$/, '$1')).filter(Boolean);
}

export async function registerTournamentTeam(tournamentId, captainId, teamName, rawMemberIds) {
  const client = await (await import('./db.js')).pool.connect();
  try {
    await client.query('BEGIN');
    const tRes = await client.query('SELECT * FROM tournaments WHERE id = $1 FOR UPDATE', [tournamentId]);
    const t = tRes.rows[0];
    if (!t) throw new Error('TOURNAMENT_NOT_FOUND');
    const format = normalizeFormat(t.format);
    const size = TEAM_FORMATS[format];
    if (size <= 1) throw new Error('SOLO_TOURNAMENT');
    if (t.status !== 'registration') throw new Error('REGISTRATION_CLOSED');

    const countRes = await client.query('SELECT COUNT(*)::int AS count FROM tournament_teams WHERE tournament_id = $1', [tournamentId]);
    if (countRes.rows[0].count >= t.slots) throw new Error('TOURNAMENT_FULL');

    const ids = [captainId, ...extractIds(rawMemberIds)].filter((v, i, a) => a.indexOf(v) === i);
    if (ids.length !== size) throw new Error(`NEED_TEAM_SIZE:${size}`);
    const players = await client.query('SELECT discord_id FROM players WHERE discord_id = ANY($1::text[])', [ids]);
    if (players.rows.length !== size) throw new Error('TEAM_MEMBER_PROFILE_MISSING');

    const used = await client.query(`
      SELECT tm.discord_id
      FROM tournament_team_members tm
      JOIN tournament_teams tt ON tt.id = tm.team_id
      WHERE tt.tournament_id = $1 AND tm.discord_id = ANY($2::text[])
    `, [tournamentId, ids]);
    if (used.rows.length) throw new Error('TEAM_MEMBER_ALREADY_REGISTERED');

    const team = await client.query(`
      INSERT INTO tournament_teams (tournament_id, name, captain_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [tournamentId, teamName.trim(), captainId]);

    for (const id of ids) {
      await client.query('INSERT INTO tournament_team_members (team_id, discord_id) VALUES ($1, $2)', [team.rows[0].id, id]);
    }
    await client.query('COMMIT');
    return team.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new Error('TEAM_NAME_OR_MEMBER_DUPLICATE');
    throw error;
  } finally {
    client.release();
  }
}

export async function startTournamentV2(tournamentId) {
  const client = await (await import('./db.js')).pool.connect();
  try {
    await client.query('BEGIN');
    const tRes = await client.query('SELECT * FROM tournaments WHERE id = $1 FOR UPDATE', [tournamentId]);
    const t = tRes.rows[0];
    if (!t) throw new Error('TOURNAMENT_NOT_FOUND');
    if (t.status !== 'registration') throw new Error('ALREADY_STARTED');

    const format = normalizeFormat(t.format);
    let participants = [];
    if (format === '1v1') {
      const r = await client.query('SELECT discord_id AS id FROM tournament_players WHERE tournament_id = $1 ORDER BY joined_at', [tournamentId]);
      participants = r.rows.map(x => ({ id: x.id, teamId: null }));
    } else {
      const r = await client.query('SELECT id FROM tournament_teams WHERE tournament_id = $1 ORDER BY created_at', [tournamentId]);
      participants = r.rows.map(x => ({ id: null, teamId: x.id }));
    }

    if (participants.length !== t.slots) throw new Error(`NEED_EXACT_SLOTS:${t.slots}`);
    participants.sort(() => Math.random() - 0.5);

    for (let i = 0; i < participants.length; i += 2) {
      const a = participants[i], b = participants[i + 1];
      const result = await client.query(`
        INSERT INTO matches (
          tournament_id, round, match_no, player1_id, player2_id, team1_id, team2_id,
          map_pool, veto_step, veto_status
        ) VALUES ($1,1,$2,$3,$4,$5,$6,$7,0,'active')
        RETURNING id
      `, [
        tournamentId, i / 2 + 1, a.id, b.id, a.teamId, b.teamId, MAP_POOL
      ]);
    }
    await client.query("UPDATE tournaments SET status = 'running', started_at = NOW() WHERE id = $1", [tournamentId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getTournamentMatchesV2(tournamentId) {
  const { rows } = await query(`
    SELECT m.*,
      p1.standoff_nick AS player1_nick,
      p2.standoff_nick AS player2_nick,
      t1.name AS team1_name, t2.name AS team2_name,
      t1.captain_id AS team1_captain, t2.captain_id AS team2_captain,
      pw.standoff_nick AS winner_nick,
      wt.name AS winner_team_name
    FROM matches m
    LEFT JOIN players p1 ON p1.discord_id = m.player1_id
    LEFT JOIN players p2 ON p2.discord_id = m.player2_id
    LEFT JOIN tournament_teams t1 ON t1.id = m.team1_id
    LEFT JOIN tournament_teams t2 ON t2.id = m.team2_id
    LEFT JOIN players pw ON pw.discord_id = m.winner_id
    LEFT JOIN tournament_teams wt ON wt.id = m.winner_team_id
    WHERE m.tournament_id = $1
    ORDER BY m.round, m.match_no
  `, [tournamentId]);
  return rows;
}

export async function getPlayerOrCaptainMatches(discordId) {
  const { rows } = await query(`
    SELECT m.*, t.name AS tournament_name,
      t1.name AS team1_name, t2.name AS team2_name,
      t1.captain_id AS team1_captain, t2.captain_id AS team2_captain,
      wt.name AS winner_team_name
    FROM matches m
    JOIN tournaments t ON t.id = m.tournament_id
    LEFT JOIN tournament_teams t1 ON t1.id = m.team1_id
    LEFT JOIN tournament_teams t2 ON t2.id = m.team2_id
    LEFT JOIN tournament_teams wt ON wt.id = m.winner_team_id
    WHERE m.player1_id = $1 OR m.player2_id = $1
       OR t1.captain_id = $1 OR t2.captain_id = $1
    ORDER BY m.created_at DESC LIMIT 10
  `, [discordId]);
  return rows;
}

export async function getVetoState(matchId) {
  const { rows } = await query('SELECT * FROM matches WHERE id = $1', [matchId]);
  if (!rows[0]) throw new Error('MATCH_NOT_FOUND');
  const match = rows[0];
  const bans = await query('SELECT * FROM match_map_veto WHERE match_id = $1 ORDER BY step', [matchId]);
  return { match, bans: bans.rows };
}

export async function banMap(matchId, discordId, mapName) {
  const client = await (await import('./db.js')).pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
    const m = r.rows[0];
    if (!m) throw new Error('MATCH_NOT_FOUND');
    if (m.veto_status !== 'active') throw new Error('VETO_FINISHED');

    const isTeam = Boolean(m.team1_id && m.team2_id);
    let teamId = null;
    if (isTeam) {
      const teams = await client.query('SELECT id, captain_id FROM tournament_teams WHERE id = ANY($1::bigint[])', [[m.team1_id, m.team2_id]]);
      const captain = teams.rows.find(t => t.captain_id === discordId);
      if (!captain) throw new Error('NOT_CAPTAIN');
      teamId = Number(captain.id);
    } else {
      if (![m.player1_id, m.player2_id].includes(discordId)) throw new Error('NOT_A_PLAYER');
      teamId = discordId === m.player1_id ? m.player1_id : m.player2_id;
    }

    const current = await client.query('SELECT COUNT(*)::int AS count FROM match_map_veto WHERE match_id = $1', [matchId]);
    const step = current.rows[0].count;
    const expectedTeam = step % 2 === 0 ? m.team1_id || m.player1_id : m.team2_id || m.player2_id;
    if (String(expectedTeam) !== String(teamId)) throw new Error('NOT_YOUR_TURN');
    if (!MAP_POOL.includes(mapName)) throw new Error('INVALID_MAP');
    const pool = m.map_pool?.length ? m.map_pool : MAP_POOL;
    if (!pool.includes(mapName)) throw new Error('INVALID_MAP');
    const already = await client.query('SELECT 1 FROM match_map_veto WHERE match_id = $1 AND map_name = $2', [matchId, mapName]);
    if (already.rows.length) throw new Error('MAP_ALREADY_BANNED');

    await client.query('INSERT INTO match_map_veto (match_id, step, team_id, action, map_name) VALUES ($1,$2,$3,$4,$5)', [matchId, step, isTeam ? teamId : null, 'ban', mapName]);

    const nextStep = step + 1;
    if (nextStep >= pool.length - 1) {
      const banned = await client.query('SELECT map_name FROM match_map_veto WHERE match_id = $1', [matchId]);
      const remaining = pool.find(x => !banned.rows.some(b => b.map_name === x));
      await client.query('UPDATE matches SET veto_step = $1, veto_status = \'finished\', selected_map = $2 WHERE id = $3', [nextStep, remaining, matchId]);
    } else {
      await client.query('UPDATE matches SET veto_step = $1 WHERE id = $2', [nextStep, matchId]);
    }
    await client.query('COMMIT');
    return getVetoState(matchId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reportMatchV2(matchId, reporterId, winnerId, winnerTeamId = null) {
  const client = await (await import('./db.js')).pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
    const m = r.rows[0];
    if (!m) throw new Error('MATCH_NOT_FOUND');
    if (m.status !== 'pending' && m.status !== 'active') throw new Error('MATCH_ALREADY_DONE');
    if (m.veto_status !== 'finished') throw new Error('VETO_NOT_FINISHED');

    let valid = false;
    if (m.team1_id && m.team2_id) {
      const rr = await client.query('SELECT id, captain_id FROM tournament_teams WHERE id = ANY($1::bigint[])', [[m.team1_id, m.team2_id]]);
      valid = rr.rows.some(x => String(x.captain_id) === String(reporterId)) && [String(m.team1_id), String(m.team2_id)].includes(String(winnerTeamId));
    } else {
      valid = [m.player1_id, m.player2_id].includes(reporterId) && [m.player1_id, m.player2_id].includes(winnerId);
    }
    if (!valid) throw new Error('NOT_A_PLAYER');

    const loserId = m.team1_id ? null : (winnerId === m.player1_id ? m.player2_id : m.player1_id);
    await client.query(`
      UPDATE matches SET winner_id=$1, winner_team_id=$2, status='completed', completed_at=NOW()
      WHERE id=$3
    `, [winnerId, winnerTeamId, matchId]);

    if (loserId) {
      await client.query('UPDATE players SET wins=wins+1, rating=rating+15, updated_at=NOW() WHERE discord_id=$1', [winnerId]);
      await client.query('UPDATE players SET losses=losses+1, rating=GREATEST(0,rating-10), updated_at=NOW() WHERE discord_id=$1', [loserId]);
    }

    const pending = await client.query('SELECT 1 FROM matches WHERE tournament_id=$1 AND round=$2 AND status<>\'completed\'', [m.tournament_id,m.round]);
    if (!pending.rows.length) {
      const roundMatches = await client.query('SELECT * FROM matches WHERE tournament_id=$1 AND round=$2 ORDER BY match_no',[m.tournament_id,m.round]);
      const winners = roundMatches.rows.map(x => x.team1_id ? { teamId:x.winner_team_id } : { id:x.winner_id });
      if (winners.length === 1) {
        await client.query("UPDATE tournaments SET status='finished', finished_at=NOW() WHERE id=$1",[m.tournament_id]);
      } else {
        const nextRound=m.round+1;
        for(let i=0;i<winners.length;i+=2){
          const a=winners[i], b=winners[i+1];
          await client.query(`
            INSERT INTO matches (tournament_id,round,match_no,player1_id,player2_id,team1_id,team2_id,map_pool,veto_step,veto_status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'active')
          `,[m.tournament_id,nextRound,i/2+1,a.id||null,b.id||null,a.teamId||null,b.teamId||null,MAP_POOL]);
        }
      }
    }
    await client.query('COMMIT');
    return true;
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
