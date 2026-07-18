import { celebrate, Joi, Segments } from "celebrate";

const opts = { convert: true, abortEarly: false, stripUnknown: true };

export const nextUpSchemas = {
  gameIdParams: Joi.object({
    gameId: Joi.number().integer().positive().required().messages({
      "number.base": "gameId must be a number",
      "number.integer": "gameId must be an integer",
      "number.positive": "gameId must be positive",
      "any.required": "gameId is required",
    }),
  }),
  reorderBody: Joi.object({
    gameIds: Joi.array()
      .items(Joi.number().integer().positive())
      .unique()
      .required()
      .messages({
        "array.base": "gameIds must be an array",
        "array.unique": "gameIds cannot contain duplicates",
        "any.required": "gameIds is required",
      }),
  }),
};

export const nextUpGameId = celebrate(
  { [Segments.PARAMS]: nextUpSchemas.gameIdParams },
  opts,
);

export const reorderNextUp = celebrate(
  { [Segments.BODY]: nextUpSchemas.reorderBody },
  opts,
);
