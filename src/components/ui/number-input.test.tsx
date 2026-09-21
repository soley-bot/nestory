// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { NumberInput } from "./number-input";
afterEach(cleanup);
it("pastes Excel currency into a controlled form without changing the amount", async () => {
  function Form() { const [value, setValue] = useState(""); return <form><NumberInput aria-label="Amount" name="amount" currencyPaste value={value} onChange={event => setValue(event.target.value)} /></form>; }
  const user = userEvent.setup(); render(<Form />);
  const input = screen.getByRole("textbox", { name: "Amount" });
  await user.click(input); await user.paste(" $ 1,198.80 ");
  expect((input as HTMLInputElement).value).toBe("1198.80");
  expect(new FormData(input.closest("form")!).get("amount")).toBe("1198.80");
});
