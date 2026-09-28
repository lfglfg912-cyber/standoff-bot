import { query } from './db.js';

export async function initTournamentV2Db() {
  await query(`
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT '1v1';
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS team1_id BIGINT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS team2_id BIGINT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS winner_team_id BIGINT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS map_pool TEXT[];
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS veto_step INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS veto_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS selected_map TEXT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS veto_round INTEGER NOT NULL DEFAULT 1;
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
      team_id BIGINT REFERENCES tournament_teams(id) ON DELETE CASCADE,
      action TEXT NOT NULL DEFAULT 'ban',
      map_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (match_id, step),
      UNIQUE (match_id, map_name)
    );

    ALTER TABLE match_map_veto ALTER COLUMN team_id DROP NOT NULL;

    CREATE TABLE IF NOT EXISTS custom_matches (
      id BIGSERIAL PRIMARY KEY,
      format TEXT NOT NULL,
      team1_ids TEXT[] NOT NULL,
      team2_ids TEXT[] NOT NULL,
      map_pool TEXT[] NOT NULL,
      veto_status TEXT NOT NULL DEFAULT 'active',
      veto_round INTEGER NOT NULL DEFAULT 1,
      selected_map TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT NOT NULL REFERENCES players(discord_id),
      winner_team INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS custom_match_map_votes (
      id BIGSERIAL PRIMARY KEY,
      match_id BIGINT NOT NULL REFERENCES custom_matches(id) ON DELETE CASCADE,
      discord_id TEXT NOT NULL REFERENCES players(discord_id) ON DELETE CASCADE,
      veto_round INTEGER NOT NULL,
      map_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (match_id, discord_id, veto_round)
    );

    CREATE TABLE IF NOT EXISTS custom_match_map_bans (
      id BIGSERIAL PRIMARY KEY,
      match_id BIGINT NOT NULL REFERENCES custom_matches(id) ON DELETE CASCADE,
      step INTEGER NOT NULL,
      map_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (match_id, map_name)
    );

    CREATE TABLE IF NOT EXISTS match_map_votes (
      id BIGSERIAL PRIMARY KEY,
      match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      discord_id TEXT NOT NULL REFERENCES players(discord_id) ON DELETE CASCADE,
      veto_round INTEGER NOT NULL,
      map_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (match_id, discord_id, veto_round)
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
  return raw.split(/[,;\s]+/).map(v => v.trim().replace(/^<@!?(\d+)>$/, '$1')).filter(Boolean);
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

export async function cancelTournamentV2(tournamentId, cancelledBy = null, reason = null) {
  const client = await (await import('./db.js')).pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM tournaments WHERE id = $1 FOR UPDATE', [tournamentId]);
    const t = r.rows[0];
    if (!t) throw new Error('TOURNAMENT_NOT_FOUND');
    if (!['registration', 'running'].includes(t.status)) throw new Error('TOURNAMENT_NOT_ACTIVE');
    await client.query(
      "UPDATE tournaments SET status = 'cancelled', finished_at = NOW(), cancelled_by = $2, cancel_reason = $3 WHERE id = $1",
      [tournamentId, cancelledBy, reason]
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
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

export async function getMatchParticipantsFromClient(client, match) {
  if (match.team1_id && match.team2_id) {
    const r = await client.query('SELECT discord_id FROM tournament_team_members WHERE team_id = ANY($1::bigint[]) ORDER BY joined_at', [[match.team1_id, match.team2_id]]);
    return r.rows.map(x => x.discord_id);
  }
  return [match.player1_id, match.player2_id].filter(Boolean);
}

export async function getVetoState(matchId) {
  const { rows } = await query('SELECT * FROM matches WHERE id = $1', [matchId]);
  if (!rows[0]) throw new Error('MATCH_NOT_FOUND');
  const match = rows[0];
  const bans = await query('SELECT * FROM match_map_veto WHERE match_id = $1 ORDER BY step', [matchId]);
  const votes = await query('SELECT map_name, COUNT(*)::int AS votes FROM match_map_votes WHERE match_id = $1 AND veto_round = $2 GROUP BY map_name ORDER BY votes DESC, map_name', [matchId, match.veto_round || 1]);
  const participants = await query(`SELECT COUNT(*)::int AS count FROM (
      SELECT discord_id FROM tournament_team_members WHERE team_id = $1
      UNION SELECT discord_id FROM tournament_team_members WHERE team_id = $2
      UNION SELECT $3::text AS discord_id UNION SELECT $4::text AS discord_id
    ) p WHERE discord_id IS NOT NULL`, [match.team1_id, match.team2_id, match.player1_id, match.player2_id]);
  const votedPlayers = await query('SELECT discord_id, map_name FROM match_map_votes WHERE match_id = $1 AND veto_round = $2', [matchId, match.veto_round || 1]);
  return { match, bans: bans.rows, votes: votes.rows, participants: participants.rows[0]?.count || 0, votedPlayers: votedPlayers.rows };
}

export async function castMapVote(matchId, discordId, mapName) {
  const client = await (await import('./db.js')).pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
    const m = r.rows[0];
    if (!m) throw new Error('MATCH_NOT_FOUND');
    if (m.veto_status !== 'active') throw new Error('VETO_FINISHED');
    const participants = await getMatchParticipantsFromClient(client, m);
    if (!participants.includes(discordId)) throw new Error('NOT_A_PLAYER');
    const pool = m.map_pool?.length ? m.map_pool : MAP_POOL;
    if (!pool.includes(mapName)) throw new Error('INVALID_MAP');
    const banned = await client.query('SELECT map_name FROM match_map_veto WHERE match_id = $1', [matchId]);
    const remaining = pool.filter(x => !banned.rows.some(b => b.map_name === x));
    if (!remaining.includes(mapName)) throw new Error('MAP_ALREADY_BANNED');
    const round = m.veto_round || 1;
    const existing = await client.query('SELECT 1 FROM match_map_votes WHERE match_id=$1 AND discord_id=$2 AND veto_round=$3', [matchId, discordId, round]);
    if (existing.rows.length) throw new Error('ALREADY_VOTED');
    await client.query('INSERT INTO match_map_votes (match_id, discord_id, veto_round, map_name) VALUES ($1,$2,$3,$4)', [matchId, discordId, round, mapName]);
    const counts = await client.query('SELECT map_name, COUNT(*)::int AS votes FROM match_map_votes WHERE match_id=$1 AND veto_round=$2 GROUP BY map_name ORDER BY votes DESC, map_name', [matchId, round]);
    const majority = Math.floor(participants.length / 2) + 1;
    const totalVotes = counts.rows.reduce((sum, x) => sum + x.votes, 0);
    let bannedMap = counts.rows.find(x => x.votes >= majority)?.map_name;
    if (!bannedMap && totalVotes >= participants.length) {
      const ranked = counts.rows.slice().sort((a,b) => b.votes - a.votes || pool.indexOf(a.map_name) - pool.indexOf(b.map_name));
      bannedMap = ranked[0]?.map_name;
    }
    if (bannedMap) {
      const stepRes = await client.query('SELECT COUNT(*)::int AS count FROM match_map_veto WHERE match_id=$1', [matchId]);
      const step = stepRes.rows[0].count;
      await client.query('INSERT INTO match_map_veto (match_id, step, team_id, action, map_name) VALUES ($1,$2,NULL,$3,$4)', [matchId, step, 'vote-ban', bannedMap]);
      const newRemaining = remaining.filter(x => x !== bannedMap);
      if (newRemaining.length === 1) await client.query("UPDATE matches SET veto_step=$1, veto_round=$2, veto_status='finished', selected_map=$3 WHERE id=$4", [step + 1, round + 1, newRemaining[0], matchId]);
      else await client.query('UPDATE matches SET veto_step=$1, veto_round=$2 WHERE id=$3', [step + 1, round + 1, matchId]);
      await client.query('DELETE FROM match_map_votes WHERE match_id=$1 AND veto_round=$2', [matchId, round]);
    }
    await client.query('COMMIT');
    return getVetoState(matchId);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
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

export async function createCustomGame({ format, team1Ids, team2Ids, createdBy }) {
  const normalized = normalizeFormat(format);
  const size = TEAM_FORMATS[normalized];
  if (!size) throw new Error('INVALID_FORMAT');
  const clean = value => [...new Set(value.map(v => String(v).replace(/^<@!?(\\d+)>$/, '$1').trim()).filter(Boolean))];
  const a = clean(team1Ids), b = clean(team2Ids);
  if (a.length !== size || b.length !== size) throw new Error('NEED_CUSTOM_TEAM_SIZE');
  if (a.some(id => b.includes(id))) throw new Error('CUSTOM_DUPLICATE_PLAYER');
  if (![...a, ...b].includes(createdBy)) throw new Error('CUSTOM_CREATOR_NOT_PLAYER');
  const players = await query('SELECT discord_id FROM players WHERE discord_id = ANY($1::text[])', [[...a, ...b]]);
  if (players.rows.length !== size * 2) throw new Error('CUSTOM_PROFILE_MISSING');
  const result = await query('INSERT INTO custom_matches (format, team1_ids, team2_ids, map_pool, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [normalized, a, b, MAP_POOL, createdBy]);
  return getCustomGameState(result.rows[0].id);
}

export async function getCustomGameState(matchId) {
  const result = await query('SELECT * FROM custom_matches WHERE id=$1', [matchId]);
  if (!result.rows[0]) throw new Error('CUSTOM_NOT_FOUND');
  const match = result.rows[0];
  const bans = await query('SELECT * FROM custom_match_map_bans WHERE match_id=$1 ORDER BY step', [matchId]);
  const votes = await query('SELECT map_name, COUNT(*)::int AS votes FROM custom_match_map_votes WHERE match_id=$1 AND veto_round=$2 GROUP BY map_name ORDER BY votes DESC,map_name', [matchId, match.veto_round || 1]);
  const participants = [...new Set([...(match.team1_ids || []), ...(match.team2_ids || [])])];
  const votedPlayers = await query('SELECT discord_id,map_name FROM custom_match_map_votes WHERE match_id=$1 AND veto_round=$2', [matchId, match.veto_round || 1]);
  return { match, bans: bans.rows, votes: votes.rows, participants, votedPlayers: votedPlayers.rows };
}

export async function castCustomMapVote(matchId, discordId, mapName) {
  const pool = (await import('./db.js')).pool;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query('SELECT * FROM custom_matches WHERE id=$1 FOR UPDATE', [matchId]);
    const match = result.rows[0];
    if (!match) throw new Error('CUSTOM_NOT_FOUND');
    if (match.veto_status !== 'active') throw new Error('VETO_FINISHED');
    const participants = [...new Set([...(match.team1_ids || []), ...(match.team2_ids || [])])];
    if (!participants.includes(discordId)) throw new Error('NOT_A_PLAYER');
    if (!match.map_pool.includes(mapName)) throw new Error('INVALID_MAP');
    const banned = await db.query('SELECT map_name FROM custom_match_map_bans WHERE match_id=$1', [matchId]);
    const remaining = match.map_pool.filter(x => !banned.rows.some(b => b.map_name === x));
    if (!remaining.includes(mapName)) throw new Error('MAP_ALREADY_BANNED');
    const round = match.veto_round || 1;
    const existing = await db.query('SELECT 1 FROM custom_match_map_votes WHERE match_id=$1 AND discord_id=$2 AND veto_round=$3', [matchId,discordId,round]);
    if (existing.rows.length) throw new Error('ALREADY_VOTED');
    await db.query('INSERT INTO custom_match_map_votes(match_id,discord_id,veto_round,map_name) VALUES($1,$2,$3,$4)', [matchId,discordId,round,mapName]);
    const counts = await db.query('SELECT map_name,COUNT(*)::int AS votes FROM custom_match_map_votes WHERE match_id=$1 AND veto_round=$2 GROUP BY map_name ORDER BY votes DESC,map_name', [matchId,round]);
    const majority = Math.floor(participants.length / 2) + 1;
    const totalVotes = counts.rows.reduce((sum,x) => sum + x.votes, 0);
    let bannedMap = counts.rows.find(x => x.votes >= majority)?.map_name;
    if (!bannedMap && totalVotes >= participants.length) {
      bannedMap = counts.rows.slice().sort((a,b) => b.votes-a.votes || match.map_pool.indexOf(a.map_name)-match.map_pool.indexOf(b.map_name))[0]?.map_name;
    }
    if (bannedMap) {
      const step = (await db.query('SELECT COUNT(*)::int AS count FROM custom_match_map_bans WHERE match_id=$1',[matchId])).rows[0].count;
      await db.query('INSERT INTO custom_match_map_bans(match_id,step,map_name) VALUES($1,$2,$3)',[matchId,step,bannedMap]);
      const next = remaining.filter(x => x !== bannedMap);
      if (next.length === 1) await db.query("UPDATE custom_matches SET veto_round=$1,veto_status='finished',selected_map=$2 WHERE id=$3",[round+1,next[0],matchId]);
      else await db.query('UPDATE custom_matches SET veto_round=$1 WHERE id=$2',[round+1,matchId]);
      await db.query('DELETE FROM custom_match_map_votes WHERE match_id=$1 AND veto_round=$2',[matchId,round]);
    }
    await db.query('COMMIT');
    return getCustomGameState(matchId);
  } catch(error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export async function reportCustomGame(matchId, reporterId, winnerTeam) {
  const pool = (await import('./db.js')).pool;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query('SELECT * FROM custom_matches WHERE id=$1 FOR UPDATE',[matchId]);
    const match = result.rows[0];
    if (!match) throw new Error('CUSTOM_NOT_FOUND');
    if (match.status === 'completed') throw new Error('MATCH_ALREADY_DONE');
    if (match.veto_status !== 'finished') throw new Error('VETO_NOT_FINISHED');
    const team1 = match.team1_ids || [], team2 = match.team2_ids || [];
    if (![...team1,...team2].includes(reporterId)) throw new Error('NOT_A_PLAYER');
    if (![1,2].includes(Number(winnerTeam))) throw new Error('INVALID_WINNER');
    const winners = Number(winnerTeam) === 1 ? team1 : team2;
    const losers = Number(winnerTeam) === 1 ? team2 : team1;
    await db.query("UPDATE custom_matches SET status='completed',winner_team=$1,completed_at=NOW() WHERE id=$2",[winnerTeam,matchId]);
    await db.query('UPDATE players SET wins=wins+1,rating=rating+15,updated_at=NOW() WHERE discord_id=ANY($1::text[])',[winners]);
    await db.query('UPDATE players SET losses=losses+1,rating=GREATEST(0,rating-10),updated_at=NOW() WHERE discord_id=ANY($1::text[])',[losers]);
    await db.query('COMMIT');
    return true;
  } catch(error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export async function listCustomGamesForPlayer(discordId) {
  const { rows } = await query(
    'SELECT * FROM custom_matches WHERE status <> $1 AND ($2 = ANY(team1_ids) OR $2 = ANY(team2_ids)) ORDER BY created_at DESC LIMIT 10',
    ['completed', discordId]
  );
  return rows;
}

export async function getReadyCustomGamesForPlayer(discordId) {
  const { rows } = await query(
    'SELECT * FROM custom_matches WHERE status = $1 AND veto_status = $2 AND ($3 = ANY(team1_ids) OR $3 = ANY(team2_ids)) ORDER BY created_at DESC LIMIT 10',
    ['active', 'finished', discordId]
  );
  return rows;
}
