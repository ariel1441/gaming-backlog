const test = require("node:test");
const { RuleTester } = require("eslint");
const rule = require("./jsx-no-undef");

test("jsx-no-undef accepts bound components and rejects missing components", () => {
  const tester = new RuleTester({
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      ecmaFeatures: { jsx: true },
    },
  });

  tester.run("jsx-no-undef", rule, {
    valid: [
      "import Card from './Card'; export default function Page() { return <Card />; }",
      "function Card() { return <div />; } export default function Page() { return <Card />; }",
      "import UI from './ui'; export default function Page() { return <UI.Card />; }",
    ],
    invalid: [
      {
        code: "export default function Page() { return <MissingCard />; }",
        errors: [{ message: "'MissingCard' is not defined." }],
      },
      {
        code: "export default function Page() { return <Missing.Card />; }",
        errors: [{ message: "'Missing' is not defined." }],
      },
    ],
  });
});
