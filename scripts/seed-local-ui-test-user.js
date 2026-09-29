import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const APPLY = process.argv.includes("--apply");
const username = String(process.env.CODEX_UI_TEST_USERNAME || "").trim();
const password = String(process.env.CODEX_UI_TEST_PASSWORD || "");
const sourceUsername = String(process.env.CODEX_UI_TEST_SOURCE_USERNAME || "").trim();
const connectionString = process.env.DATABASE_URL;

function requireLocalDatabase(value) {
  if (!value) throw new Error("DATABASE_URL is required.");
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.toLowerCase())) {
    throw new Error("Refusing to seed a non-local database.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed while NODE_ENV=production.");
  }
}

function requireConfiguration() {
  if (!username || !sourceUsername) {
    throw new Error("CODEX_UI_TEST_USERNAME and CODEX_UI_TEST_SOURCE_USERNAME are required in .env.local.");
  }
  if (username === sourceUsername) throw new Error("Source and target usernames must differ.");
  if (password.length < 16 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("CODEX_UI_TEST_PASSWORD must be between 16 and 72 UTF-8 bytes.");
  }
}

const edgeGames = [
  {
    name: "The Extremely Long Game Title Used to Verify Truncation, Wrapping, Menus, Cards, Tables, Modals, and Narrow Mobile Layouts Without Losing Important Actions",
    status: "plan to play",
    position: 991_000,
    myGenre: "UI Edge Cases, Long Sessions",
    hours: 250,
    score: 10,
    thoughts: "A deliberately long title with multiple personal genres and no artwork.",
    resumeNote: null,
    startedAt: null,
    finishedAt: null,
  },
  {
    name: "Æther Café: 日本語 & العربية — Co-op Edition",
    status: "play when in the mood",
    position: 992_000,
    myGenre: "Café / Co-op",
    hours: 12,
    score: 7.5,
    thoughts: "Unicode, punctuation, accents, and a fractional score.",
    resumeNote: "Invite a friend before continuing.",
    startedAt: "2026-02-28",
    finishedAt: null,
  },
  {
    name: "UI Edge — Missing Everything",
    status: "maybe in the future",
    position: 993_000,
    myGenre: null,
    hours: null,
    score: null,
    thoughts: null,
    resumeNote: null,
    startedAt: null,
    finishedAt: null,
  },
  {
    name: "UI Edge — Zero-Hour Microgame",
    status: "finished",
    position: 994_000,
    myGenre: "Short Games",
    hours: 0,
    score: 0,
    thoughts: "Checks valid zero values rather than treating them as missing.",
    resumeNote: null,
    startedAt: "2026-01-01",
    finishedAt: "2026-01-01",
  },
  {
    name: "UI Edge — Thousand-Hour Commitment",
    status: "played alot but didnt finish",
    position: 995_000,
    myGenre: "Long Sessions",
    hours: 1000,
    score: 9.5,
    thoughts: "Checks large estimates, sorting, and hours-range controls.",
    resumeNote: "Return after finishing the current main game.",
    startedAt: "2024-12-31",
    finishedAt: null,
  },
  {
    name: "UI Edge — Maximum Resume Note",
    status: "playing",
    position: 996_000,
    myGenre: "UI Edge Cases",
    hours: 40,
    score: 8,
    thoughts: "Exercises long-form content in the details modal.",
    resumeNote: "Checkpoint note • ".repeat(58).slice(0, 999),
    startedAt: "2026-09-29",
    finishedAt: null,
  },
];

