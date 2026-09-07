import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { enqueueSteamSync } from "../services/steamLibrarySyncService.js";
import {
  assertSavedAccountUser,
  listWishlistItems,
  moveWishlistItemToBacklog,
} from "../services/steamWishlistService.js";
import { listWishlist, wishlistItemAction, syncWishlistPrices } from "../validators/wishlist.js";

const router = express.Router();

router.get("/", verifyToken, listWishlist, async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await listWishlistItems(req.user.id, {
      ...req.query,
      query: req.query.q,
      hltbLookup: req.app.locals.hltbLookup,
    }));
  } catch (error) { next(error); }
});

router.post("/sync", verifyToken, async (req, res, next) => {
  try {
    await assertSavedAccountUser(req.user.id);
    const job = await enqueueSteamSync(req.user.id, { trigger: "manual", syncKind: "wishlist" });
    res.status(202).json({ job });
  } catch (error) { next(error); }
});

router.post('/prices/sync', verifyToken, syncWishlistPrices, async (req, res, next) => {
  try {
    await assertSavedAccountUser(req.user.id);
    const job = await enqueueSteamSync(req.user.id, { trigger: 'manual', syncKind: 'wishlist_prices' });
    res.status(202).json({ job });
  } catch (error) { next(error); }
});

router.post("/confirm-empty", verifyToken, async (req, res, next) => {
  try {
    await assertSavedAccountUser(req.user.id);
    const job = await enqueueSteamSync(req.user.id, { trigger: "manual", syncKind: "wishlist", force: true });
    res.status(202).json({ job });
  } catch (error) { next(error); }
});

router.post("/:itemId/move-to-backlog", verifyToken, wishlistItemAction, async (req, res, next) => {
  try {
    await assertSavedAccountUser(req.user.id);
    const result = await moveWishlistItemToBacklog(req.user.id, req.params.itemId, req.body.status);
    res.status(201).json(result);
  } catch (error) { next(error); }
});

export default router;
