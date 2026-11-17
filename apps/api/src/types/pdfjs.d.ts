// Tipos mínimos do pdf.js usados pelo processador de documentos.
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  interface PdfPage {
    getTextContent(): Promise<{ items: unknown[] }>;
    cleanup(): void;
  }
  interface PdfDocument {
    numPages: number;
    getPage(n: number): Promise<PdfPage>;
    destroy(): Promise<void>;
  }
  export function getDocument(src: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    disableFontFace?: boolean;
    useSystemFonts?: boolean;
    verbosity?: number;
  }): { promise: Promise<PdfDocument> };
}
