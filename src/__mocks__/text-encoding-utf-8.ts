// Mock TextEncoder and TextDecoder
export class TextEncoder {
    encode(input?: string): Uint8Array {
        return new Uint8Array(Buffer.from(input || ""));
    }
}

export class TextDecoder {
    decode(input?: Uint8Array | ArrayBuffer | SharedArrayBuffer): string {
        return Buffer.from(input || new Uint8Array()).toString();
    }
}

