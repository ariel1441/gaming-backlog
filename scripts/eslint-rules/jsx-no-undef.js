function rootJsxIdentifier(nameNode) {
  let current = nameNode;
  while (current?.type === "JSXMemberExpression") current = current.object;
  return current?.type === "JSXIdentifier" ? current : null;
}

function isDefined(scope, name) {
  for (let current = scope; current; current = current.upper) {
    if (current.set?.has(name)) return true;
  }
  return false;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow JSX components without an in-scope binding",
    },
    schema: [],
    messages: {
      undefined: "'{{name}}' is not defined.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const identifier = rootJsxIdentifier(node.name);
        const name = identifier?.name;
        if (!name || name[0] !== name[0].toUpperCase()) return;
        if (isDefined(context.getScope(), name)) return;
        context.report({
          node: identifier,
          messageId: "undefined",
          data: { name },
        });
      },
    };
  },
};
