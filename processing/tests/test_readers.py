from openpyxl import Workbook

from processing.readers.tabular import read_rows


def test_excel_reader_finds_headers_after_title_and_spacer_rows(tmp_path):
    path = tmp_path / "project-list.xlsx"
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Project List"
    worksheet.append(["Customer project register"])
    worksheet.append([])
    worksheet.append(["Project No.", "Customer Name", "Project Name."])
    worksheet.append(["IG-047", "Customer A", "Water skid"])
    workbook.save(path)

    headers, rows = read_rows(path)

    assert headers == ["Project No.", "Customer Name", "Project Name."]
    assert rows == [
        {
            "Project No.": "IG-047",
            "Customer Name": "Customer A",
            "Project Name.": "Water skid",
        }
    ]
