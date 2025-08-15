// backend/validators/games.js
import { celebrate, Segments, Joi } from "celebrate";
import { normStatus } from "../utils/status.js";

// Celebrate options: coerce types, collect all errors, strip unknown keys
const opts = { convert: true, abortEarly: false, stripUnknown: true };

// Reusable status schema: trim -> normalize via normStatus -> validate
const statusSchema = Joi.string()
  .trim()
  .required()
  .custom((value, helpers) => {
    const s = normStatus(value);
    if (!s) return helpers.error("any.invalid");
    return s; // normalized status stored back into req.body
  }, "normalize status")
  .messages({
    "any.required": "status is required",
    "any.invalid": "invalid status",
    "string.base": "status must be a string",
  });

export const reorderGame = celebrate(
  {
    [Segments.PARAMS]: Joi.object({
      id: Joi.number().integer().positive().required(),
    }),
    [Segments.BODY]: Joi.object({
      status: statusSchema, // normalized here
      targetIndex: Joi.number().integer().min(0).required().messages({
        "any.required": "targetIndex is required",
        "number.base": "targetIndex must be a number",
        "number.integer": "targetIndex must be an integer",
        "number.min": "targetIndex must be ≥ 0",
      }),
    }),
  },
  opts
);

export const upsertGame = celebrate(
  {
    [Segments.BODY]: Joi.object({
      // required
      name: Joi.string().trim().min(1).max(200).required().messages({
        "any.required": "name is required",
        "string.empty": "name cannot be empty",
        "string.max": "name must be ≤ 200 chars",
      }),

      status: statusSchema, // normalized here

      // optional short text fields ("" -> undefined, null allowed)
      my_genre: Joi.string().trim().max(120).empty("").allow(null).messages({
        "string.max": "my_genre must be ≤ 120 chars",
      }),
      thoughts: Joi.string().trim().max(2000).empty("").allow(null).messages({
        "string.max": "thoughts must be ≤ 2000 chars",
      }),

      // numeric fields (coerced by convert:true). "" -> undefined, null allowed
      my_score: Joi.number()
        .integer()
        .min(0)
        .max(10)
        .empty("")
        .allow(null)
        .messages({
          "number.base": "my_score must be a number",
          "number.integer": "my_score must be an integer",
          "number.min": "my_score must be between 0 and 10",
          "number.max": "my_score must be between 0 and 10",
        }),

      how_long_to_beat: Joi.number()
        .integer()
        .min(0)
        .max(1000)
        .empty("")
        .allow(null)
        .messages({
          "number.base": "how_long_to_beat must be a number",
          "number.integer": "how_long_to_beat must be an integer",
          "number.min": "how_long_to_beat must be ≥ 0",
          "number.max": "how_long_to_beat must be ≤ 1000 hours",
        }),

      // dates: ISO yyyy-mm-dd if provided; "" -> undefined; null allowed
      started_at: Joi.alternatives()
        .try(Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/), Joi.valid(null))
        .optional()
        .messages({
          "string.pattern.base": "started_at must be YYYY-MM-DD",
        }),
      finished_at: Joi.alternatives()
        .try(Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/), Joi.valid(null))
        .optional()
        .messages({
          "string.pattern.base": "finished_at must be YYYY-MM-DD",
        }),

      // optional enum
      hltb_pref: Joi.string().valid("main", "plus", "comp").optional(),
    }),
  },
  opts
);
