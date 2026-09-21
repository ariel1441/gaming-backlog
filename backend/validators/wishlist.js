import { celebrate, Joi, Segments } from "celebrate";

const opts = { convert: true, abortEarly: false, stripUnknown: true };
const itemId = Joi.number().integer().positive().required();
export const retireWishlistIntention = celebrate({
  [Segments.PARAMS]: Joi.object({ itemId }),
  [Segments.BODY]: Joi.object({ gameId: Joi.number().integer().positive().required() }),
}, opts);

export const syncWishlistPrices = celebrate({
  [Segments.BODY]: Joi.object({}).default({}),
}, opts);

export const listWishlist = celebrate({
  [Segments.QUERY]: Joi.object({
    active: Joi.string().valid("active", "removed", "all").default("active"),
    sort: Joi.string().valid(
      "provider_order", "priority", "date_added", "changed", "name",
      "price", "discount", "estimated_hours", "rawg_rating", "metacritic", "release_date",
    ).default("provider_order"),
    direction: Joi.string().valid("asc", "desc").default("asc"),
    q: Joi.string().trim().max(120).allow("").default(""),
    genre: Joi.array().items(Joi.string().trim().max(80)).max(20).single().default([]),
    no_genre: Joi.boolean().default(false),
    rawg_status: Joi.string().valid("all", "linked", "pending", "missing", "review", "incomplete", "failed").default("all"),
    min_hours: Joi.number().min(0),
    max_hours: Joi.number().min(0),
    on_sale: Joi.boolean().default(false),
    include_summary: Joi.boolean().default(true),
    item_id: Joi.number().integer().positive(),
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).max(100000).default(0),
  }),
}, opts);

export const wishlistItemAction = celebrate({
  [Segments.PARAMS]: Joi.object({ itemId }),
  [Segments.BODY]: Joi.object({
    status: Joi.string().trim().max(80).required(),
  }),
}, opts);

export const wishlistMetadataItem = celebrate({
  [Segments.PARAMS]: Joi.object({ itemId }),
}, opts);

export const wishlistMetadataMatch = celebrate({
  [Segments.PARAMS]: Joi.object({ itemId }),
  [Segments.BODY]: Joi.object({
    rawg_id: Joi.number().integer().positive().required(),
  }),
}, opts);
