import * as XLSX from "xlsx";

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of buf) crc = crc32Table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

// A hand-rolled, uncompressed (store method) zip container — the minimum a
// .docx needs for mammoth to read it, with no extra dependency to write one.
const buildZip = (entries: { name: string; content: string }[]): Buffer => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const { name, content } of entries) {
    const nameBuf = Buffer.from(name, "utf-8");
    const dataBuf = Buffer.from(content, "utf-8");
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const localData = Buffer.concat(localParts);
  const centralDir = Buffer.concat(centralParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(localData.length, 16);

  return Buffer.concat([localData, centralDir, end]);
};

export const buildMinimalDocx = (text: string): Buffer =>
  buildZip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    },
    {
      name: "word/document.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    },
  ]);

// A hand-built, uncompressed PDF with one text run per page — the
// minimum pdf-parse/unpdf needs, with no writer library to generate one
// from. Pass an array to build a multi-page document.
export const buildMinimalPdf = (text: string | string[]): Buffer => {
  const pageTexts = Array.isArray(text) ? text : [text];
  const pageCount = pageTexts.length;
  const fontObjNum = 3 + 2 * pageCount;

  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(
    " ",
  );

  const pageObjects = pageTexts.map(
    (_, i) =>
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 200] /Contents ${3 + pageCount + i} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >>`,
  );

  const streamObjects = pageTexts.map((pageText) => {
    const streamContent = `BT /F1 24 Tf 20 100 Td (${pageText}) Tj ET`;
    return `<< /Length ${Buffer.byteLength(streamContent, "utf-8")} >>\nstream\n${streamContent}\nendstream`;
  });

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
    ...pageObjects,
    ...streamObjects,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((content, index) => {
    offsets.push(Buffer.byteLength(body, "utf-8"));
    body += `${index + 1} 0 obj\n${content}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body, "utf-8");
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(body + xref + trailer, "utf-8");
};

// Pass an array to build one sheet per entry (Sheet1, Sheet2, ...).
export const buildMinimalXlsx = (text: string | string[]): Buffer => {
  const sheetTexts = Array.isArray(text) ? text : [text];
  const workbook = XLSX.utils.book_new();
  sheetTexts.forEach((sheetText, i) => {
    const sheet = XLSX.utils.aoa_to_sheet([[sheetText]]);
    XLSX.utils.book_append_sheet(workbook, sheet, `Sheet${i + 1}`);
  });
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};
