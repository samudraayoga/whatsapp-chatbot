declare module 'pdf-parse/lib/pdf-parse.js' {
  type PdfParseResult = {
    numpages: number;
    text: string;
  };

  export default function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
}
