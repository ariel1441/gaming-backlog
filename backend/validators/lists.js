import { celebrate, Segments, Joi } from "celebrate";

const opts = { convert: true, abortEarly: false, stripUnknown: true };

const idParam = Joi.number().integer().positive().required().messages({
  "any.required": "id is required",
  "number.base": "id must be a number",
  "number.integer": "id must be an integer",
  "number.positive": "id must be positive",
});

const gameIdParam = Joi.number().integer().positive().required().messages({
  "any.required": "gameId is required",
  "number.base": "gameId must be a number",
  "number.integer": "gameId must be an integer",
  "number.positive": "gameId must be positive",
});

const smartQuery = Joi.object({
  status: Joi.string().trim().max(80).allow("", null).optional(),
  finishedYear: Joi.number().integer().min(1970).max(2200).allow(null).optional(),
  releasedYear: Joi.number().integer().min(1970).max(2200).allow(null).optional(),
  genre: Joi.string().trim().max(80).allow("", null).optional(),
  maxHours: Joi.number().min(0).max(1000).allow(null).optional(),
  minScore: Joi.number().min(0).max(10).allow(null).optional(),
  missingHours: Joi.boolean().optional(),
  exposedControls: Joi.array()
    .items(Joi.string().valid("status", "finishedYear", "releasedYear", "genre", "maxHours"))
    .unique()
    .max(5)
    .optional(),
}).unknown(false);

const listParamsSchema = {
  [Segments.PARAMS]: Joi.object({
    id: idParam,
  }),
};

const listGameParamsSchema = {
  [Segments.PARAMS]: Joi.object({
    id: idParam,
    gameId: gameIdParam,
  }),
};

const listMetadataBody = Joi.object({
  name: Joi.string().trim().min(1).max(120).required().messages({
    "any.required": "name is required",
    "string.empty": "name cannot be empty",
    "string.max": "name must be <= 120 chars",
  }),
  description: Joi.string().trim().max(1000).empty("").allow(null).optional().messages({
    "string.max": "description must be <= 1000 chars",
  }),
  listType: Joi.string().valid("manual", "smart").optional(),
  query: smartQuery.allow(null).optional(),
  sortKey: Joi.string()
    .valid("manual", "score", "finishedDate", "releaseDate", "hours", "default")
    .allow(null)
    .optional(),
});

export const listSchemas = {
  listParams: listParamsSchema[Segments.PARAMS],
  listGameParams: listGameParamsSchema[Segments.PARAMS],
  metadataBody: listMetadataBody,
  addGameBody: Joi.object({
    gameId: Joi.number().integer().positive().required().messages({
      "any.required": "gameId is required",
      "number.base": "gameId must be a number",
      "number.integer": "gameId must be an integer",
      "number.positive": "gameId must be positive",
    }),
  }),
  reorderBody: Joi.alternatives()
    .try(
      Joi.object({
        gameIds: Joi.array()
          .items(Joi.number().integer().positive())
          .min(1)
          .unique()
          .required()
          .messages({
            "any.required": "gameIds is required",
            "array.base": "gameIds must be an array",
            "array.min": "gameIds cannot be empty",
            "array.unique": "gameIds cannot contain duplicate games",
          }),
      }),
      Joi.object({
        gameId: Joi.number().integer().positive().required().messages({
          "any.required": "gameId is required",
          "number.base": "gameId must be a number",
          "number.integer": "gameId must be an integer",
          "number.positive": "gameId must be positive",
        }),
        targetIndex: Joi.number().integer().min(0).required().messages({
          "any.required": "targetIndex is required",
          "number.base": "targetIndex must be a number",
          "number.integer": "targetIndex must be an integer",
          "number.min": "targetIndex must be >= 0",
        }),
      })
    )
    .messages({
      "alternatives.match": "reorder must include gameIds or gameId and targetIndex",
    }),
};

export const listParams = celebrate(listParamsSchema, opts);

export const listGameParams = celebrate(listGameParamsSchema, opts);

export const createList = celebrate(
  {
    [Segments.BODY]: listSchemas.metadataBody,
  },
  opts
);

export const updateList = celebrate(
  {
    ...listParamsSchema,
    [Segments.BODY]: listSchemas.metadataBody,
  },
  opts
);

export const addListGame = celebrate(
  {
    ...listParamsSchema,
    [Segments.BODY]: listSchemas.addGameBody,
  },
  opts
);

export const reorderListGames = celebrate(
  {
    ...listParamsSchema,
    [Segments.BODY]: listSchemas.reorderBody,
  },
  opts
);
