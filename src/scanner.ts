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

export interface TemplatePartialReference {
  templateName: string;
  name: string;
  nameStart: number;
  nameEnd: number;
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

const RAW_TEXT_OPEN = /<(script|style)\b[^>]*>/iy;
const SCRIPT_CLOSE = /<\/script\s*>/gi;
const STYLE_CLOSE = /<\/style\s*>/gi;

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
    if (text[cursor] === "<") {
      RAW_TEXT_OPEN.lastIndex = cursor;
      const rawText = RAW_TEXT_OPEN.exec(text);
      if (rawText !== null) {
        const contentStart = cursor + rawText[0].length;
        const closing = rawText[1].toLowerCase() === "script" ? SCRIPT_CLOSE : STYLE_CLOSE;
        closing.lastIndex = contentStart;
        const match = closing.exec(text);
        const end = match === null ? text.length : match.index + match[0].length;
        mask(cursor, end);
        cursor = end;
        continue;
      }
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

function scanDjangoTemplatePartials(text: string): TemplatePartialReference[] {
  const visible = maskIgnoredDjangoRegions(text);
  const references: TemplatePartialReference[] = [];
  const pattern = /\{%\s*include\s+(["'])([^\r\n"'#]+)#([^\s\r\n"'#%}]*)\1(?=[\s%])/g;
  for (const match of visible.matchAll(pattern)) {
    if (match.index === undefined) {
      continue;
    }
    const quoteStart = match.index + match[0].indexOf(match[1]);
    const templateNameStart = quoteStart + 1;
    const nameStart = templateNameStart + match[2].length + 1;
    references.push({
      templateName: match[2],
      name: match[3],
      nameStart,
      nameEnd: nameStart + match[3].length,
    });
  }
  return references;
}

interface PythonToken {
  type: "identifier" | "punctuation" | "string";
  value: string;
  start: number;
  contentStart?: number;
  closed?: boolean;
  staticString?: boolean;
}

function pythonTokens(text: string): PythonToken[] {
  const tokens: PythonToken[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    if (/\s/.test(text[cursor] ?? "")) {
      cursor++;
      continue;
    }
    if (text[cursor] === "#") {
      cursor = text.indexOf("\n", cursor);
      if (cursor === -1) {
        break;
      }
      continue;
    }

    const tokenStart = cursor;
    let prefix = "";
    if (/[A-Za-z_]/.test(text[cursor] ?? "")) {
      while (/[A-Za-z0-9_]/.test(text[cursor] ?? "")) {
        cursor++;
      }
      prefix = text.slice(tokenStart, cursor);
      if (text[cursor] !== "\"" && text[cursor] !== "'") {
        tokens.push({ type: "identifier", value: prefix, start: tokenStart });
        continue;
      }
    }

    if (text[cursor] === "\"" || text[cursor] === "'") {
      const quote = text[cursor];
      const quoteLength = text.startsWith(quote.repeat(3), cursor) ? 3 : 1;
      const contentStart = cursor + quoteLength;
      cursor = contentStart;
      while (cursor < text.length) {
        if (text[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (text.startsWith(quote.repeat(quoteLength), cursor)) {
          const contentEnd = cursor;
          cursor += quoteLength;
          tokens.push({
            type: "string",
            value: text.slice(contentStart, contentEnd),
            start: tokenStart,
            contentStart,
            closed: true,
            staticString: prefix === "" || /^[ru]$/i.test(prefix),
          });
          break;
        }
        cursor++;
      }
      if (tokens.at(-1)?.start !== tokenStart) {
        tokens.push({
          type: "string",
          value: text.slice(contentStart),
          start: tokenStart,
          contentStart,
          closed: false,
          staticString: false,
        });
      }
      continue;
    }

    tokens.push({ type: "punctuation", value: text[cursor], start: cursor });
    cursor++;
  }
  return tokens;
}

interface PythonCallFrame {
  name?: string;
  argument: number;
  possibleKeyword?: string;
  keyword?: string;
  delimiter: "(" | "[" | "{";
}

const PYTHON_TEMPLATE_ARGUMENTS: Readonly<Record<string, { position: number; keyword: string }>> = {
  render: { position: 1, keyword: "template_name" },
  render_to_string: { position: 0, keyword: "template_name" },
  get_template: { position: 0, keyword: "template_name" },
  select_template: { position: 0, keyword: "template_name_list" },
  TemplateResponse: { position: 1, keyword: "template" },
};

function templateReferenceFromString(token: PythonToken): TemplatePartialReference | undefined {
  if (token.type !== "string" || token.closed !== true || token.staticString !== true || token.contentStart === undefined) {
    return undefined;
  }
  const hash = token.value.indexOf("#");
  if (hash <= 0) {
    return undefined;
  }
  const name = token.value.slice(hash + 1);
  if (/\s|["'#]/.test(name)) {
    return undefined;
  }
  const nameStart = token.contentStart + hash + 1;
  return {
    templateName: token.value.slice(0, hash).replace(/\\([\\"'])/g, "$1"),
    name,
    nameStart,
    nameEnd: nameStart + name.length,
  };
}

function scanPythonTemplatePartials(text: string): TemplatePartialReference[] {
  const tokens = pythonTokens(text);
  const references: TemplatePartialReference[] = [];
  const stack: PythonCallFrame[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const top = stack.at(-1);
    if (token.type === "identifier" && top?.delimiter === "(") {
      top.possibleKeyword = token.value;
    }
    if (token.type === "punctuation") {
      if (token.value === "(" || token.value === "[" || token.value === "{") {
        const previous = tokens[index - 1];
        stack.push({
          name: token.value === "(" && previous?.type === "identifier" ? previous.value : undefined,
          argument: 0,
          delimiter: token.value,
        });
        continue;
      }
      if (token.value === ")" || token.value === "]" || token.value === "}") {
        stack.pop();
        continue;
      }
      if (top?.delimiter === "(" && token.value === ",") {
        top.argument++;
        top.possibleKeyword = undefined;
        top.keyword = undefined;
        continue;
      }
      if (top?.delimiter === "(" && token.value === "=" && top.possibleKeyword !== undefined) {
        top.keyword = top.possibleKeyword;
      }
      continue;
    }
    if (token.type !== "string") {
      continue;
    }

    const previous = tokens[index - 1]?.value;
    const next = tokens[index + 1]?.value;
    if (!["(", "[", ",", "="].includes(previous ?? "") || ![")", "]", ","].includes(next ?? "")) {
      continue;
    }
    let callIndex = -1;
    for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex--) {
      const name = stack[stackIndex].name;
      if (name !== undefined && name in PYTHON_TEMPLATE_ARGUMENTS) {
        callIndex = stackIndex;
        break;
      }
    }
    if (callIndex === -1) {
      continue;
    }
    const call = stack[callIndex];
    const expected = PYTHON_TEMPLATE_ARGUMENTS[call.name!];
    if (call.argument !== expected.position && call.keyword !== expected.keyword) {
      continue;
    }
    if (stack.slice(callIndex + 1).some((frame) => frame.name !== undefined || frame.delimiter === "{")) {
      continue;
    }
    const reference = templateReferenceFromString(token);
    if (reference !== undefined) {
      references.push(reference);
    }
  }
  return references;
}

export function scanTemplatePartialReferences(
  text: string,
  languageId: "django-html" | "python",
): TemplatePartialReference[] {
  return languageId === "python" ? scanPythonTemplatePartials(text) : scanDjangoTemplatePartials(text);
}

export function templatePartialReferenceAtOffset(
  text: string,
  languageId: "django-html" | "python",
  offset: number,
): TemplatePartialReference | undefined {
  return scanTemplatePartialReferences(text, languageId).find(
    (reference) => offset >= reference.nameStart && offset <= reference.nameEnd,
  );
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

export interface PartialNameSpan extends Span {
  kind: "definition" | "reference";
}

/** All same-file definition and reference name spans that share a partial name. */
export function partialSpansByName(scan: ScanResult, name: string): PartialNameSpan[] {
  return [
    ...scan.partialDefinitions
      .filter((definition) => definition.name === name)
      .map((definition): PartialNameSpan => ({
        start: definition.nameStart,
        end: definition.nameEnd,
        kind: "definition",
      })),
    ...scan.partialReferences
      .filter((reference) => reference.name === name)
      .map((reference): PartialNameSpan => ({
        start: reference.nameStart,
        end: reference.nameEnd,
        kind: "reference",
      })),
  ];
}

export function tagAtOffset(scan: ScanResult, offset: number): HtmlTag | undefined {
  return scan.tags.find(
    (tag) => !tag.closing && offset > tag.start && (offset < tag.end || (!tag.terminated && offset === tag.end)),
  );
}
