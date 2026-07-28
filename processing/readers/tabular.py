import csv
from dataclasses import dataclass
from pathlib import Path

from openpyxl import load_workbook


@dataclass(frozen=True)
class SheetInspection:
    name: str
    headers: list[str]
    samples: list[dict[str, object]]
    estimated_rows: int


@dataclass(frozen=True)
class FileInspection:
    filename: str
    file_type: str
    sheets: list[SheetInspection]


def inspect_file(path: str | Path, sample_size: int = 8) -> FileInspection:
    source = Path(path)
    extension = source.suffix.lower()
    if extension == ".csv":
        return _inspect_csv(source, sample_size)
    if extension == ".xlsx":
        return _inspect_xlsx(source, sample_size)
    raise ValueError(f"Unsupported file extension: {extension}")


def _inspect_csv(path: Path, sample_size: int) -> FileInspection:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames or []
        samples = []
        row_count = 0
        for row in reader:
            row_count += 1
            if len(samples) < sample_size:
                samples.append(dict(row))
    return FileInspection(
        filename=path.name,
        file_type="csv",
        sheets=[SheetInspection("CSV", headers, samples, row_count)],
    )


def _inspect_xlsx(path: Path, sample_size: int) -> FileInspection:
    # data_only prevents formula execution and returns only cached cell values.
    workbook = load_workbook(path, read_only=True, data_only=True, keep_links=False)
    sheets = []
    try:
        for worksheet in workbook.worksheets:
            rows = worksheet.iter_rows(values_only=True)
            first = next(rows, ())
            headers = [str(value).strip() if value is not None else "" for value in first]
            samples = []
            for row in rows:
                if len(samples) >= sample_size:
                    break
                samples.append(dict(zip(headers, row, strict=False)))
            sheets.append(
                SheetInspection(
                    name=worksheet.title,
                    headers=headers,
                    samples=samples,
                    estimated_rows=max(worksheet.max_row - 1, 0),
                )
            )
    finally:
        workbook.close()
    return FileInspection(filename=path.name, file_type="xlsx", sheets=sheets)
