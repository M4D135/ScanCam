import BitMatrix from '@zxing/library/esm/core/common/BitMatrix.js';
import BitMatrixParser from '@zxing/library/esm/core/datamatrix/decoder/BitMatrixParser.js';
import DataBlock from '@zxing/library/esm/core/datamatrix/decoder/DataBlock.js';
import DecodedBitStreamParser from '@zxing/library/esm/core/datamatrix/decoder/DecodedBitStreamParser.js';
import GenericGF from '@zxing/library/esm/core/common/reedsolomon/GenericGF.js';
import ReedSolomonDecoder from '@zxing/library/esm/core/common/reedsolomon/ReedSolomonDecoder.js';

const rsDecoder = new ReedSolomonDecoder(GenericGF.DATA_MATRIX_FIELD_256);
const COMPATIBLE_ERROR = /^FormatError \(invalid code word\)(?: @ DMDecoder\.cpp:\d+)?$/u;

function correctedData(symbol) {
  const { width, height, data } = symbol || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 8 || height < 8 || width > 144 || height > 144 ||
      width % 2 || height % 2 ||
      !(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
      data.length !== width * height) return null;

  const matrix = new BitMatrix(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = data[y * width + x];
      if (value !== 0 && value !== 255) return null;
      if (value === 0) matrix.set(x, y);
    }
  }

  // These are sampled modules, not the partial text returned by the first
  // decoder. Re-extract and independently verify/correct every ECC200 block.
  // Unsupported dimensions (including DMRE) throw and fail closed below.
  const parser = new BitMatrixParser(matrix);
  const codewords = Uint8Array.from(parser.readCodewords(), (word) => word & 255);
  const blocks = DataBlock.getDataBlocks(codewords, parser.getVersion());
  const total = blocks.reduce((sum, block) => sum + block.getNumDataCodewords(), 0);
  if (!total || total > 1558 || !blocks.length) return null;
  const result = new Uint8Array(total);
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const count = block.getNumDataCodewords();
    const words = Int32Array.from(block.getCodewords(), (word) => word & 255);
    rsDecoder.decode(words, words.length - count);
    for (let index = 0; index < count; index += 1) {
      result[index * blocks.length + blockIndex] = words[index];
    }
  }
  return result;
}

function validPadding(data, padIndex) {
  for (let index = padIndex + 1; index < data.length; index += 1) {
    const value = 129 + ((149 * (index + 1)) % 253) + 1;
    if (data[index] !== (value > 254 ? value - 254 : value)) return false;
  }
  return true;
}

/**
 * Compatibility for an observed encoder defect: a redundant ASCII unlatch
 * (254) immediately before PAD (129). All following randomized pads must be
 * correct. No image content, manufacturer or inventory identifier is assumed.
 *
 * This is not a general acceptance of invalid ZXing results. It requires an
 * independent ECC200 check, then a strict parse after replacing only that
 * redundant terminator with PAD. The complete decoded text AND raw content
 * must agree with the first decoder. Checksum failures, other malformed data,
 * unsupported encodings and ambiguous candidates remain rejected.
 *
 * @returns {object|null} Verified result with explicit compatibility metadata.
 */
export function recoverDataMatrixPadding(candidate) {
  if (!candidate || candidate.isValid !== false || candidate.format !== 'DataMatrix' ||
      candidate.symbology !== 'DataMatrix' || !COMPATIBLE_ERROR.test(candidate.error) ||
      candidate.hasECI || candidate.readerInit || candidate.sequenceSize > 0 ||
      typeof candidate.text !== 'string' || !candidate.text.length || candidate.text.length > 3116 ||
      !(candidate.bytes instanceof Uint8Array) || candidate.bytes.length !== candidate.text.length ||
      !candidate.bytes.every((byte, index) => byte === candidate.text.charCodeAt(index))) return null;

  try {
    const data = correctedData(candidate.symbol);
    if (!data) return null;
    for (let index = 0; index + 1 < data.length; index += 1) {
      if (data[index] !== 254 || data[index + 1] !== 129 || !validPadding(data, index + 1)) continue;
      const corrected = data.slice();
      corrected[index] = 129;
      // Retaining the positions of the original codewords is deliberate:
      // only the final redundant unlatch is changed, and parsing ends there.
      const text = DecodedBitStreamParser.decode(corrected).getText();
      if (text !== candidate.text) continue;
      return {
        ...candidate,
        isValid: true,
        error: '',
        compatibility: 'datamatrix-terminal-unlatch',
      };
    }
  } catch {
    // Bad dimensions, uncorrectable Reed-Solomon blocks, unsupported encoding,
    // and every remaining format error must stay unreadable.
  }
  return null;
}
