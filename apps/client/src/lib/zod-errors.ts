import * as z from "zod";

z.config({
  customError: (issue) => {
    switch (issue.code) {
      case "invalid_type":
        return "This field is required";
      case "invalid_format":
        return issue.format === "email"
          ? "Enter a valid email address"
          : undefined;
      case "too_small":
        return issue.origin === "string"
          ? `Must be at least ${Number(issue.minimum)} characters`
          : undefined;
      case "too_big":
        return issue.origin === "string"
          ? `Must be at most ${Number(issue.maximum)} characters`
          : undefined;
      default:
        return undefined;
    }
  },
});
