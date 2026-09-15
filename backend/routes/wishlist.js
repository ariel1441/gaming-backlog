import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { enqueueSteamSync } from "../services/steamLibrarySyncService.js";
import {
  assertSavedAccountUser,
  listWishlistItems,
  moveWishlistItemToBacklog,
  retireOwnedWishlistIntention,
} from "../services/steamWishlistService.js";
import { listWishlistMetadataRuns, refreshWishlistMetadata, refreshWishlistMetadataItem, selectWishlistRawgMatch } from "../services/wishlistMetadataService.js";
import { listWishlist, wishlistItemAction, wishlistMetadataItem, wishlistMetadataMatch, syncWishlistPrices, retireWishlistIntention } from "../validators/wishlist.js";

const router = express.Router();
router.post('/:itemId/retire-intention', verifyToken, retireWishlistIntention, async (req, res, next) => {
  try { res.json(await retireOwnedWishlistIntention(req.user.id, req.params.itemId, req.body.gameId)); }
  catch (error) { next(error); }
});

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

router.get("/metadata/runs", verifyToken, async (req, res, next) => {
  try {
    await assertSavedAccountUser(req.user.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({ runs: await listWishlistMetadataRuns(req.user.id) });
  } catch (error) { next(error); }
});

router.post("/metadata/refresh", verifyToken, async (req, res, next) => {
  try {
    await assertSavedAccountUser(req.user.id);
    const result = await refreshWishlistMetadata(req.user.id, {
      maxItems: req.body?.maxItems,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error) { next(error); }
});

router.post("/:itemId/metadata/refresh", verifyToken, wishlistMetadataItem, async (req, res, next) => {
  try {
    await assertSavedAccountUser(req.user.id);
    const result = await refreshWishlistMetadataItem(req.user.id, req.params.itemId);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error) { next(error); }
});

router.post("/:itemId/metadata/match", verifyToken, wishlistMetadataMatch, async (req, res, next) => {
  try {
    await assertSavedAccountUser(req.user.id);
    const result = await selectWishlistRawgMatch(
      req.user.id,
      req.params.itemId,
      req.body.rawg_id,
    );
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
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
