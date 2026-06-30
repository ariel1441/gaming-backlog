import { celebrate, Segments, Joi } from "celebrate";
import { gameSchemas } from "./games.js";

const opts = { convert: true, abortEarly: false, stripUnknown: true };

const catalogIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    "any.required": "id is required",
    "number.base": "id must be a number",
    "number.integer": "id must be an integer",
    "number.positive": "id must be positive",
  }),
});

const collectionKeyParamSchema = Joi.object({
  key: Joi.string()
    .trim()
    .pattern(/^[a-z0-9_]+$/)
    .max(80)
    .required()
    .messages({
      "any.required": "key is required",
      "string.pattern.base": "key must be a catalog collection key",
      "string.max": "key must be <= 80 chars",
    }),
});

export const searchCatalog = celebrate(
  {
    [Segments.QUERY]: Joi.object({
      q: Joi.string().trim().min(3).max(120).required().messages({
        "any.required": "Search query is required",
        "string.min": "Search query must be at least 3 characters",
        "string.max": "Search query must be <= 120 chars",
      }),
    }),
  },
  opts
);

export const browseCatalog = celebrate(
  {
    [Segments.QUERY]: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(48).default(24),
      shelfLimit: Joi.number().integer().min(1).max(24).default(24),
      genre: Joi.string().trim().max(80).allow("").default(""),
      releaseWindow: Joi.string()
        .valid("all", "upcoming", "recent", "older", "unknown")
        .default("all"),
      backlog: Joi.string().valid("all", "in", "not_in").default("all"),
      sort: Joi.string()
        .valid("recent", "title", "release_desc", "release_asc", "rating", "metacritic")
        .default("recent"),
    }),
  },
  opts
);

export const catalogIdParam = celebrate(
  {
    [Segments.PARAMS]: catalogIdParamSchema,
  },
  opts
);

export const collectionKeyParam = celebrate(
  {
    [Segments.PARAMS]: collectionKeyParamSchema,
  },
  opts
);

export const addCatalogGameToBacklog = celebrate(
  {
    [Segments.PARAMS]: catalogIdParamSchema,
    [Segments.BODY]: gameSchemas.upsertBody.fork(["name"], (schema) =>
      schema.optional()
    ),
  },
  opts
);
