export interface Span {
  start: number;
  end: number;
}

export interface AttributeToken {
  name: string;
  nameStart: number;
  nameEnd: number;
  value?: string;
  valueStart?: number;
  valueEnd?: number;
  quote?: "\"" | "'";
  valueClosed?: boolean;
}

export interface HtmlTag {
  name: string;
  start: number;
  end: number;
  terminated: boolean;
  closing: boolean;
  attributes: AttributeToken[];
}

export interface PartialDefinition {
  name: string;
  nameStart: number;
  nameEnd: number;
  tagStart: number;
  tagEnd: number;
  inline: boolean;
}

export interface PartialReference {
  name: string;
  nameStart: number;
  nameEnd: number;
  tagStart: number;
  tagEnd: number;
}

export interface ScanResult {
  tags: HtmlTag[];
  attributes: AttributeToken[];
  partialDefinitions: PartialDefinition[];
  partialReferences: PartialReference[];
}

function findEnd(text: string, start: number, delimiter: string): number {
  const found = text.indexOf(delimiter, start);
  return found === -1 ? text.length : found + delimiter.length;
}

function skipDjangoBlock(text: string, start: number): number {
  if (text.startsWith("{{", start)) {
    return findEnd(text, start + 2, "}}");
  }
  if (text.startsWith("{#", start)) {
    return findEnd(text, start + 2, "#}");
  }
  if (text.startsWith("{%", start)) {
    return findEnd(text, start + 2, "%}");
  }
  return start;
}

function parseTag(text: string, start: number): HtmlTag | undefined {
  let cursor = start + 1;
  const closing = text[cursor] === "/";
  if (closing) {
    cursor++;
  }
  while (/\s/.test(text[cursor] ?? "")) {
    cursor++;
  }
  const nameStart = cursor;
  while (/[A-Za-z0-9:_-]/.test(text[cursor] ?? "")) {
    cursor++;
  }
  if (cursor === nameStart) {
    return undefined;
  }

  const tag: HtmlTag = {
    name: text.slice(nameStart, cursor).toLowerCase(),
    start,
    end: text.length,
    terminated: false,
    closing,
    attributes: [],
  };
  if (closing) {
    tag.end = findEnd(text, cursor, ">");
    tag.terminated = text[tag.end - 1] === ">";
    return tag;
  }

  while (cursor < text.length) {
    while (/\s/.test(text[cursor] ?? "")) {
      cursor++;
    }
    if (text[cursor] === ">") {
      tag.end = cursor + 1;
      tag.terminated = true;
      return tag;
    }
    if (text[cursor] === "/" && text[cursor + 1] === ">") {
      tag.end = cursor + 2;
      tag.terminated = true;
      return tag;
    }
    if (text.startsWith("{{", cursor) || text.startsWith("{%", cursor) || text.startsWith("{#", cursor)) {
      cursor = skipDjangoBlock(text, cursor);
      continue;
    }

    const attributeStart = cursor;
    while (cursor < text.length && !/[\s=<>]/.test(text[cursor] ?? "")) {
      cursor++;
    }
    if (cursor === attributeStart) {
      cursor++;
      continue;
    }
    const attribute: AttributeToken = {
      name: text.slice(attributeStart, cursor),
      nameStart: attributeStart,
      nameEnd: cursor,
    };

    while (/\s/.test(text[cursor] ?? "")) {
      cursor++;
    }
    if (text[cursor] === "=") {
      cursor++;
      while (/\s/.test(text[cursor] ?? "")) {
        cursor++;
      }
      const quote: "\"" | "'" | undefined =
        text[cursor] === "\"" || text[cursor] === "'" ? (text[cursor] as "\"" | "'") : undefined;
      if (quote !== undefined) {
        attribute.quote = quote;
        cursor++;
        attribute.valueStart = cursor;
        while (cursor < text.length && text[cursor] !== quote) {
          cursor++;
        }
        attribute.valueEnd = cursor;
        attribute.value = text.slice(attribute.valueStart, attribute.valueEnd);
        attribute.valueClosed = text[cursor] === quote;
        if (attribute.valueClosed) {
          cursor++;
        }
      } else {
        attribute.valueStart = cursor;
        while (cursor < text.length && !/[\s>]/.test(text[cursor] ?? "")) {
          const djangoEnd = skipDjangoBlock(text, cursor);
          cursor = djangoEnd === cursor ? cursor + 1 : djangoEnd;
        }
        attribute.valueEnd = cursor;
        attribute.value = text.slice(attribute.valueStart, attribute.valueEnd);
        attribute.valueClosed = true;
      }
    }
    tag.attributes.push(attribute);
  }
  return tag;
}

