import { celebrate, Segments, Joi } from "celebrate";

const opts = { convert: true, abortEarly: false, stripUnknown: true };

export const usernameParam = celebrate(
  {
    [Segments.PARAMS]: Joi.object({
      username: Joi.string()
        .trim()
        .pattern(/^[\w.-]{3,30}$/)
        .required()
        .messages({
          "any.required": "username is required",
          "string.empty": "username cannot be empty",
          "string.pattern.base": "invalid username",
        }),
    }),
  },
  opts
);
