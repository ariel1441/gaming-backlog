import { celebrate, Joi, Segments } from "celebrate";

const opts = { convert: true, abortEarly: false, stripUnknown: true };
export const hideOtherInbox = celebrate({ [Segments.BODY]: Joi.object({
  snapshot: Joi.string().pattern(/^\d{1,18}$/).required(),
}) }, opts);

export const listInbox = celebrate({ [Segments.QUERY]: Joi.object({
  section: Joi.string().valid('attention', 'updates').default('updates'),
  before: Joi.string().pattern(/^[1-9]\d{0,17}$/).optional(),
  snapshot: Joi.string().pattern(/^\d{1,18}$/).optional(),
  limit: Joi.number().integer().min(1).max(50).default(20),
}) }, opts);
export const updateInbox = celebrate({ [Segments.BODY]: Joi.object({
  eventIds: Joi.array().items(Joi.number().integer().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(1000).required(),
  action: Joi.string().valid('mark_read', 'dismiss').required(),
}) }, opts);

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

export const listPlayHistory = celebrate(
  {
    [Segments.QUERY]: Joi.object({
      days: Joi.number().integer().min(7).max(180).default(35),
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
