import { Assert } from "./assert";

Assert.extend("equal", ({ isNot, stack, applyModifier }, value, expected) => {
  const pass = applyModifier(value === expected);
  if (pass) {
    const message = () => `values are ${isNot ? "not " : ""}equal`;
    return { pass, message };
  } else {
    const message = () => `expected values ${isNot ? "not " : ""}to be equal`;
    return {
      pass,
      message,
      expected,
      value,
      stack,
    };
  }
});
