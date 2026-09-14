import type { DatasetType } from "./factory-domain";

export function downloadTemplate(type: DatasetType) {
  const anchor = document.createElement("a");
  anchor.href = `/api/backend/api/imports/template/${type}/`;
  anchor.download = `vulcan_${type}_template.xlsx`;
  anchor.click();
}

export function downloadBlob(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
) {
  const formatCell = (val: unknown) => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
  };

  const csvContent =
    "\uFEFF" +
    [
      headers.map(formatCell).join(","),
      ...rows.map((row) => row.map(formatCell).join(",")),
    ].join("\r\n");

  downloadBlob(
    csvContent,
    filename.endsWith(".csv") ? filename : `${filename}.csv`,
    "text/csv;charset=utf-8;"
  );
}

export interface ExcelWorksheet {
  name: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
}

export function exportToExcelXml(filename: string, worksheets: ExcelWorksheet[]) {
  const escapeXml = (str: unknown) => {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  const sheetsXml = worksheets
    .map((ws) => {
      const headerRow = `   <Row>\n${ws.headers
        .map(
          (h) =>
            `    <Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`
        )
        .join("\n")}\n   </Row>`;

      const dataRows = ws.rows
        .map((row) => {
          const cells = row
            .map((cell) => {
              if (cell === null || cell === undefined || cell === "") {
                return `    <Cell><Data ss:Type="String"></Data></Cell>`;
              }
              if (typeof cell === "number" && !isNaN(cell)) {
                return `    <Cell><Data ss:Type="Number">${cell}</Data></Cell>`;
              }
              if (typeof cell === "boolean") {
                return `    <Cell><Data ss:Type="Boolean">${cell ? 1 : 0}</Data></Cell>`;
              }
              return `    <Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`;
            })
            .join("\n");
          return `   <Row>\n${cells}\n   </Row>`;
        })
        .join("\n");

      return `  <Worksheet ss:Name="${escapeXml(ws.name)}">\n   <Table>\n${headerRow}\n${dataRows}\n   </Table>\n  </Worksheet>`;
    })
    .join("\n");

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#416F57"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#107C41" ss:Pattern="Solid"/>
  </Style>
 </Styles>
${sheetsXml}
</Workbook>`;

  downloadBlob(
    xmlContent,
    filename.endsWith(".xls") ? filename : `${filename}.xls`,
    "application/vnd.ms-excel;charset=utf-8;"
  );
}
