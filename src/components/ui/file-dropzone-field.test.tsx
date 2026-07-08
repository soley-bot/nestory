/* @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CSV_FILE_ACCEPT,
  FileDropzoneField,
} from "@/components/ui/file-dropzone-field";

describe("FileDropzoneField", () => {
  it("mirrors required state to the native file input", () => {
    const { container } = render(
      <FileDropzoneField accept={CSV_FILE_ACCEPT} name="csvFile" required />,
    );

    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );

    expect(input?.name).toBe("csvFile");
    expect(input?.required).toBe(true);
  });
});
