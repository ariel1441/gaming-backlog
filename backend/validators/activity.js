import { celebrate, Joi, Segments } from "celebrate";

const opts = { convert: true, abortEarly: false, stripUnknown: true };

export const listActivity = celebrate(
  {
    [Segments.QUERY]: Joi.object({
      source: Joi.string().trim().max(80).optional(),
      state: Joi.string().valid("open", "resolved", "dismissed").default("open"),
      limit: Joi.number().integer().min(1).max(200).default(100),
    }),
  },
  opts,
);

export const updateActivity = celebrate(
  {
    [Segments.PARAMS]: Joi.object({
      id: Joi.number().integer().positive().required(),
    }),
    [Segments.BODY]: Joi.object({
      action: Joi.string().valid("mark_seen", "dismiss").required(),
    }),
  },
  opts,
);
