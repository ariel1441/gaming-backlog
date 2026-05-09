import { celebrate, Segments, Joi } from "celebrate";

const opts = { convert: true, abortEarly: false, stripUnknown: true };

export const keepDemo = celebrate(
  {
    [Segments.BODY]: Joi.object({
      username: Joi.string()
        .trim()
        .pattern(/^[\w.-]{3,30}$/)
        .required()
        .messages({
          "any.required": "username is required",
          "string.empty": "username cannot be empty",
          "string.pattern.base":
            "username must be 3-30 characters and use only letters, numbers, underscores, dots, or dashes",
        }),
      password: Joi.string().min(6).required().messages({
        "any.required": "password is required",
        "string.empty": "password cannot be empty",
        "string.min": "password must be at least 6 characters",
      }),
    }),
  },
  opts
);
