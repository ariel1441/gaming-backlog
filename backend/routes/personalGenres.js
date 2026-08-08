import express from "express";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import {
  createPersonalGenre,
  deletePersonalGenre,
  mergePersonalGenre,
  updatePersonalGenre,
} from "../validators/personalGenres.js";
import {
  createOrReusePersonalGenre,
  deleteUnusedPersonalGenre,
  listPersonalGenres,
  mergePersonalGenres,
  renamePersonalGenre,
} from "../services/personalGenreService.js";
import { cacheClear } from "../utils/microCache.js";

const router = express.Router();
router.use(verifyToken);

router.get("/", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ genres: await listPersonalGenres(pool, req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/", createPersonalGenre, async (req, res, next) => {
  try {
    const genre = await createOrReusePersonalGenre(pool, req.user.id, req.body.name);
    res.status(201).json({ genre });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", updatePersonalGenre, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const genre = await renamePersonalGenre(
      client,
      req.user.id,
      Number(req.params.id),
      req.body.name,
    );
    await client.query("COMMIT");
    cacheClear(req.user.id);
    res.json({ genre });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    next(error);
  } finally {
    client.release();
  }
});

router.post("/:id/merge", mergePersonalGenre, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const genre = await mergePersonalGenres(
      client,
      req.user.id,
      Number(req.params.id),
      Number(req.body.targetId),
    );
    await client.query("COMMIT");
    cacheClear(req.user.id);
    res.json({ genre });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    next(error);
  } finally {
    client.release();
  }
});

router.delete("/:id", deletePersonalGenre, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await deleteUnusedPersonalGenre(client, req.user.id, Number(req.params.id));
    await client.query("COMMIT");
    res.status(204).end();
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    next(error);
  } finally {
    client.release();
  }
});

export default router;
