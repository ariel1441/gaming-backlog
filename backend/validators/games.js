// backend/validators/games.js
import { celebrate, Segments, Joi } from "celebrate";

// Common opts: convert types, show all errors, strip unknown keys
const opts = { convert: true, abortEarly: false, stripUnknown: true };

export const reorderGame = celebrate(
  {
    [Segments.PARAMS]: Joi.object({
      id: Joi.number().integer().positive().required(),
    }),
    [Segments.BODY]: Joi.object({
      status: Joi.string().trim().max(32).required(),
      targetIndex: Joi.number().integer().min(0).required(),
    }),
  },
  opts
);

export const upsertGame = celebrate(
  {
    [Segments.BODY]: Joi.object({
      name: Joi.string().trim().max(200).required(),
      status: Joi.string().trim().max(32).required(),
      my_genre: Joi.string().trim().max(100).allow(null, ""),
      thoughts: Joi.string().trim().max(2000).allow(null, ""),
      my_score: Joi.alternatives()
        .try(Joi.number().min(0).max(100), Joi.number().min(0).max(10))
        .allow(null),
      how_long_to_beat: Joi.number().integer().min(0).max(999).allow(null),
      started_at: Joi.date().iso().allow(null),
      finished_at: Joi.date().iso().allow(null),
      hltb_pref: Joi.string().valid("main", "plus", "comp").optional(),
    }),
  },
  opts
);
