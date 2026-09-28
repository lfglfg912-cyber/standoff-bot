import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function initDb() {
  await query(`UPDATE players SET rating = 0 WHERE (COALESCE(wins, 0) + COALESCE(losses, 0)) < 5 AND rating = 1000;`);
  await query(`
    CREATE TABLE IF NOT EXISTS players (
      discord_id TEXT PRIMARY KEY,
      standoff_nick TEXT NOT NULL,
      standoff_id TEXT,
      rating INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      tournaments INTEGER NOT NULL DEFAULT 0,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slots INTEGER NOT NULL CHECK (slots IN (4, 8, 16, 32)),
      prize_gold INTEGER NOT NULL DEFAULT 0 CHECK (prize_gold >= 0),
      format TEXT NOT NULL DEFAULT '1v1-single-elimination',
      status TEXT NOT NULL DEFAULT 'registration',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS tournament_players (
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      discord_id TEXT NOT NULL REFERENCES players(discord_id) ON DELETE CASCADE,
      seed INTEGER,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tournament_id, discord_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id BIGSERIAL PRIMARY KEY,
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      match_no INTEGER NOT NULL,
      player1_id TEXT REFERENCES players(discord_id),
      player2_id TEXT REFERENCES players(discord_id),
      winner_id TEXT REFERENCES players(discord_id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      UNIQUE (tournament_id, round, match_no)
    );

    CREATE TABLE IF NOT EXISTS verification_requests (
      discord_id TEXT PRIMARY KEY REFERENCES players(discord_id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    UPDATE players SET verified = TRUE, updated_at = NOW() WHERE COALESCE(TRIM(standoff_nick), '') <> '' AND COALESCE(TRIM(standoff_id), '') <> '';

    CREATE TABLE IF NOT EXISTS ai_logs (
      id BIGSERIAL PRIMARY KEY,
      discord_id TEXT,
      prompt TEXT NOT NULL,
      response TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function getPlayer(discordId) {
  const { rows } = await query('SELECT * FROM players WHERE discord_id = $1', [discordId]);
  return rows[0] ?? null;
}

export async function listPlayers() {
  const { rows } = await query('SELECT discord_id, standoff_nick, standoff_id FROM players ORDER BY standoff_nick ASC LIMIT 25');
  return rows;
}

export async function upsertPlayer(discordId, nick, standoffId) {
  const { rows } = await query(`
    INSERT INTO players (discord_id, standoff_nick, standoff_id, verified)
    VALUES ($1, $2, $3, TRUE)
    ON CONFLICT (discord_id) DO UPDATE SET
      standoff_nick = EXCLUDED.standoff_nick,
      standoff_id = EXCLUDED.standoff_id,
      verified = TRUE,
      updated_at = NOW()
    RETURNING *
  `, [discordId, nick, standoffId || null]);
  return rows[0];
}

export async function listTournaments() {
  const { rows } = await query(`
    SELECT t.*, COUNT(tp.discord_id)::int AS registered
    FROM tournaments t
    LEFT JOIN tournament_players tp ON tp.tournament_id = t.id
    WHERE t.status IN ('registration', 'running')
    GROUP BY t.id
    ORDER BY t.created_at DESC
    LIMIT 10
  `);
  return rows;
}

export async function createTournament({ name, slots, prizeGold, createdBy }) {
  const { rows } = await query(`
    INSERT INTO tournaments (name, slots, prize_gold, created_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [name, slots, prizeGold, createdBy]);
  return rows[0];
}

export async function getTournament(id) {
  const { rows } = await query(`
    SELECT t.*, COUNT(tp.discord_id)::int AS registered
    FROM tournaments t
    LEFT JOIN tournament_players tp ON tp.tournament_id = t.id
    WHERE t.id = $1
    GROUP BY t.id
  `, [id]);
  return rows[0] ?? null;
}

export async function joinTournament(tournamentId, discordId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query('SELECT * FROM tournaments WHERE id = $1 FOR UPDATE', [tournamentId]);
    const tournament = t.rows[0];
    if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
    if (tournament.status !== 'registration') throw new Error('REGISTRATION_CLOSED');
    const count = await client.query('SELECT COUNT(*)::int AS count FROM tournament_players WHERE tournament_id = $1', [tournamentId]);
    if (count.rows[0].count >= tournament.slots) throw new Error('TOURNAMENT_FULL');
    await client.query('INSERT INTO tournament_players (tournament_id, discord_id) VALUES ($1, $2)', [tournamentId, discordId]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new Error('ALREADY_REGISTERED');
    throw error;
  } finally {
    client.release();
  }
}

export async function getTournamentPlayers(tournamentId) {
  const { rows } = await query(`
    SELECT p.* FROM tournament_players tp
    JOIN players p ON p.discord_id = tp.discord_id
    WHERE tp.tournament_id = $1
    ORDER BY tp.joined_at ASC
  `, [tournamentId]);
  return rows;
}

export async function getTournamentMatches(tournamentId) {
  const { rows } = await query(`
    SELECT m.*,
      p1.standoff_nick AS player1_nick,
      p2.standoff_nick AS player2_nick,
      pw.standoff_nick AS winner_nick
    FROM matches m
    LEFT JOIN players p1 ON p1.discord_id = m.player1_id
    LEFT JOIN players p2 ON p2.discord_id = m.player2_id
    LEFT JOIN players pw ON pw.discord_id = m.winner_id
    WHERE m.tournament_id = $1
    ORDER BY m.round, m.match_no
  `, [tournamentId]);
  return rows;
}

export async function startTournament(tournamentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query('SELECT * FROM tournaments WHERE id = $1 FOR UPDATE', [tournamentId]);
    const tournament = t.rows[0];
    if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
    if (tournament.status !== 'registration') throw new Error('ALREADY_STARTED');
    const players = await client.query('SELECT discord_id FROM tournament_players WHERE tournament_id = $1 ORDER BY joined_at ASC', [tournamentId]);
    if (players.rows.length !== tournament.slots) throw new Error(`NEED_EXACT_SLOTS:${tournament.slots}`);

    const shuffled = [...players.rows].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      await client.query('UPDATE tournament_players SET seed = $1 WHERE tournament_id = $2 AND discord_id = $3', [i + 1, tournamentId, shuffled[i].discord_id]);
    }

    const round = 1;
    for (let i = 0; i < shuffled.length; i += 2) {
      await client.query(`
        INSERT INTO matches (tournament_id, round, match_no, player1_id, player2_id)
        VALUES ($1, $2, $3, $4, $5)
      `, [tournamentId, round, i / 2 + 1, shuffled[i].discord_id, shuffled[i + 1].discord_id]);
    }

    await client.query(
      'UPDATE players SET tournaments = tournaments + 1, updated_at = NOW() WHERE discord_id IN (SELECT discord_id FROM tournament_players WHERE tournament_id = $1)',
      [tournamentId]
    );
    await client.query("UPDATE tournaments SET status = 'running', started_at = NOW() WHERE id = $1", [tournamentId]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getPlayerMatches(discordId) {
  const { rows } = await query(`
    SELECT m.*, t.name AS tournament_name
    FROM matches m JOIN tournaments t ON t.id = m.tournament_id
    WHERE m.player1_id = $1 OR m.player2_id = $1
    ORDER BY m.created_at DESC LIMIT 10
  `, [discordId]);
  return rows;
}

export async function getOpenMatchForPlayer(tournamentId, discordId) {
  const { rows } = await query(`
    SELECT * FROM matches
    WHERE tournament_id = $1 AND status = 'pending'
      AND (player1_id = $2 OR player2_id = $2)
    ORDER BY round, match_no LIMIT 1
  `, [tournamentId, discordId]);
  return rows[0] ?? null;
}

export async function reportMatch(matchId, reporterId, winnerId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
    const match = result.rows[0];
    if (!match) throw new Error('MATCH_NOT_FOUND');
    if (match.status !== 'pending') throw new Error('MATCH_ALREADY_DONE');
    if (![match.player1_id, match.player2_id].includes(reporterId)) throw new Error('NOT_A_PLAYER');
    if (![match.player1_id, match.player2_id].includes(winnerId)) throw new Error('INVALID_WINNER');

    await client.query(`UPDATE matches SET winner_id = $1, status = 'completed', completed_at = NOW() WHERE id = $2`, [winnerId, matchId]);
    const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
    await client.query('UPDATE players SET wins = wins + 1, rating = rating + 15, updated_at = NOW() WHERE discord_id = $1', [winnerId]);
    await client.query('UPDATE players SET losses = losses + 1, rating = GREATEST(0, rating - 10), updated_at = NOW() WHERE discord_id = $1', [loserId]);

    const pending = await client.query(`
      SELECT 1 FROM matches WHERE tournament_id = $1 AND round = $2 AND status = 'pending'
    `, [match.tournament_id, match.round]);

    if (pending.rows.length === 0) {
      const roundMatches = await client.query(`SELECT * FROM matches WHERE tournament_id = $1 AND round = $2 ORDER BY match_no`, [match.tournament_id, match.round]);
      const winners = roundMatches.rows.map(m => m.winner_id).filter(Boolean);
      if (winners.length === 1) {
        await client.query("UPDATE tournaments SET status = 'finished', finished_at = NOW() WHERE id = $1", [match.tournament_id]);
      } else if (winners.length > 1) {
        const nextRound = match.round + 1;
        for (let i = 0; i < winners.length; i += 2) {
          await client.query(`
            INSERT INTO matches (tournament_id, round, match_no, player1_id, player2_id)
            VALUES ($1, $2, $3, $4, $5)
          `, [match.tournament_id, nextRound, i / 2 + 1, winners[i], winners[i + 1]]);
        }
      }
    }
    await client.query('COMMIT');
    return { match, loserId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


export async function startVerification(discordId) {
  await query(`
    INSERT INTO verification_requests (discord_id, status, attempts, last_reason, updated_at)
    VALUES ($1, 'pending', 0, NULL, NOW())
    ON CONFLICT (discord_id) DO UPDATE SET
      status = 'pending',
      attempts = verification_requests.attempts,
      last_reason = NULL,
      updated_at = NOW()
  `, [discordId]);
  return true;
}

export async function getVerificationRequest(discordId) {
  const { rows } = await query('SELECT * FROM verification_requests WHERE discord_id = $1', [discordId]);
  return rows[0] ?? null;
}

export async function finishVerification(discordId, verified, reason = '') {
  await query('UPDATE verification_requests SET status = $2, attempts = attempts + 1, last_reason = $3, updated_at = NOW() WHERE discord_id = $1', [discordId, verified ? 'verified' : 'rejected', reason]);
  if (verified) {
    await query('UPDATE players SET verified = TRUE, updated_at = NOW() WHERE discord_id = $1', [discordId]);
  }
  return true;
}
