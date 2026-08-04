import csv
from dataclasses import dataclass
from datetime import date, datetime
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


def read_rows(path: str | Path) -> tuple[list[str], list[dict[str, object]]]:
    """Read the first tabular sheet without evaluating spreadsheet formulas.

    Workbooks exported from operational teams often contain title or spacer rows
    above the real table. The first row containing at least two headings is used
    as the header so those sources can be mapped without being reformatted first.
    """
    source = Path(path)
    if source.suffix.lower() == ".csv":
        with source.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            return list(reader.fieldnames or []), [dict(row) for row in reader]
    if source.suffix.lower() == ".xlsx":
        workbook = load_workbook(source, read_only=True, data_only=True, keep_links=False)
        try:
            worksheet = workbook.worksheets[0]
            iterator = worksheet.iter_rows(values_only=True)
            headers = []
            for candidate in iterator:
                normalized = [
                    str(value).strip() if value is not None else "" for value in candidate
                ]
                if sum(bool(value) for value in normalized) >= 2:
                    headers = normalized
                    break
            if not headers:
                return [], []
            return headers, [
                {
                    header: _serializable_cell(value)
                    for header, value in zip(headers, row, strict=False)
                    if header
                }
                for row in iterator
                if any(value is not None and value != "" for value in row)
            ]
        finally:
            workbook.close()
    raise ValueError(f"Unsupported file extension: {source.suffix.lower()}")


def _serializable_cell(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return "" if value is None else value


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
