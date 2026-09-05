import { celebrate, Joi, Segments } from "celebrate";

const opts = { convert: true, abortEarly: false, stripUnknown: true };
const itemId = Joi.number().integer().positive().required();

export const listWishlist = celebrate({
  [Segments.QUERY]: Joi.object({
    active: Joi.string().valid("active", "removed", "all").default("active"),
    sort: Joi.string().valid("provider_order", "priority", "date_added", "changed", "name").default("provider_order"),
    direction: Joi.string().valid("asc", "desc").default("asc"),
    q: Joi.string().trim().max(120).allow("").default(""),
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
