import { celebrate, Segments, Joi } from "celebrate";
import { normStatus } from "../utils/status.js";

const opts = { convert: true, abortEarly: false, stripUnknown: true };

const baseStatusSchema = Joi.string()
  .trim()
  .custom((value, helpers) => {
    const status = normStatus(value);
    if (!status) return helpers.error("any.invalid");
    return status;
  }, "normalize status")
  .messages({
    "any.required": "status is required",
    "any.invalid": "invalid status",
    "string.base": "status must be a string",
  });

const statusSchema = baseStatusSchema.required();

function isCalendarDate(value) {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const calendarDateSchema = Joi.alternatives()
  .try(
    Joi.string().custom((value, helpers) =>
      isCalendarDate(value) ? value : helpers.error("date.format")
    ),
    Joi.valid(null)
  )
  .optional()
  .messages({ "date.format": "date must be a real YYYY-MM-DD calendar date" });

function validateDateOrder(value, helpers) {
  if (
    value.started_at &&
    value.finished_at &&
    value.finished_at < value.started_at
  ) {
    return helpers.error("any.invalid");
  }
  return value;
}

const idParamSchema = {
  [Segments.PARAMS]: Joi.object({
    id: Joi.number().integer().positive().required().messages({
      "any.required": "id is required",
      "number.base": "id must be a number",
      "number.integer": "id must be an integer",
      "number.positive": "id must be positive",
    }),
  }),
};

export const gameSchemas = {
  idParams: idParamSchema[Segments.PARAMS],
  reorderBody: Joi.object({
    status: baseStatusSchema.optional(),
    targetIndex: Joi.number().integer().min(0).required().messages({
      "any.required": "targetIndex is required",
      "number.base": "targetIndex must be a number",
      "number.integer": "targetIndex must be an integer",
      "number.min": "targetIndex must be >= 0",
    }),
  }),
  favoritesBody: Joi.object({
    favoriteIds: Joi.array()
      .items(Joi.number().integer().positive())
      .max(5)
      .unique()
      .required()
      .messages({
        "any.required": "favoriteIds is required",
        "array.base": "favoriteIds must be an array",
        "array.max": "favoriteIds must contain at most 5 games",
        "array.unique": "favoriteIds cannot contain duplicate games",
        "number.base": "favoriteIds must contain game ids",
        "number.integer": "favoriteIds must contain integer game ids",
        "number.positive": "favoriteIds must contain positive game ids",
      }),
  }),
  upsertBody: Joi.object({
    name: Joi.string().trim().min(1).max(200).required().messages({
      "any.required": "name is required",
      "string.empty": "name cannot be empty",
      "string.max": "name must be <= 200 chars",
    }),
    status: statusSchema,
    my_genre: Joi.string().trim().max(120).empty("").allow(null).messages({
      "string.max": "my_genre must be <= 120 chars",
    }),
    thoughts: Joi.string().trim().max(2000).empty("").allow(null).messages({
      "string.max": "thoughts must be <= 2000 chars",
    }),
    resume_note: Joi.string()
      .trim()
      .max(1000)
      .allow("", null)
      .messages({
        "string.max": "resume_note must be <= 1000 chars",
      }),
    my_score: Joi.number()
      .min(0)
      .max(10)
      .precision(1)
      .empty("")
      .allow(null)
      .messages({
        "number.base": "my_score must be a number",
        "number.integer": "my_score must be an integer",
        "number.min": "my_score must be between 0 and 10",
        "number.max": "my_score must be between 0 and 10",
      }),
    how_long_to_beat: Joi.number()
      .min(0)
      .max(1000)
      .empty("")
      .allow(null)
      .messages({
        "number.base": "how_long_to_beat must be a number",
        "number.integer": "how_long_to_beat must be an integer",
        "number.min": "how_long_to_beat must be >= 0",
        "number.max": "how_long_to_beat must be <= 1000 hours",
      }),
    hours_preferred_source: Joi.string()
      .valid("auto", "estimate", "steam_actual")
      .optional()
      .messages({
        "any.only": "hours_preferred_source must be auto, estimate, or steam_actual",
      }),
    hours_locked: Joi.boolean().optional(),
    started_at: calendarDateSchema,
    finished_at: calendarDateSchema,
    hltb_pref: Joi.string().valid("main", "plus", "comp").optional(),
    rawg_id: Joi.number().integer().positive().optional().allow(null).messages({
      "number.base": "rawg_id must be a number",
      "number.integer": "rawg_id must be an integer",
      "number.positive": "rawg_id must be positive",
    }),
    rawg_slug: Joi.string().trim().max(160).optional().allow(null, "").messages({
      "string.max": "rawg_slug must be <= 160 chars",
    }),
    rawg_selection_confirmed: Joi.boolean().optional(),
  })
    .custom(validateDateOrder, "validate date order")
    .messages({
      "any.invalid": "finished_at cannot be before started_at",
    }),
};

export const gameIdParam = celebrate(idParamSchema, opts);

export const reorderGame = celebrate(
  {
    ...idParamSchema,
    [Segments.BODY]: gameSchemas.reorderBody,
  },
  opts
);

export const favoriteGames = celebrate(
  {
    [Segments.BODY]: gameSchemas.favoritesBody,
  },
  opts
);

export const upsertGame = celebrate(
  {
    [Segments.BODY]: gameSchemas.upsertBody,
  },
  opts
);
