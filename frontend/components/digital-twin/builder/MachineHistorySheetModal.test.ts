import { describe, it, expect } from "vitest";

function getColLetter(index: number): string {
  let letter = "";
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

function formatTsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const headersText = headers.join("\t");
  const rowsText = rows
    .map((row) => row.map((cell) => (cell === "—" || cell === null || cell === undefined ? "" : String(cell))).join("\t"))
    .join("\n");
  return `${headersText}\n${rowsText}`;
}

describe("MachineHistorySheetModal helper logic", () => {
  describe("getColLetter (Excel column notation)", () => {
    it("maps 0-25 to A-Z", () => {
      expect(getColLetter(0)).toBe("A");
      expect(getColLetter(1)).toBe("B");
      expect(getColLetter(25)).toBe("Z");
    });

    it("maps 26 to AA and 27 to AB", () => {
      expect(getColLetter(26)).toBe("AA");
      expect(getColLetter(27)).toBe("AB");
    });
  });

  describe("formatTsv", () => {
    it("generates tab-separated text suitable for Excel paste", () => {
      const headers = ["Timestamp", "Status", "Temperature", "Humidity"];
      const rows = [
        ["2026-09-16 10:00", "Running", 24.5, 88.2],
        ["2026-09-16 11:00", "Down", "—", null],
      ];

      const tsv = formatTsv(headers, rows);
      expect(tsv).toBe(
        "Timestamp\tStatus\tTemperature\tHumidity\n2026-09-16 10:00\tRunning\t24.5\t88.2\n2026-09-16 11:00\tDown\t\t"
      );
    });
  });
});