function maskIgnoredDjangoRegions(text: string): string {
  const chars = [...text];
  const mask = (start: number, end: number): void => {
    for (let index = start; index < end; index++) {
      chars[index] = " ";
    }
  };

  let cursor = 0;
  while (cursor < text.length) {
    if (text.startsWith("{#", cursor)) {
      const end = findEnd(text, cursor + 2, "#}");
      mask(cursor, end);
      cursor = end;
      continue;
    }
    if (text.startsWith("<!--", cursor)) {
      const end = findEnd(text, cursor + 4, "-->");
      mask(cursor, end);
      cursor = end;
      continue;
    }
    if (text.startsWith("{%", cursor)) {
      const tagEnd = findEnd(text, cursor + 2, "%}");
      const tag = text.slice(cursor, tagEnd);
      const block = tag.match(/^\{%\s*(comment|verbatim)\b/);
      if (block !== null) {
        const compactEndPattern = new RegExp(`\\{%\\s*end${block[1]}\\s*%\\}`);
        const rest = text.slice(tagEnd);
        const match = compactEndPattern.exec(rest);
        const end = match === null ? text.length : tagEnd + match.index + match[0].length;
        mask(cursor, end);
        cursor = end;
        continue;
      }
    }
    cursor++;
  }
  return chars.join("");
}

function scanPartials(text: string): Pick<ScanResult, "partialDefinitions" | "partialReferences"> {
  const visible = maskIgnoredDjangoRegions(text);
  const partialDefinitions: PartialDefinition[] = [];
  const partialReferences: PartialReference[] = [];
  const pattern = /\{%\s*(partialdef|partial)\b([\s\S]*?)%\}/g;
  for (const match of visible.matchAll(pattern)) {
    const full = match[0];
    const command = match[1];
    const args = match[2].trim().split(/\s+/).filter(Boolean);
    const name = args[0];
    if (name === undefined || match.index === undefined) {
      continue;
    }
    const relativeNameStart = full.indexOf(name, full.indexOf(command) + command.length);
    const nameStart = match.index + relativeNameStart;
    const common = {
      name,
      nameStart,
      nameEnd: nameStart + name.length,
      tagStart: match.index,
      tagEnd: match.index + full.length,
    };
    if (command === "partialdef") {
      partialDefinitions.push({ ...common, inline: args.slice(1).includes("inline") });
    } else {
      partialReferences.push(common);
    }
  }
  return { partialDefinitions, partialReferences };
}

export function scanDocument(text: string): ScanResult {
  const tags: HtmlTag[] = [];
  const attributes: AttributeToken[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    if (text.startsWith("<!--", cursor)) {
      cursor = findEnd(text, cursor + 4, "-->");
      continue;
    }
    if (text.startsWith("{#", cursor)) {
      cursor = findEnd(text, cursor + 2, "#}");
      continue;
    }
    if (text.startsWith("{%", cursor)) {
      const tagEnd = findEnd(text, cursor + 2, "%}");
      const tag = text.slice(cursor, tagEnd);
      const block = tag.match(/^\{%\s*(comment|verbatim)\b/);
      if (block !== null) {
        const endPattern = new RegExp(`\\{%\\s*end${block[1]}\\s*%\\}`, "g");
        endPattern.lastIndex = tagEnd;
        const endMatch = endPattern.exec(text);
        cursor = endMatch === null ? text.length : endMatch.index + endMatch[0].length;
      } else {
        cursor = tagEnd;
      }
      continue;
    }
    if (text[cursor] !== "<" || text.startsWith("<!", cursor) || text.startsWith("<?", cursor)) {
      cursor++;
      continue;
    }

    const tag = parseTag(text, cursor);
    if (tag === undefined) {
      cursor++;
      continue;
    }
    tags.push(tag);
    attributes.push(...tag.attributes);
    cursor = Math.max(tag.end, cursor + 1);

    if (!tag.closing && (tag.name === "script" || tag.name === "style")) {
      const closing = new RegExp(`<\\/${tag.name}\\s*>`, "gi");
      closing.lastIndex = cursor;
      const match = closing.exec(text);
      cursor = match === null ? text.length : match.index + match[0].length;
    }
  }

  return { tags, attributes, ...scanPartials(text) };
}

export function attributeAtOffset(scan: ScanResult, offset: number): AttributeToken | undefined {
  return scan.attributes.find(
    (attribute) =>
      (offset >= attribute.nameStart && offset <= attribute.nameEnd) ||
      (attribute.valueStart !== undefined &&
        attribute.valueEnd !== undefined &&
        offset >= attribute.valueStart &&
        offset <= attribute.valueEnd),
  );
}

export function partialAtOffset(
  scan: ScanResult,
  offset: number,
): PartialDefinition | PartialReference | undefined {
  return [...scan.partialDefinitions, ...scan.partialReferences].find(
    (partial) => offset >= partial.nameStart && offset <= partial.nameEnd,
  );
}

export function tagAtOffset(scan: ScanResult, offset: number): HtmlTag | undefined {
  return scan.tags.find(
    (tag) => !tag.closing && offset > tag.start && (offset < tag.end || (!tag.terminated && offset === tag.end)),
  );
}