async function main() {
  requireLocalDatabase(connectionString);
  requireConfiguration();
  const { pool } = await import("../backend/db.js");
  const client = await pool.connect();
  try {
    const sourceResult = await client.query(
      `SELECT id FROM users WHERE username = $1 AND is_guest = FALSE`,
      [sourceUsername],
    );
    if (!sourceResult.rowCount) throw new Error("Configured source user was not found as a permanent local account.");
    const sourceUserId = sourceResult.rows[0].id;
    const sourceCount = Number((await client.query(
      `SELECT COUNT(*)::int AS count FROM games WHERE user_id = $1`,
      [sourceUserId],
    )).rows[0].count);
    const existing = await client.query(`SELECT id FROM users WHERE username = $1`, [username]);

    console.log(JSON.stringify({
      database: "localhost",
      sourceGames: sourceCount,
      targetUsername: username,
      targetExists: existing.rowCount > 0,
      edgeGames: edgeGames.length,
      apply: APPLY,
    }));
    if (!APPLY) {
      console.log("Dry run only. Re-run with --apply to create the account.");
      return;
    }
    if (existing.rowCount) throw new Error("Target user already exists; refusing to overwrite it.");

    await client.query("BEGIN");
    const passwordHash = await bcrypt.hash(password, 10);
    const target = (await client.query(
      `INSERT INTO users (
         username, password_hash, is_public, is_guest, guest_expires_at,
         display_name, bio, avatar_icon, avatar_color
       ) VALUES ($1, $2, FALSE, FALSE, NULL, $3, $4, 'cpu', 'violet')
       RETURNING id`,
      [username, passwordHash, "Codex UI Test", "Permanent localhost-only account for safe UI and regression testing."],
    )).rows[0];
    const targetUserId = target.id;

    await client.query(
      `INSERT INTO user_preferences (
         user_id, default_backlog_view, default_backlog_sort_key,
         default_backlog_sort_reversed, default_landing_path,
         show_wishlist_in_backlog
       )
       SELECT $1, default_backlog_view, default_backlog_sort_key,
              default_backlog_sort_reversed, default_landing_path, FALSE
         FROM user_preferences
        WHERE user_id = $2
       ON CONFLICT (user_id) DO NOTHING`,
      [targetUserId, sourceUserId],
    );

    const sourceGenres = await client.query(
      `SELECT id, name, normalized_name
         FROM user_personal_genres
        WHERE user_id = $1
        ORDER BY id`,
      [sourceUserId],
    );
    const genreMap = new Map();
    for (const genre of sourceGenres.rows) {
      const created = (await client.query(
        `INSERT INTO user_personal_genres (user_id, name, normalized_name)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [targetUserId, genre.name, genre.normalized_name],
      )).rows[0];
      genreMap.set(genre.id, created.id);
    }

    const sourceGames = await client.query(
      `SELECT * FROM games WHERE user_id = $1 ORDER BY id`,
      [sourceUserId],
    );
    for (const game of sourceGames.rows) {
      const created = (await client.query(
        `INSERT INTO games (
           user_id, catalog_game_id, name, status, position, my_genre,
           how_long_to_beat, hours_preferred_source, hours_locked, my_score,
           thoughts, resume_note, cover, rawg_id, rawg_slug, favorite_rank,
           backlog_added_at, backlog_added_at_source, started_at, finished_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           CASE WHEN $8 = 'steam_actual' THEN 'auto' ELSE $8 END,
           $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
         ) RETURNING id`,
        [
          targetUserId, game.catalog_game_id, game.name, game.status, game.position,
          game.my_genre, game.how_long_to_beat, game.hours_preferred_source,
          game.hours_locked, game.my_score, game.thoughts, game.resume_note,
          game.cover, game.rawg_id, game.rawg_slug, game.favorite_rank,
          game.backlog_added_at, game.backlog_added_at_source,
          game.started_at, game.finished_at,
        ],
      )).rows[0];
      const memberships = await client.query(
        `SELECT personal_genre_id, position
           FROM game_personal_genres
          WHERE user_id = $1 AND game_id = $2
          ORDER BY position`,
        [sourceUserId, game.id],
      );
      for (const membership of memberships.rows) {
        const mappedGenreId = genreMap.get(membership.personal_genre_id);
        if (!mappedGenreId) continue;
        await client.query(
          `INSERT INTO game_personal_genres (user_id, game_id, personal_genre_id, position)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [targetUserId, created.id, mappedGenreId, membership.position],
        );
      }
    }

    for (const edge of edgeGames) {
      await client.query(
        `INSERT INTO games (
           user_id, name, status, position, my_genre, how_long_to_beat,
           my_score, thoughts, resume_note, started_at, finished_at,
           backlog_added_at, backlog_added_at_source
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), 'app')`,
        [
          targetUserId, edge.name, edge.status, edge.position, edge.myGenre,
          edge.hours, edge.score, edge.thoughts, edge.resumeNote,
          edge.startedAt, edge.finishedAt,
        ],
      );
    }

    await client.query("COMMIT");
    console.log(JSON.stringify({
      created: true,
      clonedGames: sourceGames.rowCount,
      edgeGames: edgeGames.length,
      totalGames: sourceGames.rowCount + edgeGames.length,
    }));
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
