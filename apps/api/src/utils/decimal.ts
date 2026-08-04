function expandScientificNotation(value: string): string {
  if (!/[eE]/.test(value)) {
    return value;
  }

  const [coefficient, exponentText] = value.toLowerCase().split("e");
  const exponent = Number(exponentText);

  if (!coefficient || !Number.isInteger(exponent)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }

  const negative = coefficient.startsWith("-");
  const unsignedCoefficient = negative ? coefficient.slice(1) : coefficient;

  const [integerPart, fractionPart = ""] = unsignedCoefficient.split(".");

  const digits = `${integerPart}${fractionPart}`;
  const decimalPosition = integerPart.length + exponent;

  let expanded: string;

  if (decimalPosition <= 0) {
    expanded = `0.${"0".repeat(-decimalPosition)}${digits}`;
  } else if (decimalPosition >= digits.length) {
    expanded = `${digits}${"0".repeat(decimalPosition - digits.length)}`;
  } else {
    expanded = `${digits.slice(0, decimalPosition)}.${digits.slice(
      decimalPosition
    )}`;
  }

  return negative ? `-${expanded}` : expanded;
}

function parseDecimal(value: string): {
  integer: bigint;
  scale: number;
} {
  const normalized = expandScientificNotation(value.trim());

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }

  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;

  const [integerPart, fractionPart = ""] = unsigned.split(".");

  const digits = `${integerPart}${fractionPart}`.replace(/^0+(?=\d)/, "");

  const integer = BigInt(digits || "0");

  return {
    integer: negative ? -integer : integer,
    scale: fractionPart.length,
  };
}

function formatScaledInteger(value: bigint, scale: number): string {
  const negative = value < 0n;
  const unsigned = negative ? -value : value;

  if (scale === 0) {
    return `${negative ? "-" : ""}${unsigned.toString()}`;
  }

  const padded = unsigned.toString().padStart(scale + 1, "0");

  const integerPart = padded.slice(0, -scale);
  const fractionPart = padded.slice(-scale).replace(/0+$/, "");

  const formatted = fractionPart
    ? `${integerPart}.${fractionPart}`
    : integerPart;

  return negative ? `-${formatted}` : formatted;
}

export function multiplyDecimalStrings(left: string, right: string): string {
  const parsedLeft = parseDecimal(left);
  const parsedRight = parseDecimal(right);

  return formatScaledInteger(
    parsedLeft.integer * parsedRight.integer,
    parsedLeft.scale + parsedRight.scale
  );
}
