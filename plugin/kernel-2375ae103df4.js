var MBB = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/kernel.js
  var kernel_exports = {};
  __export(kernel_exports, {
    ConversionError: () => ConversionError,
    MergeError: () => MergeError,
    VERSION: () => VERSION,
    activityParts: () => activityParts,
    activityRelations: () => activityRelations,
    adapterDescriptors: () => adapterDescriptors,
    bibliographyEntryCanonical: () => bibliographyEntryCanonical,
    bibliographyEntryHash: () => bibliographyEntryHash,
    bibtexCandidate: () => bibtexCandidate,
    configureBlockAdapters: () => configureBlockAdapters2,
    copyActivity: () => copyActivity,
    createActivity: () => createActivity,
    cslCandidate: () => cslCandidate,
    exportCSL: () => exportCSL,
    exportDocument: () => exportDocument,
    formatLocation: () => formatLocation,
    frontmatterFields: () => frontmatterFields,
    importDocument: () => importDocument,
    importPairedDocument: () => importPairedDocument,
    inspectNativeMath: () => inspectNativeMath,
    instantiateWritingPattern: () => instantiateWritingPattern,
    markdownSnippet: () => markdownSnippet,
    mergeMetadata: () => mergeMetadata,
    migrateBibliography: () => migrateBibliography,
    parseBibTeX: () => parseBibTeX,
    parseCSL: () => parseCSL,
    parseFrontmatter: () => parseFrontmatter,
    planMerge: () => planMerge,
    portableDocumentImages: () => portableDocumentImages,
    referenceHTML: () => referenceHTML,
    register: () => register,
    relocateDocumentImages: () => relocateDocumentImages,
    resolveMerge: () => resolveMerge,
    rewriteDocumentImages: () => rewriteDocumentImages,
    sourceNavigation: () => sourceNavigation,
    supportedBlocks: () => supportedBlocks,
    technicalDiagnostics: () => technicalDiagnostics,
    technicalIndex: () => technicalIndex,
    technicalReferenceSelection: () => technicalReferenceSelection,
    technicalRenamePlan: () => technicalRenamePlan,
    toBlocks: () => toBlocks,
    toMarkdown: () => toMarkdown,
    typedMathRange: () => typedMathRange,
    validateActivity: () => validateActivity,
    verifyNativeMathML: () => verifyNativeMathML,
    writingAdvice: () => writingAdvice,
    writingIndex: () => writingIndex,
    writingPatterns: () => writingPatterns
  });

  // src/bibliography.js
  var bibliographyTypes = [
    "article-journal",
    "book",
    "chapter",
    "paper-conference",
    "report",
    "thesis",
    "webpage",
    "dataset",
    "software",
    "document"
  ];
  var bibliographyFields = [
    "key",
    "type",
    "authors",
    "issued",
    "title",
    "containerTitle",
    "publisher",
    "volume",
    "issue",
    "page",
    "doi",
    "url",
    "identifiers",
    "source"
  ];
  var identifierFields = ["ISBN", "ISSN", "PMID", "PMCID"];
  var idPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
  var whitespace = /[\p{White_Space}\uFEFF]/gu;
  var bytes = (s) => new TextEncoder().encode(s).length;
  var keys = (o, list3) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).sort().join(",") === [...list3].sort().join(",");
  var text = (v, max, required = false) => typeof v === "string" && [...v].length <= max && !/[\r\n\x00\uD800-\uDFFF]/u.test(v) && (!required || !!v.replace(whitespace, ""));
  var failDefault = (code2, message) => {
    throw Object.assign(Error(message), { code: code2 });
  };
  var bad = (fail2, message) => fail2("BIBLIOGRAPHY_V2", message);
  function bibliographyName(value, fail2 = failDefault) {
    if (keys(value, ["literal"])) {
      if (!text(value.literal, 120, true))
        bad(fail2, "A literal author name requires 1\u2013120 plain characters");
      return value;
    }
    if (!keys(value, ["family", "given", "droppingParticle", "nonDroppingParticle", "suffix"]) || !text(value.family, 120, true) || Object.values(value).some((v) => !text(v, 120)) || [...bibliographyAuthor(value)].length > 120)
      bad(
        fail2,
        "A structured author requires an explicit family name within the existing 120-character name budget"
      );
    return value;
  }
  function bibliographyDate(value, fail2 = failDefault) {
    if (keys(value, ["literal"])) {
      if (!text(value.literal, 64))
        bad(fail2, "A literal issue date must be bounded single-line text");
      return value;
    }
    if (!keys(value, ["date-parts"]) || !Array.isArray(value["date-parts"]) || value["date-parts"].length < 1 || value["date-parts"].length > 2)
      bad(fail2, "A structured issue date requires one or two year/month/day parts");
    for (const part of value["date-parts"]) {
      if (!Array.isArray(part) || part.length < 1 || part.length > 3 || part.some((v) => !Number.isSafeInteger(v)) || part[0] < 1 || part[0] > 9999 || part.length > 1 && (part[1] < 1 || part[1] > 12))
        bad(fail2, "The structured issue date is invalid");
      const leap = part[0] % 4 === 0 && (part[0] % 100 !== 0 || part[0] % 400 === 0), max = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][(part[1] || 1) - 1];
      if (part.length > 2 && (part[2] < 1 || part[2] > max))
        bad(fail2, "The structured issue date is invalid");
    }
    return value;
  }
  function ipv4(host) {
    const parts = host.split(".");
    return parts.length === 4 && parts.every((part) => /^(?:0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255);
  }
  function ipv6(host) {
    if (!host.includes(":") || !/^[0-9a-f:.]+$/i.test(host)) return false;
    const sides = host.split("::");
    if (sides.length > 2) return false;
    const groups = sides.flatMap((side) => side === "" ? [] : side.split(":"));
    let units2 = 0;
    for (const [i, group] of groups.entries()) {
      if (group.includes(".")) {
        if (i !== groups.length - 1 || !host.endsWith(group) || !ipv4(group)) return false;
        units2 += 2;
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(group)) return false;
        units2++;
      }
    }
    return sides.length === 2 ? units2 < 8 : units2 === 8;
  }
  function bibliographyURL(value) {
    if (!text(value, 2048)) return false;
    if (!value) return true;
    if (/[\p{White_Space}\uFEFF\x00-\x20\x7f\\]/u.test(value)) return false;
    const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
    if (!authority) return false;
    const bracketed = authority.startsWith("["), parts = (bracketed ? /^\[([^\]]+)\](?::([0-9]+))?$/ : /^([^:]+)(?::([0-9]+))?$/).exec(
      authority
    );
    if (!parts) return false;
    if (parts[2] !== void 0) {
      const port = parts[2].replace(/^0+/, "") || "0";
      if (port.length > 5 || Number(port) > 65535) return false;
    }
    if (bracketed) return ipv6(parts[1]);
    let host;
    try {
      host = decodeURIComponent(parts[1]);
    } catch {
      return false;
    }
    if (!host || /[\p{White_Space}\uFEFF\x00-\x20\x7f#/:<>?@\[\]\\^|%]/u.test(host)) return false;
    if (/^[0-9.]+$/.test(host)) return ipv4(host.replace(/\.$/, ""));
    return true;
  }
  function bibliographyEntry(value, fail2 = failDefault) {
    if (!keys(value, bibliographyFields) || typeof value.key !== "string" || !idPattern.test(value.key) || !bibliographyTypes.includes(value.type) || !Array.isArray(value.authors) || value.authors.length > 8 || !text(value.title, 512, true))
      bad(
        fail2,
        "Bibliography v2 entries require closed fields, a stable key, a supported type and a title"
      );
    value.authors.forEach((v) => bibliographyName(v, fail2));
    bibliographyDate(value.issued, fail2);
    for (const name of ["containerTitle", "publisher", "source"])
      if (!text(value[name], 512))
        bad(fail2, "Publication and source fields are limited to 512 plain characters");
    for (const name of ["volume", "issue", "page"])
      if (!text(value[name], 128))
        bad(fail2, "Volume, issue and pages are limited to 128 plain characters");
    if (!text(value.doi, 512) || value.doi && !/^10\.[0-9]{4,9}\/[A-Za-z0-9\-._;()/:]+$/.test(value.doi))
      bad(fail2, "A DOI must be a bounded supported DOI identifier, without a URL prefix");
    if (!bibliographyURL(value.url))
      bad(fail2, "Bibliography URLs must use absolute HTTP or HTTPS without credentials");
    if (!keys(value.identifiers, identifierFields) || Object.values(value.identifiers).some((v) => !text(v, 128)))
      bad(fail2, "Bibliography identifiers require bounded ISBN, ISSN, PMID and PMCID text fields");
    return value;
  }
  function bibliographyV2(attrs2, fail2 = failDefault) {
    if (!["author-year", "numeric"].includes(attrs2.style) || !Array.isArray(attrs2.entries) || !attrs2.entries.length || attrs2.entries.length > 64 || bytes(JSON.stringify(attrs2.entries)) > 65536)
      bad(fail2, "Bibliography v2 requires a fixed supported style and 1\u201364 entries within 64 KiB");
    const used = /* @__PURE__ */ new Set();
    for (const entry2 of attrs2.entries) {
      bibliographyEntry(entry2, fail2);
      if (used.has(entry2.key)) bad(fail2, "Bibliography keys must be unique");
      used.add(entry2.key);
    }
    if (Object.hasOwn(attrs2, "origins")) {
      if (!Array.isArray(attrs2.origins) || attrs2.origins.length > 64)
        bad(fail2, "Bibliography origins require at most 64 closed source declarations");
      const linked = /* @__PURE__ */ new Set();
      for (const origin of attrs2.origins) {
        if (!keys(origin, ["key", "namespace", "item", "version", "hash"]) || typeof origin.key !== "string" || !used.has(origin.key) || linked.has(origin.key) || typeof origin.namespace !== "string" || !/^L_[a-f0-9]{32}$/.test(origin.namespace) || typeof origin.item !== "string" || !/^I_[a-f0-9]{32}$/.test(origin.item) || !Number.isSafeInteger(origin.version) || origin.version < 1 || typeof origin.hash !== "string" || !/^[a-f0-9]{64}$/.test(origin.hash))
          bad(
            fail2,
            "Bibliography origins require unique existing keys and bounded opaque source versions"
          );
        linked.add(origin.key);
      }
    }
    return attrs2;
  }
  function bibliographyEntryCanonical(entry2) {
    bibliographyEntry(entry2);
    const order = (value) => Array.isArray(value) ? value.map(order) : value && typeof value === "object" ? Object.fromEntries(
      Object.keys(value).sort().map((k) => [k, order(value[k])])
    ) : value;
    return JSON.stringify(
      order(Object.fromEntries(Object.entries(entry2).filter(([key]) => key !== "key")))
    );
  }
  async function bibliographyEntryHash(entry2) {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(bibliographyEntryCanonical(entry2))
    );
    return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  function emptyBibliographyEntry(key) {
    return {
      key,
      type: "document",
      authors: [],
      issued: { literal: "" },
      title: "",
      containerTitle: "",
      publisher: "",
      volume: "",
      issue: "",
      page: "",
      doi: "",
      url: "",
      identifiers: Object.fromEntries(identifierFields.map((k) => [k, ""])),
      source: ""
    };
  }
  function migrateBibliography(entries) {
    return entries.map((e) => ({
      ...emptyBibliographyEntry(e.key),
      authors: e.authors.map((literal) => ({ literal })),
      issued: { literal: e.year },
      title: e.title,
      source: e.source,
      url: e.url
    }));
  }
  function bibliographyAuthor(name) {
    return name.literal ?? [name.given, name.droppingParticle, name.nonDroppingParticle, name.family, name.suffix].filter(Boolean).join(" ");
  }
  function bibliographyYear(issued) {
    return issued.literal !== void 0 ? issued.literal : issued["date-parts"].map((p) => String(p[0])).filter((v, i, a) => i === 0 || v !== a[0]).join("\u2013");
  }
  function bibliographyProjection(entry2) {
    const date = entry2.issued.literal !== void 0 ? entry2.issued.literal : entry2.issued["date-parts"].map((p) => p.map((v, i) => i ? String(v).padStart(2, "0") : String(v)).join("-")).join("\u2013");
    return {
      key: entry2.key,
      authors: entry2.authors.map(bibliographyAuthor),
      title: entry2.title,
      year: bibliographyYear(entry2.issued),
      source: [
        entry2.containerTitle,
        entry2.publisher,
        entry2.volume && "vol. " + entry2.volume,
        entry2.issue && "no. " + entry2.issue,
        entry2.page && "pp. " + entry2.page,
        date && date !== bibliographyYear(entry2.issued) ? date : "",
        ...identifierFields.filter((k) => entry2.identifiers[k]).map((k) => k + " " + entry2.identifiers[k]),
        entry2.doi ? "DOI " + entry2.doi : "",
        entry2.source
      ].filter(Boolean).join(" \xB7 "),
      url: entry2.url || (entry2.doi ? "https://doi.org/" + entry2.doi : "")
    };
  }
  function cslJSON(input, fail2) {
    if (typeof input !== "string" || bytes(input) > 65536 || input.includes("\0"))
      fail2("CSL_INPUT", "CSL-JSON input must be UTF-8 JSON within 64 KiB");
    if (input.charCodeAt(0) === 65279) input = input.slice(1);
    const tokens = input.match(/"(?:\\.|[^"\\])*"|[^\s]/g) || [], stack = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === "{" || t === "[") {
        stack.push(t === "{" ? /* @__PURE__ */ new Set() : null);
        if (stack.length > 16) fail2("CSL_DEPTH", "CSL-JSON nesting exceeds sixteen levels");
      } else if (t === "}" || t === "]") stack.pop();
      else if (t.startsWith('"') && tokens[i + 1] === ":" && stack.at(-1)) {
        let key;
        try {
          key = JSON.parse(t);
        } catch {
          fail2("CSL_JSON", "CSL-JSON is invalid");
        }
        if (stack.at(-1).has(key)) fail2("CSL_JSON", "CSL-JSON contains a duplicate property");
        stack.at(-1).add(key);
      }
    }
    let parsed;
    try {
      parsed = JSON.parse(input);
    } catch {
      fail2("CSL_JSON", "CSL-JSON is invalid");
    }
    let count = 0;
    function walk(v) {
      if (++count > 16384) fail2("CSL_INPUT", "CSL-JSON data exceeds its bounded node budget");
      if (typeof v === "string" && /[\uD800-\uDFFF]/u.test(v) || typeof v === "number" && !Number.isFinite(v))
        fail2("CSL_JSON", "CSL-JSON contains invalid Unicode or a nonfinite number");
      if (v && typeof v === "object") {
        for (const key of Object.keys(v))
          if ([...key].length > 128 || /[\x00\r\n\uD800-\uDFFF]/u.test(key))
            fail2("CSL_JSON", "CSL-JSON property names are invalid or too long");
        Object.values(v).forEach(walk);
      }
    }
    walk(parsed);
    return parsed;
  }
  var cslFields = [
    "id",
    "type",
    "author",
    "issued",
    "title",
    "container-title",
    "publisher",
    "volume",
    "issue",
    "page",
    "DOI",
    "URL",
    "ISBN",
    "ISSN",
    "PMID",
    "PMCID",
    "source"
  ];
  function parseCSL(input, keyMap = {}, fail2 = failDefault) {
    const rows = cslJSON(input, fail2);
    if (!Array.isArray(rows) || !rows.length || rows.length > 64)
      fail2("CSL_ITEMS", "CSL-JSON requires an array of 1\u201364 records");
    if (!keyMap || Array.isArray(keyMap) || typeof keyMap !== "object" || Object.keys(keyMap).some(
      (k) => !/^(?:0|[1-9]\d*)$/.test(k) || Number(k) >= rows.length || typeof keyMap[k] !== "string" || !idPattern.test(keyMap[k])
    ))
      fail2("CSL_KEYS", "CSL-JSON key mappings are invalid");
    const losses = [], keyMappings = [], ids = /* @__PURE__ */ new Set();
    const loss = (index, field) => {
      if (losses.length >= 256)
        fail2(
          "CSL_LOSS",
          "CSL-JSON has more than 256 unsupported fields; simplify the input before importing"
        );
      losses.push({ index, field });
    };
    const entries = rows.map((row, index) => {
      if (!row || Array.isArray(row) || typeof row !== "object" || !bibliographyTypes.includes(row.type))
        fail2("CSL_TYPE", "A CSL-JSON record has an unsupported or missing type");
      if (!(typeof row.id === "string" && row.id.length && bytes(row.id) <= 512 || typeof row.id === "number" && Number.isSafeInteger(row.id)))
        fail2("CSL_ID", "A CSL-JSON record requires a bounded string or safe integer id");
      const originalId = String(row.id);
      if (ids.has(originalId)) fail2("CSL_ID", "CSL-JSON record ids are duplicated");
      ids.add(originalId);
      const key = (Object.hasOwn(keyMap, index) ? keyMap[index] : void 0) ?? (idPattern.test(originalId) ? originalId : "reference-" + (index + 1));
      if (typeof key !== "string" || !idPattern.test(key))
        fail2("CSL_KEYS", "A proposed CSL-JSON key is invalid");
      if (key !== originalId) keyMappings.push({ index, from: originalId, to: key });
      for (const field of Object.keys(row)) if (!cslFields.includes(field)) loss(index, field);
      const value = { ...emptyBibliographyEntry(key), type: row.type, title: row.title };
      if (row.author !== void 0) {
        if (!Array.isArray(row.author) || row.author.length > 8)
          fail2("CSL_NAMES", "CSL-JSON supports at most eight authors");
        value.authors = row.author.map((name, n) => {
          if (!name || Array.isArray(name) || typeof name !== "object")
            fail2("CSL_NAMES", "A CSL-JSON author is invalid");
          const allowed = name.literal !== void 0 ? ["literal"] : ["family", "given", "dropping-particle", "non-dropping-particle", "suffix"];
          for (const f of Object.keys(name))
            if (!allowed.includes(f)) loss(index, "author[" + n + "]." + f);
          return name.literal !== void 0 ? { literal: name.literal } : {
            family: name.family,
            given: name.given === void 0 ? "" : name.given,
            droppingParticle: name["dropping-particle"] === void 0 ? "" : name["dropping-particle"],
            nonDroppingParticle: name["non-dropping-particle"] === void 0 ? "" : name["non-dropping-particle"],
            suffix: name.suffix === void 0 ? "" : name.suffix
          };
        });
      }
      if (row.issued !== void 0) {
        if (!row.issued || Array.isArray(row.issued) || typeof row.issued !== "object")
          fail2("CSL_DATE", "A CSL-JSON issue date is invalid");
        for (const f of Object.keys(row.issued))
          if (!["literal", "date-parts"].includes(f)) loss(index, "issued." + f);
        if (row.issued.literal !== void 0 && row.issued["date-parts"] !== void 0)
          fail2("CSL_DATE", "Choose a literal date or structured date parts, not both");
        if (row.issued["date-parts"] !== void 0 && !Array.isArray(row.issued["date-parts"]))
          fail2("CSL_DATE", "A CSL-JSON issue date is invalid");
        value.issued = row.issued.literal !== void 0 ? { literal: row.issued.literal } : row.issued["date-parts"] === void 0 ? { literal: "" } : {
          "date-parts": row.issued["date-parts"].map((part) => {
            if (!Array.isArray(part)) fail2("CSL_DATE", "A CSL-JSON issue date is invalid");
            return part.map(
              (v) => typeof v === "string" && /^\d{1,4}$/.test(v) ? Number(v) : v
            );
          })
        };
      }
      for (const [from, to] of [
        ["container-title", "containerTitle"],
        ["publisher", "publisher"],
        ["DOI", "doi"],
        ["URL", "url"],
        ["source", "source"]
      ])
        if (row[from] !== void 0) value[to] = row[from];
      for (const field of ["volume", "issue", "page"])
        if (row[field] !== void 0) {
          if (typeof row[field] !== "string" && !Number.isSafeInteger(row[field]))
            fail2("CSL_NUMBER", "CSL-JSON numeric fields require text or safe integers");
          value[field] = String(row[field]);
        }
      for (const field of identifierFields)
        if (row[field] !== void 0) value.identifiers[field] = row[field];
      bibliographyEntry(value, fail2);
      return value;
    });
    bibliographyV2({ style: "author-year", entries }, fail2);
    return { entries, losses, keyMappings };
  }
  function cslCandidate(existing, report, mode, referencedKeys, ackLoss = false, ackKeys = false, fail2 = failDefault) {
    if (!["merge", "replace"].includes(mode) || !report || !Array.isArray(report.entries))
      fail2("CSL_MODE", "Choose merge or replace for CSL-JSON import");
    if (report.losses.length && !ackLoss)
      fail2(
        "CSL_LOSS",
        "Review and explicitly acknowledge unsupported CSL-JSON fields before adopting the candidate"
      );
    if (report.keyMappings.length && !ackKeys)
      fail2(
        "CSL_KEYS",
        "Review and explicitly acknowledge the proposed citation keys before adopting the candidate"
      );
    const entries = mode === "merge" ? [...existing, ...report.entries] : [...report.entries];
    bibliographyV2({ style: "author-year", entries }, fail2);
    const keys2 = new Set(entries.map((e) => e.key));
    if (referencedKeys.some((k) => !keys2.has(k)))
      fail2("CSL_REFERENCED", "The replacement would remove currently cited keys");
    return entries;
  }
  function exportCSL(entries, fail2 = failDefault) {
    bibliographyV2({ style: "author-year", entries }, fail2);
    return entries.map((e) => {
      const row = { id: e.key, type: e.type, title: e.title };
      if (e.authors.length)
        row.author = e.authors.map(
          (n) => n.literal !== void 0 ? { literal: n.literal } : Object.fromEntries(
            [
              ["family", n.family],
              ["given", n.given],
              ["dropping-particle", n.droppingParticle],
              ["non-dropping-particle", n.nonDroppingParticle],
              ["suffix", n.suffix]
            ].filter(([, v]) => v !== "")
          )
        );
      if (e.issued.literal === void 0 || e.issued.literal !== "") row.issued = e.issued;
      for (const [to, from] of [
        ["container-title", "containerTitle"],
        ["publisher", "publisher"],
        ["volume", "volume"],
        ["issue", "issue"],
        ["page", "page"],
        ["DOI", "doi"],
        ["URL", "url"],
        ["source", "source"]
      ])
        if (e[from] !== "") row[to] = e[from];
      for (const name of identifierFields) if (e.identifiers[name]) row[name] = e.identifiers[name];
      return row;
    });
  }

  // src/technical.js
  var technicalSchemas = {
    object: { id: "string", kind: "string", caption: "string" },
    statement: { id: "string", kind: "string", title: "string", open: "boolean" },
    bibliography: { id: "string", entries: "object" }
  };
  var technicalKind = (name) => name?.startsWith("mbb/") && Object.hasOwn(technicalSchemas, name.slice(4)) ? name.slice(4) : null;
  var technicalId = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
  var plain = (value, limit, nonempty = false) => typeof value === "string" && [...value].length <= limit && !/[\r\n\x00\uD800-\uDFFF]/u.test(value) && (!nonempty || value.replace(
    /[ \t\r\n\f\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/gu,
    ""
  ).length > 0);
  var bad2 = (fail2, message) => fail2("TECHNICAL_ATTRIBUTES", message);
  function technicalAttributes(kind, attrs2, fail2) {
    if (kind === "object") {
      if (!["equation", "figure", "table", "listing"].includes(attrs2.kind) || !plain(attrs2.caption, 512, true))
        bad2(fail2, "An object requires a supported kind and a plain caption of 1\u2013512 characters");
    } else if (kind === "statement") {
      if (!["definition", "theorem", "proof"].includes(attrs2.kind) || !plain(attrs2.title, 200, true) || attrs2.kind !== "proof" && attrs2.open !== true)
        bad2(fail2, "A statement requires a supported kind and title; only proofs may be closed");
    } else if (kind === "bibliography") {
      if (attrs2.version === 2 || Object.hasOwn(attrs2, "style")) return bibliographyV2(attrs2, fail2);
      const entries = attrs2.entries;
      if (!Array.isArray(entries) || !entries.length || entries.length > 64 || new TextEncoder().encode(JSON.stringify(entries)).length > 65536)
        bad2(fail2, "A bibliography requires 1\u201364 entries within 64 KiB");
      const keys2 = /* @__PURE__ */ new Set();
      for (const entry2 of entries) {
        if (!entry2 || Array.isArray(entry2) || typeof entry2 !== "object" || Object.keys(entry2).sort().join(",") !== "authors,key,source,title,url,year" || typeof entry2.key !== "string" || !technicalId.test(entry2.key) || keys2.has(entry2.key) || !Array.isArray(entry2.authors) || entry2.authors.length > 8 || entry2.authors.some((name) => !plain(name, 120, true)) || !plain(entry2.title, 512, true) || !plain(entry2.source, 512) || !plain(entry2.year, 32) || !plain(entry2.url, 2048))
          bad2(fail2, "Bibliography fields are incomplete, duplicated, or outside their bounds");
        keys2.add(entry2.key);
        if (entry2.url) {
          let url;
          try {
            url = new URL(entry2.url);
          } catch {
            bad2(fail2, "Bibliography URLs must use absolute HTTP or HTTPS");
          }
          if (!/^https?:\/\/[^/?#]+/i.test(entry2.url) || !url.hostname || !["http:", "https:"].includes(url.protocol) || url.username || url.password || /[\x00-\x20\x7f\\\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/u.test(
            entry2.url
          ))
            bad2(fail2, "Bibliography URLs must use absolute HTTP or HTTPS without credentials");
        }
      }
    }
    return attrs2;
  }
  function technicalReference(raw, fail2, complete = true) {
    const match2 = /^<span((?:\s+[a-z][a-z0-9-]*="[^"<>]*")+)>([^<>\r\n]*)<\/span>/.exec(raw);
    const invalid = () => fail2(
      "TECHNICAL_REFERENCE",
      "The versioned reference marker is malformed or its text differs from its identity"
    );
    if (!match2 || complete && match2[0].length !== raw.length) return invalid();
    const attrs2 = /* @__PURE__ */ new Map();
    for (const item of match2[1].matchAll(/\s+([a-z][a-z0-9-]*)="([^"<>]*)"/g)) {
      if (attrs2.has(item[1])) return invalid();
      attrs2.set(item[1], item[2]);
    }
    const kind = attrs2.get("class") === "mbb-xref" ? "xref" : attrs2.get("class") === "mbb-cite" ? "cite" : null;
    const identity = attrs2.get(kind === "xref" ? "data-mbb-target" : "data-mbb-keys");
    if (kind === "xref" && attrs2.get("data-mbb-version") === "2") {
      if (attrs2.size !== 6 || [...attrs2.keys()].some(
        (k) => ![
          "class",
          "data-mbb-target",
          "data-mbb-version",
          "data-mbb-namespace",
          "data-mbb-document",
          "data-mbb-kind"
        ].includes(k)
      ) || !/^S_[a-f0-9]{32}$/.test(attrs2.get("data-mbb-namespace") || "") || !/^D_[a-f0-9]{32}$/.test(attrs2.get("data-mbb-document") || "") || !technicalId.test(identity || "") || !["equation", "figure", "table", "listing", "statement", "step", "activity"].includes(
        attrs2.get("data-mbb-kind")
      ) || match2[2] !== "[" + identity + "]")
        return invalid();
      return {
        raw: match2[0],
        kind,
        keys: [identity],
        version: 2,
        namespace: attrs2.get("data-mbb-namespace"),
        document: attrs2.get("data-mbb-document"),
        targetKind: attrs2.get("data-mbb-kind")
      };
    }
    if (!kind || attrs2.size !== 3 || attrs2.get("data-mbb-version") !== "1" || typeof identity !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}(?:,[A-Za-z][A-Za-z0-9_-]{0,63}){0,7}$/.test(identity) || kind === "xref" && identity.includes(",") || match2[2] !== "[" + identity + "]")
      return invalid();
    const keys2 = identity.split(",");
    if (new Set(keys2).size !== keys2.length) return invalid();
    return { raw: match2[0], kind, keys: keys2 };
  }
  function technicalReferenceOpening(raw) {
    return /^<span\b[^>]*(?:mbb-(?:xref|cite)|data-mbb-(?:target|keys|version))/i.test(raw);
  }
  function technicalRawHTML(html, fail2) {
    const projected = html.replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
    for (const match2 of projected.matchAll(/<span\b[^>]*>/gi))
      if (technicalReferenceOpening(match2[0]))
        technicalReference(projected.slice(match2.index), fail2, false);
  }
  function installTechnicalInline(md2, fail2) {
    md2.inline.ruler.before("html_inline", "mbb_technical_reference", (state, silent) => {
      const raw = state.src.slice(state.pos, state.posMax);
      if (!technicalReferenceOpening(raw)) return false;
      let code2 = 0;
      for (const token3 of state.tokens)
        if (token3.type === "html_inline") {
          if (/^<(?:code|pre)(?:\s|>)/i.test(token3.content)) code2++;
          else if (/^<\/(?:code|pre)\s*>/i.test(token3.content)) code2 = Math.max(0, code2 - 1);
        }
      if (code2) return false;
      const ref = technicalReference(raw, fail2, false);
      if (state.linkLevel)
        fail2("TECHNICAL_REFERENCE", "Technical references must not be inside links or images");
      if (!silent) state.push("mbb_technical_reference", "", 0).content = ref.raw;
      state.pos += ref.raw.length;
      return true;
    });
    md2.renderer.rules.mbb_technical_reference = (tokens, i) => tokens[i].content;
  }
  function validateTechnical(blocks, fail2) {
    const objects = /* @__PURE__ */ new Set(), keys2 = /* @__PURE__ */ new Set(), refs = [];
    let bibliographies = 0, count = 0;
    const walk = (list3, depth = 0, footnote = false) => {
      let seenFootnotes = false;
      for (const block2 of list3) {
        const name = block2.name || block2.blockName, a = block2.attributes || block2.attrs || {}, inner = block2.innerBlocks || block2.children || [], kind = technicalKind(name);
        if (name === "mbb/footnotes") seenFootnotes = true;
        if (kind) {
          if (++count > 2048) fail2("STRUCTURE_LIMIT", "Technical objects exceed the document budget");
          technicalAttributes(kind, a, fail2);
          if (kind !== "bibliography") {
            if (footnote)
              fail2(
                "TECHNICAL_STRUCTURE",
                "Technical objects and statements must not be inside footnotes"
              );
            objects.add(a.id);
          }
          if (kind === "object" && (inner.length !== 1 || inner[0].name !== {
            equation: "mbb/math",
            figure: "core/image",
            table: "core/table",
            listing: "mbb/code"
          }[a.kind]))
            fail2(
              "TECHNICAL_STRUCTURE",
              "An object must contain exactly one matching supported block"
            );
          if (kind === "statement" && !inner.length)
            fail2("TECHNICAL_STRUCTURE", "A statement body must not be empty");
          if (kind === "bibliography") {
            if (++bibliographies > 1 || depth || inner.length || seenFootnotes)
              fail2(
                "TECHNICAL_STRUCTURE",
                "One bibliography is allowed at top level before footnotes, without body blocks"
              );
            for (const entry2 of a.entries) keys2.add(entry2.key);
          }
        }
        for (const field of technicalFields(block2)) {
          const html = field.html;
          technicalRawHTML(html, fail2);
          const template = document.createElement("template");
          template.innerHTML = html;
          for (const node of template.content.querySelectorAll("span.mbb-xref,span.mbb-cite")) {
            if (node.closest("code,pre")) continue;
            if (node.closest("a"))
              fail2("TECHNICAL_REFERENCE", "Technical references must not be inside links or images");
            refs.push(technicalReference(node.outerHTML, fail2));
            if (refs.length > 4096)
              fail2("STRUCTURE_LIMIT", "Technical references exceed the document budget");
          }
        }
        walk(inner, depth + 1, footnote || name === "mbb/footnote");
      }
    };
    walk(blocks);
    for (const ref of refs)
      for (const key of ref.version === 2 ? [] : ref.keys)
        if (!(ref.kind === "xref" ? objects : keys2).has(key))
          fail2(
            "TECHNICAL_MISSING",
            "A technical reference has no matching object or bibliography entry"
          );
  }
  function technicalFields(block2) {
    const a = block2.attributes || {}, fields = [];
    const add2 = (path, value) => {
      if (value !== void 0 && value !== null) fields.push({ path, html: String(value) });
    };
    if (["mbb/code", "mbb/math", "core/code", "core/preformatted"].includes(block2.name))
      return fields;
    add2(["content"], a.content);
    if (block2.name === "core/html" && a.content === void 0)
      add2(["content"], block2.originalContent ?? block2.innerContent?.join(""));
    if (block2.name === "core/image") add2(["caption"], a.caption);
    if (block2.name === "core/table")
      for (const section of ["head", "body", "foot"])
        for (const [rowIndex, row] of (a[section] || []).entries())
          for (const [cellIndex, cell] of (row.cells || []).entries())
            add2([section, rowIndex, "cells", cellIndex, "content"], cell.content);
    return fields;
  }
  function referenceHTML(kind, keys2) {
    if (!["xref", "cite"].includes(kind) || !Array.isArray(keys2) || keys2.length < 1 || keys2.length > 8 || kind === "xref" && keys2.length !== 1 || keys2.some((key) => typeof key !== "string" || !technicalId.test(key)) || new Set(keys2).size !== keys2.length)
      throw Error("Reference kinds and keys must match the closed technical-writing contract");
    const identity = keys2.join(",");
    return `<span data-mbb-${kind === "xref" ? "target" : "keys"}="${identity}" data-mbb-version="1" class="mbb-${kind}">[${identity}]</span>`;
  }
  var allBlocks = (blocks) => {
    const found = [], stack = blocks.map((block2) => ({ block: block2, depth: 0 })).reverse();
    while (stack.length) {
      const { block: block2, depth } = stack.pop();
      if (depth > 32 || found.length >= 1e4)
        throw Error("Technical structure exceeds its depth or node budget");
      found.push(block2);
      for (const child of [...block2.innerBlocks || []].reverse())
        stack.push({ block: child, depth: depth + 1 });
    }
    return found;
  };
  var parsedFields = (block2) => technicalFields(block2).map((field) => {
    const template = document.createElement("template");
    template.innerHTML = field.html;
    return { ...field, root: template.content };
  });
  function technicalIndex(blocks) {
    const targets = [], entries = [], counts = {}, notes = /* @__PURE__ */ new Map(), noteOrder = [], bodyRefs = [], noteRefs = /* @__PURE__ */ new Map();
    const addRefs = (block2, refs) => {
      for (const field of parsedFields(block2)) {
        for (const node of field.root.querySelectorAll(
          "span.mbb-xref,span.mbb-cite,span.mbb-footnote-ref"
        )) {
          if (node.closest("code,pre")) continue;
          if (node.className === "mbb-footnote-ref") {
            const label = node.getAttribute("data-mbb-footnote");
            if (!noteOrder.includes(label)) noteOrder.push(label);
          } else {
            try {
              refs.push(
                technicalReference(node.outerHTML, (code2, message) => {
                  throw Error(message);
                })
              );
            } catch {
            }
          }
        }
      }
    };
    const visit = (list3, note = null) => {
      for (const block2 of list3) {
        const a = block2.attributes || {}, kind = technicalKind(block2.name);
        if (kind === "object" || kind === "statement")
          targets.push({
            id: a.id,
            kind: a.kind,
            title: a.caption ?? a.title,
            number: counts[a.kind] = (counts[a.kind] || 0) + 1,
            clientId: block2.clientId
          });
        if (kind === "bibliography")
          for (const entry2 of a.entries || [])
            entries.push({
              ...a.version === 2 ? bibliographyProjection(entry2) : entry2,
              clientId: block2.clientId
            });
        if (block2.name === "mbb/footnote") {
          notes.set(a.label, block2);
          noteRefs.set(a.label, []);
          visit(block2.innerBlocks || [], a.label);
          continue;
        }
        addRefs(block2, note === null ? bodyRefs : noteRefs.get(note));
        visit(block2.innerBlocks || [], note);
      }
    };
    visit(blocks);
    const ordered = [
      ...bodyRefs,
      ...noteOrder.flatMap((label) => noteRefs.get(label) || []),
      ...[...notes.keys()].filter((label) => !noteOrder.includes(label)).flatMap((label) => noteRefs.get(label) || [])
    ];
    const numbers = /* @__PURE__ */ new Map();
    for (const ref of ordered)
      if (ref.kind === "cite") {
        for (const key of ref.keys) if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
      }
    for (const entry2 of entries)
      if (!numbers.has(entry2.key)) numbers.set(entry2.key, numbers.size + 1);
    return {
      targets,
      entries: entries.map((entry2) => ({ ...entry2, number: numbers.get(entry2.key) }))
    };
  }
  function technicalRenamePlan(blocks, type, from, to, fail2) {
    if (!["label", "key"].includes(type) || !technicalId.test(from) || !technicalId.test(to))
      fail2(
        "TECHNICAL_ID",
        "Labels and keys must begin with an ASCII letter and contain at most 64 letters, digits, underscores or hyphens"
      );
    const list3 = allBlocks(blocks), index = technicalIndex(blocks), matches = type === "label" ? index.targets.filter((item) => item.id === from) : index.entries.filter((item) => item.key === from);
    if (matches.length !== 1)
      fail2("TECHNICAL_ID", "The original label or key is missing or duplicated");
    if (from === to) return { patches: [], affectedReferences: 0 };
    const ids = [];
    for (const block2 of list3) {
      const a = block2.attributes || {};
      if (typeof a.id === "string") ids.push(a.id);
      if (a.anchor) ids.push(a.anchor);
      for (const tab of a.tabs || []) if (tab.id) ids.push(tab.id);
      for (const field of parsedFields(block2))
        for (const node of field.root.querySelectorAll("[id]")) ids.push(node.id);
    }
    if ((type === "label" ? ids : index.entries.map((entry2) => entry2.key)).includes(to))
      fail2("TECHNICAL_ID", "The proposed label or key already exists");
    let affectedReferences = 0;
    const patches = [];
    for (const block2 of list3) {
      const attrs2 = block2.attributes || {}, patch = {};
      if (type === "label" && technicalKind(block2.name) !== null && attrs2.id === from) patch.id = to;
      if (type === "key" && block2.name === "mbb/bibliography" && attrs2.entries.some((entry2) => entry2.key === from))
        patch.entries = attrs2.entries.map(
          (entry2) => entry2.key === from ? { ...entry2, key: to } : entry2
        );
      if (patch.entries && Object.hasOwn(attrs2, "origins"))
        patch.origins = attrs2.origins.map(
          (origin) => origin.key === from ? { ...origin, key: to } : origin
        );
      for (const field of technicalFields(block2)) {
        const literalRanges = [...field.html.matchAll(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)].map(
          (m) => [m.index, m.index + m[0].length]
        );
        const replacements = [];
        for (const opening of field.html.matchAll(/<span\b[^>]*>/g)) {
          const offset = opening.index;
          if (!technicalReferenceOpening(opening[0]) || literalRanges.some(([start, end]) => offset >= start && offset < end))
            continue;
          const ref = technicalReference(field.html.slice(offset), fail2, false);
          if (ref.version === 2 || ref.kind !== (type === "label" ? "xref" : "cite") || !ref.keys.includes(from))
            continue;
          affectedReferences++;
          replacements.push({
            offset,
            length: ref.raw.length,
            html: referenceHTML(
              ref.kind,
              ref.keys.map((key) => key === from ? to : key)
            )
          });
        }
        let updated = field.html;
        for (const replacement of replacements.reverse())
          updated = updated.slice(0, replacement.offset) + replacement.html + updated.slice(replacement.offset + replacement.length);
        if (updated === field.html) continue;
        const [top, ...path] = field.path;
        if (!path.length) patch[top] = updated;
        else {
          if (!Object.hasOwn(patch, top)) patch[top] = JSON.parse(JSON.stringify(attrs2[top]));
          let target = patch[top];
          for (const part of path.slice(0, -1)) target = target[part];
          target[path.at(-1)] = updated;
        }
      }
      if (Object.keys(patch).length) patches.push({ clientId: block2.clientId, attributes: patch });
    }
    return { patches, affectedReferences };
  }
  function technicalReferenceCount(blocks, type, key) {
    let count = 0;
    for (const block2 of allBlocks(blocks))
      for (const field of parsedFields(block2))
        for (const node of field.root.querySelectorAll(
          type === "label" ? "span.mbb-xref" : "span.mbb-cite"
        )) {
          if (node.closest("code,pre")) continue;
          const ref = technicalReference(node.outerHTML, (code2, message) => {
            throw Error(message);
          });
          if (ref.version !== 2 && ref.keys.includes(key)) count++;
        }
    return count;
  }
  function technicalDiagnostics(blocks) {
    const ids = /* @__PURE__ */ new Map(), targetCounts = /* @__PURE__ */ new Map(), keyCounts = /* @__PURE__ */ new Map(), references = [], issues = [], invalidTargets = /* @__PURE__ */ new Set(), invalidKeys = /* @__PURE__ */ new Set();
    const add2 = (code2, identity = "", clientId = null) => {
      if (issues.length < 32 && !issues.some((i) => i.code === code2 && i.identity === identity))
        issues.push({ code: code2, identity, clientId });
    };
    const count = (map2, key) => {
      if (typeof key === "string") map2.set(key, (map2.get(key) || 0) + 1);
    };
    for (const block2 of allBlocks(blocks)) {
      const a = block2.attributes || {}, kind = technicalKind(block2.name);
      if (typeof a.id === "string") count(ids, a.id);
      count(ids, a.anchor);
      for (const tab of a.tabs || []) count(ids, tab.id);
      if (kind === "object" || kind === "statement") count(targetCounts, a.id);
      if (kind === "bibliography") for (const entry2 of a.entries || []) count(keyCounts, entry2.key);
      if (kind) {
        try {
          technicalAttributes(kind, a, (code2, message) => {
            throw Error(message);
          });
        } catch {
          add2("attributes", a.id, block2.clientId);
          if (kind === "bibliography")
            for (const entry2 of a.entries || []) invalidKeys.add(entry2.key);
          else invalidTargets.add(a.id);
        }
      }
      if (kind === "object" && ((block2.innerBlocks || []).length !== 1 || block2.innerBlocks[0].name !== { equation: "mbb/math", figure: "core/image", table: "core/table", listing: "mbb/code" }[a.kind])) {
        add2("object-body", a.id, block2.clientId);
        invalidTargets.add(a.id);
      }
      if (kind === "statement" && !(block2.innerBlocks || []).length) {
        add2("statement-body", a.id, block2.clientId);
        invalidTargets.add(a.id);
      }
      for (const field of parsedFields(block2)) {
        for (const node of field.root.querySelectorAll("[id]")) count(ids, node.id);
        for (const node of field.root.querySelectorAll("span.mbb-xref,span.mbb-cite")) {
          if (node.closest("code,pre")) continue;
          try {
            references.push({
              ...technicalReference(node.outerHTML, (code2, message) => {
                throw Error(message);
              }),
              clientId: block2.clientId
            });
          } catch {
            add2("reference-marker", "", block2.clientId);
          }
        }
      }
    }
    for (const [id2, count2] of ids)
      if (count2 > 1)
        add2(
          "duplicate-id",
          id2,
          allBlocks(blocks).find((b) => b.attributes?.id === id2 || b.attributes?.anchor === id2)?.clientId
        );
    for (const [key, count2] of keyCounts) if (count2 > 1) add2("duplicate-key", key);
    for (const ref of references)
      for (const key of ref.version === 2 ? [] : ref.keys)
        if (!(ref.kind === "xref" ? targetCounts : keyCounts).has(key))
          add2(ref.kind === "xref" ? "missing-target" : "missing-key", key, ref.clientId);
    return {
      issues,
      validTargets: [...targetCounts.keys()].filter(
        (id2) => technicalId.test(id2) && ids.get(id2) === 1 && !invalidTargets.has(id2)
      ),
      validKeys: [...keyCounts.keys()].filter(
        (key) => technicalId.test(key) && keyCounts.get(key) === 1 && !invalidKeys.has(key)
      )
    };
  }
  function technicalReferenceSelection(value, kind, identity) {
    referenceHTML(kind, identity.split(","));
    const candidates = [
      ...value.text.matchAll(/\[[A-Za-z][A-Za-z0-9_-]{0,63}(?:,[A-Za-z][A-Za-z0-9_-]{0,63}){0,7}\]/g)
    ].filter((match3) => {
      const start = match3.index, end = start + match3[0].length;
      if (match3[0] !== "[" + identity + "]" || value.start < start || value.end > end) return false;
      for (let i = start; i < end; i++)
        if (!value.formats[i]?.some(
          (format3) => format3.type === "mbb/" + kind && format3.attributes?.identity === identity
        ))
          return false;
      return true;
    });
    const match2 = candidates.find((match3) => value.start < match3.index + match3[0].length) || candidates[0];
    if (!match2) throw Error("Select one reference marker before changing its target");
    return { start: match2.index, end: match2.index + match2[0].length };
  }

  // src/activity-copy.js
  function cloneActivity(block2, identity, create, fail2) {
    if (block2?.name !== "mbb/component" || block2.attributes?.version !== 2)
      fail2(
        "ACTIVITY_RELATION",
        "Activity relations require a closed map of unique local static targets"
      );
    const prefix = "activity-" + [...crypto.getRandomValues(new Uint8Array(12))].map((n) => n.toString(16).padStart(2, "0")).join(""), mapping = /* @__PURE__ */ new Map(), referenceKinds = /* @__PURE__ */ new Map(), list3 = [];
    const visit = (b) => {
      list3.push(b);
      for (const c of b.innerBlocks || []) visit(c);
    };
    visit(block2);
    const own2 = (id2) => {
      if (typeof id2 === "string" && !mapping.has(id2)) mapping.set(id2, prefix + "-" + mapping.size);
    };
    for (const b of list3) {
      const kind = b.name === "mbb/object" ? b.attributes.kind : b.name === "mbb/statement" ? "statement" : b.name === "mbb/step" ? "step" : b.name === "mbb/component" && b.attributes.version === 2 ? "activity" : null;
      if (kind) referenceKinds.set(b.attributes.id, kind);
      own2(b.attributes.id);
      own2(b.attributes.anchor);
      for (const tab of b.attributes.tabs || []) own2(tab.id);
      for (const f of technicalFields(b)) {
        const doc = document.createElement("template");
        doc.innerHTML = f.html;
        for (const node of doc.content.querySelectorAll("[id]"))
          if (!node.closest("pre,code")) own2(node.id);
      }
    }
    const rewrite = (html) => {
      const literals = [...html.matchAll(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)].map((m) => [
        m.index,
        m.index + m[0].length
      ]);
      return html.replace(/<span\b[^>]*>\[[^<>]*\]<\/span>|<[A-Za-z][^>]*>/g, (raw, offset) => {
        if (literals.some(([a, b]) => offset >= a && offset < b)) return raw;
        if (raw.startsWith("<span") && raw.includes("mbb-xref")) {
          let ref;
          try {
            ref = technicalReference(raw, fail2);
          } catch {
            return raw;
          }
          if (ref.kind === "xref" && mapping.has(ref.keys[0]) && referenceKinds.has(ref.keys[0]) && (ref.version !== 2 || ref.namespace === identity?.namespace && ref.document === identity?.document && ref.targetKind === referenceKinds.get(ref.keys[0]))) {
            const from = ref.keys[0], to = mapping.get(from);
            return raw.replace('data-mbb-target="' + from + '"', 'data-mbb-target="' + to + '"').replace(">[" + from + "]<", ">[" + to + "]<");
          }
          return raw;
        }
        return raw.replace(
          /\b(id|href|aria-labelledby|aria-describedby|aria-controls|headers)="([^"]*)"/g,
          (match2, key, value) => {
            let fragment2;
            if (key === "href" && value.startsWith("#")) {
              try {
                fragment2 = decodeURIComponent(value.slice(1));
              } catch {
              }
            }
            const next = key === "href" ? mapping.has(fragment2) ? "#" + mapping.get(fragment2) : value : value.split(/\s+/).map((id2) => mapping.get(id2) || id2).join(" ");
            return next === value ? match2 : key + '="' + next + '"';
          }
        );
      });
    };
    const copy = (b) => {
      const a = JSON.parse(JSON.stringify(b.attributes));
      if (mapping.has(a.id)) a.id = mapping.get(a.id);
      if (mapping.has(a.anchor)) a.anchor = mapping.get(a.anchor);
      for (const tab of a.tabs || []) tab.id = mapping.get(tab.id) || tab.id;
      if (b.name === "mbb/code-tabs") a.defaultTab = mapping.get(a.defaultTab) || a.defaultTab;
      if (a.activity) {
        const r = a.activity;
        r.prompt = mapping.get(r.prompt);
        r.explanation = mapping.get(r.explanation);
        r.hints = r.hints.map((id2) => mapping.get(id2));
        r.options = r.options.map((o) => ({ ...o, target: mapping.get(o.target) }));
        for (const key of ["correct", "incorrect"]) r.feedback[key] = mapping.get(r.feedback[key]);
      }
      for (const f of technicalFields(b)) {
        let target = a;
        for (const key of f.path.slice(0, -1)) target = target[key];
        target[f.path.at(-1)] = rewrite(f.html);
      }
      return create(b.name, a, (b.innerBlocks || []).map(copy));
    };
    return copy(block2);
  }

  // src/activities.js
  var object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  var closed = (v, keys2) => object(v) && Object.keys(v).length === keys2.length && keys2.every((k) => Object.hasOwn(v, k));
  var id = (v) => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v);
  function activityRelations(value, fail2) {
    const bad3 = () => fail2(
      "ACTIVITY_RELATION",
      "Activity relations require a closed map of unique local static targets"
    );
    if (!closed(value, ["schema", "prompt", "options", "hints", "feedback", "explanation"]) || value.schema !== 1 || !id(value.prompt) || !id(value.explanation) || !Array.isArray(value.options) || value.options.length > 8 || !Array.isArray(value.hints) || value.hints.length > 3 || !value.hints.every(id) || !closed(value.feedback, ["correct", "incorrect"]) || !id(value.feedback.correct) || !id(value.feedback.incorrect))
      bad3();
    const keys2 = /* @__PURE__ */ new Set();
    for (const option of value.options) {
      if (!closed(option, ["key", "target"]) || typeof option.key !== "string" || !/^[a-z][a-z0-9_-]{0,15}$/.test(option.key) || keys2.has(option.key) || !id(option.target))
        bad3();
      keys2.add(option.key);
    }
    const targets = [
      value.prompt,
      ...value.options.map((o) => o.target),
      ...value.hints,
      value.feedback.correct,
      value.feedback.incorrect,
      value.explanation
    ];
    if (new Set(targets).size !== targets.length) bad3();
    return targets;
  }
  function activityParts(block2) {
    const parts = /* @__PURE__ */ new Map();
    const visit = (list3) => {
      for (const child of list3 || []) {
        if ((child.name || child.blockName) === "mbb/component") continue;
        if ((child.name || child.blockName) === "mbb/collapse")
          parts.set((child.attributes || child.attrs).id, child);
        visit(child.innerBlocks);
      }
    };
    visit(block2.innerBlocks);
    return parts;
  }
  function validateActivity(block2, fail2) {
    const a = block2.attributes || block2.attrs;
    if (a?.version !== 2 || (block2.name || block2.blockName) !== "mbb/component") return;
    const targets = activityRelations(a.activity, fail2), parts = activityParts(block2), direct = new Map(
      (block2.innerBlocks || []).filter((b) => (b.name || b.blockName) === "mbb/collapse").map((b) => [(b.attributes || b.attrs).id, b])
    );
    if (targets.some((target) => !parts.has(target)) || [a.activity.prompt, ...a.activity.options.map((o) => o.target)].some(
      (target) => !direct.has(target) || (direct.get(target).attributes || direct.get(target).attrs).open !== true
    ))
      fail2(
        "ACTIVITY_TARGET",
        "Activity targets must exist within their own component; prompts and options must be direct open static parts"
      );
  }

  // src/i18n.js
  var translate = (message) => globalThis.MBBI18n?.t(message) ?? globalThis.wp?.i18n?.__(message, "markbridge") ?? message;
  var format = (message, ...values) => {
    let next = 0;
    return String(message).replace(/%%|%(?:(\d+)\$)?([sd])/g, (token3, index, kind) => {
      if (token3 === "%%") return "%";
      const value = values[index ? Number(index) - 1 : next++];
      return kind === "d" ? String(Number(value)) : String(value ?? "");
    });
  };
  var translateError = (error3) => globalThis.MBBI18n?.error(error3) ?? translate(error3.message);

  // plugin/writing-patterns.json
  var writing_patterns_default = [
    {
      id: "tutorial",
      title: "Technical tutorial",
      source: "# Tutorial\n\n## Goal\n\nDescribe the goal and prerequisites.\n\n## Explanation\n\nExplain the idea and assumptions.\n\n$$\nx^2 + y^2 = z^2\n$$\n\n## Example\n\n```python\nprint(1)\n```\n\n## Review\n\nExplain the result and check a boundary case.\n",
      content: '<!-- wp:heading {"level":1} --><h1 class="wp-block-heading">Tutorial</h1><!-- /wp:heading -->\n\n<!-- wp:heading --><h2 class="wp-block-heading">Goal</h2><!-- /wp:heading -->\n\n<!-- wp:paragraph --><p>Describe the goal and prerequisites.</p><!-- /wp:paragraph -->\n\n<!-- wp:heading --><h2 class="wp-block-heading">Explanation</h2><!-- /wp:heading -->\n\n<!-- wp:paragraph --><p>Explain the idea and assumptions.</p><!-- /wp:paragraph -->\n\n<!-- wp:mbb/math {"tex":"x^2 + y^2 = z^2"} -->\n<pre class="wp-block-mbb-math"><code class="mbb-tex">x^2 + y^2 = z^2</code></pre>\n<!-- /wp:mbb/math -->\n\n<!-- wp:heading --><h2 class="wp-block-heading">Example</h2><!-- /wp:heading -->\n\n<!-- wp:mbb/code {"language":"python","code":"print(1)\\n"} --><pre class="wp-block-mbb-code"><code class="language-python">print(1)\n</code></pre><!-- /wp:mbb/code -->\n\n<!-- wp:heading --><h2 class="wp-block-heading">Review</h2><!-- /wp:heading -->\n\n<!-- wp:paragraph --><p>Explain the result and check a boundary case.</p><!-- /wp:paragraph -->'
    },
    {
      id: "paper-notes",
      title: "Paper notes",
      source: "# Paper notes\n\n## Question\n\nDescribe the research question.\n\n## Method\n\nExplain assumptions and evidence.\n\n## Findings\n\nSummarize the findings in your own words.\n\n## Limitations\n\nRecord limitations and follow-up questions.\n",
      content: '<!-- wp:heading {"level":1} --><h1 class="wp-block-heading">Paper notes</h1><!-- /wp:heading -->\n\n<!-- wp:heading --><h2 class="wp-block-heading">Question</h2><!-- /wp:heading -->\n\n<!-- wp:paragraph --><p>Describe the research question.</p><!-- /wp:paragraph -->\n\n<!-- wp:heading --><h2 class="wp-block-heading">Method</h2><!-- /wp:heading -->\n\n<!-- wp:paragraph --><p>Explain assumptions and evidence.</p><!-- /wp:paragraph -->\n\n<!-- wp:heading --><h2 class="wp-block-heading">Findings</h2><!-- /wp:heading -->\n\n<!-- wp:paragraph --><p>Summarize the findings in your own words.</p><!-- /wp:paragraph -->\n\n<!-- wp:heading --><h2 class="wp-block-heading">Limitations</h2><!-- /wp:heading -->\n\n<!-- wp:paragraph --><p>Record limitations and follow-up questions.</p><!-- /wp:paragraph -->'
    },
    {
      id: "lesson",
      title: "Question, hint, derivation and experiment",
      source: ':::mbb:v1 collapse {"id":"{{instance}}-question","title":"Question","open":true}\n\nState the problem and input constraints.\n\n:::mbb:v1 collapse {"id":"{{instance}}-hint","title":"Hint","open":false}\n\nGive a hint without disclosing the result.\n\n:::mbb:end\n\n:::mbb:end\n\n:::mbb:v1 collapse {"id":"{{instance}}-derivation","title":"Derivation","open":true}\n\n:::mbb:v1 statement {"id":"{{instance}}-claim","kind":"definition","title":"Goal","open":true}\n\nExplain the reasoning and a boundary case.\n\n:::mbb:end\n\n:::mbb:v1 object {"id":"{{instance}}-equation","kind":"equation","caption":"Invariant"}\n\n$$\nx^2 + y^2 = z^2\n$$\n\n:::mbb:end\n\nSee <span class="mbb-xref" data-mbb-target="{{instance}}-equation" data-mbb-version="1">[{{instance}}-equation]</span>.\n\n:::mbb:end\n\n:::mbb:v1 collapse {"id":"{{instance}}-experiment","title":"Experiment","open":true}\n\n```javascript\nconsole.log(1);\n```\n\nKeep the explanation readable without an interactive extension.\n\n:::mbb:end\n\n',
      content: '<!-- wp:mbb/writing-pattern {"pattern":"lesson"} /-->',
      instantiate: true
    }
  ];

  // src/writing-tools.js
  function markdownSnippet(text3) {
    if (typeof text3 !== "string" || new TextEncoder().encode(text3).length > 65536 || text3.includes("\0"))
      return null;
    const value = text3.replace(/\r\n?/g, "\n").trim();
    const lines = value.split("\n");
    if (lines.length >= 3 && /^\$\$$/.test(lines[0]) && lines.at(-1) === "$$" && lines.slice(1, -1).every((line) => line !== "$$") && /[A-Za-z\\]/.test(lines.slice(1, -1).join("\n")))
      return { kind: "math", source: text3 };
    const fence3 = /^(\`{3,}|~{3,})([A-Za-z0-9_+.-]*)$/.exec(lines[0]);
    if (fence3 && lines.length >= 3 && lines.at(-1) === fence3[1] && !lines.slice(1, -1).some((line) => new RegExp("^" + fence3[1][0] + "{" + fence3[1].length + ",}\\s*$").test(line)))
      return { kind: "code", source: text3 };
    if (lines.length >= 2 && lines.every((line) => /^(?:[-+*] |\d{1,9}\. )\S/.test(line)))
      return { kind: "list", source: text3 };
    return null;
  }
  var writingPatterns = writing_patterns_default;
  function instantiateWritingPattern(id2, instance = null) {
    const pattern = writing_patterns_default.find((p) => p.id === id2);
    if (!pattern) throw Error("Unknown writing pattern");
    if (!pattern.instantiate) return pattern.source;
    instance ||= "pattern-" + [...crypto.getRandomValues(new Uint8Array(12))].map((n) => n.toString(16).padStart(2, "0")).join("");
    if (!/^[A-Za-z][A-Za-z0-9_-]{2,39}$/.test(instance))
      throw Error("Invalid writing pattern instance");
    return pattern.source.replaceAll("{{instance}}", instance);
  }
  function registerWritingPatterns(toBlocks2) {
    const name = "mbb/writing-pattern";
    if (wp.blocks.getBlockType(name)) return;
    wp.blocks.registerBlockType(name, {
      apiVersion: 3,
      title: translate("Writing pattern"),
      category: "text",
      attributes: { pattern: { type: "string" } },
      supports: { inserter: false, html: false, reusable: false },
      edit({ attributes, clientId }) {
        const registry2 = wp.data.useRegistry(), initialized = wp.element.useRef(false);
        wp.element.useEffect(() => {
          if (initialized.current) return;
          const current = registry2.select("core/block-editor").getBlock(clientId);
          if (!current || current.name !== name) return;
          initialized.current = true;
          try {
            const blocks = toBlocks2(instantiateWritingPattern(attributes.pattern));
            const dispatch = registry2.dispatch("core/block-editor");
            dispatch.__unstableMarkNextChangeAsNotPersistent();
            dispatch.replaceBlocks(clientId, blocks);
          } catch {
            initialized.current = false;
          }
        }, [clientId, attributes.pattern, registry2]);
        return wp.element.createElement(
          "p",
          wp.blockEditor.useBlockProps(),
          translate("Preparing writing pattern\u2026")
        );
      },
      save() {
        return null;
      }
    });
  }
  function writingIndex(blocks) {
    const items = [];
    const visit = (list3, path = []) => list3.forEach((block2, n) => {
      const a = block2.attributes || {}, p = [...path, n];
      const category = block2.name === "mbb/component" && a.version === 2 ? "activity" : block2.name === "mbb/math" ? "math" : block2.name === "core/image" || block2.name === "mbb/gallery" ? "figure" : block2.name === "core/table" ? "table" : block2.name === "mbb/statement" ? "statement" : block2.name === "mbb/bibliography" ? "bibliography" : block2.name === "mbb/object" ? a.kind : [
        "mbb/component",
        "mbb/steps",
        "mbb/step",
        "mbb/collapse",
        "mbb/code-tabs",
        "mbb/code-compare"
      ].includes(block2.name) ? "teaching" : null;
      if (category)
        items.push({
          category,
          clientId: block2.clientId,
          path: p,
          id: a.id || "",
          title: a.activity ? activityParts(block2).get(a.activity.prompt)?.attributes.title || a.id : a.title || a.caption || a.tex || a.component || "",
          ...block2.name === "mbb/component" ? {
            component: a.component,
            componentVersion: a.componentVersion,
            activity: a.activity,
            parts: [...activityParts(block2)].map(([id2, b]) => ({
              id: id2,
              title: b.attributes.title,
              clientId: b.clientId
            }))
          } : {},
          name: block2.name,
          renameType: ["mbb/object", "mbb/statement"].includes(block2.name) ? "label" : null
        });
      if (block2.name === "mbb/bibliography")
        for (const entry2 of a.entries || [])
          items.push({
            category: "bibliography",
            clientId: block2.clientId,
            path: p,
            id: entry2.key,
            title: entry2.title,
            name: block2.name,
            renameType: "key"
          });
      visit(block2.innerBlocks || [], p);
    });
    visit(blocks);
    return items;
  }
  function writingAdvice(blocks) {
    const issues = [];
    const visit = (list3) => list3.forEach((block2) => {
      const a = block2.attributes || {};
      if (block2.name === "mbb/component" && a.version === 2) {
        try {
          validateActivity(block2, (code2, message) => {
            throw Error(translate(message));
          });
        } catch (error3) {
          issues.push({ severity: "error", clientId: block2.clientId, message: error3.message });
        }
      }
      if (block2.name === "core/image" && !String(a.alt || "").trim())
        issues.push({
          severity: "advice",
          clientId: block2.clientId,
          message: translate(
            "Image alternative text is empty. Review whether the image needs an explanation."
          )
        });
      if (block2.name === "mbb/component" && !(block2.innerBlocks || []).length)
        issues.push({
          severity: "error",
          clientId: block2.clientId,
          message: translate("The teaching component needs static content before saving.")
        });
      visit(block2.innerBlocks || []);
    });
    visit(blocks);
    return issues.slice(0, 64);
  }

  // src/native-media.js
  var mediaKinds = /* @__PURE__ */ new Set(["image", "gallery"]);
  var error = (fail2, code2, message) => fail2(code2, message);
  function mediaCaption(value, fail2) {
    if (typeof value !== "string" || new TextEncoder().encode(value).length > 4096 || /[\x00\r\n\uD800-\uDFFF]/u.test(value))
      error(fail2, "MEDIA_CAPTION", "Media captions require bounded single-line safe inline content");
    const root = document.createElement("template");
    root.innerHTML = value;
    const walk = (node, depth = 0) => {
      if (depth > 16) error(fail2, "MEDIA_CAPTION", "Media captions exceed their structure budget");
      if (node.nodeType === 3) return;
      if (node.nodeType !== 1 || !["strong", "em", "del", "code", "br"].includes(node.localName) || node.attributes.length)
        error(
          fail2,
          "MEDIA_CAPTION",
          "Media captions only support text, strong, emphasis, deletion, code and line breaks"
        );
      for (const child of node.childNodes) walk(child, depth + 1);
    };
    for (const node of root.content.childNodes) walk(node);
    const normalize3 = (s) => s.replace(/<br\s*\/?\s*>/g, "<br>");
    if (normalize3(root.innerHTML) !== normalize3(value))
      error(fail2, "MEDIA_CAPTION", "Media caption HTML must be canonical and balanced");
    return value;
  }
  function mediaAttributes(kind, input, fail2, source = true) {
    if (!input || typeof input !== "object" || Array.isArray(input))
      error(fail2, "MEDIA_ATTRIBUTES", "Native media attributes must be a closed object");
    if (!source && kind === "gallery" && input.linkTo === "none") {
      input = { ...input };
      delete input.linkTo;
    }
    const allowed = kind === "image" ? ["caption", "id", "sizeSlug", "linkDestination"] : ["columns", "imageCrop"];
    if (Object.keys(input).some((k) => !allowed.includes(k)))
      error(fail2, "MEDIA_ATTRIBUTES", "Unsupported native media attribute");
    const a = {};
    for (const key of allowed) if (Object.hasOwn(input, key)) a[key] = input[key];
    if (kind === "image") {
      if (Object.hasOwn(a, "caption")) mediaCaption(a.caption, fail2);
      if (Object.hasOwn(a, "id") && (!Number.isSafeInteger(a.id) || a.id < 1))
        error(fail2, "MEDIA_ID", "Media attachment IDs must be positive safe integers");
      if (Object.hasOwn(a, "sizeSlug") && !["thumbnail", "medium", "large", "full"].includes(a.sizeSlug))
        error(fail2, "MEDIA_ATTRIBUTES", "Unsupported native image size");
      if (Object.hasOwn(a, "linkDestination") && a.linkDestination !== "none")
        error(fail2, "MEDIA_LINK", "Only unlinked native images are supported in this version");
    } else {
      if (Object.hasOwn(a, "columns") && (!Number.isInteger(a.columns) || a.columns < 1 || a.columns > 8))
        error(fail2, "MEDIA_ATTRIBUTES", "Gallery columns must be an integer from 1 to 8");
      if (Object.hasOwn(a, "imageCrop") && typeof a.imageCrop !== "boolean")
        error(fail2, "MEDIA_ATTRIBUTES", "Gallery imageCrop must be a boolean");
    }
    if (kind === "image" && a.caption === "") delete a.caption;
    return a;
  }
  function mediaImageAttributes(input, fail2) {
    const a = { ...input };
    if (a.isDecorative === false) delete a.isDecorative;
    for (const key of ["url", "alt", "title"]) delete a[key];
    if (a.caption !== void 0 && typeof a.caption !== "string") a.caption = String(a.caption);
    return mediaAttributes("image", a, fail2, false);
  }
  function mediaGalleryAttributes(input, fail2) {
    const a = { ...input }, defaults2 = {
      caption: "",
      images: [],
      ids: [],
      shortCodeTransforms: [],
      navigationButtonType: "icon",
      randomOrder: false,
      fixedHeight: true,
      sizeSlug: "large",
      allowResize: false,
      aspectRatio: "auto"
    };
    for (const [key, value] of Object.entries(defaults2))
      if (JSON.stringify(a[key]) === JSON.stringify(value)) delete a[key];
    if (a.imageCrop === true) delete a.imageCrop;
    return mediaAttributes("gallery", a, fail2, false);
  }
  function assembleMedia(item, make2, fail2) {
    const a = mediaAttributes(item.kind, item.attrs, fail2);
    if (item.kind === "image") {
      if (item.children.length !== 1 || item.children[0].name !== "core/image" || item.children[0].innerBlocks?.length || Object.keys(mediaImageAttributes(item.children[0].attributes, fail2)).length)
        error(
          fail2,
          "MEDIA_STRUCTURE",
          "An image directive requires exactly one ordinary Markdown image"
        );
      return make2("core/image", { ...item.children[0].attributes, ...a });
    }
    if (!item.children.length || item.children.length > 32 || item.children.some((b) => b.name !== "core/image"))
      error(fail2, "MEDIA_STRUCTURE", "A gallery requires 1 to 32 direct native images");
    return make2("core/gallery", a, item.children);
  }
  function validateMedia(blocks, fail2, portable = false) {
    let budget = 0;
    const walk = (list3, depth = 0) => {
      if (depth > 32)
        error(fail2, "MEDIA_STRUCTURE", "Native media exceeds the document structure budget");
      for (const b of list3) {
        if (++budget > 1e4)
          error(fail2, "MEDIA_STRUCTURE", "Native media exceeds the document structure budget");
        if (b.name === "core/footnotes")
          error(
            fail2,
            "NATIVE_FOOTNOTES",
            "Native footnotes require external post metadata and cannot be converted losslessly"
          );
        if (b.name === "core/image") {
          const a = mediaImageAttributes(b.attributes || {}, fail2);
          if ((b.innerBlocks || []).length)
            error(fail2, "MEDIA_STRUCTURE", "Native image blocks cannot contain child blocks");
          if (portable && a.id)
            error(fail2, "MEDIA_LOCAL_ID", "Portable exports cannot carry local media attachment IDs");
        }
        if (b.name === "core/gallery") {
          mediaGalleryAttributes(b.attributes || {}, fail2);
          const inner = b.innerBlocks || [];
          if (!inner.length || inner.length > 32 || inner.some((c) => c.name !== "core/image"))
            error(fail2, "MEDIA_STRUCTURE", "A gallery requires 1 to 32 direct native images");
        }
        walk(b.innerBlocks || [], depth + 1);
      }
    };
    walk(blocks);
  }
  function validateMediaSerialized(serialized, fail2) {
    for (const m of serialized.matchAll(/<!-- wp:(image|gallery)(?: (\{[\s\S]*?\}))? -->/g)) {
      let attrs2;
      try {
        attrs2 = JSON.parse(m[2] || "{}");
      } catch {
        error(fail2, "MEDIA_ATTRIBUTES", "Native media attributes must be a closed object");
      }
      mediaAttributes(m[1], attrs2, fail2, false);
    }
    if (/<!-- wp:footnotes(?:\s|\/)/.test(serialized))
      error(
        fail2,
        "NATIVE_FOOTNOTES",
        "Native footnotes require external post metadata and cannot be converted losslessly"
      );
  }
  function mediaDirective(kind, attrs2, body) {
    return ":::mbb:v1 " + kind + " " + JSON.stringify(attrs2) + "\n\n" + body.trimEnd() + "\n\n:::mbb:end";
  }

  // src/source-navigation.js
  var NATIVE = {
    "native-code": "core/code",
    preformatted: "core/preformatted",
    group: "core/group",
    columns: "core/columns",
    column: "core/column",
    image: "core/image",
    gallery: "core/gallery",
    details: "core/details",
    buttons: "core/buttons",
    button: "core/button"
  };
  var NAMES = {
    paragraph: ["core/paragraph"],
    heading: ["core/heading"],
    code: ["mbb/code"],
    math: ["mbb/math"],
    quote: ["core/quote"],
    list: ["core/list", "mbb/list"],
    separator: ["core/separator"],
    frontmatter: ["mbb/frontmatter"]
  };
  var blank = (line) => /^[ \t]*$/.test(line);
  var fence = (line) => /^ {0,3}(`{3,}|~{3,})[^\r\n]*$/.exec(line);
  var heading = (line) => /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line);
  var list = (line) => /^ {0,3}(?:[-+*][ \t]+|\d{1,9}[.)][ \t]+)/.test(line);
  var quote = (line) => /^ {0,3}>/.test(line);
  var definition = (line) => /^ {0,3}\[\^([^\]\r\n]+)\]:/.exec(line);
  var directive = (line) => /^:::mbb:v[12] ([a-z-]+) (\{.*\})$/.exec(line);
  var separator = (line) => /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
  var setext = (line) => /^ {0,3}(?:=+|-+)[ \t]*$/.test(line);
  var ownMath = (line) => /^[ \t]*\$\$[ \t]*$/.test(line);
  var boundary = (line) => blank(line) || !!fence(line) || heading(line) || list(line) || quote(line) || !!definition(line) || !!directive(line) || line === ":::mbb:end" || separator(line) || ownMath(line) || /^ {0,3}</.test(line);
  function paragraphKinds(text3) {
    const marks = [];
    let ticks = 0;
    for (let i = 0; i < text3.length; i++) {
      if (text3[i] === "\\" && !ticks) {
        i++;
        continue;
      }
      if (text3[i] === "`") {
        let count = 1;
        while (text3[i + count] === "`") count++;
        if (!ticks) ticks = count;
        else if (ticks === count) ticks = 0;
        i += count - 1;
        continue;
      }
      if (!ticks && text3.slice(i, i + 2) === "$$") {
        marks.push(i);
        i++;
      }
    }
    if (!marks.length) return ["paragraph"];
    if (marks.length % 2) return ["unknown"];
    const kinds2 = [];
    let cursor = 0;
    for (let i = 0; i < marks.length; i += 2) {
      if (text3.slice(cursor, marks[i]).trim()) kinds2.push("paragraph");
      kinds2.push("math");
      cursor = marks[i + 1] + 2;
    }
    if (text3.slice(cursor).trim()) kinds2.push("paragraph");
    return kinds2;
  }
  function sourceNavigation(source, blocks) {
    const result = { schema: 1, offsetUnit: "utf16", ranges: [], unmapped: [] };
    if (typeof source !== "string" || new TextEncoder().encode(source).length > 262144 || /[\uD800-\uDFFF\0]/u.test(source) || !Array.isArray(blocks)) {
      result.unmapped.push({ blockPath: [], reason: "invalid-input" });
      return result;
    }
    const lines = [];
    let offset = 0;
    for (const raw of source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || []) {
      if (!raw) continue;
      lines.push({ text: raw.replace(/[\r\n]+$/, ""), start: offset, end: offset + raw.length });
      offset += raw.length;
    }
    const definitions = /* @__PURE__ */ new Map();
    let duplicateDefinition = false;
    let unsupportedSyntax = false;
    const unit = (kind, start, end, extra = {}) => ({
      kind,
      start: lines[start].start,
      end: lines[end - 1].end,
      startLine: start + 1,
      endLine: end,
      precision: ["quote", "list", "teaching"].includes(kind) ? "coarse" : "exact",
      ...extra
    });
    function scan(from, until, depth = 0) {
      const units2 = [];
      if (depth > 32) return [{ kind: "unknown" }];
      let i = from;
      while (i < until) {
        const line = lines[i].text;
        if (blank(line)) {
          i++;
          continue;
        }
        const start = i, f = fence(line), d = directive(line), note = definition(line);
        if (i === 0 && line === "---" && lines[i + 1]?.text === "markbridge: 1") {
          i += 2;
          while (i < until && lines[i].text !== "---") i++;
          if (i === until) {
            units2.push(unit("unknown", start, i));
            break;
          }
          units2.push(unit("frontmatter", start, ++i));
          continue;
        }
        if (f) {
          i++;
          const close = new RegExp("^ {0,3}" + f[1][0] + "{" + f[1].length + ",}[ \\t]*$");
          while (i < until && !close.test(lines[i].text)) i++;
          units2.push(unit(i < until ? "code" : "unknown", start, i < until ? ++i : i));
          continue;
        }
        if (d) {
          let attrs2;
          try {
            attrs2 = JSON.parse(d[2]);
          } catch {
            attrs2 = {};
          }
          i++;
          let level = 1;
          while (i < until && level) {
            const nestedFence = fence(lines[i].text);
            if (nestedFence) {
              const close = new RegExp(
                "^ {0,3}" + nestedFence[1][0] + "{" + nestedFence[1].length + ",}[ \\t]*$"
              );
              i++;
              while (i < until && !close.test(lines[i].text)) i++;
              if (i < until) i++;
              continue;
            }
            if (directive(lines[i].text)) level++;
            if (lines[i].text === ":::mbb:end") level--;
            if (level) i++;
          }
          if (i === until) {
            units2.push(unit("unknown", start, i));
            break;
          }
          const children = scan(start + 1, i, depth + 1);
          units2.push(
            unit("teaching", start, ++i, {
              teachingKind: d[1],
              stableId: attrs2.id,
              anchor: attrs2.anchor,
              children
            })
          );
          continue;
        }
        if (note) {
          i++;
          while (i < until && (/^(?: {4}|\t)/.test(lines[i].text) || blank(lines[i].text) && i + 1 < until && /^(?: {4}|\t)/.test(lines[i + 1].text)))
            i++;
          if (i < until && !boundary(lines[i].text)) unsupportedSyntax = true;
          if (definitions.has(note[1])) duplicateDefinition = true;
          definitions.set(note[1], unit("footnote", start, i));
          continue;
        }
        if (ownMath(line)) {
          i++;
          while (i < until && !ownMath(lines[i].text)) i++;
          units2.push(unit(i < until ? "math" : "unknown", start, i < until ? ++i : i));
          continue;
        }
        if (heading(line)) {
          units2.push(unit("heading", start, ++i));
          continue;
        }
        if (separator(line)) {
          units2.push(unit("separator", start, ++i));
          continue;
        }
        if (quote(line) || list(line)) {
          const kind = quote(line) ? "quote" : "list";
          i++;
          while (i < until) {
            const next = lines[i].text;
            if (kind === "quote") {
              if (!quote(next)) break;
            } else if (blank(next)) {
              if (i + 1 >= until || !list(lines[i + 1].text) && !/^[ \t]+\S/.test(lines[i + 1].text))
                break;
            } else if (!list(next) && !/^[ \t]+/.test(next) && boundary(next)) break;
            i++;
          }
          units2.push(unit(kind, start, i));
          continue;
        }
        if (/^ {0,3}</.test(line) || /^ {4}\S|^\t\S/.test(line) || line === ":::mbb:end") {
          i++;
          while (i < until && !blank(lines[i].text)) i++;
          units2.push(unit("unknown", start, i));
          continue;
        }
        i++;
        if (i < until && setext(lines[i].text)) {
          units2.push(unit("heading", start, ++i));
          continue;
        }
        while (i < until && !boundary(lines[i].text)) i++;
        const span = unit("paragraph", start, i);
        const kinds2 = paragraphKinds(source.slice(span.start, span.end));
        for (const kind of kinds2)
          units2.push({ ...span, kind, precision: kinds2.length > 1 ? "coarse" : span.precision });
      }
      return units2;
    }
    const syntax = scan(0, lines.length);
    let normalizedCount = 0;
    const normalize3 = (items, depth = 0) => {
      if (depth > 32) throw Error("limit");
      return items.filter(
        (b) => b && (b.name || b.blockName || !/^[ \t\r\n]*$/.test(String(b.innerHTML || "")))
      ).map((b) => {
        if (++normalizedCount > 1e4 || !(b.name || b.blockName)) throw Error("shape");
        return {
          name: b.name || b.blockName || "",
          attrs: b.attributes || b.attrs || {},
          children: normalize3(b.innerBlocks || b.children || [], depth + 1)
        };
      });
    };
    let count = 0;
    const recordUnmapped = (path, reason) => {
      if (result.unmapped.length >= 2048) throw Error("range-limit");
      result.unmapped.push({ blockPath: path, reason });
    };
    const unmapped = (node, path, reason) => {
      if (++count > 1e4) throw Error("range-limit");
      recordUnmapped(path, reason);
      node.children.forEach((child, i) => unmapped(child, [...path, i], reason));
    };
    const add2 = (node, path, span, precision = span.precision) => {
      if (++count > 1e4) throw Error("range-limit");
      if (result.ranges.length >= 2048) throw Error("range-limit");
      result.ranges.push({
        id: "r" + result.ranges.length,
        blockPath: path,
        kind: span.kind,
        start: span.start,
        end: span.end,
        startLine: span.startLine,
        endLine: span.endLine,
        precision
      });
    };
    const coarseChildren = (node, path, span) => node.children.forEach((child, i) => {
      const childPath = [...path, i];
      add2(child, childPath, span, "coarse");
      coarseChildren(child, childPath, span);
    });
    function bind(items, units2, parentPath = []) {
      const ordinary = [];
      items.forEach((node, i) => {
        const path = [...parentPath, i];
        if (node.name !== "mbb/footnotes") {
          ordinary.push({ node, path });
          return;
        }
        recordUnmapped(path, "definition-group");
        node.children.forEach((note, j) => {
          const notePath = [...path, j], span = definitions.get(note.attrs.label);
          if (note.name !== "mbb/footnote" || !span || duplicateDefinition)
            unmapped(note, notePath, "definition-identity");
          else {
            add2(note, notePath, span);
            coarseChildren(note, notePath, span);
          }
        });
      });
      if (ordinary.length !== units2.length) {
        ordinary.forEach(({ node, path }) => unmapped(node, path, "structure-mismatch"));
        return;
      }
      let blocked = false;
      ordinary.forEach(({ node, path }, i) => {
        const span = units2[i];
        const allowed = span.kind === "teaching" ? [NATIVE[span.teachingKind] || "mbb/" + span.teachingKind] : NAMES[span.kind] || [];
        const identity = span.kind !== "teaching" || (NATIVE[span.teachingKind] ? !span.anchor || span.anchor === node.attrs.anchor : typeof span.stableId === "string" && span.stableId === node.attrs.id);
        if (blocked || !allowed.includes(node.name) || !identity) {
          blocked = true;
          unmapped(node, path, "unsupported-structure");
          return;
        }
        if (span.kind === "teaching" && ["code-tabs", "button", "bibliography", "image"].includes(span.teachingKind) && node.children.length) {
          blocked = true;
          unmapped(node, path, "unsupported-structure");
          return;
        }
        add2(node, path, span);
        if (span.kind === "teaching") {
          if (["code-tabs", "button", "bibliography", "image"].includes(span.teachingKind)) {
          } else if (span.teachingKind === "code-compare")
            bind(node.children, span.children.slice(2), path);
          else bind(node.children, span.children, path);
        } else coarseChildren(node, path, span);
      });
    }
    const uncertain = (units2) => units2.some((u) => u.kind === "unknown" || uncertain(u.children || []));
    try {
      const tree2 = normalize3(blocks);
      if (unsupportedSyntax || uncertain(syntax))
        tree2.forEach((node, i) => unmapped(node, [i], "unsupported-syntax"));
      else bind(tree2, syntax);
    } catch (error3) {
      if (error3.message !== "range-limit") {
        result.ranges = [];
        result.unmapped = [];
      }
      result.unmapped = result.unmapped.slice(0, 2047);
      result.unmapped.push({ blockPath: [], reason: "structure-limit" });
    }
    const comparePath = (a, b) => {
      for (let i = 0; i < Math.min(a.blockPath.length, b.blockPath.length); i++) {
        if (a.blockPath[i] !== b.blockPath[i]) return a.blockPath[i] - b.blockPath[i];
      }
      return a.blockPath.length - b.blockPath.length;
    };
    result.ranges.sort(comparePath).forEach((range, i) => {
      range.id = "r" + i;
    });
    result.unmapped.sort(comparePath);
    return result;
  }

  // plugin/includes/php-converter/diagnostics.json
  var diagnostics_default = [
    " (older baseline; compare conflicts)",
    " (permissions changed; candidate preserved)",
    " (source binding changed)",
    " Apply ",
    " I understand that original static media URLs may become public after upload, even when the article is a private draft.",
    " Input has not been applied. Article saving is paused.",
    " Prepare the export again.",
    " Static fallback content remains readable. You can start again.",
    " and others",
    " block",
    " is executable.",
    " is missing or not executable.",
    " isolated interactive preview",
    " source",
    " \xB7 Another tab",
    " \xB7 Conversion backend: ",
    " \xB7 Older record awaiting verification",
    " \xB7 Restored from #",
    " \xB7 This tab",
    '">Edit Markdown</button> <button class="button mbb-history" data-post="',
    '">Export saved article</button></li>',
    '">Manage image emoji packs</a> ',
    '">New article</a> ',
    '">Next page</a>',
    '">Previous page</a> ',
    '">Revisions / restore</button> <button class="button mbb-export" data-post="',
    '">Settings</a>',
    '">Upload Markdown</a> ',
    '">View settings and diagnostics</a>.',
    "$$ must occupy a complete line",
    "%1$s (block %2$s)",
    "%1$s / 8 versions; %2$s / 131072 bytes",
    "%1$s difference: green additions, red deletions, and gray unchanged context.",
    "%1$s differences: green additions, red deletions, and gray unchanged context.",
    "%1$s reference markers will be updated. No change has been applied.",
    "%1$s \xB7 %2$s \xB7 %3$s\xD7%4$s \xB7 %5$s bytes",
    "%1$s. Reading the latest version for comparison.",
    ", ",
    ", attribute",
    ", column ",
    ", reference ",
    ". Check the differences and preview before confirming.",
    ". Check this block's formatting, or download Markdown for safekeeping before correcting and previewing it again.",
    ". The current candidate is preserved. Download it or compare manually.",
    ". The source is preserved. You can retry.",
    "1. Select and order articles",
    "2. Metadata and scope",
    "3. Prepare, confirm, download",
    "; automatic three-way merge is unavailable. Download the candidate and compare manually.",
    "; click or press Enter to view the formula and TeX",
    "; repeated structure cannot be located reliably",
    "; the original candidate remains downloadable. Verify the latest version again.",
    "</form><h2>Optional image resources</h2><p>Unicode emoji are used by default. Administrators may import image packs; basic installation requires no resource downloads.</p>",
    '</select> <button class="button" name="operation" value="select">Enable selected pack</button> <button class="button" name="operation" value="delete">Delete inactive pack</button></p></form>',
    '</select> <button class="button" name="operation" value="select">Enable selected pack</button> <button class="button" name="operation" value="delete">Delete inactive pack</button></p></form></div>',
    '</select></p><p class="description">Only adjusts the Markdown editing window, not body or frontend fonts. Refresh an already open editing window.</p>',
    "</tbody></table><h2>Rejected registrations</h2><ul>",
    '<a href="https://github.com/wzf2000/MarkBridge/issues">Report an issue</a>',
    '<a href="https://github.com/wzf2000/MarkBridge/issues">Report an issue</a></p>',
    '<a href="https://github.com/wzf2000/MarkBridge/wiki">Documentation</a>',
    '<a href="https://github.com/wzf2000/MarkBridge/wiki">Documentation</a> \xB7 ',
    '<a href="https://github.com/wzf2000/MarkBridge/wiki/Emoji-Packs">Image pack guide</a></p>',
    '<a href="https://github.com/wzf2000/MarkBridge/wiki/Getting-Started">Quick start</a> \xB7 ',
    "<details><summary>Compatibility and advanced runtime settings</summary><p>Current backend: ",
    '<div class="notice notice-error"><p>Display settings contain invalid values. Original settings are unchanged.</p></div>',
    '<div class="notice notice-error"><p>Display settings could not be saved. Check the database state.</p></div>',
    '<div class="notice notice-error"><p>The database configuration could not be saved. Check the database state. No successful switch was reported.</p></div>',
    '<div class="notice notice-error"><p>The proposed runtime failed verification. Original settings are unchanged.</p></div>',
    '<div class="notice notice-info"><p>This runtime directory endpoint cannot currently change configuration. Refresh the page and use the conversion backend settings. Server-managed directories cannot be overridden.</p></div>',
    '<div class="notice notice-success"><p>Display settings saved.</p></div>',
    '<div class="notice notice-success"><p>The runtime was verified and enabled.</p></div>',
    '<div class="wrap"><h1>MarkBridge image emoji</h1><p>Unicode is used by default; external resources are not automatically downloaded. No download source is bundled. Import only image packs with known provenance and licensing. Importing does not grant a license to use the resources.</p>',
    '<div class="wrap"><h1>MarkBridge teaching extensions</h1><p>Read-only diagnostics: fixed local resources and public data-only parameters. At most 2 active executions and 4 previews; parameters are limited to 16 KiB. Static content and configuration are preserved when an extension is disabled.</p><table class="widefat striped"><thead><tr><th>Component</th><th>Version / protocol / minimum MarkBridge</th><th>Status</th><th>Budgets</th></tr></thead><tbody>',
    '<div class="wrap"><h1>Markdown editing bridge</h1><p>Upload Markdown for editing in both representations. Preview differences before saving, publishing, or submitting for review. Set a featured image before publishing.</p><p><button class="button button-primary" id="mbb-new">Upload a new document</button></p><ul>',
    "<h2>Conversion backend</h2>",
    '<h2>Diagnostics</h2><table class="widefat striped"><tbody>',
    '<h2>Editing experience</h2><p><label for="mbb-source-font-size">Markdown source font size</label> ',
    '<h2>Formula and code display</h2><table class="form-table"><tbody>',
    "<h2>Overview and getting started</h2><p>Version: ",
    "<h2>Unapplied candidate diagnostics: ",
    '<input type="hidden" name="operation" value="import"><input type="file" name="pack_zip" accept=".zip" required><button class="button">Import pack</button></form><form method="post">',
    '<label for="mbb-runtime-path">Private server directory</label> ',
    '<p class="description">MARKBRIDGE_RUNTIME is defined. An invalid constant does not fall back to database settings.</p>',
    '<p class="description">MARKBRIDGE_RUNTIME is server-managed and overrides only the Node directory. An invalid constant does not fall back to the database directory.</p>',
    '<p class="description">Selecting PHP preserves the existing valid Node directory for later switching and does not use the directory entered here.</p>',
    '<p class="mbb-adapter-unavailable" data-mbb-generated="" role="status">The static block adapter package or version is unavailable. Saved content and configuration are preserved; conversion and paired restoration are unavailable.</p>',
    '<p><a href="https://github.com/wzf2000/MarkBridge/wiki/Runtime">Node runtime preparation and configuration</a></p>',
    '<p><label for="mbb-converter-path">Private Node directory</label> ',
    "<p>A basic installation uses bundled PHP and needs no server directory configuration. Existing Node configuration is preserved during upgrades. Administrators can verify and select a backend below.</p>",
    "<p>Active configuration source: ",
    "<p>Current backend: ",
    "<p>MARKBRIDGE_CONVERTER_BACKEND is defined. The backend is server-managed and cannot be overridden here.</p>",
    "<p>New installations default to PHP. Node requires a matching private server runtime prepared beforehand. Changes apply only after verification, never rewrite content, and do not automatically fall back on failure.</p>",
    "<p>Select the engine in the conversion backend settings above. PHP requires no private Node directory, and failures do not fall back to another backend.</p>",
    "<p>The current conversion configuration is invalid and will be rejected explicitly. No other backend is selected automatically.</p>",
    '<p>These results describe the failed candidate, not the currently active backend.</p><table class="widefat striped"><tbody>',
    "<p>Unicode is used by default; external resources are not automatically downloaded. No download source is bundled. Import only image packs with known provenance and licensing. Importing does not grant a license to use the resources.</p>",
    "A CSL-JSON author is invalid",
    "A CSL-JSON issue date is invalid",
    "A CSL-JSON record has an unsupported or missing type",
    "A CSL-JSON record requires a bounded string or safe integer id",
    "A DOI must be a bounded supported DOI identifier, without a URL prefix",
    "A FrontMatter header is limited to 16 KiB",
    "A JSON export request is required",
    "A ZIP may contain only one Markdown document and PNG/JPEG/GIF/WebP images",
    "A ZIP may contain only one document and at most 32 images",
    "A batch operation is in progress. Refresh its status after it completes.",
    "A batch requires at most five items",
    "A bibliography requires 1\u201364 entries within 64 KiB",
    "A button group requires 1\u201332 direct link buttons",
    "A button may contain only a link",
    "A code comparison must begin with two fenced code blocks",
    "A code group may contain only the corresponding number of fences",
    "A code group requires 1\u20138 versions",
    "A code version ID duplicates a document anchor",
    "A code version title must be empty or single-line text of at most 200 characters",
    "A column must be a direct child of columns",
    "A complex list contains a non-list item",
    "A document may contain only one footnote definition section",
    "A document permits one empty top-level logical identity",
    "A file did not finish uploading. No drafts were created.",
    "A footnote definition is not referenced",
    "A footnote name must contain 1\u201364 letters, digits, underscores, or hyphens",
    "A footnote reference has no definition",
    "A gallery requires 1 to 32 direct native images",
    "A group label must be single-line plain text",
    "A link button must be a direct leaf of a button group",
    "A link button must contain exactly one controlled text paragraph",
    "A link title must occupy a single line",
    "A list contains a non-list item",
    "A literal author name requires 1\u2013120 plain characters",
    "A literal issue date must be bounded single-line text",
    "A local image reference is not present in the ZIP: ",
    "A logical identity requires a closed namespace and document tuple",
    "A native container may only contain its declared child block types",
    "A new media namespace could not be created",
    "A new native block candidate must be imported through bounded Markdown while preserving its original block shape.",
    "A newer version exists; no migration is declared",
    "A nonempty documentId is required",
    "A paired save cannot start inside a native save transaction.",
    "A pending image path is invalid",
    "A preview image changed or has the wrong content type.",
    "A preview image digest does not match.",
    "A proposed CSL-JSON key is invalid",
    "A real WordPress block runtime is required",
    "A reference marker is malformed. Correct it before saving.",
    "A relative image is missing. Include it in the single-document ZIP.",
    "A resource ZIP can only be imported as a Markdown candidate",
    "A resource candidate cannot be saved twice",
    "A save result is uncertain. Keep this batch for verification before canceling.",
    "A selected field is not present in the current header proposal.",
    "A selected term slug no longer exists or changed. Terms are never created automatically.",
    "A stable document_id is required",
    "A stage group may only contain stages",
    "A stage must be a direct child of a stage group",
    "A staged input changed. Prepare that file again.",
    "A staged input digest changed. Prepare that file again.",
    "A statement body must not be empty",
    "A statement requires a supported kind and title; only proofs may be closed",
    "A static article link is unsafe",
    "A structured author requires an explicit family name within the existing 120-character name budget",
    "A structured issue date requires one or two year/month/day parts",
    "A summary must be single-line plain text",
    "A table requires exactly one header and no footer",
    "A teaching ID conflicts with a body anchor",
    "A teaching ID must begin with a letter and contain 1\u201364 ASCII letters, digits, underscores, or hyphens",
    "A teaching title must be single-line plain text of 1\u2013200 characters",
    "A technical reference has no matching object or bibliography entry",
    "A valid article ID is required",
    "A version conflict was detected. Saving is disabled. Compare the server version and current candidate below.",
    "About the input and final download",
    "Acquire a new opening baseline after adopting the merged candidate.",
    "Activity",
    "Activity relations require a closed map of unique local static targets",
    "Activity targets must exist within their own component; prompts and options must be direct open static parts",
    "Activity template",
    "Adapter attributes are missing or contain unknown fields",
    "Add a trailing newline to the ",
    "Add article",
    "Add author or institution",
    "Add bibliography entry",
    "Add code version",
    "Add end date",
    "Add entries",
    "Add field",
    "Add item",
    "Additional identifiers",
    "Additional source text",
    "Administrator permission is required.",
    "Adopt as a new unsaved collection. Cancel preserves current fields and the current job.",
    "Adopt as new collection",
    "Adopt publication arrangement",
    "Adopt unsaved merge candidate",
    "Advanced JSON",
    "All content",
    "All purposes",
    "All relationships",
    "All relationships and articles",
    "All whitespace is preserved. Empty code and code without a trailing newline are allowed.",
    "An anchor must begin with a letter and contain 1\u201364 ASCII letters, digits, underscores, or hyphens",
    "An editable article already has this title. This operation only creates a new draft.",
    "An editable managed article has identical Markdown. This operation does not update it.",
    "An empty anchor must occupy a separate paragraph to prevent editor tag loss",
    "An existing block with this name does not match the registered static template and will not be overwritten",
    "An external image link is unsafe",
    "An image changed during packaging. Export did not complete",
    "An image changed during static export",
    "An image directive requires exactly one ordinary Markdown image",
    "An image reference must not traverse above the ZIP root",
    "An invalid block cannot be exported",
    "An object must contain exactly one matching supported block",
    "An object requires a supported kind and a plain caption of 1\u2013512 characters",
    "Annotate additional code lines",
    "Anonymous inline footnotes are not supported",
    "Another ZIP is being prepared",
    "Another paired backup is being processed. Try again shortly. Current input is preserved.",
    "Another save is in progress. Try again later.",
    "Another selected file has identical Markdown.",
    "Another selected file has the same name.",
    "Another selected file has the same title.",
    "Another window disabled local recovery.",
    "Another window disabled recovery. Older verification cannot enable it or write again.",
    "Answer",
    "Append values",
    "Appendix",
    "Applied bibliography changed. The current candidate is preserved and unapplied.",
    "Applied configuration changed. The current candidate is preserved and unapplied. Saving is paused.",
    "Applied value: ",
    "Apply bibliography edits",
    "Apply changes to the editor, then use the normal save action.",
    "Apply formula",
    "Apply parameters",
    "Apply text edits",
    "Apply to editor",
    "Arrange references to saved articles, then prepare an immutable snapshot. Collection configuration is not a second article body.",
    "Article",
    "Article IDs (comma separated, up to 50)",
    "Article metadata changed while reading. Reconcile again",
    "Article search failed. Try again.",
    "Article title",
    "At most 16 static adapters may be registered",
    "At most 256 distinct local image references are supported; actual images remain limited to 32",
    "At most 32 actual images may be exported",
    "At most 32 highlighted ranges are allowed",
    "At most 32 image targets",
    "At most four export candidates can be kept. Cancel an older candidate or wait for expiration",
    "At most four resource candidates may be kept. Cancel older candidates or wait for expiration",
    "Authentication expired. Local candidates are preserved. Refresh or sign in again, then recheck recovery permissions.",
    "Authors",
    "Authors (one per line, at most eight)",
    "Authors (one per line, up to 8)",
    "Authors and institutions",
    "Author\u2013year",
    "Automatic",
    "Automatic copy failed. Select the summary to copy it manually.",
    "Automatic copy failed. The source is selected for manual copying",
    "Autosaves and revisions for this document cannot be written separately.",
    "Available",
    "Awaiting selection",
    "Back to branch",
    "Batch Markdown source",
    "Batch files",
    "Batch import drafts",
    "Batch item preview",
    "Batch ownership or its manifest could not be verified.",
    "Batch restored for the current account. Preview unfinished items again.",
    "BibTeX DOI values must be bounded DOI identifiers",
    "BibTeX accent conversion requires Unicode normalization",
    "BibTeX entries support at most eight authors",
    "BibTeX input must be UTF-8 text within 64 KiB",
    "BibTeX is outside the supported bounded data subset",
    "BibTeX replacement must preserve every currently cited key",
    "BibTeX source (up to 64 KiB)",
    "BibTeX supports one to 64 entries",
    "Bibliography",
    "Bibliography URLs must use absolute HTTP or HTTPS",
    "Bibliography URLs must use absolute HTTP or HTTPS without credentials",
    "Bibliography author names are outside their bounds",
    "Bibliography edits changed. Preview the BibTeX mapping again",
    "Bibliography edits changed. Preview the CSL-JSON mapping again.",
    "Bibliography edits have not been applied. Apply or discard them before saving or renaming keys.",
    "Bibliography fields are incomplete, duplicated, or outside their bounds",
    "Bibliography identifiers require bounded ISBN, ISSN, PMID and PMCID text fields",
    "Bibliography keys (at most eight)",
    "Bibliography keys must be unique",
    "Bibliography origins must be a JSON array of closed objects",
    "Bibliography origins require at most 64 closed source declarations",
    "Bibliography origins require unique existing keys and bounded opaque source versions",
    "Bibliography settings",
    "Bibliography v2 entries require closed fields, a stable key, a supported type and a title",
    "Bibliography v2 requires a fixed supported style and 1\u201364 entries within 64 KiB",
    "Block ",
    "Block %1$s",
    "Block %1$s cannot be exported to Markdown",
    "Block %1$s%2$s",
    "Block %1$s, attribute %2$s",
    "Block HTML, attributes or nesting would change during Markdown roundtrip",
    "Block at Markdown line %1$s",
    "Block attributes must be an object",
    "Block candidate",
    "Block children and HTML slots disagree",
    "Block content is missing or too large.",
    "Block formula delimiters $$ must each occupy their own line",
    "Block preview",
    "Body alignment must match header columns",
    "Body chapter",
    "Body chapters use 1, 2; appendices use A, B. Prefaces keep article object numbers. Chapter numbering covers equations, figures, tables, listings, definitions, theorems and proofs; steps and activities retain article numbers.",
    "Body conflict ",
    "Body conflict %1$s (opening line %2$s%3$s)",
    "Book",
    "Book chapter",
    "Both representations match. Check the differences and confirm restoration.",
    "Boundary AST exceeds structural limits",
    "Browser draft recovery",
    "Browser structure check completed. Reading suggestions may be ignored; the server validates again when saving.",
    "Built-in content preview",
    "Button groups only support the default flex layout",
    "Button text is limited to 256 nodes and 16 levels",
    "Button text is limited to 4 KiB",
    "Button text must not be empty",
    "Buttons only support controlled text formatting",
    "Buttons only support plain text and strong/em/del/code, without links, images, or nested interactions",
    "By stage",
    "CSL-JSON contains a duplicate property",
    "CSL-JSON contains invalid Unicode or a nonfinite number",
    "CSL-JSON data exceeds its bounded node budget",
    "CSL-JSON file (optional)",
    "CSL-JSON has more than 256 unsupported fields; simplify the input before importing",
    "CSL-JSON input must be UTF-8 JSON within 64 KiB",
    "CSL-JSON is invalid",
    "CSL-JSON key mappings are invalid",
    "CSL-JSON nesting exceeds sixteen levels",
    "CSL-JSON numeric fields require text or safe integers",
    "CSL-JSON property names are invalid or too long",
    "CSL-JSON record ids are duplicated",
    "CSL-JSON requires an array of 1\u201364 records",
    "CSL-JSON source (up to 64 KiB)",
    "CSL-JSON supports at most eight authors",
    "Cancel",
    "Cancel BibTeX import",
    "Cancel CSL-JSON import",
    "Cancel export",
    "Cancel image import and keep the document",
    "Cancel remaining items and remove staging",
    "Cancel snapshot",
    "Canceled",
    "Canceled. Created drafts and their media were preserved.",
    "Candidate body or metadata exceeds its budget or has invalid types",
    "Candidate budgets",
    "Candidate content policy",
    "Candidate identity does not match",
    "Candidates must be valid UTF-8 text",
    "Caption",
    "Categories and tags require at most 100 unique existing term slugs",
    "Category or tag save failed",
    "Category slugs",
    "Changes",
    "Chapter role",
    "Check changed targets and readable incoming references",
    "Check current block conversion",
    "Check current content",
    "Check formula delimiters and TeX source. Each block formula delimiter $$ must occupy its own line.",
    "Check label rename",
    "Check named footnote references and definitions. Each definition must be unique, referenced, and placed at the end of the document.",
    "Check selected articles",
    "Check the indicated position and use supported blocks and formatting. The candidate is preserved; correct it and preview again.",
    "Check the snapshot scope",
    "Check this block's styles, attributes, and nesting. A supported block type does not imply support for all formatting. Download Markdown to preserve the candidate if needed.",
    "Checking document references\u2026",
    "Checking paired backups\u2026",
    "Checking the current article target\u2026",
    "Child slot must be empty",
    "Chinese structural reading covers a limited set of mathematical structures.",
    "Choose 1 to 50 distinct article IDs.",
    "Choose a .bib file within 64 KiB",
    "Choose a batch item and a plain title of at most 200 characters.",
    "Choose a currently readable managed article. Unavailable references remain stored without exposing their content to readers.",
    "Choose a different default version explicitly before deleting the default version.",
    "Choose a featured image in article settings before publishing, then preview and save.",
    "Choose a historical version",
    "Choose a literal date or structured date parts, not both",
    "Choose a local ZIP. Also check this site's PHP upload limits",
    "Choose a reference target",
    "Choose a relationship",
    "Choose a revision",
    "Choose a revision (latest 100)",
    "Choose a revision and view its differences. Nothing has been restored yet.",
    "Choose a saved managed article.",
    "Choose a stage",
    "Choose a target to insert a reference.",
    "Choose a teaching component in the sidebar",
    "Choose a valid image from the media library.",
    "Choose an existing article.",
    "Choose an existing group for every node.",
    "Choose an existing item",
    "Choose an existing line.",
    "Choose an existing mobile starting item, or use Automatic.",
    "Choose an option",
    "Choose between one and ten Markdown or single-document ZIP files.",
    "Choose bibliography entries",
    "Choose copy or explicit identity migration.",
    "Choose draft, pending review, public, or private.",
    "Choose every body and metadata conflict. Adoption only creates an unsaved candidate; preview and save again.",
    "Choose every conflict explicitly",
    "Choose existing, different endpoints for every relationship.",
    "Choose explicit BibTeX merge or replacement",
    "Choose explicit migration or prepare a copy for an existing identity.",
    "Choose files to scan or resume one of your active batches.",
    "Choose merge or replace for CSL-JSON import",
    "Choose one of the registered values.",
    "Choose one to ten files within the 16 MiB upload budget.",
    "Choose this conflict",
    "Choose up to 50 articles.",
    "Choose up to ten Markdown or single-document ZIP files. Scan first, preview each item, then create drafts one at a time. Header metadata is not applied.",
    "Citation key mappings:",
    "Citation style",
    "Clear selection",
    "Clear this account's local candidates",
    "Click a formula to enlarge it or copy TeX. Disabling this only removes frontend interactions; formula layout and editor previews remain available.",
    "Click or press Enter to view the formula and TeX",
    "Close",
    "Close editing bridge",
    "Close interactive preview",
    "Close the current batch before handing over more files.",
    "Close without restoring",
    "Code",
    "Code and math cannot contain blocks",
    "Code and math must contain only literal text",
    "Code comparison",
    "Code comparison requires two initial fenced code blocks",
    "Code copy button",
    "Code group settings",
    "Code groups cannot have child blocks",
    "Code groups must not contain nested body content",
    "Code groups require 1\u20138 versions",
    "Code language tokens do not support additional parameters",
    "Code line numbers",
    "Code line numbers must remain between 1 and 999999",
    "Code markup only supports plain text",
    "Code must be UTF-8 without NUL",
    "Code must be valid Unicode without NUL",
    "Code or math HTML disagrees with block attributes",
    "Code pipes in tables are outside the current engine reverse contract",
    "Code requires a simple language and a trailing newline",
    "Code requires an explicit structural LF",
    "Code requires an explicit structural LF separator",
    "Code text for manual copying (newlines may be normalized)",
    "Code version IDs are invalid or duplicated",
    "Code version attributes are incomplete or unknown",
    "Code version conflicts with a document ID",
    "Code version is not a complete original fence",
    "Code version/group exceeds 64/128 KiB",
    "Code versions",
    "Collapse diagram",
    "Collapsible content",
    "Collapsible content is limited to three nested levels",
    "Collection configuration candidate",
    "Collection title",
    "Collections",
    "Colors match the source branch; patterns show the relationship type.",
    "Column alignment must be top, center or bottom",
    "Column width differs from its fixed HTML style",
    "Column width must be a percentage greater than 0 and at most 100",
    "Columns",
    "Columns may contain only 0\u20136 direct column blocks",
    "Comment was not saved: ",
    "Comments, private notes, and source paths are excluded. Unselected private reference targets remain unavailable.",
    "Companion series import is unavailable or exceeds the bounded candidate list. Select articles manually.",
    "Compare ideas",
    "Compatibility and advanced runtime settings",
    "Compatibility details",
    "Compatibility is based on installed exact versions. No extension is downloaded or enabled here.",
    "Completed",
    "Component",
    "Component details",
    "Component execution completed.",
    "Component initialization failed.",
    "Component initialization timed out.",
    "Component numbers must be finite",
    "Component parameters are limited to 16 KiB",
    "Component parameters do not satisfy the registered strict schema.",
    "Component parameters exceed the depth or node budget",
    "Component parameters must be a JSON object",
    "Component parameters must contain only JSON data",
    "Component purpose",
    "Component text must be valid Unicode",
    "Component type",
    "Component version",
    "Components in this article",
    "Concept",
    "Conference paper",
    "Configuration (read only)",
    "Confirm download",
    "Confirm draft save",
    "Confirm paired save",
    "Confirm private publication",
    "Confirm public publication",
    "Confirm restoration of both representations",
    "Confirm submission for review",
    "Confirm that original media URLs may be public, and preview the resource transformation again",
    "Confirm that uploaded image URLs may be public, including for a draft.",
    "Confirm this snapshot",
    "Conflict repair requires an administrator and the unchanged article identity.",
    "Connections to other branches",
    "Container must contain only its declared child blocks",
    "Content changed. Check the rename again.",
    "Content changed. Paste again to review the current selection.",
    "Content changed. Prepare the operation again.",
    "Content navigation and checks",
    "Content preview",
    "Content type",
    "Continue rebuild",
    "Conversion backend",
    "Conversion cannot preserve all current block content or attributes. Export was blocked",
    "Conversion failed",
    "Conversion kernel",
    "Conversion startup snapshot",
    "Conversion support and current content",
    "Conversion support: %1$s unsupported blocks",
    "Conversion worker",
    "Convert native math to inline formula (MathJax)",
    "Convert to display formula",
    "Convert to display formula (MathJax)",
    "Convert to inline formula (MathJax)",
    "Convert to ordinary list",
    "Copied",
    "Copied ",
    "Copy",
    "Copy ",
    "Copy %1$s code",
    "Copy TeX",
    "Copy as a new activity",
    "Copy diagnostic summary",
    "Copy identity metadata",
    "Copy line link",
    "Copy revision content into the current identity",
    "Copy the original code manually",
    "Copy with new identities (default)",
    "Correct feedback",
    "Correct option",
    "Correct the article IDs before adding a search result.",
    "Count",
    "Course workbench",
    "Create this draft",
    "Creates an unsaved structure. Preview before saving; reader state is not stored.",
    "Creating this draft. If the connection is interrupted, refresh batch status before trying again.",
    "Cross-document identities require the core WordPress transactional database connection. Legacy editing remains available.",
    "Cross-document identities require transactional tables. No existing table was changed.",
    "Cross-reference",
    "Cross-site Markdown and images ZIP",
    "Cross-site ZIP requires every image to be a verified local attachment of this article",
    "Current article target",
    "Current block types have conversion mappings. Check their conversion to confirm that attributes and formatting are preserved.",
    "Current blocks passed the browser round-trip check. The server will validate them again when saving.",
    "Current blocks were converted to Markdown for preview and have not been saved.",
    "Current branch",
    "Current categories or tags could not be read",
    "Current formula size",
    "Current metadata was written to the header candidate but has not been saved. Preview again. Source-managed articles still require the source write workflow.",
    "Current stable label",
    "Current value is outside the registered choices",
    "Current: ",
    "Custom more-separator attributes are not supported",
    "DOI identifier (without URL prefix)",
    "DOM and mbstring are available.",
    "DOM or mbstring is missing.",
    "Damaged candidate",
    "Damaged index",
    "Database and source file rollback both failed. Verify both representations.",
    "Database rollback failed; the save state is uncertain. Verify the article.",
    "Dataset",
    "Day (optional)",
    "Default code version",
    "Default scope is public, password-free, editable articles. Private selection never includes unselected private reference targets.",
    "Default version must reference a group member",
    "Definition",
    "Definition, theorem or proof",
    "Delete candidate",
    "Delete configuration",
    "Delete current version",
    "Delete empty list",
    "Delete entire code group",
    "Deleting configuration never deletes articles. Maximum 10 chapters; verified image bytes total at most 16 MiB.",
    "Dependency loading",
    "Description",
    "Details",
    "Details must contain exactly one direct summary",
    "Diagnostic summary",
    "Diagnostic summary copied.",
    "Diagrams and relationships",
    "Difference %1$s",
    "Differences between the latest server version and candidate",
    "Directed",
    "Directories must not contain data",
    "Directory isolation",
    "Disallowed URL scheme",
    "Discard bibliography edits",
    "Discard parameter input",
    "Discard text edits",
    "Display formula",
    "Display math requires a closing $$ line",
    "Display math requires paired $$ delimiters",
    "Document",
    "Document candidate requests require a closed JSON object with valid fields and no duplicate keys.",
    "Document containers and declarations are unsupported",
    "Document identity enabled",
    "Document identity is not enabled",
    "Document metadata proposal",
    "Document pagination",
    "Document references",
    "Documents receiving new logical identities: ",
    "Documents retaining their logical identities: ",
    "Down enters a term; Left and Right move between terms; Up returns; Home reads the whole formula; Escape leaves exploration.",
    "Download CSL-JSON subset",
    "Download current candidate .md",
    "Download current unsaved candidate",
    "Download local candidate",
    "Download original code ",
    "Download snapshot ZIP",
    "Download web book ZIP",
    "Downloaded. The saved article, source file, and unsaved input are unchanged.",
    "Draft",
    "Draft created",
    "Draft recovery",
    "Draft title",
    "Drag canvas: ",
    "Drag canvas: off",
    "Dropping particle",
    "Duplicate bibliography key: %1$s",
    "Duplicate code group",
    "Duplicate enum declaration",
    "Duplicate footnote definition",
    "Duplicate footnote label",
    "Duplicate stable label: %1$s",
    "Duplicate teaching ID",
    "Duplicate teaching JSON attribute",
    "Duplicate teaching JSON property",
    "Each adapter requires 1\u201316 fields",
    "Each candidate is limited to 256 KiB. Download for manual comparison",
    "Each candidate is limited to 32,768 lines",
    "Each code version requires a complete corresponding fence without container prefixes",
    "Each document may contain only one nonempty top-level stage group",
    "Each document must be UTF-8 text within 256 KiB.",
    "Each image is limited to 32 MP",
    "Each image is limited to 8 MiB",
    "Each item creates a separate draft after preview and confirmation. Existing articles are never overwritten.",
    "Each merge source is limited to 256 KiB and 32,768 lines. Download the original candidate for manual comparison",
    "Each operation processes at most ten articles. Continue until ready; no background job is scheduled.",
    "Each pair may contain each relationship kind only once.",
    "Each registration descriptor is limited to 16 KiB",
    "Each version is limited to 64 KiB and the group to 128 KiB",
    "Each version requires a complete fence without container prefixes",
    "Edges",
    "Edit inline formula: %1$s",
    "Edit item",
    "Edit or upload Markdown, then check the differences.",
    "Editing changed. Waiting for verification before updating the local candidate\u2026",
    "Editing permission for this article was lost. Only this article's local candidates are removed; other articles are preserved.",
    "Edition",
    "Empty anchors must occupy their own paragraph",
    "Enable a compatible diagram extension before inserting a diagram.",
    "Enable document references",
    "Enable local recovery in this browser ",
    "Enable paired backups while this page is open",
    "Enabled",
    "Enabled: candidates are stored only in this browser and expire after 7 days.",
    "End date",
    "Enter a title without HTML, or explicitly select the header title proposal.",
    "Enter single-line TeX without unescaped dollar signs.",
    "Enter single-line TeX.",
    "Enter term",
    "Entity-looking image alternative text would change under the current engine serialization",
    "Equation",
    "Equations",
    "Every cross-site native image requires a verified association",
    "Every group must contain at least one node.",
    "Every local image must be a readable attachment of its selected article. External images remain links and are not fetched.",
    "Exact version is missing",
    "Exact version is unavailable",
    "Excerpt",
    "Exclusive details groups are not supported",
    "Execution completed. The recorded trace is ready for playback.",
    "Execution exceeded its time budget and was terminated.",
    "Execution failed. Static fallback content remains readable.",
    "Execution stopped.",
    "Existing arrangements keep their original schema. Adopt publication arrangement to add authors, editions, chapter roles and optional chapter object numbering.",
    "Existing identities are retained only if unclaimed; occupied identities block saving.",
    "Existing image URLs are preserved; the server does not download them.",
    "Expected a single code element",
    "Expected a string ",
    "Expected a string %1$s",
    "Expected one ",
    "Expected one %1$s",
    "Expected one table",
    "Expected table row",
    "Explanation",
    "Explanation relationship",
    "Explicit export confirmation is required",
    "Explicit item confirmation is required.",
    "Explicit migration retaining identities",
    "Explicit person name",
    "Explicitly apply edits. The server validates parameters against the registered schema when saving.",
    "Explicitly include the selected private drafts",
    "Explicitly selected private article",
    "Explore with keyboard",
    "Export body copy",
    "Export did not complete",
    "Export did not complete. The saved article and source file are unchanged.",
    "Export directory permissions could not be restricted",
    "Export format",
    "Export preparation was canceled or expired",
    "Export saved article",
    "Export staging must be outside the web root",
    "Export the article's current saved paired representations. Prepare the manifest and confirm the download. Unsaved editor input is unchanged.",
    "Extensions",
    "Failed",
    "Family name (explicit)",
    "Featured image",
    "Featured image ID",
    "Featured image save failed",
    "Fenced code must preserve its trailing newline",
    "Figure",
    "Figures",
    "File needs correction",
    "File validation failed.",
    "Files received. Scan selected files to review them before creating drafts.",
    "Final media HTML does not satisfy the save allowlist",
    "Final publication authorization did not match. Prepare again.",
    "Find a reference target",
    "Find articles by title",
    "Find text",
    "Find, replace and navigate",
    "Footnote",
    "Footnote ",
    "Footnote definition cannot be empty",
    "Footnote definitions",
    "Footnote definitions cannot contain references",
    "Footnote definitions must be inside the footnote section",
    "Footnote definitions must not be empty",
    "Footnote definitions must not contain footnote references",
    "Footnote labels require 1\u201364 letters, numbers, underscores or hyphens",
    "Footnote name",
    "Footnote reference",
    "Footnote reference text disagrees with its label",
    "Footnote references cannot appear in links",
    "Footnote references cannot appear in links or images",
    "Footnote references exceed the parser node budget",
    "Footnote section may contain only nonempty definitions",
    "Footnote section must be nonempty and top-level",
    "Footnote section requires one ol",
    "Footnotes are not supported here",
    "Footnotes belong only in the footnote section",
    "For further optimization",
    "Format",
    "Formula engine failed to load: ",
    "Formula engine load timed out",
    "Formula preview (not written to the body)",
    "Formula preview is unavailable. The original TeX is preserved.",
    "Formula reader",
    "Formula reading tools",
    "Formula source contains a standalone delimiter line",
    "Formula syntax error: ",
    "Formula typesetting engine",
    "Formula typesetting failed. No incomplete HTML was downloaded",
    "Formula typesetting failed; showing TeX source",
    "Formula typesetting timed out. The source is preserved. You can retry.",
    "Four interactive previews are already open. Close another preview first.",
    "From",
    "From line %1$s: current %2$s lines \u2192 revision %3$s lines (including unchanged lines between changes).",
    "FrontMatter attributes may only contain version:1 and raw",
    "FrontMatter fields are unknown, duplicated, or not single-line JSON",
    "FrontMatter metadata proposal",
    "FrontMatter must be the unique first top-level block",
    "FrontMatter strings must be valid Unicode",
    "FrontMatter values must be valid JSON",
    "Full explanation",
    "Full map",
    "Full reading entry must remain enabled",
    "Full text",
    "Full-text mode",
    "Gallery columns must be an integer from 1 to 8",
    "Gallery imageCrop must be a boolean",
    "General demonstrations",
    "General settings",
    "Generate a complete offline web book in your browser, inspect its static preview, then confirm and download. Articles and resources are checked again before download.",
    "Generate and inspect the web book first.",
    "Generate web book",
    "Given name",
    "Go",
    "Go to highlighted lines",
    "Go to line",
    "Group",
    "Groups",
    "Groups only support div or section tags",
    "Groups only support flow or constrained layout",
    "HTML blocks cannot contain child blocks",
    "HTML comments and non-text nodes are unsupported",
    "HTML comments and nontext nodes are unsupported",
    "HTML contains a bare less-than sign or incomplete markup",
    "HTML document containers are not allowed",
    "HTML exceeds structural limits",
    "HTML exceeds the node or nesting limit",
    "HTML head nodes are not allowed",
    "HTML requires parser repair or contains duplicate attributes",
    "HTML span positions disagree",
    "Header metadata is retained in Markdown but is not applied by batch import.",
    "Heading level or list start is out of range",
    "Highlight exceeds corresponding code length",
    "Highlighted lines exceed the corresponding code range",
    "Highlighted lines must be unique positive integers separated by commas",
    "Highlighted lines or ranges",
    "Highlighted lines: %1$s",
    "Highlighted ranges must be ordered, disjoint and within the code",
    "Highlights require comma-separated lines or closed ranges",
    "Hint",
    "I reviewed and accept the listed CSL-JSON field losses",
    "I reviewed and accept the proposed citation keys",
    "Identifier",
    "Image alternative text cannot contain footnote markers",
    "Image alternative text is empty. Review whether the image needs an explanation.",
    "Image blocks cannot contain child blocks",
    "Image emoji packs",
    "Image import must not change the original metadata header",
    "Image mapping does not target an author image",
    "Image mapping must be a list",
    "Image mappings are invalid or duplicated",
    "Image mappings are limited to 256 references and 32 targets",
    "Image mappings are limited to 32 targets",
    "Image mappings must point to actual author images",
    "Image projection cannot preserve the complete document",
    "Image references cannot be reliably projected while preserving the remaining body bytes",
    "Image references must point to files within the ZIP",
    "Image requires exactly one img element",
    "Image resource import",
    "Image targets cannot be changed while preserving the remaining body bytes. Choose Markdown single-file export or correct the references",
    "Image text must not contain footnote references",
    "Image transformation failed closed round-trip validation. The candidate was not saved",
    "Image unavailable.",
    "Images are only in private staging; no media exists yet. Preview and explicitly confirm first.",
    "Images must be regular local files within uploads",
    "Images or export metadata changed. Prepare again",
    "Images require src, alt and no children",
    "Import BibTeX",
    "Import BibTeX bibliography",
    "Import CSL-JSON",
    "Import Companion series",
    "Import Markdown",
    "Import Markdown file",
    "Import Markdown first for a new document.",
    "Import behavior",
    "Import bounded CSL-JSON",
    "Import operation",
    "Incomplete or unknown version fields",
    "Incomplete teaching attributes",
    "Incorrect feedback",
    "Independent body changes were combined. Unchanged metadata uses the latest server version; overlapping metadata requires an explicit choice.",
    "Index status",
    "Indexed component versions",
    "Initial focus",
    "Initial values",
    "Initialize",
    "Initialize or rebuild reference index",
    "Initializing the isolated component\u2026",
    "Initially annotates 400 lines; at most 2000 per side, 4000 initial lines per article, and 8000 manually requested lines. Remaining source stays unchanged and fully copyable.",
    "Initially open",
    "Inline code must be literal text",
    "Inline comments and non-text nodes are unsupported",
    "Inline formula source",
    "Inline formula source differs from its display text",
    "Inline formulas must occupy one line without leading or trailing whitespace.",
    "Inline math must contain matching literal TeX",
    "Inline math text disagrees with TeX",
    "Inline text cannot follow nested list blocks",
    "Input already delivered to your browser cannot be recalled. Final authorization checks this plugin download, not the authenticity of arbitrary client HTML.",
    "Input exceeds 256 KiB",
    "Input exceeds the node or nesting limit",
    "Input must be UTF-8 without NUL bytes",
    "Insert a checkable task list.",
    "Insert a teaching structure",
    "Insert activity",
    "Insert cross-reference",
    "Insert example at selection",
    "Insert literature citation",
    "Insert or edit footnote reference",
    "Insert recognized Markdown",
    "Insert reference",
    "Insert self-check",
    "Insert writing pattern",
    "Inserts an unsaved example with new stable IDs. Playback and reader choices are never saved. Edit the explanation, then preview and confirm through the normal save workflow.",
    "Inspect exact versions in the current article. Select an instance to review its parameters and prepare any supported upgrade.",
    "Installed extensions",
    "Integers only",
    "Interactive editor preview. Edit the static fallback body below.",
    "Invalid FrontMatter carrier HTML",
    "Invalid FrontMatter status",
    "Invalid JSON attributes",
    "Invalid JSON property",
    "Invalid MathML conversion input",
    "Invalid Unicode",
    "Invalid activity template",
    "Invalid author candidate patch",
    "Invalid block JSON",
    "Invalid boolean field type",
    "Invalid button link class",
    "Invalid code language",
    "Invalid code line metadata",
    "Invalid component catalog request.",
    "Invalid component name or version",
    "Invalid component property name",
    "Invalid component/version",
    "Invalid controlled relationship map configuration.",
    "Invalid cross-site media association map",
    "Invalid enum declaration",
    "Invalid field name",
    "Invalid highlighted lines",
    "Invalid image mapping",
    "Invalid integer budget",
    "Invalid knowledge map configuration.",
    "Invalid language or missing terminal newline",
    "Invalid link target",
    "Invalid local author draft",
    "Invalid native block class names",
    "Invalid native block nesting",
    "Invalid native block tag or class",
    "Invalid native block wrapper structure",
    "Invalid or conflicting registration identity or version",
    "Invalid or duplicate author tool registration",
    "Invalid or duplicate document tool registration.",
    "Invalid or duplicate version ID",
    "Invalid or repeated image mapping",
    "Invalid plain text field type, Unicode, or length",
    "Invalid relationship map configuration.",
    "Invalid stable teaching ID",
    "Invalid static syntax class",
    "Invalid static syntax token",
    "Invalid table alignment",
    "Invalid task item state or content",
    "Invalid template class",
    "Invalid text HTML",
    "Invalid text length budget",
    "Invalid versioned teaching directive",
    "Isolated conversion",
    "Isolated conversion failed. The configuration was not switched.",
    "Isolated conversion passed.",
    "Issue",
    "Issue date",
    "Issue date form",
    "Item",
    "Items",
    "Journal article",
    "Keep article numbering",
    "Keep as plain text",
    "Keep at most two active batches. Cancel an older batch or wait for expiry; the site also has a shared staging limit.",
    "Keep my changes and continue from the latest version",
    "Keep the current identity. Import a copy as a new draft instead.",
    "Kind",
    "Label",
    "Labels and keys must begin with an ASCII letter and contain at most 64 letters, digits, underscores or hyphens",
    "Language",
    "Language tag",
    "Last formal save: ",
    "Last paired backup: ",
    "Latest server version",
    "Left",
    "Left highlighted lines (comma-separated)",
    "Left language",
    "Left original code",
    "Left title",
    "Library source declarations",
    "Line differences: ",
    "Line link copied",
    "Link rel must be text",
    "Link rel must contain unique tokens from the closed safe set",
    "Link text cannot contain footnote markers",
    "Link text must not contain footnote references",
    "Links must have an href",
    "List item",
    "List items must start with a paragraph",
    "Listing",
    "Literal date",
    "Literal issue date",
    "Literal name or institution",
    "Literal names stay literal. Switching to person fields starts empty; enter the authored name parts explicitly.",
    "Literature citation",
    "Loading activity templates\u2026",
    "Loading component description\u2026",
    "Loading your active batches\u2026",
    "Local attachment IDs cannot be imported from a batch. Use portable images without another site's IDs.",
    "Local author edits are unapplied and not saved. Prepare or discard them to continue.",
    "Local block restoration only restores a candidate. The header proposal is preserved. Use a separate bridge preview and confirmation to apply metadata.",
    "Local document reference",
    "Local image references must be relative paths within the ZIP",
    "Local recovery is not enabled.",
    "Locally modified snapshot",
    "Locate error line",
    "Locate selection in preview",
    "Locate source",
    "Locate source object",
    "Located the containing structure.",
    "Located the source object.",
    "Logical document identity",
    "Logical identity copy mapping",
    "Logical identity handling",
    "Long code differences estimated by matching line positions: ",
    "Manual copying may normalize newlines. Download the original code to preserve bytes",
    "Mapped entries are a preview. Existing unapplied edits are preserved until you choose this candidate.",
    "Mapped publication fields",
    "MarkBridge image emoji",
    "MarkBridge settings sections",
    "MarkBridge teaching extensions",
    'MarkBridge: the conversion runtime is unavailable. <a href="',
    "Markdown after image target replacement and normalization (saving uses final WordPress media URLs)",
    "Markdown and block editing",
    "Markdown and blocks were saved together.",
    "Markdown and images ZIP",
    "Markdown candidate",
    "Markdown edit / upload",
    "Markdown editing bridge",
    "Markdown is missing or the source is too large.",
    "Markdown line ",
    "Markdown line %1$s%2$s",
    "Markdown line %1$s, column %2$s",
    "Markdown must be bounded UTF-8 text",
    "Markdown paste preview",
    "Markdown preserves original bytes. ZIP bundles only verifiable related images and prepares a portable copy. This does not save editor input.",
    "Markdown single file",
    "Markdown source",
    "Markdown source / preview",
    "Match case",
    "Matches the verified WordPress 7.1 templates.",
    "Matches: ",
    "Math (MathJax)",
    "Math contains a standalone $$ delimiter",
    "Math in image alternative text would be discarded by the current engine",
    "Math span must contain only text",
    "MathML validator unavailable",
    "Maximum three nested collapse containers",
    "Media attachment IDs must be positive safe integers",
    "Media caption HTML must be canonical and balanced",
    "Media captions exceed their structure budget",
    "Media captions only support text, strong, emphasis, deletion, code and line breaks",
    "Media captions require bounded single-line safe inline content",
    "Media commit markers did not complete",
    "Media copies for this import could not be prepared",
    "Merge %1$s",
    "Merge computation exceeded its budget. Preserve the candidate and compare manually",
    "Merge data has unknown or missing fields",
    "Merge data must be a closed object",
    "Merge permission was lost",
    "Merge permission was lost during paired verification",
    "Merge preparation did not complete. The original candidate and saved content are unchanged.",
    "Merge preparation failed",
    "Merge without overwriting keys",
    "Metadata authorization differs after image transformation",
    "Metadata proposal: editing this header does not automatically change article settings. Select fields in the editing bridge, preview again, and confirm.",
    "Metadata types or values differ from the signature",
    "Metadata, terms, the candidate, or the identity changed. Preview again.",
    "Migration requires an explicit unclaimed identity candidate.",
    "Minimum MarkBridge",
    "Mismatched block closing comment",
    "Mismatched closing block comment",
    "Mismatched code version count",
    "Missing bibliography entry: %1$s",
    "Missing block closing comment",
    "Missing closing block comment",
    "Missing footnote definition",
    "Missing reference target: %1$s",
    "Missing table header",
    "Mobile column stacking must be boolean",
    "Mobile starting branch",
    "Mode",
    "Month (optional)",
    "More",
    "More block must use its default exact marker",
    "More targets",
    "More than 128 conflicts were found. Download the candidate and resolve them manually",
    "More than 32 attachments were found for verification",
    "More than two adjacent inline breaks cannot be represented",
    "Move current version down",
    "Move current version up",
    "Move down",
    "Move up",
    "Multi-paragraph list",
    "Multilingual code tabs",
    "Must fix before saving: ",
    "My candidate",
    "My candidate: %1$s; latest server version: %2$s",
    "Name",
    "Name form",
    "Name suffix",
    "Named footnotes are not implemented in this prototype",
    "Namespaced dependencies and the standalone loading map are loaded.",
    "Narrow the search to at most 10000 matches.",
    "Native adapter serialized attributes or HTML cannot round-trip exactly",
    "Native blocks cannot round-trip exactly through Markdown. No candidate was created. Download them for safekeeping or adjust the blocks.",
    "Native code and preformatted blocks only support plain text",
    "Native details are limited to 8 nested levels",
    "Native footnotes require external post metadata and cannot be converted losslessly",
    "Native image attachment class and ID disagree",
    "Native image blocks cannot contain child blocks",
    "Native media attributes must be a closed object",
    "Native media exceeds the document structure budget",
    "Native saving did not complete and was rolled back.",
    "Native saving only preserves header proposals. Apply metadata by selecting fields, previewing, and confirming in the editing bridge.",
    "Native text HTML must match the canonical core save",
    "Native text leaves cannot contain body content",
    "Native text requires bounded plain text with LF line endings",
    "Near serialized block character ",
    "Near serialized block character %1$s",
    "Neither the source file nor the paired article was saved.",
    "New attachment ownership verification failed",
    "New collection",
    "New draft",
    "New images were not fully associated with the article",
    "New input entered during restoration checks is preserved. Preview again before restoring blocks.",
    "New input entered while uploading is preserved. The late file did not overwrite the candidate.",
    "New line number",
    "New media directory ownership verification failed",
    "New native blocks cannot round-trip exactly. No candidate was created. Download the original blocks for safekeeping.",
    "New-window links must include noopener",
    "Next match",
    "Next numbered lines",
    "Next page",
    "Next stage",
    "Next term",
    "No articles selected.",
    "No body changes.",
    "No compatible self-check templates are registered. Existing static content remains readable.",
    "No cross-branch relationships in this branch.",
    "No declared upgrade",
    "No fields are applied by default. Select fields and preview again. Clearing a selection changes neither current article settings nor the header.",
    "No indexed objects in the current content.",
    "No matching articles in this page.",
    "No matching articles in this scan. Continue to the next page.",
    "No matching text.",
    "No proven preview range for this selection. Preview the current source again.",
    "No readable reference targets found.",
    "No reading is available for this term.",
    "No recoverable candidate exists for the current identity and version.",
    "No runtime directory is configured.",
    "No selectable revision exists.",
    "No versioned metadata proposal exists. An unversioned header remains ordinary body content.",
    "Node",
    "Node (private server runtime)",
    "Node diagram",
    "Node role",
    "Nodes",
    "Non-dropping particle",
    "Nothing is stored by default. When enabled, drafts are stored as unencrypted text in this browser and may be accessible to other users of a shared device. At most 8 records and 1 MiB total, expiring after 7 days. This is not a substitute for saving to the site.",
    "Numbered lines %1$s\u2013%2$s; the complete code remains visible.",
    "Numbered object",
    "Numbers must be finite",
    "Numeric",
    "Object %1$s must contain exactly one matching formula, image, table or code block. The existing body has been preserved.",
    "Object numbering",
    "Object or statement kind",
    "Old line number",
    "Older baseline; compare and resolve conflicts before saving.",
    "One bibliography is allowed at top level before footnotes, without body blocks",
    "One footnote section is allowed, at the document end",
    "One nonempty top-level steps group is permitted",
    "One provider plugin can include many component types. Exact versions are compatibility records, not separate plugins or questions.",
    "One source file and the standard library. The editor preview does not execute programs.",
    "One source file and the standard library. The example remains readable when execution is unavailable.",
    "Only HTTP, HTTPS, mailto and relative links are supported",
    "Only a saved managed article that remains editable can be exported.",
    "Only a simple code language identifier is supported",
    "Only administrators can view the source write audit.",
    "Only creates an unsaved candidate. Fences, FrontMatter, and complete teaching containers are compared atomically. Ambiguous repeated structures require explicit choices. Newlines and trailing whitespace retain their original bytes.",
    "Only currently readable incoming references are shown. Other articles are not changed.",
    "Only derived identifiers are indexed. Existing article bodies are never changed by initialization or rebuild.",
    "Only link buttons are supported, not action buttons",
    "Only matching fenced versions are allowed",
    "Only paired, explicitly supported WordPress blocks are accepted",
    "Only registered local resources are allowed",
    "Only steps are permitted in a steps group",
    "Only unlinked native images are supported in this version",
    "Open an article by its title. Connections suggest reading paths; choose your own starting point.",
    "Open created draft",
    "Open the original image",
    "Opening version",
    "Operation completed.",
    "Option",
    "Optional ZIP dependencies are unavailable. Markdown single-file download remains available.",
    "Optional cover attachment ID",
    "Options",
    "Order",
    "Original Markdown",
    "Original Markdown bytes, including header and code newlines, will be downloaded. Image URLs are preserved; images are not bundled.",
    "Original code for manual copying",
    "Original code for the current version",
    "Original header selections are preserved. Preview again to obtain a new receipt.",
    "Other registered providers",
    "Overlapping image syntax",
    "Overlapping image syntax cannot be projected reliably",
    "PHP (bundled; no Node directory required)",
    "PHP 8.2 or newer.",
    "PHP conversion",
    "PHP conversion dependencies",
    "PHP conversion dependencies are unavailable or conflict. Original content was not written.",
    "PHP conversion dependencies are unbuilt, missing, or differ from their manifest.",
    "PHP conversion failed. Node was not used as a fallback.",
    "PHP dependencies failed to load or conflict with an existing dependency. Node was not used as a fallback.",
    "PHP extensions",
    "PHP paired conversion passed.",
    "PHP proc_open is unavailable; isolated conversion cannot run.",
    "PHP process execution is unavailable. Node conversion did not run; original content was not written.",
    "PHP version",
    "Pages",
    "Paired backup failed. Current input remains in the editor. ",
    "Paired backup storage failed. Current input is preserved; try again or download your candidate.",
    "Paired backup storage is full. Delete some of your older backups or contact an administrator. Current input is preserved.",
    "Paired backup verification failed. Current input is preserved; compare the article and try again.",
    "Paired backups require the core WordPress MySQL connection. Normal editing remains available.",
    "Paired body or accompanying field verification failed",
    "Paper notes",
    "Paragraph parsing failed",
    "Paragraphs, headings, quotes, lists, task lists, tables, images, links, code, TeX formulas, named footnotes, and restricted HTML are supported. Styles, extra attributes, and third-party blocks must still pass round-trip validation.",
    "Parameter JSON (data only)",
    "Parameter JSON (data only; verified on save)",
    "Parameter form",
    "Parameter structure exceeds budget",
    "Parameters",
    "Parameters are data only. Explicitly apply or discard them. No code is executed.",
    "Parameters are unapplied; article saving is paused. Apply or discard them to continue.",
    "Parameters exceed 16 KiB",
    "Parameters exceed the supported depth.",
    "Parameters have not been applied. Apply or discard the parameter input before saving.",
    "Parameters must be a JSON object",
    "Parent term",
    "Passed",
    "Pasted source",
    "Pending resource hint fields are invalid",
    "Pending resource hints were preserved. If these images are still referenced, upload the original ZIP again or remove them. Body content is preserved.",
    "Pending review",
    "Permission verification failed. Recovery is paused and local candidates are preserved.",
    "Permission was lost and the browser refused cleanup. Clear this site's local candidates in the browser's site data settings.",
    "Permissions and resolved values will be checked again in the server preview.",
    "Permissions changed while reading merge inputs",
    "Portable document reference",
    "Portable exports cannot carry local media attachment IDs",
    "Post-save content verification failed",
    "Practice",
    "Preface",
    "Prepare a copy with a new identity",
    "Prepare bibliography v2 candidate",
    "Prepare conflict repair with a new identity",
    "Prepare controlled document links upgrade",
    "Prepare explicit identity migration",
    "Prepare export and resource manifest",
    "Prepare initial parameters",
    "Prepare or discard local author edits before applying parameters.",
    "Prepare relationship layout upgrade",
    "Prepare snapshot",
    "Prepare the identity operation again. Current input is preserved.",
    "Prepare three-way merge",
    "Preparing the export manifest\u2026",
    "Preparing this item. No article or media is created by preview.",
    "Preparing writing pattern\u2026",
    "Presentation resources could not be loaded",
    "Preserve current component ",
    "Preview BibTeX mapping",
    "Preview CSL-JSON mapping",
    "Preview and explicitly confirm the write for a source-managed article.",
    "Preview image encoding failed.",
    "Preview image verification failed.",
    "Preview images exceed their budget.",
    "Preview math font files are invalid. Try again.",
    "Preview math fonts exceed their size budget.",
    "Preview math fonts failed to load. Try again.",
    "Preview resources expired. Upload the ZIP again",
    "Preview the current source to enable navigation.",
    "Preview the mapping to the existing six bibliography fields. The entry type and original BibTeX are not stored separately. Nothing is applied until you apply bibliography edits.",
    "Preview the metadata selection again before confirming.",
    "Preview this item",
    "Preview this item again before creating its draft.",
    "Preview, then confirm the source write",
    "Previewed; not saved",
    "Previous match",
    "Previous numbered lines",
    "Previous page",
    "Previous stage",
    "Previous term",
    "Prior understanding",
    "Prior understanding supports comprehension without restricting access; explanations and practice connect the material.",
    "Private",
    "Private Node.js is missing, outdated, or does not match the manifest.",
    "Private batch staging is unavailable.",
    "Private collection storage is unavailable. Refresh before retrying; no successful operation was reported.",
    "Private export staging could not be created",
    "Private input staging failed.",
    "Private to your account. Up to 10 backups per article for 7 days; site quota 32 MiB. Restoring opens a candidate for comparison. Only an explicit save can update WordPress or a source file. New drafts and unconverted input use browser recovery.",
    "Process execution",
    "Proof",
    "Proposal: ",
    "Proposed citation key",
    "Proposed reference key",
    "Proposed stable ID",
    "Protocol",
    "Public",
    "Publication and source fields are limited to 512 plain characters",
    "Publication fields remain on this page. Adopt again to restore them before saving.",
    "Publication metadata and numbering",
    "Publication or source",
    "Publication title",
    "Published",
    "Published privately",
    "Published publicly",
    "Publisher",
    "Question",
    "Question, hint, derivation and experiment",
    "Raw FrontMatter header",
    "Raw button attributes do not describe a link button",
    "Raw details attributes have invalid types or non-neutral values",
    "Re-verifying the opening baseline and latest server version\u2026",
    "Read by stage",
    "Read permissions",
    "Read source",
    "Read the complete activity",
    "Read the latest server version again",
    "Reading",
    "Reading ZIP data failed",
    "Reading language",
    "Reading mode (full / staged)",
    "Reading revisions\u2026",
    "Reading suggestion: ",
    "Reading the latest server version\u2026",
    "Reading the server version\u2026",
    "Ready for preview",
    "Received files",
    "Rechecking permissions, the article, and images\u2026",
    "Recognized result",
    "Recovery permission verification did not complete. Local recovery is paused; edited content remains on the page.",
    "Recovery permissions could not be verified again. Local recovery is paused; edited content remains on the page.",
    "Redo source change",
    "Reduce document size or nesting and use UTF-8 text without NUL.",
    "Reference",
    "Reference URL (HTTP or HTTPS)",
    "Reference index operation completed.",
    "Reference markers affected; no changes have been applied.",
    "Reference permissions changed. Prepare the export again.",
    "Reference target",
    "Reference title",
    "Reference transaction required.",
    "Reference type",
    "Reference verification failed. Current input is preserved.",
    "References within this batch point to its new drafts. References outside the batch are preserved.",
    "Refresh batch status",
    "Refresh collections",
    "Refresh content navigation",
    "Refresh or sign in again to verify recovery permissions.",
    "Refresh paired backups",
    "Registered teaching component",
    "Rejected registrations",
    "Related practice",
    "Relations suggest reading paths and connections; choose your own starting point.",
    "Relationship canvas; arrow keys pan when drag mode is on",
    "Relationship explanation",
    "Removal count",
    "Remove article",
    "Remove author",
    "Remove bibliography entry",
    "Remove end date",
    "Remove field",
    "Remove item",
    "Remove references before deleting this item:",
    "Rename label and references",
    "Rename label or reference key",
    "Replace all",
    "Replace bibliography entries",
    "Replace selection",
    "Replace with",
    "Replaced matches: ",
    "Report",
    "Request and base documentId must match",
    "Request failed",
    "Reserved internal marker",
    "Reserved internal teaching markers cannot be Markdown input",
    "Reset size",
    "Reset view",
    "Resource SHA-256",
    "Resource ZIP import requires PHP zip, intl, and POSIX-safe staging. Ordinary Markdown editing remains available.",
    "Resource content changed. Upload the ZIP again",
    "Resource import did not complete. The source was not written.",
    "Resource import envelope fields are invalid",
    "Resource import is unavailable on this site. It requires zip, intl, safe staging, and media upload permission. Ordinary Markdown remains editable.",
    "Resource import permission was lost",
    "Resource import requires Web Crypto verification in HTTPS or a trusted local environment. Ordinary Markdown remains editable.",
    "Resource import requires a valid document ID",
    "Resource manifest verification failed. Upload the ZIP again",
    "Resource preview was canceled.",
    "Resource staging could not be created",
    "Resource staging write failed",
    "Resources changed after preview",
    "Resources changed during download. Prepare again",
    "Resources changed during preparation. Prepare again",
    "Restart rebuild",
    "Restoration differences",
    "Restoration provenance could not be recorded",
    "Restore candidate and view differences",
    "Restore revision",
    "Restore the selected revision's title, Markdown, and blocks. The current saved version is preserved in history. Article ID, author, and visibility remain unchanged.",
    "Restore to current blocks (without saving)",
    "Restored candidates and new articles have no trusted opening baseline for this session. Compare manually.",
    "Restoring both representations together\u2026",
    "Resume batch",
    "Retry formula typesetting",
    "Retry local recovery verification",
    "Retry verification or download the current candidate.",
    "Return to footnote ",
    "Return to footnote %1$s, reference %2$s",
    "Return to tabbed reading",
    "Reverse conversion requires an explicit Markdown source document",
    "Review and explicitly acknowledge the proposed citation keys before adopting the candidate",
    "Review and explicitly acknowledge unsupported CSL-JSON fields before adopting the candidate",
    "Review document candidate",
    "Review the conflicting article and prepare a new identity.",
    "Review the content below, then create only this draft. A created draft remains saved if another item fails.",
    "Review this item",
    "Revision content preview",
    "Revision content verification failed",
    "Revision restoration cannot automatically apply header metadata.",
    "Revision restoration cannot import new ZIP resources.",
    "Revision save failed",
    "Revisions / restore",
    "Right",
    "Right highlighted lines (comma-separated)",
    "Right language",
    "Right original code",
    "Right title",
    "Rights statement",
    "Rows",
    "Runtime dependencies",
    "Runtime directory",
    "Runtime manifest",
    "Safe source file write failed.",
    "Safe staging requires POSIX process identity checks",
    "Save after checking the preview",
    "Save as ",
    "Save collection configuration",
    "Save directly; both formats stay in sync",
    "Save display settings",
    "Save needs verification; do not import again",
    "Save status",
    "Save succeeded. Only this tab's candidates matching this save were cleaned; other changes are preserved.",
    "Save the adopted document with the normal editor Save / Update action. Its exact source has not been saved.",
    "Saved collections",
    "Saving both representations\u2026",
    "Saving did not complete and was rolled back.",
    "Saving failed and rollback was unavailable. Contact an administrator.",
    "Scan finished. Correct blocked originals or preview valid items. Duplicate warnings do not overwrite existing articles.",
    "Scan selected files",
    "Scanning files. No articles or media are created.",
    "Scheduled",
    "Scroll horizontally to read long lines. Focus the code and use the arrow keys.",
    "Search",
    "Search articles",
    "Search editable articles",
    "Search for saved articles you can edit.",
    "Search managed articles",
    "Search reference targets",
    "Searching managed articles\u2026",
    "Select a preview object, or use Tab and Enter, to locate its source.",
    "Select at least one article before preparing a snapshot.",
    "Select code line %1$s",
    "Select editable public articles without passwords, or explicitly include selected private drafts. Password-protected articles are not supported.",
    "Select instance",
    "Select the same bibliography block before using this candidate",
    "Selected article usage",
    "Selected files repeat a logical identity. Correct the ambiguous originals before preparing the batch.",
    "Selected mathematical expression",
    "Selected relationship",
    "Selected the containing structure.",
    "Selected the source object.",
    "Self checks",
    "Semantic exploration is unavailable for this formula.",
    "Separator must be empty",
    "Series",
    "Server paired backups",
    "Server title: %1$s; status: %2$s.",
    "Set current version as default",
    "Sets the first mobile view. Readers can switch branches or open the full map.",
    "Shared arrivals use a neutral color.",
    "Shorten node titles or article URLs, or reduce relationships to fit the static output budget.",
    "Show all code versions",
    "Show copy buttons in frontend code toolbars. Highlighting and language labels remain available.",
    "Show diagram",
    "Show entire branch",
    "Show full text",
    "Show in map",
    "Show line numbers beside frontend code blocks.",
    "Show more code lines",
    "Show more differences",
    "Show more lines",
    "Show relationship",
    "Sign in again with an account that can edit.",
    "Sign in with an account that can create drafts.",
    "Sign-in or editing permission was lost. This account's local candidates were cleared. Sign in and explicitly enable recovery again.",
    "Simple items can contain only nested simple lists",
    "Simple task lists were unsupported by the historical parser",
    "Size",
    "Snapshot ZIP",
    "Snapshot matches declared version",
    "Software",
    "Some articles may be unavailable.",
    "Some component families have no verified available version. Choose a historical version to inspect them.",
    "Some interrupted media could not be cleaned. Try later",
    "Some structures have only partial position hints.",
    "Source",
    "Source and differences",
    "Source and serialized snapshot do not match",
    "Source beside preview",
    "Source binding verification failed.",
    "Source comparison unavailable",
    "Source declarations do not prove authenticity or grant library access. Article snapshots remain readable without the library.",
    "Source file content or its version fingerprint is missing.",
    "Source must preserve its trailing newline. Use the button below to add it explicitly.",
    "Source version history could not be saved",
    "Source, canonical source, and blocks are each limited to 256 KiB, with at most 10,000 nodes and 32 levels. Exceeding a budget is rejected without switching backends.",
    "Source-managed articles cannot import new ZIP media. Maintain resources through the original source.",
    "Stable ID",
    "Stable code group ID",
    "Stable document ID",
    "Stable version ID",
    "Stage",
    "Stage %1$s",
    "Stage %1$s / %2$s",
    "Stage and activity targets require an existing logical identity. Maintain it with the document identity tools before choosing a target.",
    "Stage mode must be full/staged and the full-text entry must be enabled",
    "Stage navigation",
    "Staging cleanup did not complete",
    "Staging directory cleanup did not complete",
    "Staging directory permissions could not be restricted",
    "Standard input",
    "Start",
    "Start date",
    "Start interactive demonstration",
    "Starting item",
    "Starting line number",
    "Starting line: %1$s",
    "Statement %1$s requires body content.",
    "Statements",
    "Static HTML embeds verified local images and typeset formulas for offline reading. External images become links and are not fetched; unverified local images are refused. All stages and code versions are included; interactive demonstrations use their static fallback.",
    "Static HTML embeds verified local images and typeset formulas for offline reading. External or unrelated images are refused. All stages and code versions are included; interactive demonstrations use their static fallback.",
    "Static HTML for offline reading",
    "Static HTML preview",
    "Static HTML requires every image to be a verified local attachment of this article",
    "Static activity relations",
    "Static adapter ",
    "Static adapter HTML does not match the registered template",
    "Static adapter containers must not contain body content",
    "Static adapter parameters (JSON)",
    "Static adapters must not contain child blocks",
    "Static adapters must not contain nested blocks",
    "Static block registrations changed during conversion. The candidate was not written.",
    "Static block registrations changed during saving",
    "Static block registrations changed or were not confirmed. Keep the candidate and preview again.",
    "Static fallback content is always preserved. Start the interactive component explicitly.",
    "Static registrations changed while preparing the candidate. Preview again.",
    "Static registrations changed while preparing the native candidate. Verify it again.",
    "Static registrations changed while rendering the preview. The candidate was not written. Preview again.",
    "Static syntax engine unavailable",
    "Static syntax resource timeout",
    "Static syntax resource unavailable",
    "Static syntax token budget",
    "Static view unavailable. Original content and read-only configuration are preserved.",
    "Static view unavailable. The original explanation remains readable.",
    "Status",
    "Status refreshed. Preview unfinished items again before confirmation.",
    "Step must be a direct child of steps",
    "Structure",
    "Structured reading and exploration",
    "Structured year, month and day",
    "Suggested reading order",
    "Sync by content anchors",
    "Synchronize horizontal scrolling",
    "Synchronous JavaScript. The input variable contains the standard input text. The editor preview does not execute programs.",
    "Synchronous JavaScript. The input variable contains the standard input text. The example remains readable when execution is unavailable.",
    "Table",
    "Table blocks cannot contain child blocks",
    "Table column counts differ",
    "Table must have exactly one header row",
    "Table requires one header and at most one body",
    "Table width must be consistent",
    "Tables",
    "Tag slugs",
    "Target",
    "Target type",
    "Task content",
    "Task content HTML disagrees with its attribute",
    "Task item",
    "Task list",
    "Task lists are not supported here",
    "Task marker disagrees with checked state",
    "Task requires its marker and content span",
    "TeX contains unescaped dollar signs and cannot be converted without loss.",
    "TeX copied",
    "TeX inside native MathML differs from the formula source.",
    "TeX source",
    "Teaching ID conflicts with a body anchor",
    "Teaching IDs must be unique within the document",
    "Teaching attributes must be a valid JSON object",
    "Teaching attributes must be valid Unicode",
    "Teaching body cannot be empty",
    "Teaching body content must not be empty",
    "Teaching boundary AST exceeds structural limits",
    "Teaching component",
    "Teaching container attributes are incomplete, unknown, or have invalid types",
    "Teaching container depth must not exceed 31 levels",
    "Teaching containers require a complete :::mbb:v1 name and JSON attributes",
    "Teaching example",
    "Teaching nesting exceeds the structural limit",
    "Teaching settings",
    "Teaching structure exceeds depth or node limits",
    "Teaching structure exceeds its depth or node budget",
    "Teaching structures",
    "Teaching title must be nonempty single-line text",
    "Technical block %1$s has incomplete or invalid fields.",
    "Technical details",
    "Technical object settings",
    "Technical objects and statements must not be inside footnotes",
    "Technical objects exceed the document budget",
    "Technical references exceed the document budget",
    "Technical references must not be inside links or images",
    "Technical tutorial",
    "Technical writing",
    "Template tag nesting would change the saved structure",
    "Templates are limited to 64 nodes and 8 levels",
    "Templates only allow fixed safe tags",
    "Terminal newline does not match code",
    "Terminal newline must be boolean",
    "Text blocks cannot contain child blocks",
    "Text edits have not been applied. Apply or discard them before saving.",
    "The BibTeX file could not be read as bounded UTF-8 text",
    "The FrontMatter closing delimiter is missing",
    "The FrontMatter version must be 1",
    "The HTML anchor differs from the block attribute",
    "The MathJax script could not be loaded",
    "The PHP conversion service did not complete. Original content was not written.",
    "The PHP converter has not been verified with this WordPress version.",
    "The PHP converter requires PHP 8.2.",
    "The PHP process can read runtime files.",
    "The PHP process cannot read the runtime directory or worker.cjs.",
    "The ZIP contains duplicate or Unicode-equivalent paths",
    "The ZIP contains links, special files, encryption, or an unsupported compression method",
    "The ZIP could not be completed",
    "The ZIP document failed closed conversion. Correct the document first",
    "The ZIP entry could not be read",
    "The ZIP includes %1$s verified images. Only image targets are replaced with portable paths. External or unrelated images retain their URLs. Verify the copy below. The manifest contains no author, private notes, or source file paths.",
    "The ZIP is invalid or damaged",
    "The ZIP must contain one Markdown document",
    "The ZIP path contains empty segments, traversal, or aliases",
    "The ZIP path is invalid",
    "The ZIP path is not valid Unicode",
    "The actual source file differs from the saved pair. Automatic three-way merge is unavailable; reconcile the source normally first",
    "The actual streamed ZIP expansion exceeds its budget",
    "The adapter snapshot JSON is invalid",
    "The adapter version does not match. Original configuration is preserved but cannot convert new candidates",
    "The adopted candidate was edited before saving or its baseline changed. Your input is preserved. Copy your current edits for safekeeping, then undo back to the saved original, reopen the tool, and prepare and save the candidate before editing its body.",
    "The anchor duplicates a document ID",
    "The applied document candidate expired or its baseline changed. Your input is preserved. Undo it and prepare the candidate again before saving.",
    "The article ID is missing.",
    "The article changed again while reading. Read the latest server version again",
    "The article changed again while reading. Reopen the editor",
    "The article changed. Its current version cannot masquerade as the opening baseline",
    "The article changed. Preview again before importing",
    "The article contains an unsafe HTML attribute",
    "The article contains an unsafe inline style",
    "The article contains content outside the static HTML subset",
    "The article does not exist.",
    "The article exceeds the component description budget.",
    "The article has more than 32 related images; silent truncation is not allowed",
    "The article has newer changes. Reload and merge them.",
    "The article identity changed",
    "The article identity changed during paired verification",
    "The article identity or pair changed while reading. Reconcile again",
    "The article is currently unavailable for recovery. Restore it normally through WordPress first.",
    "The article is deleted, trashed, or not yet managed. Restore it normally or create a new document first.",
    "The article is trashed or not editable. Local candidates are preserved. Restore the article normally through WordPress first.",
    "The article is unavailable or changed. Reload to continue.",
    "The article or source binding changed. The old baseline cannot be reused",
    "The article or source binding identity changed. Verify it again before synchronization.",
    "The article record could not be locked",
    "The article search input is invalid.",
    "The article snapshot is incomplete.",
    "The article was deleted and cannot be recreated with its old identity.",
    "The article was deleted. Local candidates are preserved but cannot restore it or recreate its old ID.",
    "The article, source identity, or version changed. Upload the ZIP again",
    "The author candidate changed. Preview again.",
    "The author or site identity changed. Local recovery is disabled.",
    "The batch exceeds its file type, per-file or 16 MiB upload budget.",
    "The batch exceeds the 128 MP image processing budget.",
    "The batch exceeds the 32 MiB expanded budget.",
    "The batch expired or is unavailable. Prepare the files again.",
    "The batch expired. Saved drafts remain; prepare the remaining files again.",
    "The batch identity is invalid.",
    "The batch lock could not be opened.",
    "The batch operation did not complete. Refresh its status before trying again.",
    "The batch preview is incomplete. Refresh its status.",
    "The batch staging directory could not be created.",
    "The bibliography must precede footnote definitions",
    "The block attribute JSON is invalid",
    "The block candidate has no successfully generated Markdown. Current blocks are preserved. Check the title and status first.",
    "The block editor has unsaved changes. Save through the bridge before restoring a revision.",
    "The block formula closing $$ is missing",
    "The block formula lacks paired $$ delimiters",
    "The block wrapper contains unknown or non-neutral attributes",
    "The body changed. Select it again before creating a formula.",
    "The body is identical.",
    "The body is synchronized from a source file; preview and confirm the source write",
    "The body may contain at most 256 distinct image references for export",
    "The bound source changed while reading. Reconcile again",
    "The bound source exceeds its safe read budget",
    "The bound source file could not be read",
    "The bound source file could not be read. The displayed Markdown is the WordPress saved copy and may not be the latest source file. Viewing and previewing only.",
    "The bound source file is currently not writable.",
    "The bound source file is currently unavailable.",
    "The bound source file was read for viewing and previewing only. Use the synchronization tool to update it.",
    "The bound source file was read. Edit it, preview the differences, and explicitly confirm the source write.",
    "The bound source is not a bounded regular file. Reconcile the source normally first",
    "The bound source is unavailable. Preserve the candidate and reconcile manually",
    "The browser refused storage cleanup. Clear site data in the browser settings. Edited content remains on the page.",
    "The button link contains unknown attributes",
    "The button link has an unsafe scheme or character",
    "The button text paragraph is unclosed",
    "The candidate JSON exceeds 256 KiB. Edited content remains on the page and can be downloaded.",
    "The candidate body exceeds 256 KiB or has an unsupported format. Edited content remains on the page and can be downloaded.",
    "The candidate changed. Preview the differences again before saving.",
    "The candidate could not be restored as blocks.",
    "The candidate is damaged, expired, or has a different identity or baseline. Body content was not restored.",
    "The candidate is in the difference preview and has not been written to WordPress or the source file.",
    "The candidate or opening baseline changed after the merge preview",
    "The code example parameters are invalid. Preserve the original content and check the source and input.",
    "The code group fence structure is incomplete",
    "The code language is invalid or the trailing newline is missing",
    "The code language must be a safe ASCII token of at most 64 characters",
    "The collection budget is full. Cancel an unused candidate or reduce the selected articles or images. Saved articles are unchanged.",
    "The collection input is invalid. Current fields are preserved.",
    "The collection operation failed. Current fields are preserved.",
    "The collection, article, permissions, or resources changed. Prepare a new snapshot; saved articles are unchanged.",
    "The commit result could not be reliably confirmed. Current source, media, and import records are preserved. Verify the article before importing again.",
    "The commit result could not be reliably confirmed. Verify the article before saving again.",
    "The component catalog changed. Refresh the list before continuing.",
    "The component changed while this candidate was open. Review or discard the candidate.",
    "The component could not be loaded.",
    "The component initialization envelope exceeds its budget.",
    "The component is missing or incompatible. Preserve its configuration or enable the matching extension before editing.",
    "The component is missing or incompatible. Static fallback content and configuration are preserved.",
    "The component is missing, incompatible, or failed resource verification. Static fallback content and configuration are preserved.",
    "The component message could not be sent.",
    "The component message exceeds its budget.",
    "The component message format is invalid.",
    "The component resource digest does not match",
    "The component resource has an unexpected content type.",
    "The component resource is too large",
    "The component resource is unavailable",
    "The compressed archive is limited to 8 MiB. Images were not truncated",
    "The confirmed candidate was saved, but subsequent local recovery cleanup did not complete. Current input is preserved. Preview again or download it.",
    "The confirmed candidate was saved. Input entered while saving is preserved and unsaved. Re-upload the ZIP if images still refer to its original paths.",
    "The content changed. Preview the differences again.",
    "The content does not satisfy the server HTML allowlist and was not saved.",
    "The content is hidden and its interactive preview was terminated. Expand it to start again.",
    "The content is unchanged; no duplicate write is needed.",
    "The conversion backend configuration is invalid. No other backend will be used as a fallback.",
    "The conversion backend could not be saved. Check the database state. No successful switch was reported.",
    "The conversion backend is managed by server constants. Database settings are unchanged.",
    "The conversion backend settings are invalid. Original content was not written.",
    "The conversion backend was verified and applied.",
    "The conversion kernel differs from the plugin. Rebuild the runtime.",
    "The conversion kernel matches.",
    "The conversion library matches its locked dependency manifest.",
    "The conversion runtime is ready",
    "The conversion runtime is unconfigured or incompatible with this plugin or WordPress. Original content was not written.",
    "The conversion runtime needs attention. See the diagnostics below",
    "The conversion service did not complete. Original content was not written.",
    "The conversion service is unavailable.",
    "The conversion worker matches.",
    "The converter is processing another request or the shared lock is unreadable. Try later and check permissions.",
    "The core script snapshot differs. Rebuild the runtime.",
    "The core script snapshot matches.",
    "The current account cannot export this article.",
    "The current account cannot import media.",
    "The current account cannot prepare a merge for this article or source file",
    "The current article changed. Resolve the version conflict first. The header was not changed.",
    "The current article changed. Resolve the version conflict first. The original baseline is preserved.",
    "The current candidate is temporarily locked for an accurate comparison. Choose differing title, status, and featured image values explicitly before continuing manually, then preview again.",
    "The current content includes unsupported blocks: %1$s%2$s. Preserve the content, adjust it, and preview again.",
    "The current document version is missing. Reload before saving.",
    "The current formula could not be located. Select it again.",
    "The current logical identity must be retained. Prepare an explicit copy candidate instead.",
    "The current user's staging directory could not be prepared",
    "The database save baseline could not be verified. Neither the article nor the source file was written.",
    "The database was rolled back, but some newly created media could not be removed. Verify the import state.",
    "The database was rolled back, but the source file could not be restored.",
    "The declared ZIP size differs from its actual stream",
    "The declared uncompressed ZIP size exceeds its budget",
    "The default version must reference an ID in the group",
    "The dependency lockfile differs.",
    "The dependency lockfile matches.",
    "The details open state differs from its HTML",
    "The details open state must be boolean",
    "The directory does not exist.",
    "The directory exists.",
    "The displayed source, metadata, or source fingerprint does not match the signed baseline",
    "The document ID already exists. Continue editing the existing document.",
    "The document ID is invalid.",
    "The document ID must begin with a letter and contain 3\u201364 ASCII letters, digits, underscores, or hyphens.",
    "The document candidate is unavailable or expired. Save current edits and reopen the tool.",
    "The document lock could not be created.",
    "The earlier candidate preview did not complete. New input is preserved. Preview the differences again.",
    "The earlier candidate was not confirmed as saved. New input is preserved. Preview the differences again.",
    "The editing session or input changed. Local recovery was not applied; current content is preserved.",
    "The enum value is not in the registered set",
    "The excerpt contains HTML that WordPress would rewrite and was not applied.",
    "The excerpt contains disallowed HTML.",
    "The excerpt is limited to 8 KiB and must not contain invalid control characters",
    "The execution summary exceeds its budget or has an invalid format.",
    "The existing article pair is invalid and cannot establish existing media links",
    "The export archive could not be created",
    "The export candidate does not belong to the current identity",
    "The export candidate expired or was canceled. Prepare again",
    "The export candidate identity does not match",
    "The export confirmation receipt does not match",
    "The export directory contains unknown files and was not removed",
    "The export file could not be removed",
    "The export file is unsafe",
    "The export identity is invalid",
    "The export is still preparing or was interrupted. Cancel it or wait for cleanup",
    "The export manifest is incomplete. Download was not allowed.",
    "The export request did not complete. Check permissions and the network, then prepare again.",
    "The export request has invalid field types",
    "The export request has unknown or missing fields",
    "The export sidecar fields or body/image digests do not match. Import was rejected",
    "The export staging path is unsafe",
    "The export was canceled or claimed during confirmation",
    "The exported body could not be written",
    "The featured image ID is invalid.",
    "The featured image must be a nonnegative safe integer",
    "The field has an invalid type.",
    "The file is too large.",
    "The file was read but has not been saved. Preview the differences first.",
    "The final media URL cannot round-trip exactly",
    "The final media URL does not belong to this import",
    "The footnote definition section must be at the end of the document",
    "The footnote definition section must be last and contain definitions",
    "The footnote marker differs from its name",
    "The format changed. Prepare the export again.",
    "The formula cannot be typeset.",
    "The formula changed. Select it again.",
    "The formula engine cannot parse this TeX.",
    "The formula engine did not verify this TeX.",
    "The formula engine document could not be loaded",
    "The formula interface is not ready",
    "The formula is being typeset; showing TeX source temporarily",
    "The formula is too long",
    "The formula preview engine is unavailable for static export",
    "The formula syntax cannot be typeset",
    "The group label differs from its HTML",
    "The header proposal changed. Previous metadata selections were reset; choose them again.",
    "The historical identity differs. Compare the exact revision without changing the current identity.",
    "The history candidate provenance could not be saved.",
    "The image URL does not match its local attachment",
    "The image digest could not be read",
    "The image extension, MIME type, and actual image data do not agree",
    "The image manifest is invalid.",
    "The image path is not canonical",
    "The image path must not contain symbolic links",
    "The image pixels exceed the remaining batch budget",
    "The import commit state is uncertain. Media and private records are preserved. Verify the article before trying again",
    "The installed extension catalog exceeds its display budget.",
    "The integer exceeds its registered budget",
    "The interactive preview is closed.",
    "The isolated component attempted unauthorized navigation.",
    "The isolated component is ready.",
    "The item count is outside the registered bounds.",
    "The latest server signature is incomplete",
    "The latest server version could not be read: %1$s. The candidate remains in the editor. Try reading again.",
    "The local block candidate is for preview only. Source-managed articles still require the source workflow; save restrictions remain in effect.",
    "The local block candidate was verified. Confirmation only restores it to the current editor and does not save it to the site.",
    "The local candidate was updated and has not been saved to the site.",
    "The local difference exceeds 12,000 cells. Compare manually",
    "The local image attachment is missing or is not available to this author",
    "The manifest format is valid.",
    "The manually adopted baseline has not been signed again. Future conflicts can still be compared manually.",
    "The media library directory is unavailable",
    "The merge baseline document has an invalid shape or exceeds its budget",
    "The merge baseline does not belong to the current user, site, or article identity",
    "The merge baseline failed complete paired verification",
    "The merge baseline signature does not match",
    "The merge body, metadata, or source projection differs from the signature",
    "The merge request identity is invalid",
    "The merge signature projection exceeds its budget or is not valid JSON",
    "The merged candidate has not been saved. Verify its title, status, featured image, and FrontMatter proposal, then preview all differences again.",
    "The merged result failed closed conversion. The original candidate is preserved",
    "The metadata preview receipt expired.",
    "The metadata selection contains an unknown field.",
    "The metadata selection contains duplicates.",
    "The metadata selection is invalid.",
    "The native MathML contains unsupported attributes.",
    "The native MathML contains unsupported elements.",
    "The native MathML contains unsupported structure.",
    "The native MathML could not be parsed.",
    "The native MathML is invalid.",
    "The native MathML lacks a unique TeX source annotation.",
    "The native MathML lacks verifiable semantic structure.",
    "The native editor did not retain the complete candidate. Current input is preserved; use Markdown edit / upload to preview it again.",
    "The native editor is synchronizing Undo or Redo. Your input is preserved. Wait for the editor to finish, then save again.",
    "The native formula changed during verification. Select it again before converting.",
    "The native formula contains nested blocks and cannot be converted without loss.",
    "The native formula has extra formatting or attributes and cannot be converted without loss.",
    "The native formula has extra styles or attributes and cannot be converted without loss.",
    "The native formula has no usable TeX or exceeds its length budget.",
    "The native formula's display structure could not be verified. Preserve the native formula.",
    "The native formula's display structure differs from its TeX and cannot be converted without loss.",
    "The new block candidate was verified. Check its title, document ID, and differences, then explicitly create a managed draft with paired Markdown and blocks.",
    "The new draft identity is invalid.",
    "The new media directory already exists. No existing resources were overwritten",
    "The new media directory contains links or objects outside its boundary",
    "The number is outside the registered bounds.",
    "The opening baseline expired. Preserve the candidate and reconcile again",
    "The opening baseline or latest version identity changed while reading",
    "The opening version is missing",
    "The original English reading is available, but this expression cannot be explored structurally.",
    "The original categories or tags could not be read",
    "The original code contains CR/CRLF and may display as LF here. Switching and reopening preserve original bytes; actual input uses the browser textarea's newlines.",
    "The original component pair is damaged and cannot authorize preservation of unregistered configuration.",
    "The original label or key is missing or duplicated",
    "The page is suspended. Explicitly restart the interactive preview after returning.",
    "The page was reactivated. Local recovery must be verified again; normal editing is unaffected.",
    "The paired revision could not be preserved",
    "The permission fingerprint changed. Local candidates are preserved but cannot be restored under the old permissions. Verify your identity again.",
    "The preview font origin is invalid. No preview was generated.",
    "The preview image byte count does not match.",
    "The preview image type is invalid.",
    "The preview image was canceled or exceeds its budget.",
    "The private Node.js version matches and is executable.",
    "The private resource path is not owned by the current process identity and was not taken over",
    "The private staging directory could not be prepared",
    "The proposed conversion backend failed verification. Original settings are unchanged.",
    "The proposed label or key already exists",
    "The publication client is unavailable. Enable its matching version and prepare again.",
    "The publication output is invalid or exceeds its budget.",
    "The recovery session changed.",
    "The recovery session or current account changed.",
    "The reference database connection is unavailable. Current input is preserved.",
    "The reference index could not be verified. Current input is preserved.",
    "The reference index has not been initialized.",
    "The reference index is not ready. An administrator can initialize or rebuild it.",
    "The reference index is stale. Ask an administrator to rebuild it.",
    "The reference operation input is invalid.",
    "The relationship map validator is unavailable. Reload before applying parameters.",
    "The remaining expanded batch budget is exhausted",
    "The replacement exceeds the source size limit.",
    "The replacement would remove currently cited keys",
    "The request failed. Sign in again if necessary, then refresh batch status.",
    "The request is too large.",
    "The resource candidate changed. Preview again.",
    "The resource directory escapes its boundary",
    "The resource does not belong to the current identity",
    "The resource expired or was canceled. Upload the ZIP again",
    "The resource identifier is invalid",
    "The resource lock is unavailable",
    "The resource manifest is invalid",
    "The resource manifest is unavailable. Upload the ZIP again",
    "The resource response is invalid.",
    "The resource was saved, expired, or canceled. Upload the ZIP again",
    "The revision changed. Choose it again.",
    "The revision is too large.",
    "The revision paired record could not be saved",
    "The revision title does not satisfy the current rules.",
    "The revision's Markdown and blocks differ or are incompatible. Nothing was restored.",
    "The revision's paired record is incompatible or damaged. Nothing was restored.",
    "The runtime directory is outside public directories.",
    "The runtime directory must not be inside WordPress or a public uploads directory.",
    "The runtime does not match the current WordPress version.",
    "The save result needs verification. Do not import this item again.",
    "The save transaction could not be started",
    "The save transaction could not be started.",
    "The save transaction did not start; the source file was restored. The source was not saved.",
    "The saved article changed. Prepare the export again",
    "The saved document changed. The reference index was not committed.",
    "The saved document identity is invalid",
    "The saved representations do not match and cannot be exported",
    "The selected publication adapter is unavailable.",
    "The selected reference target no longer exists.",
    "The selected scope exceeds the usage report limit. Choose fewer articles.",
    "The selection contains other formatting or objects. Select plain text first.",
    "The semantic reading exceeds its budget.",
    "The semantic tree contains an ambiguous identity.",
    "The semantic tree contains an invalid relationship.",
    "The semantic tree exceeds its depth budget.",
    "The semantic tree is missing or exceeds the exploration budget.",
    "The server did not return a complete trusted opening baseline",
    "The server did not return a valid unsaved merge candidate",
    "The server is validating and generating a preview\u2026",
    "The server or source changed during merge confirmation",
    "The server version or source file changed. Current edits did not overwrite the local candidate. Resolve the version conflict first; the current candidate can be downloaded.",
    "The slug conflicts with existing content.",
    "The slug conflicts with existing content. No suffix was added automatically.",
    "The slug must be a single-line path name of at most 200 characters",
    "The source and block snapshots do not match",
    "The source binding changed during paired verification",
    "The source binding or content changed. Read it again before synchronization.",
    "The source box was edited. Subsequent operations use the browser's textarea newlines. Check code in the difference preview.",
    "The source changed during conversion. Verify it again",
    "The source contains CR/CRLF. Uploading, switching views, and unedited previews preserve its original bytes. Editing this source box applies the browser's newline normalization to the document, including code.",
    "The source contains NUL",
    "The source file changed while reading or exceeds its budget",
    "The source file changed. Read it again before confirming.",
    "The source file could not be read.",
    "The source file or article content changed. Read it again before confirming.",
    "The source file was safely written, and Markdown and blocks were saved together.",
    "The source identity changed. The candidate cannot be restored into a new source binding.",
    "The source must be a string of at most 256 KiB",
    "The source must be valid Unicode",
    "The source read did not complete. Automatic three-way merge is unavailable. Current text is preserved for manual comparison.",
    "The source staging file could not be created.",
    "The source target does not exist or is not a regular file.",
    "The staged archive changed",
    "The staged archive digest does not match",
    "The staged document changed. Prepare that file again.",
    "The staged document is unavailable.",
    "The staged source could not be written.",
    "The staging directory contains unknown objects and was not cleaned",
    "The staging directory must be outside the web root",
    "The staging file name is invalid",
    "The staging manifest commit did not complete",
    "The staging manifest could not be written",
    "The staging manifest is too large",
    "The staging manifest write did not complete",
    "The startup snapshot changed. Rebuild the runtime.",
    "The startup snapshot matches.",
    "The static HTML contains a forbidden attribute",
    "The static HTML contains a forbidden element",
    "The static HTML contains a forbidden node",
    "The static HTML contains an unsafe inline style",
    "The static HTML contains an unsafe link",
    "The static HTML contains an unverified image",
    "The static HTML descriptor exceeds 32 MiB. Content was not truncated",
    "The static HTML exceeds 32 MiB. Content was not truncated",
    "The static HTML exceeds its structure budget",
    "The static HTML exporter is unavailable. Prepare again.",
    "The static HTML preview could not be loaded. Prepare the export again.",
    "The static adapter is missing or incompatible",
    "The static adapter is missing or incompatible. Original configuration was not removed",
    "The static article contains an unresolved footnote",
    "The static article could not be parsed",
    "The static export descriptor exceeds its budget",
    "The static export descriptor is invalid or exceeds its budget",
    "The static export was canceled",
    "The static image descriptor is invalid",
    "The static image digest or type does not match",
    "The static image encoding is invalid",
    "The static math font is invalid",
    "The static math stylesheet is invalid",
    "The static stylesheet contains an external resource",
    "The static stylesheet is unsafe",
    "The structured issue date is invalid",
    "The teaching block version must be 1",
    "The teaching closing marker has no corresponding opening marker",
    "The teaching component needs static content before saving.",
    "The teaching container closing marker is missing",
    "The template references an unknown field",
    "The template root must be a safe tag",
    "The terminal newline marker does not match the code",
    "The terminal newline marker must be boolean",
    "The text length is outside the registered bounds.",
    "The title changed. Preview this item again.",
    "The title must be single-line text of 1\u2013200 characters",
    "The transformed reference candidate exceeds the existing document budget.",
    "The uncompressed export exceeds its budget. Content was not truncated",
    "The upgrade target is no longer registered. Discard the candidate or restore the extension.",
    "The uploaded batch is incomplete.",
    "The uploaded file is a known older version and cannot overwrite the current edits.",
    "The user staging directory changed its resolved path",
    "The version matches.",
    "The version or source changed after preview. The candidate was not applied. Preview the differences again.",
    "The version, source, or permissions changed. Reopen the article. The candidate was not applied.",
    "The versioned reference marker is malformed or its text differs from its identity",
    "Theorem",
    "There are unsaved changes. Save before restoring.",
    "These parameters use the JSON editor. All fields are preserved; the server verifies them when saving.",
    "Thesis",
    "This Markdown cannot be represented without a block roundtrip change",
    "This URL was not verified as a readable local attachment related to this article. The URL is preserved and is not fetched",
    "This ZIP is a fixed publication snapshot for an export adapter, not yet a complete reading website. Articles and resource bytes are checked again before confirmation and download.",
    "This account cannot publish articles. Save a draft or submit for review.",
    "This account's local candidates were cleared and recovery was disabled.",
    "This article already has a logical identity.",
    "This article has no current logical identity.",
    "This article has no source file binding.",
    "This article has no writable source file binding.",
    "This article is not a Markdown source document.",
    "This article is synchronized from a source file. Edit the source and run the synchronization tool; blocks and previews remain available here.",
    "This article is synchronized from a source file. Use the controlled source write workflow.",
    "This article is unavailable.",
    "This backup has an older baseline. Compare it with the current article before explicitly saving.",
    "This batch belongs to another account.",
    "This batch expired. Verify pending saves; prepare other files again.",
    "This batch was canceled. Saved drafts are preserved.",
    "This bibliography uses the original six-field format. It stays unchanged until you explicitly upgrade or adopt a CSL-JSON candidate.",
    "This block cannot yet be converted to Markdown",
    "This browser cannot safely verify the isolated component. Static fallback content is preserved.",
    "This browser does not support bounded resource reads",
    "This browser does not support reliable cross-tab storage locks. Local recovery is disabled; normal editing is unaffected.",
    "This browser does not support reliable storage locks.",
    "This candidate still references pending images. Upload the ZIP again or remove those images. Body content is preserved",
    "This change only affects source bytes. Open Markdown edit / upload to preview and apply it with source Undo and save.",
    "This collection candidate is busy. Try again shortly.",
    "This collection operation is unavailable. Sign in again or refresh your collection list.",
    "This cross-site ZIP creates new local attachment IDs; IDs from the source site are never reused.",
    "This document failed conversion. Correct the original file and prepare it again.",
    "This document must be saved through the native article update route.",
    "This entry cannot import new ZIP media. Body and source save rules remain in effect.",
    "This entry is cited. Remove its citations before deleting it.",
    "This extension information is unavailable.",
    "This field is not in the registered schema.",
    "This finite subset imports up to 64 records within 64 KiB. Review unsupported fields and key mappings explicitly. The original JSON is not stored, and import does not save the article.",
    "This image does not belong to the resource candidate",
    "This item cannot be previewed. Refresh its status or correct its original file.",
    "This local recovery record has no trusted signed opening baseline. Compare manually; it cannot serve as a three-way merge baseline.",
    "This logical identity is unavailable or already claimed. Prepare a copy with a new identity.",
    "This new article already has unsaved content. Save or clear it before importing Markdown.",
    "This paired backup is unavailable or expired. Current input is preserved.",
    "This preview creates a normalized cross-site copy without old attachment IDs. Import creates new local attachments and associations. The saved original is unchanged.",
    "This publication adapter does not support this collection schema. Select a compatible format.",
    "This registered field is required.",
    "This report covers only the article IDs you select, not a site-wide inventory. Every article requires current editing permission.",
    "This resource import was canceled. The document is preserved. Upload the ZIP again or remove pending images.",
    "This resource is being saved or cleaned",
    "This revision cannot be used for this article.",
    "This revision predates document identity. The exact historical pair is read-only; prepare an explicit candidate to retain the current identity.",
    "This save request could not be verified. Reopen the editor and try again.",
    "This structure has no Chinese reading yet. The original English semantics are shown.",
    "This summary contains versions, error codes and timings only.",
    "This tab's draft identity could not be isolated. Local recovery is disabled.",
    "Three-way merge candidate",
    "Title",
    "Title: %1$s \u2192 %2$s",
    "To",
    "Tolerance",
    "Too many highlighted ranges",
    "Too many media files were generated",
    "Transaction commit failed",
    "Two selected articles declare the same logical identity. Resolve the identity conflict before preparing.",
    "Typesetting the complete offline article\u2026",
    "URL",
    "Unapplied component version change:",
    "Unavailable",
    "Unavailable article",
    "Unavailable starting item",
    "Unclassified purpose",
    "Unclosed teaching container",
    "Undated",
    "Undo publication arrangement",
    "Undo source change",
    "Unexpected DOM node",
    "Unexpected data after the block sequence",
    "Unexpected list item block",
    "Unexpected relocated HTML head content",
    "Unexpected table cell",
    "Unexpected teaching closing marker",
    "Unit",
    "Unknown conflict choice",
    "Unknown conversion mode",
    "Unknown editing mode.",
    "Unknown field type",
    "Unknown native adapter type",
    "Unknown or invalid block attribute",
    "Unknown or invalid teaching attribute",
    "Unknown staging objects were preserved for review.",
    "Unreferenced footnote definition",
    "Unsafe HTML color or dimensions",
    "Unsafe color",
    "Unsafe image dimensions",
    "Unsafe links, duplicate HTML attributes, and image inputs that would lose alternative text are explicitly rejected.",
    "Unsafe or malformed Presentation MathML",
    "Unsafe or overlong code language",
    "Unsafe property name",
    "Unsupported HTML attribute: ",
    "Unsupported HTML attribute: %1$s",
    "Unsupported HTML block structure",
    "Unsupported HTML class",
    "Unsupported HTML tag %1$s",
    "Unsupported HTML tag: ",
    "Unsupported HTML tag: %1$s",
    "Unsupported Markdown node %1$s",
    "Unsupported Markdown syntax",
    "Unsupported Presentation MathML",
    "Unsupported TeX command or math in BibTeX",
    "Unsupported attribute %1$s.%2$s",
    "Unsupported base document schema, converter or origin",
    "Unsupported block: ",
    "Unsupported block: %1$s",
    "Unsupported display class",
    "Unsupported fields that will not be stored:",
    "Unsupported footnote definition structure",
    "Unsupported inline HTML element: ",
    "Unsupported inline HTML element: %1$s",
    "Unsupported inline HTML export %1$s",
    "Unsupported inline syntax",
    "Unsupported inline syntax %1$s",
    "Unsupported list item structure",
    "Unsupported native image size",
    "Unsupported native media attribute",
    "Unsupported or inconsistent HTML attributes on ",
    "Unsupported or inconsistent HTML attributes on %1$s",
    "Unsupported or unsafe HTML style",
    "Unsupported or unsafe style",
    "Unsupported origin or model version",
    "Unsupported teaching block version",
    "Untitled article",
    "Untitled collection",
    "Untitled draft",
    "Untitled reference",
    "Upgrade candidate available",
    "Upgrade diagram to use the visual editor",
    "Upload Markdown or an image resource ZIP ",
    "Upload a .bib file",
    "Uploaded image URLs may become public, including for a draft.",
    "Use a safe article URL for every node.",
    "Use bibliography candidate",
    "Use chapter object numbers",
    "Use displayed line numbers, for example 12,15-18.",
    "Use label for rename",
    "Use my candidate",
    "Use supported text formatting and safe links. Do not include scripts, event attributes, or unsupported HTML.",
    "Use the editor's Save / Update action to save both representations together",
    "Use the exact revision workflow when its logical identity is unchanged.",
    "Use the latest server version",
    "Use the opening version",
    "Use the save button in the preview",
    "Validating both representations of the revision\u2026",
    "Validating the formula\u2026",
    "Validation passed; target status: ",
    "Value",
    "Values",
    "Verified image resources: ",
    "Verify and apply conversion backend",
    "Verify and save",
    "Verify and save Node directory",
    "Verifying component resources\u2026",
    "Verifying save result",
    "Verifying the ZIP in private staging. No media has been uploaded. The document remains editable.",
    "Verifying the formula\u2026",
    "Verifying the saved article. Unsaved input is not included in the export.",
    "Version",
    "Version conflict: compare the server and candidate",
    "Version language",
    "Version statement",
    "Version title (optional)",
    "Version title must be empty or at most 200 single-line characters",
    "Versions must be a JSON array of objects",
    "View differences",
    "View differences and preview",
    "View differences first. Restoration requires successful verification.",
    "View external image",
    "View formula: ",
    "View full map",
    "View restoration differences and preview",
    "Visual editor",
    "Volume",
    "Volume, issue and pages are limited to 128 plain characters",
    "Wait for successful typesetting before applying the formula.",
    "Web book preview",
    "Web page",
    "Whole formula",
    "WordPress cannot safely decode this image. No media was created",
    "WordPress core scripts",
    "WordPress did not create an image attachment",
    "WordPress image processing is unavailable. Incomplete media was not kept",
    "WordPress rejected the image or wrote it outside the expected media location",
    "WordPress save failed",
    "WordPress saved the submission, but the response differs from the local candidate. The candidate is preserved. Compare first.",
    "WordPress saved this ordinary article submission. Different local edits are preserved; the article is not automatically managed by MarkBridge.",
    "WordPress version",
    "WordPress would rewrite this title. Correct the proposal.",
    "Working\u2026",
    "Write current metadata into the header",
    "Write the explanation and static fallback here.",
    "Writing pattern",
    "Year",
    "You cannot assign categories or tags to this article.",
    "You cannot change MarkBridge conversion settings.",
    "You cannot change MarkBridge settings.",
    "You cannot view MarkBridge settings.",
    "You do not have permission to edit this article.",
    "You do not have permission to write this article's source file.",
    "Your changes are preserved against the latest server baseline. Preview all differences and explicitly save again.",
    "Your sign-in expired. Sign in again before using paired backups. Current input is preserved.",
    "Your title: %1$s; status: %2$s.",
    "ZIP batches require image upload permission and the existing ZIP dependencies.",
    "ZIP entry CRC verification failed",
    "ZIP export dependencies are unavailable. Markdown single-file export remains available",
    "ZIP export requires PHP zip, intl, and POSIX. Markdown single-file export remains available",
    "ZIP files are limited to 100 entries",
    "ZIP files are limited to 8 MiB",
    "ZIP files are limited to 8 MiB.",
    "ZIP images are prepared. New input entered while reading is preserved; the document was not overwritten. Preview the current candidate.",
    "Zoom in",
    "Zoom out",
    "[Image preview placeholder: %1$s; total preview limit 8 MiB / 16 MP, including duplicate images]",
    "left",
    "manifest.json is missing, damaged, or has an unsupported version.",
    "off",
    "on",
    "raw must contain only the complete FrontMatter header",
    "right",
    "worker.cjs differs from the plugin or manifest.",
    "\u2212 left-side deletions or changes; + right-side additions or changes. Leading marks indicate author highlights."
  ];

  // src/diagnostics.js
  var known = new Set(diagnostics_default);
  var patterns = diagnostics_default.filter(
    (value) => /%\d+\$s/.test(value) && /^(?:Unsupported |Expected |Block .* cannot )/.test(value)
  ).sort((a, b) => b.replace(/%\d+\$s/g, "").length - a.replace(/%\d+\$s/g, "").length).map((id2) => {
    const expression = id2.split(/(%\d+\$s)/).map(
      (part) => /^%\d+\$s$/.test(part) ? "([\\s\\S]{0,1024})" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ).join("");
    return { id: id2, regex: new RegExp("^" + expression + "$") };
  });
  function describeDiagnostic(message) {
    if (typeof message !== "string" || new TextEncoder().encode(message).length > 8192 || /[\uD800-\uDFFF\0]/u.test(message))
      return { id: null, args: [] };
    if (known.has(message)) return { id: message, args: [] };
    for (const { id: id2, regex } of patterns) {
      const result = regex.exec(message);
      if (result && result.length <= 9 && result.slice(1).every((value) => new TextEncoder().encode(value).length <= 1024) && format(id2, ...result.slice(1)) === message)
        return { id: id2, args: result.slice(1) };
    }
    return { id: null, args: [] };
  }

  // src/block-adapters.js
  var nativeNames = {
    "native-code": "core/code",
    preformatted: "core/preformatted",
    group: "core/group",
    columns: "core/columns",
    column: "core/column",
    details: "core/details",
    buttons: "core/buttons",
    button: "core/button"
  };
  var bytes2 = (v) => new TextEncoder().encode(v).length;
  var nonblank = (v) => v.replace(
    /[ \t\r\n\f\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/gu,
    ""
  ) !== "";
  var object2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var plain2 = (v, max, fail2, nonempty = false) => {
    if (typeof v !== "string" || /[\uD800-\uDFFF\0]/u.test(v) || [...v].length > max || nonempty && !nonblank(v))
      fail2("ADAPTER_ATTRIBUTES", "Invalid plain text field type, Unicode, or length");
    return v;
  };
  var closed2 = (v, keys2, required, fail2) => {
    if (!object2(v) || Object.keys(v).some((k) => !keys2.includes(k)) || required.some((k) => !Object.hasOwn(v, k)))
      fail2("ADAPTER_ATTRIBUTES", "Adapter attributes are missing or contain unknown fields");
  };
  var nativeAdapterKind = (name) => Object.keys(nativeNames).find((k) => nativeNames[k] === name) || null;
  var nativeAdapterName = (kind) => nativeNames[kind];
  var nativeAdapterKinds = new Set(Object.keys(nativeNames));
  function adapterURL(value, fail2) {
    plain2(value, 2048, fail2, true);
    if (/[\x00-\x20\x7f<>"`]/.test(value) || /^([^:/?#]+):/.test(value) && !/^(?:https?|mailto|tel|ftp):/i.test(value))
      fail2("ADAPTER_URL", "The button link has an unsafe scheme or character");
    return value;
  }
  function adapterAnchor(value, fail2) {
    if (typeof value !== "string" || !/^(?:[A-Za-z][A-Za-z0-9_-]{0,63})?(?![\s\S])/.test(value))
      fail2(
        "ADAPTER_ANCHOR",
        "An anchor must begin with a letter and contain 1\u201364 ASCII letters, digits, underscores, or hyphens"
      );
    return value;
  }
  var fragment = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content;
  };
  function plainSummary(html, fail2) {
    plain2(html, 4096, fail2);
    if (/<\/?[A-Za-z]|<!/.test(html))
      fail2("ADAPTER_SUMMARY", "A summary must be single-line plain text");
    const root = fragment(html);
    if ([...root.childNodes].some((n) => n.nodeType !== 3))
      fail2("ADAPTER_SUMMARY", "A summary must be single-line plain text");
    const value = plain2(root.textContent, 200, fail2, true);
    if (/[\r\n]/.test(value)) fail2("ADAPTER_SUMMARY", "A summary must be single-line plain text");
    return value;
  }
  function buttonText(html, fail2) {
    if (globalThis.wp?.richText?.RichTextData && html instanceof wp.richText.RichTextData)
      html = html.toString();
    plain2(html, Number.MAX_SAFE_INTEGER, fail2);
    if (/<!/.test(html) || [...html.matchAll(/<\/?([A-Za-z][A-Za-z0-9-]*)\b/g)].some(
      (m) => !["strong", "em", "s", "del", "code"].includes(m[1].toLowerCase())
    ))
      fail2("ADAPTER_INLINE", "Buttons only support controlled text formatting");
    if (bytes2(html) > 4096) fail2("ADAPTER_LIMIT", "Button text is limited to 4 KiB");
    const root = fragment(html);
    let count = 0;
    const walk = (node, depth = 1) => {
      if (++count > 256 || depth > 16)
        fail2("ADAPTER_LIMIT", "Button text is limited to 256 nodes and 16 levels");
      if (node.nodeType === 3) {
        plain2(node.textContent, 4096, fail2);
        return;
      }
      if (node.nodeType !== 1 || !["strong", "em", "s", "del", "code"].includes(node.localName) || node.attributes.length || node.localName === "code" && [...node.childNodes].some((n) => n.nodeType !== 3))
        fail2(
          "ADAPTER_INLINE",
          "Buttons only support plain text and strong/em/del/code, without links, images, or nested interactions"
        );
      [...node.childNodes].forEach((child) => walk(child, depth + 1));
    };
    [...root.childNodes].forEach((child) => walk(child));
    if (!nonblank(root.textContent)) fail2("ADAPTER_INLINE", "Button text must not be empty");
    return html;
  }
  function buttonParagraph(html, fail2) {
    const root = fragment(html.trim());
    if (root.childNodes.length !== 1 || root.firstChild.nodeType !== 1 || root.firstChild.localName !== "p" || root.firstChild.attributes.length)
      fail2("ADAPTER_STRUCTURE", "A link button must contain exactly one controlled text paragraph");
    return buttonText(root.firstChild.innerHTML, fail2);
  }
  var nativeRichText = (value) => globalThis.wp?.richText?.RichTextData && value instanceof wp.richText.RichTextData ? value.toString() : value;
  var nativeTextKind = (kind) => ["native-code", "preformatted"].includes(kind);
  function nativePlainText(value, fail2) {
    plain2(value, 262144, fail2);
    if (/[\x00-\x08\x0b-\x1f\x7f]/.test(value) || bytes2(value) > 262144)
      fail2("ADAPTER_TEXT", "Native text requires bounded plain text with LF line endings");
    return value;
  }
  var nativeTextRichText = (html) => {
    const element = document.createElement("span");
    element.innerHTML = html;
    return wp.richText.RichTextData.fromHTMLElement(element, { preserveWhiteSpace: true });
  };
  var nativeTextHTML = (text3, kind) => {
    const html = escapeAdapterText(text3).replaceAll("\xA0", "&nbsp;");
    return kind === "preformatted" ? html.replaceAll("\n", "<br>") : html;
  };
  function nativeContentText(value, kind, fail2) {
    const html = nativeRichText(value);
    if (typeof html !== "string" || html.includes("\r"))
      fail2("ADAPTER_TEXT", "Native text requires bounded plain text with LF line endings");
    const root = fragment(html);
    let text3 = "";
    for (const n of root.childNodes) {
      if (n.nodeType === 3) text3 += n.textContent;
      else if (n.nodeType === 1 && n.localName === "br" && !n.attributes.length) text3 += "\n";
      else fail2("ADAPTER_TEXT", "Native code and preformatted blocks only support plain text");
    }
    return nativePlainText(text3, fail2);
  }
  function nativeAttributes(kind, attrs2, fail2, source = false) {
    if (!nativeAdapterKinds.has(kind)) fail2("ADAPTER_KIND", "Unknown native adapter type");
    const keys2 = {
      "native-code": ["anchor", "className", source ? "text" : "content"],
      preformatted: ["anchor", "className", source ? "text" : "content"],
      group: ["tagName", "anchor", "ariaLabel", "className", "layout"],
      columns: ["verticalAlignment", "isStackedOnMobile", "anchor", "className"],
      column: ["verticalAlignment", "width", "anchor", "className"],
      details: ["summary", "showContent", "anchor", ...!source ? ["name"] : []],
      buttons: ["anchor", "layout"],
      button: [
        "url",
        "title",
        "linkTarget",
        "rel",
        "anchor",
        ...!source ? ["text", "tagName", "type"] : []
      ]
    }[kind];
    closed2(
      attrs2,
      keys2,
      nativeTextKind(kind) ? [source ? "text" : "content"] : kind === "details" ? ["summary"] : kind === "button" ? ["url", ...!source ? ["text"] : []] : [],
      fail2
    );
    const out = {};
    if (Object.hasOwn(attrs2, "anchor") && adapterAnchor(attrs2.anchor, fail2))
      out.anchor = attrs2.anchor;
    if (nativeTextKind(kind)) {
      const text3 = source ? nativePlainText(attrs2.text, fail2) : nativeContentText(attrs2.content, kind, fail2);
      out[source ? "text" : "content"] = source ? text3 : nativeTextHTML(text3, kind);
    }
    if (nativeTextKind(kind)) {
      if (Object.hasOwn(attrs2, "className")) {
        if (typeof attrs2.className !== "string" || attrs2.className.length > 200 || attrs2.className !== "" && !/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z][A-Za-z0-9_-]*)*$/.test(attrs2.className))
          fail2("ADAPTER_ATTRIBUTES", "Invalid native block class names");
        out.className = attrs2.className;
      }
    }
    if (kind === "columns" || kind === "column") {
      if (Object.hasOwn(attrs2, "className")) {
        if (typeof attrs2.className !== "string" || attrs2.className.length > 200 || attrs2.className !== "" && !/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z][A-Za-z0-9_-]*)*(?![\s\S])/.test(attrs2.className))
          fail2("ADAPTER_ATTRIBUTES", "Invalid native block class names");
        out.className = attrs2.className;
      }
      if (Object.hasOwn(attrs2, "verticalAlignment")) {
        if (!["top", "center", "bottom"].includes(attrs2.verticalAlignment))
          fail2("ADAPTER_ATTRIBUTES", "Column alignment must be top, center or bottom");
        out.verticalAlignment = attrs2.verticalAlignment;
      }
      if (kind === "columns") {
        if (Object.hasOwn(attrs2, "isStackedOnMobile") && typeof attrs2.isStackedOnMobile !== "boolean")
          fail2("ADAPTER_ATTRIBUTES", "Mobile column stacking must be boolean");
        out.isStackedOnMobile = attrs2.isStackedOnMobile ?? true;
      } else if (Object.hasOwn(attrs2, "width")) {
        if (typeof attrs2.width !== "string" || !/^(?:(?:0|[1-9][0-9]?)(?:\.[0-9]{1,3})?|100(?:\.0{1,3})?)%(?![\s\S])/.test(attrs2.width) || parseFloat(attrs2.width) <= 0)
          fail2(
            "ADAPTER_ATTRIBUTES",
            "Column width must be a percentage greater than 0 and at most 100"
          );
        out.width = attrs2.width;
      }
    }
    if (kind === "group") {
      out.tagName = Object.hasOwn(attrs2, "tagName") ? attrs2.tagName : "div";
      if (!["div", "section"].includes(out.tagName))
        fail2("ADAPTER_ATTRIBUTES", "Groups only support div or section tags");
      if (Object.hasOwn(attrs2, "ariaLabel")) {
        out.ariaLabel = plain2(attrs2.ariaLabel, 200, fail2);
        if (/[\x00-\x1f\x7f\u0085\u2028\u2029]/.test(out.ariaLabel))
          fail2("ADAPTER_ATTRIBUTES", "A group label must be single-line plain text");
      }
      if (Object.hasOwn(attrs2, "className")) {
        if (typeof attrs2.className !== "string" || attrs2.className.length > 200 || attrs2.className !== "" && !/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z][A-Za-z0-9_-]*)*$/.test(attrs2.className))
          fail2("ADAPTER_ATTRIBUTES", "Invalid native block class names");
        out.className = attrs2.className;
      }
      if (Object.hasOwn(attrs2, "layout")) {
        closed2(attrs2.layout, ["type"], ["type"], fail2);
        if (!["flow", "constrained"].includes(attrs2.layout.type))
          fail2("ADAPTER_ATTRIBUTES", "Groups only support flow or constrained layout");
        out.layout = { type: attrs2.layout.type };
      }
    } else if (nativeTextKind(kind) || kind === "columns" || kind === "column") {
    } else if (kind === "details") {
      if (Object.hasOwn(attrs2, "name") && attrs2.name !== "")
        fail2("ADAPTER_ATTRIBUTES", "Exclusive details groups are not supported");
      out.summary = source ? plain2(attrs2.summary, 200, fail2, true) : plainSummary(nativeRichText(attrs2.summary), fail2);
      if (/[\r\n]/.test(out.summary))
        fail2("ADAPTER_SUMMARY", "A summary must be single-line plain text");
      if (Object.hasOwn(attrs2, "showContent") && typeof attrs2.showContent !== "boolean")
        fail2("ADAPTER_ATTRIBUTES", "The details open state must be boolean");
      out.showContent = attrs2.showContent ?? false;
    } else if (kind === "buttons") {
      if (Object.hasOwn(attrs2, "layout") && (!object2(attrs2.layout) || Object.keys(attrs2.layout).length !== 1 || attrs2.layout.type !== "flex"))
        fail2("ADAPTER_ATTRIBUTES", "Button groups only support the default flex layout");
      if (Object.hasOwn(attrs2, "layout")) out.layout = { type: "flex" };
    } else {
      if (Object.hasOwn(attrs2, "tagName") && attrs2.tagName !== "a" || Object.hasOwn(attrs2, "type") && attrs2.type !== "button")
        fail2("ADAPTER_ATTRIBUTES", "Only link buttons are supported, not action buttons");
      out.url = adapterURL(attrs2.url, fail2);
      if (Object.hasOwn(attrs2, "title")) {
        plain2(attrs2.title, 200, fail2);
        if (/[\r\n]/.test(attrs2.title))
          fail2("ADAPTER_ATTRIBUTES", "A link title must occupy a single line");
        out.title = attrs2.title;
      }
      if (Object.hasOwn(attrs2, "linkTarget")) {
        if (!["", "_self", "_blank"].includes(attrs2.linkTarget))
          fail2("ADAPTER_ATTRIBUTES", "Invalid link target");
        out.linkTarget = attrs2.linkTarget;
      }
      if (Object.hasOwn(attrs2, "rel")) {
        if (typeof attrs2.rel !== "string") fail2("ADAPTER_ATTRIBUTES", "Link rel must be text");
        const tokens = attrs2.rel ? attrs2.rel.split(" ") : [];
        if (tokens.length > 5 || new Set(tokens).size !== tokens.length || tokens.some((v) => !["noopener", "noreferrer", "nofollow", "ugc", "sponsored"].includes(v)))
          fail2("ADAPTER_ATTRIBUTES", "Link rel must contain unique tokens from the closed safe set");
        out.rel = tokens.join(" ");
      }
      if (out.linkTarget === "_blank" && !out.rel?.split(" ").includes("noopener"))
        fail2("ADAPTER_ATTRIBUTES", "New-window links must include noopener");
      if (!source) out.text = buttonText(nativeRichText(attrs2.text), fail2);
    }
    return out;
  }
  function nativeBlockAttributes(kind, attrs2, fail2) {
    const a = nativeAttributes(kind, attrs2, fail2, true);
    if (nativeTextKind(kind)) {
      const { text: text3, ...rest } = a;
      return {
        ...rest,
        content: nativeTextRichText(nativeTextHTML(text3, kind))
      };
    }
    return kind === "details" ? { ...a, summary: escapeAdapterText(a.summary) } : a;
  }
  var escapeAdapterText = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  var registry = [];
  var adapterDescriptors = () => registry;
  var tags = ["div", "p", "span", "strong", "em", "del", "code"];
  function validateAdapterDescriptors(input, fail2) {
    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        fail2("ADAPTER_REGISTRY", "The adapter snapshot JSON is invalid");
      }
    }
    if (!Array.isArray(input) || input.length > 16)
      fail2("ADAPTER_REGISTRY", "At most 16 static adapters may be registered");
    const names = /* @__PURE__ */ new Set(), blocks = /* @__PURE__ */ new Set();
    const result = input.map((raw) => {
      closed2(
        raw,
        ["schema", "name", "version", "blockName", "attributes", "template"],
        ["schema", "name", "version", "blockName", "attributes", "template"],
        fail2
      );
      if (raw.schema !== 1 || typeof raw.name !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(raw.name) || typeof raw.version !== "string" || !/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(raw.version) || typeof raw.blockName !== "string" || !/^[a-z][a-z0-9-]{0,63}\/[a-z][a-z0-9-]{0,63}$/.test(raw.blockName) || raw.blockName.startsWith("core/") || raw.blockName.startsWith("mbb/") || names.has(raw.name) || blocks.has(raw.blockName))
        fail2("ADAPTER_REGISTRY", "Invalid or conflicting registration identity or version");
      names.add(raw.name);
      blocks.add(raw.blockName);
      if (!object2(raw.attributes) || !Object.keys(raw.attributes).length || Object.keys(raw.attributes).length > 16)
        fail2("ADAPTER_REGISTRY", "Each adapter requires 1\u201316 fields");
      const attributes = {};
      for (const key of Object.keys(raw.attributes).sort()) {
        if (!/^[a-z][A-Za-z0-9_]{0,63}$/.test(key) || [
          "mbbAdapterVersion",
          "className",
          "style",
          "anchor",
          "metadata",
          "lock",
          "align",
          "layout",
          "constructor",
          "prototype",
          "__proto__",
          "backgroundColor",
          "textColor",
          "borderColor",
          "gradient",
          "fontSize",
          "fontFamily",
          "allowedBlocks"
        ].includes(key))
          fail2("ADAPTER_REGISTRY", "Invalid field name");
        const v = raw.attributes[key];
        if (v?.type === "plainText") {
          closed2(v, ["type", "maxLength"], ["type", "maxLength"], fail2);
          if (!Number.isSafeInteger(v.maxLength) || v.maxLength < 1 || v.maxLength > 4096)
            fail2("ADAPTER_REGISTRY", "Invalid text length budget");
          attributes[key] = { type: v.type, maxLength: v.maxLength };
        } else if (v?.type === "integer") {
          closed2(v, ["type", "minimum", "maximum"], ["type", "minimum", "maximum"], fail2);
          if (!Number.isSafeInteger(v.minimum) || !Number.isSafeInteger(v.maximum) || v.minimum > v.maximum)
            fail2("ADAPTER_REGISTRY", "Invalid integer budget");
          attributes[key] = {
            type: v.type,
            minimum: v.minimum === 0 ? 0 : v.minimum,
            maximum: v.maximum === 0 ? 0 : v.maximum
          };
        } else if (v?.type === "boolean") {
          closed2(v, ["type"], ["type"], fail2);
          attributes[key] = { type: v.type };
        } else if (v?.type === "enum") {
          closed2(v, ["type", "values"], ["type", "values"], fail2);
          if (!Array.isArray(v.values) || !v.values.length || v.values.length > 16 || new Set(v.values).size !== v.values.length)
            fail2("ADAPTER_REGISTRY", "Invalid enum declaration");
          v.values.forEach((x) => plain2(x, 200, fail2));
          attributes[key] = { type: v.type, values: [...v.values] };
        } else fail2("ADAPTER_REGISTRY", "Unknown field type");
      }
      let count = 0;
      const template = (v, depth) => {
        if (!object2(v) || ++count > 64 || depth > 8)
          fail2("ADAPTER_REGISTRY", "Templates are limited to 64 nodes and 8 levels");
        if (Object.hasOwn(v, "field")) {
          closed2(v, ["field"], ["field"], fail2);
          if (typeof v.field !== "string" || !Object.hasOwn(attributes, v.field))
            fail2("ADAPTER_REGISTRY", "The template references an unknown field");
          return { field: v.field };
        }
        if (Object.hasOwn(v, "text")) {
          closed2(v, ["text"], ["text"], fail2);
          return { text: plain2(v.text, 4096, fail2) };
        }
        closed2(v, ["tag", "class", "children"], ["tag", "children"], fail2);
        if (!tags.includes(v.tag) || !Array.isArray(v.children))
          fail2("ADAPTER_REGISTRY", "Templates only allow fixed safe tags");
        const out = { tag: v.tag };
        if (Object.hasOwn(v, "class")) {
          if (typeof v.class !== "string" || v.class.length > 200 || !/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z][A-Za-z0-9_-]*)*$/.test(v.class))
            fail2("ADAPTER_REGISTRY", "Invalid template class");
          out.class = v.class;
        }
        out.children = v.children.map((child) => template(child, depth + 1));
        if (out.children.some(
          (child) => child.tag && (v.tag !== "div" && ["div", "p"].includes(child.tag) || v.tag === "code")
        ))
          fail2("ADAPTER_REGISTRY", "Template tag nesting would change the saved structure");
        return out;
      };
      const node = template(raw.template, 1);
      if (!node.tag) fail2("ADAPTER_REGISTRY", "The template root must be a safe tag");
      const descriptor = {
        schema: 1,
        name: raw.name,
        version: raw.version,
        blockName: raw.blockName,
        attributes,
        template: node
      };
      if (bytes2(JSON.stringify(descriptor)) > 16384)
        fail2("ADAPTER_REGISTRY", "Each registration descriptor is limited to 16 KiB");
      return descriptor;
    });
    return result.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  }
  function configureBlockAdapters(input, fail2) {
    registry = validateAdapterDescriptors(input, fail2);
  }
  var staticAdapterKind = (name) => registry.find((d) => d.blockName === name);
  function staticAdapterAttributes(descriptor, attrs2, fail2, source = false) {
    const keys2 = Object.keys(descriptor.attributes);
    closed2(
      attrs2,
      [...keys2, ...!source ? ["mbbAdapterVersion"] : []],
      [...keys2, ...!source ? ["mbbAdapterVersion"] : []],
      fail2
    );
    if (!source && attrs2.mbbAdapterVersion !== descriptor.version)
      fail2(
        "ADAPTER_VERSION",
        "The adapter version does not match. Original configuration is preserved but cannot convert new candidates"
      );
    const out = {};
    if (!source) out.mbbAdapterVersion = descriptor.version;
    for (const key of keys2) {
      const field = descriptor.attributes[key], v = attrs2[key];
      if (field.type === "plainText") out[key] = plain2(v, field.maxLength, fail2);
      else if (field.type === "integer") {
        if (!Number.isSafeInteger(v) || v < field.minimum || v > field.maximum)
          fail2("ADAPTER_ATTRIBUTES", "The integer exceeds its registered budget");
        out[key] = v === 0 ? 0 : v;
      } else if (field.type === "boolean") {
        if (typeof v !== "boolean") fail2("ADAPTER_ATTRIBUTES", "Invalid boolean field type");
        out[key] = v;
      } else {
        if (!field.values.includes(v))
          fail2("ADAPTER_ATTRIBUTES", "The enum value is not in the registered set");
        out[key] = v;
      }
    }
    return out;
  }
  function adapterSourceAttributes(attrs2, fail2) {
    closed2(attrs2, ["name", "version", "attrs"], ["name", "version", "attrs"], fail2);
    const descriptor = registry.find((d) => d.name === attrs2.name && d.version === attrs2.version);
    if (!descriptor)
      fail2(
        "ADAPTER_VERSION",
        "The static adapter is missing or incompatible. Original configuration was not removed"
      );
    return {
      descriptor,
      attributes: {
        mbbAdapterVersion: descriptor.version,
        ...staticAdapterAttributes(descriptor, attrs2.attrs, fail2, true)
      }
    };
  }
  var ownedTypes = /* @__PURE__ */ new Map();
  var parameterDrafts = /* @__PURE__ */ new Map();
  var adapterDraftPending = () => parameterDrafts.size > 0;
  function registerStaticBlockAdapters(fail2) {
    const e = wp.element.createElement;
    const props = (node) => node.class ? { className: node.class } : null;
    const reactTemplate = (node, attrs2) => Object.hasOwn(node, "text") ? node.text : Object.hasOwn(node, "field") ? String(attrs2[node.field]) : e(node.tag, props(node), ...node.children.map((child) => reactTemplate(child, attrs2)));
    for (const [name, fingerprint] of ownedTypes) {
      if (!registry.some((d) => d.blockName === name && JSON.stringify(d) === fingerprint)) {
        wp.blocks.unregisterBlockType(name);
        ownedTypes.delete(name);
      }
    }
    for (const d of registry) {
      let Edit = function({ attributes: a, setAttributes, clientId }) {
        const initial = Object.fromEntries(Object.keys(d.attributes).map((key) => [key, a[key]]));
        const applied = JSON.stringify(initial, null, 2);
        const [raw, setRaw] = wp.element.useState(parameterDrafts.get(clientId)?.raw ?? applied), [error3, setError] = wp.element.useState(parameterDrafts.get(clientId)?.error ?? "");
        const lock = () => {
          try {
            wp.data.dispatch("core/editor").lockPostSaving("mbb-adapter-" + clientId);
          } catch {
          }
        };
        const unlock = () => {
          try {
            wp.data.dispatch("core/editor").unlockPostSaving("mbb-adapter-" + clientId);
          } catch {
          }
        };
        wp.element.useEffect(() => {
          if (!parameterDrafts.has(clientId)) {
            setRaw(applied);
            setError("");
          }
        }, [applied]);
        wp.element.useEffect(
          () => () => {
            parameterDrafts.delete(clientId);
            unlock();
          },
          []
        );
        const change = (value) => {
          setRaw(value);
          setError("");
          parameterDrafts.set(clientId, { raw: value, error: "" });
          lock();
        };
        const apply = () => {
          try {
            const value = JSON.parse(raw), normalized = staticAdapterAttributes(d, value, fail2, true);
            setAttributes({ mbbAdapterVersion: d.version, ...normalized });
            parameterDrafts.delete(clientId);
            unlock();
            setError("");
          } catch (err) {
            setError(translateError(err));
            parameterDrafts.set(clientId, { raw, error: translateError(err) });
            lock();
          }
        };
        const initialize = () => {
          const value = Object.fromEntries(
            Object.entries(d.attributes).map(([key, v]) => [
              key,
              v.type === "integer" ? v.minimum : v.type === "boolean" ? false : v.type === "enum" ? v.values[0] : ""
            ])
          );
          change(JSON.stringify(value, null, 2));
        };
        return e(
          "div",
          wp.blockEditor.useBlockProps({ className: "mbb-static-adapter-editor" }),
          e("strong", null, translate("Static adapter ") + d.name + " / " + d.version),
          e(wp.components.TextareaControl, {
            label: translate("Static adapter parameters (JSON)"),
            value: raw,
            onChange: change
          }),
          error3 ? e("p", { role: "alert" }, error3) : null,
          e(
            "p",
            null,
            translate("Parameters are data only. Explicitly apply or discard them. No code is executed.")
          ),
          e(
            wp.components.Button,
            { variant: "secondary", onClick: initialize },
            translate("Prepare initial parameters")
          ),
          e(wp.components.Button, { variant: "primary", onClick: apply }, translate("Apply parameters")),
          e(
            wp.components.Button,
            {
              variant: "secondary",
              onClick: () => {
                parameterDrafts.delete(clientId);
                unlock();
                setRaw(applied);
                setError("");
              }
            },
            translate("Discard parameter input")
          )
        );
      };
      if (ownedTypes.has(d.blockName)) continue;
      const existing = wp.blocks.getBlockType(d.blockName);
      if (existing)
        fail2(
          "ADAPTER_REGISTRY",
          "An existing block with this name does not match the registered static template and will not be overwritten"
        );
      const attributes = { mbbAdapterVersion: { type: "string" } };
      for (const [key, v] of Object.entries(d.attributes))
        attributes[key] = {
          type: { plainText: "string", integer: "number", boolean: "boolean", enum: "string" }[v.type]
        };
      wp.blocks.registerBlockType(d.blockName, {
        apiVersion: 3,
        title: translate("Static adapter ") + d.name,
        category: "widgets",
        attributes,
        supports: { className: false, customClassName: false, html: false, anchor: false },
        edit: Edit,
        save: ({ attributes: a }) => {
          try {
            return reactTemplate(d.template, staticAdapterAttributes(d, a, fail2));
          } catch {
            return e("div", null, "\u9759\u6001\u9002\u914D\u53C2\u6570\u5C1A\u672A\u5E94\u7528");
          }
        }
      });
      ownedTypes.set(d.blockName, JSON.stringify(d));
    }
    globalThis.MarkBridgeAdapterDrafts = { pending: adapterDraftPending };
  }
  function validateAdaptersSerialized(serialized, fail2, parse = JSON.parse) {
    for (const m of serialized.matchAll(
      /<!-- wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)(?: (\{[\s\S]*?\}))? -->/g
    )) {
      const name = m[1].includes("/") ? m[1] : "core/" + m[1], kind = nativeAdapterKind(name), descriptor = staticAdapterKind(name);
      if (!kind && !descriptor) continue;
      let a;
      try {
        a = parse(m[2] || "{}", fail2);
      } catch {
        fail2("ADAPTER_ATTRIBUTES", "The block attribute JSON is invalid");
      }
      if (descriptor) staticAdapterAttributes(descriptor, a, fail2);
      else {
        closed2(
          a,
          {
            "native-code": ["anchor", "className"],
            preformatted: ["anchor", "className"],
            group: ["tagName", "anchor", "ariaLabel", "className", "layout"],
            columns: ["verticalAlignment", "isStackedOnMobile", "anchor", "className"],
            column: ["verticalAlignment", "width", "anchor", "className"],
            details: ["showContent", "anchor", "name"],
            buttons: ["anchor", "layout"],
            button: ["anchor", "tagName", "type"]
          }[kind],
          [],
          fail2
        );
        if (["group", "columns", "column"].includes(kind)) nativeAttributes(kind, a, fail2, true);
        if (nativeTextKind(kind)) {
          nativeAttributes(kind, { ...a, text: "" }, fail2, true);
          const end = serialized.indexOf("<!-- /wp:" + m[1] + " -->", m.index + m[0].length);
          if (end < 0) fail2("ADAPTER_STRUCTURE", "Invalid native block wrapper structure");
          const raw = serialized.slice(m.index + m[0].length, end);
          if (raw.includes("\r"))
            fail2("ADAPTER_TEXT", "Native text requires bounded plain text with LF line endings");
          const block2 = wp.blocks.parse(m[0] + raw + "<!-- /wp:" + m[1] + " -->")[0];
          const attrs2 = nativeAttributes(kind, block2.attributes, fail2);
          const canonicalAttrs = {
            ...attrs2,
            content: nativeTextRichText(attrs2.content)
          };
          const coreHTML = wp.blocks.getSaveContent(name, canonicalAttrs, []);
          if (raw !== "\n" + coreHTML + "\n")
            fail2("ADAPTER_TEXT", "Native text HTML must match the canonical core save");
        }
        if (Object.hasOwn(a, "anchor")) adapterAnchor(a.anchor, fail2);
        if (kind === "details" && (Object.hasOwn(a, "showContent") && typeof a.showContent !== "boolean" || Object.hasOwn(a, "name") && a.name !== ""))
          fail2(
            "ADAPTER_ATTRIBUTES",
            "Raw details attributes have invalid types or non-neutral values"
          );
        if (kind === "buttons" && Object.hasOwn(a, "layout")) {
          closed2(a.layout, ["type"], ["type"], fail2);
          if (a.layout.type !== "flex")
            fail2("ADAPTER_ATTRIBUTES", "Button groups only support the default flex layout");
        }
        if (kind === "button" && (Object.hasOwn(a, "tagName") && a.tagName !== "a" || Object.hasOwn(a, "type") && a.type !== "button"))
          fail2("ADAPTER_ATTRIBUTES", "Raw button attributes do not describe a link button");
      }
    }
  }

  // src/component-authors.js
  var authors = /* @__PURE__ */ new Map();
  var token = /^[a-z][a-z0-9-]{0,63}$/;
  var version = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
  function registerComponentAuthor(descriptor) {
    if (!descriptor || ![1, 2].includes(descriptor.apiVersion) || Object.keys(descriptor).some(
      (key2) => ![
        ...["apiVersion", "component", "componentVersion", "Editor", "supports", "upgrade"],
        ...descriptor.apiVersion === 2 ? ["validate", "create"] : []
      ].includes(key2)
    ) || typeof descriptor.component !== "string" || !token.test(descriptor.component) || typeof descriptor.componentVersion !== "string" || !version.test(descriptor.componentVersion) || "Editor" in descriptor && typeof descriptor.Editor !== "function" || typeof descriptor.Editor !== "function" && !descriptor.upgrade || descriptor.apiVersion === 2 && (typeof descriptor.validate !== "function" || typeof descriptor.create !== "function") || typeof descriptor.supports !== "function")
      throw Error("Invalid component author registration");
    if (descriptor.upgrade && (typeof descriptor.upgrade.componentVersion !== "string" || !version.test(descriptor.upgrade.componentVersion) || descriptor.upgrade.componentVersion === descriptor.componentVersion || typeof descriptor.upgrade.migrate !== "function" || Object.keys(descriptor.upgrade).some((key2) => !["componentVersion", "migrate"].includes(key2))))
      throw Error("Invalid component author upgrade");
    const key = descriptor.component + "@" + descriptor.componentVersion;
    if (authors.has(key) || authors.size >= 32)
      throw Error("Duplicate or excessive component author registration");
    authors.set(
      key,
      Object.freeze({
        ...descriptor,
        ...descriptor.upgrade ? { upgrade: Object.freeze({ ...descriptor.upgrade }) } : {}
      })
    );
  }
  var componentAuthor = (component, componentVersion) => authors.get(component + "@" + componentVersion);
  globalThis.MarkBridgeComponentAuthors = Object.freeze({
    apiVersion: 1,
    activityVersion: 1,
    localDraftVersion: 1,
    templates: () => [...authors.values()].filter((a) => a.apiVersion === 2).map((a) => ({ component: a.component, componentVersion: a.componentVersion })),
    create(component, version2, id2) {
      const a = authors.get(component + "@" + version2);
      if (a?.apiVersion !== 2 || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(id2))
        throw Error("Invalid activity template");
      return a.create({ id: id2 });
    },
    register: registerComponentAuthor
  });

  // src/component-catalog.js
  var pending = /* @__PURE__ */ new Map();
  var catalogGeneration = 0;
  var config = () => globalThis.MBBComponentCatalog;
  var providers = () => globalThis.MBBComponents || [];
  var find = (id2, version2) => providers().find((p) => p.id === id2 && p.version === version2);
  var scope = () => JSON.stringify([
    config()?.postId,
    globalThis.MBB_EDITOR?.postId,
    globalThis.MBB_EDITOR?.state?.expected
  ]);
  function request(path, fields = {}) {
    const cfg = config();
    const url = new URL(cfg.url, globalThis.location?.href || "http://markbridge.invalid/");
    if (url.searchParams.has("rest_route")) {
      const route = url.searchParams.get("rest_route");
      url.searchParams.set("rest_route", route.replace(/\/?$/, "/") + path);
    } else {
      url.pathname = url.pathname.replace(/\/?$/, "/") + path;
    }
    for (const [key, value] of Object.entries({ post_id: cfg.postId || 0, ...fields }))
      url.searchParams.set(key, value);
    return globalThis.wp.apiFetch({ url: url.href });
  }
  async function componentCatalogPage(page = 1, type = "", perPage = 20, view = "all", purpose = "") {
    const cfg = config();
    if (!cfg) {
      const all = providers();
      const items = (view === "latest" ? latestComponentChoices(all) : all).filter(
        (p) => (!type || p.id === type) && (!purpose || componentPurposeUnknown(p) || componentPurposes(p).includes(purpose))
      );
      return {
        items,
        total: items.length,
        perPage: 50,
        page: 1,
        purposes: [...new Set(all.flatMap(componentPurposes))]
      };
    }
    const opening = cfg.fingerprint;
    const result = await request("catalog", {
      page,
      type,
      per_page: perPage,
      fingerprint: opening,
      view,
      purpose
    });
    if (config() !== cfg || result.fingerprint !== opening)
      throw Error(translate("The component catalog changed. Refresh the list before continuing."));
    return result;
  }
  async function componentActivityTemplates(templates) {
    if (!Array.isArray(templates) || templates.length > 32)
      throw Error(translate("Invalid activity template"));
    if (!templates.length) return [];
    const openingConfig = config(), openingScope = scope();
    const remaining = new Set(templates.map((t) => t.component + "@" + t.componentVersion));
    const allowed = /* @__PURE__ */ new Map();
    let perPage = 50, page;
    try {
      page = await componentCatalogPage(1, "", perPage);
    } catch (error3) {
      if (error3.code !== "component_catalog_limit") throw error3;
      perPage = 20;
      page = await componentCatalogPage(1, "", perPage);
    }
    for (let n = 1; n <= Math.ceil(256 / perPage); n++) {
      if (config() !== openingConfig || scope() !== openingScope)
        throw Error(translate("The component catalog changed. Refresh the list before continuing."));
      for (const entry2 of page.items) {
        const key = entry2.id + "@" + entry2.version;
        if (!remaining.has(key)) continue;
        remaining.delete(key);
        if (entry2.activityVersion === 1) allowed.set(key, entry2);
      }
      if (!remaining.size || page.page * page.perPage >= page.total) break;
      page = await componentCatalogPage(page.page + 1, "", perPage);
    }
    return templates.flatMap((t) => {
      const entry2 = allowed.get(t.component + "@" + t.componentVersion);
      return entry2 ? [{ ...t, title: entry2.title }] : [];
    });
  }
  async function resolveComponent(id2, version2) {
    const cfg = config();
    if (!cfg) return find(id2, version2);
    const key = cfg.fingerprint + ":" + id2 + "@" + version2;
    const existing = find(id2, version2);
    if (existing) return existing;
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
      const result = await request(
        "descriptor/" + encodeURIComponent(id2) + "/" + encodeURIComponent(version2),
        { fingerprint: cfg.fingerprint }
      );
      const p = result.provider;
      if (config() !== cfg || result.fingerprint !== cfg.fingerprint || !p || p.id !== id2 || p.version !== version2)
        throw Error(translate("The component catalog changed. Refresh the list before continuing."));
      if (!find(id2, version2)) {
        if (providers().length >= 256 || new TextEncoder().encode(JSON.stringify([...providers(), p])).length > 4194304)
          throw Error(translate("The installed extension catalog exceeds its display budget."));
        globalThis.MBBComponents = [...providers(), p];
        globalThis.dispatchEvent(new Event("mbb-component-descriptor"));
      }
      return p;
    })();
    pending.set(key, job);
    try {
      return await job;
    } finally {
      pending.delete(key);
    }
  }
  async function resolveDefaultComponent(id2, preferred = "") {
    const cfg = config();
    if (!cfg)
      return find(id2, preferred) || latestComponentChoices(providers()).find((p) => p.id === id2);
    if (!preferred) {
      const latest = await componentCatalogPage(1, id2, 20, "latest");
      return latest.items[0] ? resolveComponent(id2, latest.items[0].version) : null;
    }
    let page = await componentCatalogPage(1, id2);
    const fallback = page.defaults[id2];
    while (preferred && !page.items.some((p) => p.version === preferred) && page.page * page.perPage < page.total)
      page = await componentCatalogPage(page.page + 1, id2);
    const version2 = page.items.some((p) => p.version === preferred) ? preferred : fallback;
    return version2 ? resolveComponent(id2, version2) : null;
  }
  function useComponentDescriptor(wp2, id2, version2) {
    const [, render] = wp2.element.useState(0);
    wp2.element.useEffect(() => {
      let active = true;
      if (id2 && version2)
        resolveComponent(id2, version2).then(
          () => {
            if (active) render((n) => n + 1);
          },
          () => {
          }
        );
      return () => {
        active = false;
      };
    }, [id2, version2, config()?.fingerprint]);
    return find(id2, version2);
  }
  function componentPurposes(p) {
    return p.purposes || (p.activityVersion === 1 ? ["Self checks"] : p.readerMode ? ["Diagrams and relationships"] : ["Unclassified purpose"]);
  }
  function componentPurposeUnknown(p) {
    return p.purposeUnknown ?? (!p.purposes && p.activityVersion !== 1 && !p.readerMode);
  }
  var groupKey = (p) => p.id + "@" + (p.authoringGroup || p.title);
  var compareVersions = (a, b) => {
    const left = a.split(".").map(Number), right = b.split(".").map(Number);
    for (let n = 0; n < 3; n++) if (left[n] !== right[n]) return left[n] - right[n];
    return 0;
  };
  function latestComponentChoices(items) {
    const latest = /* @__PURE__ */ new Map();
    for (const p of items) {
      if (p.status && !["available", "indexed"].includes(p.status)) continue;
      const key = groupKey(p), previous = latest.get(key);
      if (!previous || compareVersions(p.version, previous.version) > 0) latest.set(key, p);
    }
    return [...latest.values()];
  }
  function componentDependencies(blocks, items) {
    const uses = /* @__PURE__ */ new Map();
    const walk = (list3) => {
      for (const block2 of list3 || []) {
        const { component: id2, componentVersion: version2 } = block2.attributes || {};
        if (block2.name === "mbb/component" && id2 && version2) {
          const key = id2 + "@" + version2;
          if (!uses.has(key)) uses.set(key, { id: id2, version: version2, clients: [], instances: [], title: id2 });
          uses.get(key).clients.push(block2.clientId);
          uses.get(key).instances.push(block2.attributes);
        }
        walk(block2.innerBlocks);
      }
    };
    walk(blocks);
    return [...uses.values()].map((use) => {
      const exact = items.find((p) => p.id === use.id && p.version === use.version);
      const available = exact && (!exact.status || ["available", "indexed"].includes(exact.status));
      const newer = exact && items.filter(
        (p) => groupKey(p) === groupKey(exact) && (!p.status || ["available", "indexed"].includes(p.status)) && compareVersions(p.version, use.version) > 0
      );
      const author = componentAuthor(use.id, use.version);
      const supported = author && use.instances.some((attrs2) => {
        try {
          return author.supports(JSON.parse(JSON.stringify(attrs2.params || {})), {
            activity: attrs2.activity
          });
        } catch {
          return false;
        }
      });
      const upgrade = supported && author?.upgrade;
      const target = upgrade && items.find((p) => p.id === use.id && p.version === upgrade.componentVersion);
      return {
        ...use,
        title: exact?.title || use.id,
        status: !exact ? "missing" : !available ? "unavailable" : target && (!target.status || ["available", "indexed"].includes(target.status)) ? "upgrade" : newer?.length ? "newer" : "current",
        target: target?.version
      };
    });
  }
  var catalogSnapshot;
  function allComponentEntries() {
    const cfg = config() || providers(), identity = scope(), fingerprint = config()?.fingerprint;
    if (catalogSnapshot?.config === cfg && catalogSnapshot?.scope === identity && catalogSnapshot?.fingerprint === fingerprint)
      return catalogSnapshot.promise;
    const promise = readAllComponentEntries();
    const snapshot = { config: cfg, scope: identity, fingerprint, promise };
    catalogSnapshot = snapshot;
    promise.catch(() => {
      if (catalogSnapshot === snapshot) catalogSnapshot = null;
    });
    return promise;
  }
  async function readAllComponentEntries() {
    const result = [];
    let page = await componentCatalogPage(1, "", 20);
    while (true) {
      result.push(...page.items);
      if (page.page * page.perPage >= page.total) return result;
      if (result.length >= 256)
        throw Error(translate("The installed extension catalog exceeds its display budget."));
      page = await componentCatalogPage(page.page + 1, "", 20);
    }
  }
  function createComponentSelector(wp2) {
    const el = wp2.element.createElement;
    return function ComponentSelector({
      component,
      version: version2,
      disabled,
      onChange,
      clientId,
      draftFingerprint,
      draftGeneration
    }) {
      const [page, setPage] = wp2.element.useState(1);
      const [history, setHistory] = wp2.element.useState(false);
      const [purpose, setPurpose] = wp2.element.useState("");
      const [expanded, setExpanded] = wp2.element.useState(false);
      const [dependencies, setDependencies] = wp2.element.useState(null);
      const [dependencyError, setDependencyError] = wp2.element.useState("");
      const blocks = wp2.data.useSelect((select) => select("core/block-editor").getBlocks(), []);
      const documentKeys = JSON.stringify(
        componentDependencies(blocks, []).map(({ id: id2, version: version3, clients, instances }) => [
          id2,
          version3,
          clients,
          instances
        ])
      );
      const [data, setData] = wp2.element.useState(null);
      const [error3, setError] = wp2.element.useState("");
      const [loading, setLoading] = wp2.element.useState(false);
      const live = wp2.element.useRef({});
      const signature = JSON.stringify([
        component,
        version2,
        clientId,
        draftFingerprint,
        scope(),
        history,
        purpose,
        page
      ]);
      const interruptedSelection = live.current.signature !== signature && live.current.pendingSelection != null;
      if (live.current.signature !== signature) {
        live.current.signature = signature;
        live.current.generation = ++catalogGeneration;
        live.current.pendingSelection = null;
      }
      wp2.element.useEffect(() => {
        if (interruptedSelection) setLoading(false);
      }, [signature]);
      wp2.element.useEffect(() => {
        let active = true;
        setLoading(true);
        componentCatalogPage(page, "", 20, history ? "all" : "latest", purpose).then(
          (next) => {
            if (active) {
              setData(next);
              setError("");
              setLoading(false);
            }
          },
          (e) => {
            if (active) {
              setError(e.message);
              setLoading(false);
            }
          }
        );
        return () => {
          active = false;
          live.current.generation = ++catalogGeneration;
        };
      }, [page, history, purpose, config()?.fingerprint]);
      wp2.element.useEffect(() => {
        let active = true;
        const openingScope = scope();
        setDependencies(null);
        setDependencyError("");
        if (!expanded) return;
        allComponentEntries().then(
          async (snapshot) => {
            const items2 = snapshot.map((p) => ({ ...p }));
            const used = componentDependencies(blocks, items2);
            const keys2 = /* @__PURE__ */ new Map();
            for (const use of used) {
              keys2.set(use.id + "@" + use.version, [use.id, use.version]);
              const target = componentAuthor(use.id, use.version)?.upgrade?.componentVersion;
              if (target) keys2.set(use.id + "@" + target, [use.id, target]);
            }
            await Promise.all(
              [...keys2.values()].map(async ([id2, exact]) => {
                const entry2 = items2.find((p) => p.id === id2 && p.version === exact);
                if (!entry2) return;
                try {
                  const provider = await resolveComponent(id2, exact);
                  entry2.status = provider?.status || "available";
                } catch {
                  entry2.status = "unavailable";
                }
              })
            );
            if (active && scope() === openingScope)
              setDependencies(componentDependencies(blocks, items2));
          },
          (e) => {
            if (active) setDependencyError(e.message);
          }
        );
        return () => {
          active = false;
        };
      }, [expanded, documentKeys, config()?.fingerprint, scope()]);
      wp2.element.useEffect(
        () => () => {
          live.current.signature = "";
        },
        []
      );
      const current = component + "@" + version2;
      const items = data?.items || (history ? providers() : latestComponentChoices(providers()));
      return el(
        "div",
        {},
        el(wp2.components.SelectControl, {
          label: translate("Component purpose"),
          value: purpose,
          disabled: loading,
          options: [
            { label: translate("All purposes"), value: "" },
            ...(data?.purposes || [...new Set(items.flatMap(componentPurposes))]).map((p) => ({
              label: translate(p),
              value: p
            }))
          ],
          onChange: (value) => {
            setPage(1);
            setPurpose(value);
          }
        }),
        el(wp2.components.CheckboxControl, {
          label: translate("Choose a historical version"),
          checked: history,
          onChange: (value) => {
            setPage(1);
            setHistory(value);
          }
        }),
        el(wp2.components.SelectControl, {
          label: translate("Registered teaching component"),
          disabled: disabled || loading,
          value: current,
          options: [
            ...!items.some((p) => p.id + "@" + p.version === current) ? [
              {
                label: translate("Preserve current component ") + (component || translate("Awaiting selection")) + " " + (version2 || ""),
                value: current
              }
            ] : [],
            ...items.map((p) => ({
              label: p.title + " " + p.version + (componentPurposeUnknown(p) ? " \xB7 " + translate("Unclassified purpose") : ""),
              value: p.id + "@" + p.version
            }))
          ],
          onChange: async (key) => {
            const generation = ++catalogGeneration;
            live.current.generation = generation;
            live.current.pendingSelection = generation;
            const opening = live.current.signature;
            const openingScope = scope();
            const openingDraftGeneration = draftGeneration?.();
            const selected = wp2.data?.select?.("core/block-editor")?.getSelectedBlockClientId?.();
            setLoading(true);
            try {
              const [id2, exact] = key.split("@");
              const p = await resolveComponent(id2, exact);
              if (p && live.current.generation === generation && live.current.signature === opening && draftGeneration?.() === openingDraftGeneration && scope() === openingScope && selected === wp2.data?.select?.("core/block-editor")?.getSelectedBlockClientId?.())
                onChange(p);
            } catch (e) {
              if (live.current.generation === generation) setError(e.message);
            } finally {
              if (live.current.generation === generation) {
                live.current.pendingSelection = null;
                setLoading(false);
              }
            }
          }
        }),
        loading ? el("p", { role: "status" }, translate("Loading component description\u2026")) : null,
        data?.unverifiedGroups ? el(
          "p",
          { role: "status" },
          translate(
            "Some component families have no verified available version. Choose a historical version to inspect them."
          )
        ) : null,
        error3 ? el("p", { role: "alert" }, error3) : null,
        config() ? el(
          "div",
          {},
          el(
            wp2.components.Button,
            {
              variant: "secondary",
              disabled: page <= 1 || loading,
              onClick: () => setPage(page - 1)
            },
            translate("Previous page")
          ),
          " " + page + " ",
          el(
            wp2.components.Button,
            {
              variant: "secondary",
              disabled: !data || page * data.perPage >= data.total || loading,
              onClick: () => setPage(page + 1)
            },
            translate("Next page")
          )
        ) : null,
        el(
          "details",
          {
            className: "mbb-component-dependencies",
            onToggle: (event) => setExpanded(event.currentTarget.open)
          },
          el("summary", {}, translate("Components in this article")),
          el(
            "p",
            {},
            translate(
              "Inspect exact versions in the current article. Select an instance to review its parameters and prepare any supported upgrade."
            )
          ),
          dependencyError ? el("p", { role: "alert" }, dependencyError) : !dependencies ? expanded ? el("p", { role: "status" }, translate("Loading component description\u2026")) : null : el(
            "ul",
            {},
            ...dependencies.map(
              (use) => el(
                "li",
                { key: use.id + "@" + use.version },
                el("strong", {}, use.title + " " + use.version),
                el(
                  "p",
                  {},
                  translate(
                    {
                      missing: "Exact version is missing",
                      unavailable: "Exact version is unavailable",
                      upgrade: "Upgrade candidate available",
                      newer: "A newer version exists; no migration is declared",
                      current: "No declared upgrade"
                    }[use.status]
                  ) + (use.status === "upgrade" ? " \u2192 " + use.target : "")
                ),
                ...use.clients.map(
                  (id2, n) => el(
                    wp2.components.Button,
                    {
                      key: id2,
                      variant: "link",
                      onClick: () => wp2.data.dispatch("core/block-editor").selectBlock(id2)
                    },
                    translate("Select instance") + " " + (n + 1)
                  )
                )
              )
            )
          )
        )
      );
    };
  }
  globalThis.MarkBridgeComponentCatalog = Object.freeze({
    page: componentCatalogPage,
    activities: componentActivityTemplates,
    resolve: resolveComponent,
    resolveDefault: resolveDefaultComponent,
    scope
  });

  // src/author-tools.js
  var tools = /* @__PURE__ */ new Map();
  var clone = (v) => JSON.parse(JSON.stringify(v));
  var token2 = /^[a-z][a-z0-9-]{0,63}$/;
  function registerAuthorTool(d) {
    if (!d || Object.keys(d).sort().join(",") !== "Editor,id,slot,version" || typeof d.id !== "string" || !token2.test(d.id) || typeof d.version !== "string" || !/^\d+\.\d+\.\d+$/.test(d.version) || d.slot !== "bibliography/v2" || typeof d.Editor !== "function" || tools.size >= 32 || tools.has(d.id))
      throw Error(translate("Invalid or duplicate author tool registration"));
    tools.set(d.id, Object.freeze({ ...d }));
  }
  function scope2() {
    const cfg = globalThis.MBB_EDITOR;
    return JSON.stringify([
      cfg?.postId || 0,
      cfg?.state?.expected || null,
      cfg?.state?.source_sha256 || null
    ]);
  }
  function AuthorTools({ slot, draft, change, registry: registry2, clientId, session }) {
    const { useRef, useEffect, createElement: el } = wp.element;
    const state = useRef({ signature: "", generation: 0, active: true });
    const signature = JSON.stringify([clientId, scope2(), draft]);
    if (state.current.signature !== signature) {
      state.current.signature = signature;
      state.current.generation++;
    }
    const generation = state.current.generation, openingScope = scope2();
    useEffect(() => {
      state.current.active = true;
      return () => {
        state.current.active = false;
        state.current.generation++;
      };
    }, [clientId]);
    const patch = (value) => {
      if (!state.current.active || state.current.generation !== generation || openingScope !== scope2())
        throw Error(translate("The author candidate changed. Preview again."));
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((k) => !["entries", "origins", "style"].includes(k)) || ["entries", "origins"].some(
        (k) => Object.hasOwn(value, k) && (!Array.isArray(value[k]) || value[k].length > 64 || value[k].some(
          (v) => !v || typeof v !== "object" || Array.isArray(v) || typeof v.key !== "string"
        ))
      ) || Object.hasOwn(value, "style") && !["numeric", "author-year"].includes(value.style) || new TextEncoder().encode(JSON.stringify(value)).length > 262144)
        throw Error(translate("Invalid author candidate patch"));
      const claimed = ++state.current.generation;
      try {
        change(clone(value));
      } catch (error3) {
        if (state.current.generation === claimed) state.current.generation--;
        throw error3;
      }
    };
    return el(
      "div",
      { className: "mbb-author-tools" },
      ...[...tools.values()].filter((d) => d.slot === slot).map(
        (d) => el(d.Editor, {
          key: d.id,
          draft: clone(draft),
          change: patch,
          registry: registry2,
          clientId,
          session,
          generation,
          baseline: signature
        })
      )
    );
  }
  globalThis.MarkBridgeAuthorTools = Object.freeze({ apiVersion: 1, register: registerAuthorTool });
  globalThis.MarkBridgeExtensions = Object.freeze({
    apiVersion: 1,
    registerAuthorTool,
    registerComponentAuthor(d) {
      return globalThis.MarkBridgeComponentAuthors.register(d);
    },
    registerPublicationClient(id2, d) {
      return globalThis.MarkBridgeCollections.registerClient(id2, d);
    }
  });

  // src/bibliography-editor.js
  var typeLabel = (type) => ({
    "article-journal": translate("Journal article"),
    book: translate("Book"),
    chapter: translate("Book chapter"),
    "paper-conference": translate("Conference paper"),
    report: translate("Report"),
    thesis: translate("Thesis"),
    webpage: translate("Web page"),
    dataset: translate("Dataset"),
    software: translate("Software"),
    document: translate("Document")
  })[type] ?? type;
  function mappedFields(entry2) {
    const el = wp.element.createElement;
    const issued = entry2.issued.literal !== void 0 ? entry2.issued.literal : entry2.issued["date-parts"].map((p) => p.map((v, i) => i ? String(v).padStart(2, "0") : String(v)).join("-")).join("\u2013");
    const fields = [
      [translate("Issue date"), issued],
      [translate("Publication title"), entry2.containerTitle],
      [translate("Publisher"), entry2.publisher],
      [translate("Volume"), entry2.volume],
      [translate("Issue"), entry2.issue],
      [translate("Pages"), entry2.page],
      [translate("DOI identifier (without URL prefix)"), entry2.doi],
      [translate("Reference URL (HTTP or HTTPS)"), entry2.url],
      [translate("Additional source text"), entry2.source],
      ...Object.entries(entry2.identifiers)
    ];
    return el(
      "details",
      {},
      el("summary", {}, translate("Mapped publication fields")),
      el(
        "dl",
        {},
        ...fields.filter(([, v]) => v !== "").flatMap(([label, value]) => [
          el("dt", { key: label + "label" }, label),
          el("dd", { key: label + "value" }, value)
        ])
      )
    );
  }
  function BibliographyV2Fields({ a, setAttributes, registry: registry2, session, pending: pending2, Rename: Rename2 }) {
    const el = wp.element.createElement, [notice, setNotice] = wp.element.useState(""), [, refresh] = wp.element.useState(0);
    const update = (i, patch) => setAttributes({ entries: a.entries.map((e, n) => n === i ? { ...e, ...patch } : e) });
    const text3 = (label, value, onChange) => el(wp.components.TextControl, { label, value, onChange });
    return el(
      "div",
      {},
      el(wp.components.SelectControl, {
        label: translate("Citation style"),
        value: a.style,
        options: [
          { value: "author-year", label: translate("Author\u2013year") },
          { value: "numeric", label: translate("Numeric") }
        ],
        onChange: (style) => setAttributes({ style })
      }),
      ...a.entries.map(
        (e, i) => el(
          wp.components.PanelBody,
          {
            key: e.key,
            title: (e.title || translate("Untitled reference")) + " (" + e.key + ")",
            opened: (session.openEntry ?? a.entries[0]?.key) === e.key,
            onToggle: () => {
              session.openEntry = (session.openEntry ?? a.entries[0]?.key) === e.key ? null : e.key;
              refresh((n) => n + 1);
            }
          },
          !pending2 ? el(Rename2, { type: "key", identity: e.key, registry: registry2, session }) : null,
          el(wp.components.SelectControl, {
            label: translate("Reference type"),
            value: e.type,
            options: bibliographyTypes.map((type) => ({ value: type, label: typeLabel(type) })),
            onChange: (type) => update(i, { type })
          }),
          text3(translate("Reference title"), e.title, (title) => update(i, { title })),
          el("h4", {}, translate("Authors and institutions")),
          ...e.authors.map(
            (n, j) => el(
              "fieldset",
              { key: j, className: "mbb-bibliography-author" },
              el("legend", {}, String(j + 1) + ". " + bibliographyAuthor(n)),
              el(wp.components.SelectControl, {
                label: translate("Name form"),
                value: n.literal !== void 0 ? "literal" : "person",
                options: [
                  { value: "literal", label: translate("Literal name or institution") },
                  { value: "person", label: translate("Explicit person name") }
                ],
                onChange: (kind) => update(i, {
                  authors: e.authors.map(
                    (v, k) => k === j ? kind === "literal" ? { literal: bibliographyAuthor(v) } : {
                      family: "",
                      given: "",
                      droppingParticle: "",
                      nonDroppingParticle: "",
                      suffix: ""
                    } : v
                  )
                })
              }),
              n.literal !== void 0 ? text3(
                translate("Literal name or institution"),
                n.literal,
                (literal) => update(i, { authors: e.authors.map((v, k) => k === j ? { literal } : v) })
              ) : el(
                "div",
                {},
                ...["family", "given", "droppingParticle", "nonDroppingParticle", "suffix"].map(
                  (f) => text3(
                    {
                      family: translate("Family name (explicit)"),
                      given: translate("Given name"),
                      droppingParticle: translate("Dropping particle"),
                      nonDroppingParticle: translate("Non-dropping particle"),
                      suffix: translate("Name suffix")
                    }[f],
                    n[f],
                    (value) => update(i, {
                      authors: e.authors.map((v, k) => k === j ? { ...v, [f]: value } : v)
                    })
                  )
                )
              ),
              el(
                wp.components.Button,
                {
                  variant: "tertiary",
                  onClick: () => update(i, { authors: e.authors.filter((_, k) => k !== j) })
                },
                translate("Remove author")
              )
            )
          ),
          el(
            "p",
            { className: "description" },
            translate(
              "Literal names stay literal. Switching to person fields starts empty; enter the authored name parts explicitly."
            )
          ),
          el(
            wp.components.Button,
            {
              variant: "secondary",
              disabled: e.authors.length >= 8,
              onClick: () => update(i, { authors: [...e.authors, { literal: "" }] })
            },
            translate("Add author or institution")
          ),
          el(wp.components.SelectControl, {
            label: translate("Issue date form"),
            value: e.issued.literal !== void 0 ? "literal" : "parts",
            options: [
              { value: "literal", label: translate("Literal date") },
              { value: "parts", label: translate("Structured year, month and day") }
            ],
            onChange: (kind) => update(i, {
              issued: kind === "literal" ? { literal: bibliographyYear(e.issued) } : { "date-parts": [[0]] }
            })
          }),
          e.issued.literal !== void 0 ? text3(
            translate("Literal issue date"),
            e.issued.literal,
            (literal) => update(i, { issued: { literal } })
          ) : el(
            "div",
            {},
            ...e.issued["date-parts"].map(
              (part, p) => el(
                "fieldset",
                { key: p },
                el("legend", {}, p ? translate("End date") : translate("Start date")),
                ...[translate("Year"), translate("Month (optional)"), translate("Day (optional)")].map(
                  (label, k) => el(wp.components.TextControl, {
                    key: k,
                    label,
                    type: "number",
                    value: part[k] || "",
                    onChange: (value) => {
                      const next = [...part];
                      next[k] = value === "" ? 0 : Number(value);
                      while (next.length > 1 && !next.at(-1)) next.pop();
                      for (let n = 0; n < next.length; n++) next[n] ??= 0;
                      update(i, {
                        issued: {
                          "date-parts": e.issued["date-parts"].map(
                            (v, q) => q === p ? next : v
                          )
                        }
                      });
                    }
                  })
                )
              )
            ),
            el(
              wp.components.Button,
              {
                variant: "tertiary",
                onClick: () => update(i, {
                  issued: {
                    "date-parts": e.issued["date-parts"].length === 1 ? [e.issued["date-parts"][0], [0]] : [e.issued["date-parts"][0]]
                  }
                })
              },
              e.issued["date-parts"].length === 1 ? translate("Add end date") : translate("Remove end date")
            )
          ),
          ...["containerTitle", "publisher", "volume", "issue", "page", "doi", "url", "source"].map(
            (f) => text3(
              {
                containerTitle: translate("Publication title"),
                publisher: translate("Publisher"),
                volume: translate("Volume"),
                issue: translate("Issue"),
                page: translate("Pages"),
                doi: translate("DOI identifier (without URL prefix)"),
                url: translate("Reference URL (HTTP or HTTPS)"),
                source: translate("Additional source text")
              }[f],
              e[f],
              (value) => update(i, { [f]: value })
            )
          ),
          el(
            "details",
            {},
            el("summary", {}, translate("Additional identifiers")),
            ...Object.keys(e.identifiers).map(
              (f) => text3(
                f,
                e.identifiers[f],
                (value) => update(i, { identifiers: { ...e.identifiers, [f]: value } })
              )
            )
          ),
          el(
            wp.components.Button,
            {
              variant: "tertiary",
              onClick: () => {
                if (technicalReferenceCount(
                  registry2.select("core/block-editor").getBlocks(),
                  "key",
                  e.key
                )) {
                  setNotice(translate("This entry is cited. Remove its citations before deleting it."));
                  return;
                }
                setNotice("");
                setAttributes({ entries: a.entries.filter((_, n) => n !== i) });
              }
            },
            translate("Remove bibliography entry")
          )
        )
      ),
      el(
        wp.components.Button,
        {
          variant: "secondary",
          disabled: a.entries.length >= 64,
          onClick: () => {
            const keys2 = new Set(a.entries.map((e) => e.key));
            let n = 1;
            while (keys2.has("reference-" + n)) n++;
            session.openEntry = "reference-" + n;
            setAttributes({ entries: [...a.entries, emptyBibliographyEntry("reference-" + n)] });
          }
        },
        translate("Add bibliography entry")
      ),
      notice ? el("p", { role: "alert" }, notice) : null
    );
  }
  function CSLImport({ a, change, registry: registry2, clientId, session }) {
    const el = wp.element.createElement, [opened, setOpened] = wp.element.useState(false), [input, setInput] = wp.element.useState(""), [mode, setMode] = wp.element.useState("merge"), [keyMap, setKeyMap] = wp.element.useState({}), [report, setReport] = wp.element.useState(null), [error3, setError] = wp.element.useState(""), [ackLoss, setAckLoss] = wp.element.useState(false), [ackKeys, setAckKeys] = wp.element.useState(false);
    const generation = wp.element.useRef(0), baseline = JSON.stringify(a);
    wp.element.useEffect(
      () => () => {
        generation.current++;
      },
      []
    );
    const reset = () => {
      generation.current++;
      setReport(null);
      setError("");
      setAckLoss(false);
      setAckKeys(false);
    };
    const close = () => {
      reset();
      setOpened(false);
    };
    const referenced = () => {
      const blocks = registry2.select("core/block-editor").getBlocks(), keys2 = new Set([...a.entries, ...report?.entries || []].map((e) => e.key));
      return [...keys2].filter((key) => technicalReferenceCount(blocks, "key", key));
    };
    const preview = () => {
      try {
        const parsed = parseCSL(input, keyMap);
        setReport({ ...parsed, baseline, mode, input, keyMap: JSON.stringify(keyMap) });
        setError("");
        setAckLoss(false);
        setAckKeys(false);
      } catch (e) {
        if (report?.input !== input) setReport(null);
        setError(translate(e.message));
      }
    };
    let candidate = null, candidateError = "";
    if (report) {
      try {
        if (report.baseline !== baseline || report.mode !== mode || report.input !== input || report.keyMap !== JSON.stringify(keyMap))
          throw Error(translate("Bibliography edits changed. Preview the CSL-JSON mapping again."));
        candidate = cslCandidate(
          a.version === 2 ? a.entries : migrateBibliography(a.entries),
          report,
          mode,
          referenced(),
          ackLoss,
          ackKeys
        );
      } catch (e) {
        candidateError = translate(e.message);
      }
    }
    const download = () => {
      try {
        const entries = a.version === 2 ? a.entries : migrateBibliography(a.entries), blob = new Blob([JSON.stringify(exportCSL(entries), null, 2) + "\n"], {
          type: "application/json"
        }), url = URL.createObjectURL(blob), link2 = document.createElement("a");
        link2.href = url;
        link2.download = "bibliography.csl.json";
        link2.click();
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
        setError("");
      } catch (e) {
        setError(translate(e.message));
      }
    };
    return el(
      "div",
      { className: "mbb-csl-tools" },
      el(
        wp.components.Button,
        {
          variant: "secondary",
          onClick: () => {
            reset();
            setOpened(true);
          }
        },
        translate("Import CSL-JSON")
      ),
      el(
        wp.components.Button,
        { variant: "tertiary", onClick: download },
        translate("Download CSL-JSON subset")
      ),
      error3 && !opened ? el("p", { role: "alert" }, error3) : null,
      opened ? el(
        wp.components.Modal,
        {
          title: translate("Import bounded CSL-JSON"),
          onRequestClose: close,
          className: "mbb-csl-modal"
        },
        el(
          "p",
          {},
          translate(
            "This finite subset imports up to 64 records within 64 KiB. Review unsupported fields and key mappings explicitly. The original JSON is not stored, and import does not save the article."
          )
        ),
        el(
          "label",
          {},
          translate("CSL-JSON file (optional)"),
          el("input", {
            type: "file",
            accept: ".json,application/json",
            onChange: async (event) => {
              reset();
              setKeyMap({});
              const ticket = generation.current, file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 65536) {
                setError(translate("CSL-JSON input must be UTF-8 JSON within 64 KiB"));
                return;
              }
              try {
                const bytes4 = await file.arrayBuffer(), text3 = new TextDecoder("utf-8", { fatal: true }).decode(bytes4);
                if (ticket === generation.current) setInput(text3);
              } catch {
                if (ticket === generation.current) setError(translate("CSL-JSON is invalid"));
              }
            }
          })
        ),
        el(wp.components.TextareaControl, {
          label: translate("CSL-JSON source (up to 64 KiB)"),
          value: input,
          rows: 8,
          onChange: (value) => {
            reset();
            setInput(value);
            setKeyMap({});
          }
        }),
        el(wp.components.SelectControl, {
          label: translate("Import behavior"),
          value: mode,
          options: [
            { value: "merge", label: translate("Add entries") },
            { value: "replace", label: translate("Replace bibliography entries") }
          ],
          onChange: (value) => {
            reset();
            setMode(value);
          }
        }),
        el(
          wp.components.Button,
          { variant: "secondary", onClick: preview },
          translate("Preview CSL-JSON mapping")
        ),
        error3 ? el("p", { role: "alert" }, error3) : null,
        report ? el(
          "div",
          {},
          el(
            "div",
            { className: "mbb-csl-preview" },
            ...report.entries.map(
              (e, i) => el(
                "section",
                { key: i },
                el("h3", {}, e.title),
                el(
                  "p",
                  {},
                  typeLabel(e.type) + " \xB7 " + e.authors.map(bibliographyAuthor).join("; ") + " \xB7 " + bibliographyYear(e.issued)
                ),
                mappedFields(e),
                el(wp.components.TextControl, {
                  label: translate("Proposed citation key"),
                  value: keyMap[i] ?? e.key,
                  onChange: (value) => {
                    generation.current++;
                    setError("");
                    setAckKeys(false);
                    setAckLoss(false);
                    setKeyMap({ ...keyMap, [i]: value });
                  }
                })
              )
            )
          ),
          report.losses.length ? el(
            "div",
            {},
            el("p", {}, translate("Unsupported fields that will not be stored:")),
            el(
              "ul",
              {},
              ...report.losses.map(
                (l, i) => el("li", { key: i }, String(l.index + 1) + ": " + l.field)
              )
            ),
            el(wp.components.CheckboxControl, {
              label: translate("I reviewed and accept the listed CSL-JSON field losses"),
              checked: ackLoss,
              onChange: setAckLoss
            })
          ) : null,
          report.keyMappings.length ? el(
            "div",
            {},
            el("p", {}, translate("Citation key mappings:")),
            el(
              "ul",
              {},
              ...report.keyMappings.map(
                (m, i) => el("li", { key: i }, m.from + " \u2192 " + m.to)
              )
            ),
            el(wp.components.CheckboxControl, {
              label: translate("I reviewed and accept the proposed citation keys"),
              checked: ackKeys,
              onChange: setAckKeys
            })
          ) : null,
          candidateError ? el("p", { role: "status" }, candidateError) : null
        ) : null,
        el(
          wp.components.Button,
          {
            variant: "primary",
            disabled: !candidate,
            onClick: () => {
              try {
                const current = registry2.select("core/block-editor").getBlock(clientId);
                if (!current || registry2.select("core/block-editor").getSelectedBlockClientId() !== clientId)
                  throw Error(
                    translate("Select the same bibliography block before using this candidate")
                  );
                if (!candidate)
                  throw Error(
                    translate("Bibliography edits changed. Preview the CSL-JSON mapping again.")
                  );
                const entries = cslCandidate(
                  a.version === 2 ? a.entries : migrateBibliography(a.entries),
                  report,
                  mode,
                  referenced(),
                  ackLoss,
                  ackKeys
                );
                change({ version: 2, style: a.version === 2 ? a.style : "author-year", entries });
                session.openEntry = report.entries[0]?.key;
                close();
              } catch (e) {
                setError(translate(e.message));
              }
            }
          },
          translate("Use bibliography candidate")
        ),
        el(
          wp.components.Button,
          { variant: "tertiary", onClick: close },
          translate("Cancel CSL-JSON import")
        )
      ) : null
    );
  }

  // src/bibtex.js
  var defaults = (code2, message) => {
    throw Object.assign(new Error(message), { code: code2 });
  };
  var failMessage = "BibTeX is outside the supported bounded data subset";
  var whitespace2 = /[ \t\r\n\f\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/gu;
  var accents = {
    "'": "\u0301",
    "`": "\u0300",
    '"': "\u0308",
    "^": "\u0302",
    "~": "\u0303",
    "=": "\u0304",
    ".": "\u0307",
    c: "\u0327",
    v: "\u030C",
    u: "\u0306",
    H: "\u030B"
  };
  var commands = {
    TeX: "TeX",
    LaTeX: "LaTeX",
    ae: "\xE6",
    AE: "\xC6",
    oe: "\u0153",
    OE: "\u0152",
    aa: "\xE5",
    AA: "\xC5",
    o: "\xF8",
    O: "\xD8",
    ss: "\xDF"
  };
  function plain3(raw, fail2) {
    let out = "";
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === "{" || c === "}") continue;
      if (c === "$") fail2("BIBTEX_TEX", "Unsupported TeX command or math in BibTeX");
      if (c !== "\\") {
        out += c === "~" ? " " : c;
        continue;
      }
      const next = raw[++i];
      if ("&%$#_{}".includes(next || "\0")) {
        out += next;
        continue;
      }
      if (Object.hasOwn(accents, next)) {
        if (/[A-Za-z]/.test(next) && /[A-Za-z]/.test(raw[i + 1] || "\0"))
          fail2("BIBTEX_TEX", "Unsupported TeX command or math in BibTeX");
        while (raw[i + 1] === " ") i++;
        const grouped = raw[i + 1] === "{";
        if (grouped) i++;
        const letter = String.fromCodePoint(raw.codePointAt(i + 1) || 0);
        if (!/^\p{L}$/u.test(letter)) fail2("BIBTEX_TEX", "Unsupported TeX command or math in BibTeX");
        i += letter.length;
        if (grouped && raw[++i] !== "}")
          fail2("BIBTEX_TEX", "Unsupported TeX command or math in BibTeX");
        out += (letter + accents[next]).normalize("NFC");
        continue;
      }
      let command = next || "";
      while (/[A-Za-z]/.test(raw[i + 1] || "\0")) command += raw[++i];
      if (!Object.hasOwn(commands, command))
        fail2("BIBTEX_TEX", "Unsupported TeX command or math in BibTeX");
      out += commands[command];
      if (raw.slice(i + 1, i + 3) === "{}") i += 2;
    }
    return out.replace(whitespace2, " ").trim();
  }
  function authors2(raw, fail2) {
    let depth = 0, start = 0;
    const values = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === "\\") {
        i++;
        continue;
      }
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") depth--;
      if (!depth && /[ \t\r\n\f\v]/.test(raw[i - 1] || "") && /^and(?=[ \t\r\n\f\v])/i.test(raw.slice(i))) {
        values.push(raw.slice(start, i));
        i += 2;
        start = i + 1;
      }
    }
    values.push(raw.slice(start));
    if (values.length > 8) fail2("BIBTEX_AUTHORS", "BibTeX entries support at most eight authors");
    return values.map((x) => plain3(x, fail2));
  }
  function parseBibTeX(input, fail2 = defaults) {
    if (typeof input !== "string" || new TextEncoder().encode(input).length > 65536 || /[\x00-\x08\x0e-\x1f\x7f\uD800-\uDFFF]/u.test(input))
      fail2("BIBTEX_LIMIT", "BibTeX input must be UTF-8 text within 64 KiB");
    const source = input.replace(/^\ufeff/, "");
    let at = 0;
    const entries = [];
    const bad3 = () => fail2("BIBTEX_SYNTAX", failMessage);
    const skip = () => {
      while (at < source.length) {
        if (/[ \t\r\n\f\v]/.test(source[at])) at++;
        else if (source[at] === "%") {
          while (at < source.length && source[at] !== "\n") at++;
        } else break;
      }
    };
    const take = (c) => {
      skip();
      if (source[at++] !== c) bad3();
    };
    const word = () => {
      skip();
      const m = /^[A-Za-z][A-Za-z0-9_-]*/.exec(source.slice(at));
      if (!m) bad3();
      at += m[0].length;
      return m[0];
    };
    function value(field) {
      skip();
      const open = source[at++];
      if (open !== "{" && open !== '"') {
        at--;
        const m = /^\d+/.exec(source.slice(at));
        if (field !== "year" || !m) bad3();
        at += m[0].length;
        return m[0];
      }
      let raw = "", depth = 0;
      while (at < source.length) {
        const c = source[at++];
        if (c === "\\") {
          if (at === source.length) bad3();
          raw += c + source[at++];
          continue;
        }
        if (c === "{") {
          if (++depth > 16) bad3();
          raw += c;
          continue;
        }
        if (c === "}") {
          if (!depth) {
            if (open === "}") bad3();
            if (open === "{") return raw;
            bad3();
          }
          depth--;
          raw += c;
          continue;
        }
        if (c === '"' && open === '"' && !depth) return raw;
        raw += c;
      }
      bad3();
    }
    while (true) {
      skip();
      if (at === source.length) break;
      take("@");
      const type = word().toLowerCase();
      if (!["article", "book", "inproceedings", "misc"].includes(type)) bad3();
      skip();
      const open = source[at++];
      if (!["{", "("].includes(open)) bad3();
      const close = open === "{" ? "}" : ")";
      const key = word();
      if (!technicalId.test(key)) bad3();
      take(",");
      const fields = {};
      while (true) {
        skip();
        if (source[at] === close) {
          at++;
          break;
        }
        const name = word().toLowerCase();
        if (![
          "author",
          "title",
          "year",
          "journal",
          "booktitle",
          "publisher",
          "doi",
          "url",
          "volume",
          "number",
          "pages"
        ].includes(name) || Object.hasOwn(fields, name))
          bad3();
        take("=");
        fields[name] = value(name);
        skip();
        if (source[at] === ",") {
          at++;
          continue;
        }
        if (source[at] === close) {
          at++;
          break;
        }
        bad3();
      }
      if (!Object.hasOwn(fields, "title")) bad3();
      const f = Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, k === "author" ? v : plain3(v, fail2)])
      );
      if (Object.entries(f).some(([k, v]) => k !== "author" && !v)) bad3();
      if (f.year && !/^\d{1,4}$/.test(f.year)) bad3();
      let doi = f.doi || "";
      if (doi) {
        doi = doi.replace(/^https:\/\/doi\.org\//i, "");
        if (!/^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/.test(doi))
          fail2("BIBTEX_DOI", "BibTeX DOI values must be bounded DOI identifiers");
      }
      const parts = [];
      for (const [field, label] of [
        ["journal", "Journal"],
        ["booktitle", "Book title"],
        ["publisher", "Publisher"],
        ["volume", "Volume"],
        ["number", "Number"],
        ["pages", "Pages"]
      ])
        if (Object.hasOwn(f, field)) {
          if (!f[field]) bad3();
          parts.push(label + ": " + f[field]);
        }
      if (doi && f.url) parts.push("DOI: " + doi);
      entries.push({
        key,
        authors: Object.hasOwn(f, "author") ? authors2(f.author, fail2) : [],
        title: f.title,
        year: f.year || "",
        source: parts.join("; "),
        url: f.url || (doi ? "https://doi.org/" + doi : "")
      });
      if (entries.length > 64) fail2("BIBTEX_LIMIT", "BibTeX supports one to 64 entries");
    }
    technicalAttributes("bibliography", { entries }, fail2);
    return entries;
  }
  function bibtexCandidate(existing, incoming, mode, referencedKeys = [], fail2 = defaults) {
    if (!["merge", "replace"].includes(mode) || !Array.isArray(existing) || !Array.isArray(incoming) || !Array.isArray(referencedKeys) || referencedKeys.length > 64 || referencedKeys.some((key) => typeof key !== "string" || !technicalId.test(key)))
      fail2("BIBTEX_MODE", "Choose explicit BibTeX merge or replacement");
    const entries = mode === "merge" ? [...existing, ...incoming] : [...incoming];
    technicalAttributes("bibliography", { entries }, fail2);
    const keys2 = new Set(entries.map((e) => e.key));
    if (referencedKeys.some((key) => !keys2.has(key)))
      fail2("BIBTEX_REFERENCES", "BibTeX replacement must preserve every currently cited key");
    return entries.map((e) => ({ ...e, authors: [...e.authors] }));
  }

  // src/technical-editor.js
  var kinds = {
    equation: () => translate("Equation"),
    figure: () => translate("Figure"),
    table: () => translate("Table"),
    listing: () => translate("Listing"),
    definition: () => translate("Definition"),
    theorem: () => translate("Theorem"),
    proof: () => translate("Proof")
  };
  var bodyTypes = {
    equation: "mbb/math",
    figure: "core/image",
    table: "core/table",
    listing: "mbb/code"
  };
  var entry = (key) => ({
    key,
    authors: [],
    title: translate("Reference title"),
    year: "",
    source: "",
    url: ""
  });
  var indexCache = /* @__PURE__ */ new WeakMap();
  function editorState(blocks) {
    let state = indexCache.get(blocks);
    if (!state) {
      state = { ...technicalIndex(blocks), ...technicalDiagnostics(blocks) };
      indexCache.set(blocks, state);
    }
    return state;
  }
  function issueText(issue) {
    const messages = {
      "duplicate-id": translate("Duplicate stable label: %1$s"),
      "duplicate-key": translate("Duplicate bibliography key: %1$s"),
      "missing-target": translate("Missing reference target: %1$s"),
      "missing-key": translate("Missing bibliography entry: %1$s"),
      "reference-marker": translate("A reference marker is malformed. Correct it before saving."),
      "object-body": translate(
        "Object %1$s must contain exactly one matching formula, image, table or code block. The existing body has been preserved."
      ),
      "statement-body": translate("Statement %1$s requires body content."),
      attributes: translate("Technical block %1$s has incomplete or invalid fields.")
    };
    return format(
      messages[issue.code] || translate("Technical block %1$s has incomplete or invalid fields."),
      issue.identity
    );
  }
  function technicalSave(kind, a) {
    const el = wp.element.createElement;
    const body = () => el("div", { className: "mbb-technical-body" }, el(wp.blockEditor.InnerBlocks.Content));
    if (kind === "object")
      return el(
        "figure",
        { id: a.id, className: "mbb-technical-object", "data-mbb-object-kind": a.kind },
        body(),
        el("figcaption", { className: "mbb-technical-caption" }, a.caption)
      );
    if (kind === "statement") {
      const proof = a.kind === "proof";
      return el(
        proof ? "details" : "section",
        {
          id: a.id,
          className: "mbb-technical-statement",
          "data-mbb-statement-kind": a.kind,
          ...proof && a.open ? { open: true } : {}
        },
        el(proof ? "summary" : "p", { className: "mbb-technical-heading" }, a.title),
        body()
      );
    }
    return el(
      "section",
      {
        id: a.id,
        className: "mbb-bibliography",
        ...a.version === 2 ? { "data-mbb-bibliography-version": "2", "data-mbb-citation-style": a.style } : {}
      },
      el("p", { className: "mbb-bibliography-title" }, "Bibliography"),
      el(
        "ol",
        {},
        ...(a.entries || []).map((value) => a.version === 2 ? bibliographyProjection(value) : value).map(
          (item) => el(
            "li",
            { key: item.key, "data-mbb-bib-key": item.key },
            ...["authors", "title", "year", "source", "url"].map(
              (field) => el(
                "span",
                { key: field, className: "mbb-bib-" + field },
                field === "authors" ? item.authors.join(", ") : item[field]
              )
            )
          )
        )
      )
    );
  }
  function Rename({ type, identity, registry: registry2, session }) {
    const proposalKey = type + ":" + identity;
    const el = wp.element.createElement;
    const [proposed, setProposed] = wp.element.useState(
      session.renames[proposalKey] ?? identity ?? ""
    ), [notice, setNotice] = wp.element.useState(""), [plan, setPlan] = wp.element.useState(null);
    wp.element.useEffect(() => {
      setProposed(session.renames[proposalKey] ?? identity ?? "");
      setPlan(null);
      setNotice("");
    }, [identity]);
    const preflight = () => {
      const next = technicalRenamePlan(
        registry2.select("core/block-editor").getBlocks(),
        type,
        identity,
        proposed,
        (code2, message) => {
          throw Error(translate(message));
        }
      );
      return next;
    };
    return el(
      "div",
      {},
      el(wp.components.TextControl, {
        label: type === "label" ? translate("Proposed stable ID") : translate("Proposed reference key"),
        value: proposed,
        onChange: (value) => {
          session.renames[proposalKey] = value;
          setProposed(value);
          setPlan(null);
          setNotice("");
        }
      }),
      el(
        wp.components.Button,
        {
          variant: "secondary",
          disabled: proposed === identity,
          onClick: () => {
            try {
              const next = preflight();
              setPlan(next);
              setNotice(
                format(
                  translate("%1$s reference markers will be updated. No change has been applied."),
                  next.affectedReferences
                )
              );
            } catch (error3) {
              setPlan(null);
              setNotice(error3.message);
            }
          }
        },
        translate("Check label rename")
      ),
      notice ? el("p", { role: plan ? "status" : "alert" }, notice) : null,
      plan ? el(
        wp.components.Button,
        {
          variant: "primary",
          onClick: () => {
            try {
              const next = preflight();
              delete session.renames[proposalKey];
              if (type === "key" && session.openEntry === identity) session.openEntry = proposed;
              registry2.dispatch("core/block-editor").updateBlockAttributes(
                next.patches.map((p) => p.clientId),
                Object.fromEntries(next.patches.map((p) => [p.clientId, p.attributes])),
                true
              );
              setPlan(null);
              setNotice("");
            } catch (error3) {
              setPlan(null);
              setNotice(error3.message);
            }
          }
        },
        translate("Rename label and references")
      ) : null
    );
  }
  function BibliographyFields({ a, setAttributes, registry: registry2, session, pending: pending2 }) {
    const el = wp.element.createElement, [notice, setNotice] = wp.element.useState(""), [, refresh] = wp.element.useState(0);
    const update = (index, patch) => setAttributes({
      entries: (a.entries || []).map((item, i) => i === index ? { ...item, ...patch } : item)
    });
    return el(
      "div",
      {},
      ...(a.entries || []).map(
        (item, index) => el(
          wp.components.PanelBody,
          {
            key: item.key,
            title: item.title + " (" + item.key + ")",
            opened: (session.openEntry ?? a.entries?.[0]?.key) === item.key,
            onToggle: () => {
              session.openEntry = (session.openEntry ?? a.entries?.[0]?.key) === item.key ? null : item.key;
              refresh((n) => n + 1);
            }
          },
          !pending2 ? el(Rename, { type: "key", identity: item.key, registry: registry2, session }) : null,
          ...["authors", "title", "year", "source", "url"].map(
            (field) => el(field === "authors" ? wp.components.TextareaControl : wp.components.TextControl, {
              key: field,
              label: {
                authors: translate("Authors (one per line, at most eight)"),
                title: translate("Reference title"),
                year: translate("Year"),
                source: translate("Publication or source"),
                url: translate("Reference URL (HTTP or HTTPS)")
              }[field],
              value: field === "authors" ? item.authors.join("\n") : item[field],
              onChange: (value) => update(index, {
                [field]: field === "authors" ? value ? value.split("\n") : [] : value
              })
            })
          ),
          el(
            wp.components.Button,
            {
              variant: "tertiary",
              onClick: () => {
                try {
                  if (technicalReferenceCount(
                    registry2.select("core/block-editor").getBlocks(),
                    "key",
                    item.key
                  ))
                    throw Error(translate("This entry is cited. Remove its citations before deleting it."));
                  setAttributes({ entries: a.entries.filter((_, i) => i !== index) });
                  setNotice("");
                } catch (error3) {
                  setNotice(error3.message);
                }
              }
            },
            translate("Remove bibliography entry")
          )
        )
      ),
      el(
        wp.components.Button,
        {
          variant: "secondary",
          disabled: (a.entries || []).length >= 64,
          onClick: () => {
            const used = new Set((a.entries || []).map((item) => item.key));
            let n = 1;
            while (used.has("reference-" + n)) n++;
            session.openEntry = "reference-" + n;
            setAttributes({ entries: [...a.entries || [], entry("reference-" + n)] });
          }
        },
        translate("Add bibliography entry")
      ),
      notice ? el("p", { role: "alert" }, notice) : null
    );
  }
  function TechnicalTextDraft({ kind, a, setAttributes, clientId, drafts, syncDraftLock }) {
    const el = wp.element.createElement, field = kind === "object" ? "caption" : "title", original = a[field] || "";
    const [text3, setText] = wp.element.useState(drafts.get(clientId)?.text ?? original);
    const [error3, setError] = wp.element.useState("");
    const pending2 = drafts.get(clientId);
    wp.element.useEffect(() => {
      setText(drafts.get(clientId)?.text ?? original);
    }, [original]);
    const clear = () => {
      drafts.delete(clientId);
      syncDraftLock();
      setError("");
    };
    return el(
      "div",
      {},
      el(wp.components.TextControl, {
        label: kind === "object" ? translate("Caption") : translate("Title"),
        value: text3,
        onChange: (next) => {
          setText(next);
          setError("");
          if (next === original) drafts.delete(clientId);
          else
            drafts.set(clientId, {
              text: next,
              baseline: drafts.get(clientId)?.baseline ?? original
            });
          syncDraftLock();
        }
      }),
      error3 ? el("p", { role: "alert" }, error3) : null,
      pending2 ? el(
        "p",
        { role: "status" },
        translate("Text edits have not been applied. Apply or discard them before saving.")
      ) : null,
      el(
        wp.components.Button,
        {
          variant: "primary",
          disabled: !pending2,
          onClick: () => {
            try {
              technicalAttributes(kind, { ...a, [field]: text3 }, (code2, message) => {
                throw Error(translate(message));
              });
              setAttributes({ [field]: text3 });
              clear();
            } catch (error4) {
              setError(error4.message);
            }
          }
        },
        translate("Apply text edits")
      ),
      el(
        wp.components.Button,
        {
          variant: "tertiary",
          disabled: !pending2,
          onClick: () => {
            clear();
            setText(original);
          }
        },
        translate("Discard text edits")
      )
    );
  }
  function BibTeXImport({ entries, change, registry: registry2, clientId, session }) {
    const el = wp.element.createElement;
    const state = session.bibtex ??= { input: "", mode: "merge", preview: null };
    const [opened, setOpened] = wp.element.useState(false), [error3, setError] = wp.element.useState(""), [, refresh] = wp.element.useState(0);
    const lifetime = wp.element.useRef({ alive: true, sequence: 0 });
    wp.element.useEffect(() => {
      lifetime.current.alive = true;
      return () => {
        lifetime.current.alive = false;
        lifetime.current.sequence++;
        state.preview = null;
      };
    }, []);
    const fail2 = (code2, message) => {
      throw Error(translate(message));
    };
    const update = (patch) => {
      Object.assign(state, patch, { preview: null });
      setError("");
      refresh((n) => n + 1);
    };
    const close = () => {
      lifetime.current.sequence++;
      state.preview = null;
      setOpened(false);
    };
    const currentKeys = () => {
      const blocks = registry2.select("core/block-editor").getBlocks();
      return [...new Set(entries.map((item) => item.key))].filter(
        (key) => technicalReferenceCount(blocks, "key", key)
      );
    };
    return el(
      wp.element.Fragment,
      {},
      el(
        wp.components.Button,
        { variant: "secondary", onClick: () => setOpened(true) },
        translate("Import BibTeX")
      ),
      opened ? el(
        wp.components.Modal,
        { title: translate("Import BibTeX bibliography"), onRequestClose: close },
        el(
          "p",
          {},
          translate(
            "Preview the mapping to the existing six bibliography fields. The entry type and original BibTeX are not stored separately. Nothing is applied until you apply bibliography edits."
          )
        ),
        el(wp.components.TextareaControl, {
          label: translate("BibTeX source (up to 64 KiB)"),
          value: state.input,
          onChange: (value) => {
            lifetime.current.sequence++;
            if (new TextEncoder().encode(value).length > 65536) {
              update({});
              setError(translate("BibTeX input must be UTF-8 text within 64 KiB"));
              return;
            }
            update({ input: value });
          }
        }),
        el(
          "label",
          {},
          translate("Upload a .bib file"),
          el("input", {
            type: "file",
            accept: ".bib",
            onChange: async (event) => {
              const file = event.target.files?.[0], sequence = ++lifetime.current.sequence;
              update({});
              if (!file) return;
              try {
                if (!/\.bib$/i.test(file.name) || file.size > 65536)
                  throw Error(translate("Choose a .bib file within 64 KiB"));
                const bytes4 = await file.arrayBuffer();
                const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes4);
                if (!lifetime.current.alive || sequence !== lifetime.current.sequence) return;
                update({ input: value });
              } catch (error4) {
                if (lifetime.current.alive && sequence === lifetime.current.sequence)
                  setError(translate("The BibTeX file could not be read as bounded UTF-8 text"));
              }
            }
          })
        ),
        el(wp.components.SelectControl, {
          label: translate("Import operation"),
          value: state.mode,
          options: [
            { value: "merge", label: translate("Merge without overwriting keys") },
            { value: "replace", label: translate("Replace bibliography entries") }
          ],
          onChange: (mode) => {
            lifetime.current.sequence++;
            update({ mode });
          }
        }),
        el(
          wp.components.Button,
          {
            variant: "secondary",
            onClick: () => {
              try {
                const incoming = parseBibTeX(state.input, fail2), candidate = bibtexCandidate(entries, incoming, state.mode, currentKeys(), fail2);
                state.preview = { incoming, candidate, baseline: JSON.stringify(entries) };
                setError("");
                refresh((n) => n + 1);
              } catch (error4) {
                state.preview = null;
                setError(error4.message);
                refresh((n) => n + 1);
              }
            }
          },
          translate("Preview BibTeX mapping")
        ),
        error3 ? el("p", { role: "alert" }, error3) : null,
        state.preview ? el(
          "div",
          {},
          el(
            "p",
            { role: "status" },
            translate(
              "Mapped entries are a preview. Existing unapplied edits are preserved until you choose this candidate."
            )
          ),
          ...state.preview.candidate.map(
            (item, index) => el(
              "details",
              { key: item.key, open: index === 0 },
              el("summary", {}, item.key + " \u2014 " + item.title),
              el(
                "dl",
                {},
                ...[
                  ["Authors", item.authors.join("; ")],
                  ["Year", item.year],
                  ["Publication or source", item.source],
                  ["Reference URL (HTTP or HTTPS)", item.url]
                ].flatMap(([label, value]) => [
                  el("dt", { key: label + "-label" }, translate(label)),
                  el("dd", { key: label }, value)
                ])
              )
            )
          )
        ) : null,
        el(
          wp.components.Button,
          {
            variant: "primary",
            disabled: !state.preview,
            onClick: () => {
              try {
                const store = registry2.select("core/block-editor");
                if (!store.getBlock(clientId) || store.getSelectedBlockClientId() !== clientId)
                  throw Error(
                    translate("Select the same bibliography block before using this candidate")
                  );
                if (state.preview.baseline !== JSON.stringify(entries))
                  throw Error(translate("Bibliography edits changed. Preview the BibTeX mapping again"));
                const candidate = bibtexCandidate(
                  entries,
                  state.preview.incoming,
                  state.mode,
                  currentKeys(),
                  fail2
                );
                change({ entries: candidate });
                state.preview = null;
                close();
              } catch (error4) {
                state.preview = null;
                setError(error4.message);
                refresh((n) => n + 1);
              }
            }
          },
          translate("Use bibliography candidate")
        ),
        el(
          wp.components.Button,
          { variant: "tertiary", onClick: close },
          translate("Cancel BibTeX import")
        )
      ) : null
    );
  }
  function BibliographyOrigins({ a }) {
    const el = wp.element.createElement, [states, setStates] = wp.element.useState({});
    wp.element.useEffect(() => {
      let active = true;
      Promise.all(
        (a.origins || []).map(async (origin) => {
          const entry2 = a.entries.find((e) => e.key === origin.key);
          try {
            return [origin.key, await window.MBB.bibliographyEntryHash(entry2) === origin.hash];
          } catch {
            return [origin.key, null];
          }
        })
      ).then((values) => {
        if (active) setStates(Object.fromEntries(values));
      });
      return () => {
        active = false;
      };
    }, [JSON.stringify(a.entries), JSON.stringify(a.origins)]);
    if (!a.origins?.length) return null;
    return el(
      "details",
      {},
      el("summary", {}, translate("Library source declarations")),
      el(
        "p",
        {},
        translate(
          "Source declarations do not prove authenticity or grant library access. Article snapshots remain readable without the library."
        )
      ),
      ...a.origins.map(
        (origin) => el(
          "p",
          { key: origin.key },
          origin.key + ": " + (states[origin.key] === true ? translate("Snapshot matches declared version") : states[origin.key] === false ? translate("Locally modified snapshot") : translate("Source comparison unavailable"))
        )
      )
    );
  }
  function BibliographyDraft({
    a,
    setAttributes,
    registry: registry2,
    clientId,
    session,
    drafts,
    syncDraftLock
  }) {
    const el = wp.element.createElement;
    const saved = {
      version: a.version ?? 1,
      ...a.version === 2 ? { style: a.style } : {},
      ...a.version === 2 && Object.hasOwn(a, "origins") ? { origins: a.origins } : {},
      entries: a.entries || []
    };
    const original = JSON.stringify(saved);
    const [draft, setDraft] = wp.element.useState(drafts.get(clientId)?.value ?? saved), [error3, setError] = wp.element.useState("");
    const pending2 = drafts.get(clientId);
    wp.element.useEffect(() => {
      setDraft(drafts.get(clientId)?.value ?? saved);
    }, [original]);
    const change = (patch) => {
      const next = { ...draft, ...patch };
      if (Object.hasOwn(next, "origins"))
        next.origins = next.origins.filter((o) => next.entries.some((e) => e.key === o.key));
      setDraft(next);
      setError("");
      if (JSON.stringify(next) === original) drafts.delete(clientId);
      else
        drafts.set(clientId, { value: next, baseline: drafts.get(clientId)?.baseline ?? original });
      syncDraftLock();
    };
    const apply = () => {
      try {
        if (!pending2 || pending2.baseline !== original)
          throw Error(
            translate("Applied bibliography changed. The current candidate is preserved and unapplied.")
          );
        technicalAttributes("bibliography", { ...a, ...draft }, (code2, message) => {
          throw Error(translate(message));
        });
        const patched = registry2.select("core/block-editor").getBlocks().map(
          (block2) => block2.clientId === clientId ? { ...block2, attributes: { ...block2.attributes, ...draft } } : block2
        );
        validateTechnical(patched, (code2, message) => {
          throw Error(translate(message));
        });
        setAttributes(draft);
        drafts.delete(clientId);
        syncDraftLock();
        setError("");
      } catch (error4) {
        setError(error4.message);
      }
    };
    return el(
      "div",
      {},
      el(CSLImport, { a: draft, change, registry: registry2, clientId, session }),
      el(BibliographyOrigins, { a: draft }),
      draft.version === 2 ? el(AuthorTools, { slot: "bibliography/v2", draft, change, registry: registry2, clientId, session }) : null,
      draft.version === 2 ? el(BibliographyV2Fields, {
        a: draft,
        setAttributes: change,
        registry: registry2,
        session,
        pending: !!pending2,
        Rename
      }) : el(
        "div",
        {},
        el(
          "p",
          {},
          translate(
            "This bibliography uses the original six-field format. It stays unchanged until you explicitly upgrade or adopt a CSL-JSON candidate."
          )
        ),
        el(
          wp.components.Button,
          {
            variant: "secondary",
            onClick: () => change({
              version: 2,
              style: "author-year",
              entries: migrateBibliography(draft.entries)
            })
          },
          translate("Prepare bibliography v2 candidate")
        ),
        el(BibTeXImport, { entries: draft.entries, change, registry: registry2, clientId, session }),
        el(BibliographyFields, {
          a: { ...a, entries: draft.entries },
          setAttributes: change,
          registry: registry2,
          session,
          pending: !!pending2
        })
      ),
      pending2 ? el(
        "p",
        { role: "status" },
        pending2.baseline !== original ? translate("Applied bibliography changed. The current candidate is preserved and unapplied.") : translate(
          "Bibliography edits have not been applied. Apply or discard them before saving or renaming keys."
        )
      ) : null,
      error3 ? el("p", { role: "alert" }, error3) : null,
      el(
        wp.components.Button,
        { variant: "primary", disabled: !pending2, onClick: apply },
        translate("Apply bibliography edits")
      ),
      el(
        wp.components.Button,
        {
          variant: "tertiary",
          disabled: !pending2,
          onClick: () => {
            drafts.delete(clientId);
            syncDraftLock();
            setDraft(saved);
            setError("");
          }
        },
        translate("Discard bibliography edits")
      )
    );
  }
  function registerReferences() {
    if (typeof wp.data?.select !== "function" || typeof wp.data?.useRegistry !== "function" || typeof wp.data?.useSelect !== "function" || typeof wp.richText?.registerFormatType !== "function")
      return;
    const formats = wp.data.select("core/rich-text");
    if (typeof formats?.getFormatType !== "function") return;
    const el = wp.element.createElement;
    for (const refKind of ["xref", "cite"]) {
      const name = "mbb/" + refKind;
      if (formats.getFormatType(name)) continue;
      wp.richText.registerFormatType(name, {
        title: refKind === "xref" ? translate("Cross-reference") : translate("Literature citation"),
        tagName: "span",
        className: "mbb-" + refKind,
        attributes: {
          identity: refKind === "xref" ? "data-mbb-target" : "data-mbb-keys",
          version: "data-mbb-version",
          ...refKind === "xref" ? {
            namespace: "data-mbb-namespace",
            document: "data-mbb-document",
            targetKind: "data-mbb-kind"
          } : {}
        },
        edit: ({ value, onChange, isActive }) => {
          const registry2 = wp.data.useRegistry(), blocks = wp.data.useSelect((select) => select("core/block-editor").getBlocks(), []);
          const [opened, setOpened] = wp.element.useState(false), [selected, setSelected] = wp.element.useState([]), [error3, setError] = wp.element.useState("");
          let index = { targets: [], entries: [], validTargets: [], validKeys: [], issues: [] };
          try {
            index = editorState(blocks);
          } catch {
          }
          const options = refKind === "xref" ? index.targets.filter((item) => index.validTargets.includes(item.id)).map((item) => ({
            value: item.id,
            label: (item.title || (kinds[item.kind]?.() || item.kind) + " " + item.number) + " (" + item.id + ")"
          })) : index.entries.filter((item) => index.validKeys.includes(item.key)).map((item) => ({
            value: item.key,
            label: "[" + item.number + "] " + item.title + " (" + item.key + ")"
          }));
          const active = wp.richText.getActiveFormat(value, name), hasLink = !!wp.richText.getActiveFormat(value, "core/link");
          const preview = refKind === "xref" ? options.find((option) => option.value === selected[0])?.label : selected.map((key) => index.entries.find((item) => item.key === key)?.number).filter(Boolean).sort((a, b) => a - b).map((n) => "[" + n + "]").join(", ");
          return el(
            wp.element.Fragment,
            {},
            el(wp.blockEditor.RichTextToolbarButton, {
              icon: refKind === "xref" ? "admin-links" : "book",
              title: refKind === "xref" ? translate("Insert cross-reference") : translate("Insert literature citation"),
              isActive,
              onClick: () => {
                setSelected(active?.attributes?.identity?.split(",") || []);
                setError("");
                setOpened(true);
              }
            }),
            opened ? el(
              wp.components.Modal,
              {
                title: refKind === "xref" ? translate("Choose a reference target") : translate("Choose bibliography entries"),
                onRequestClose: () => setOpened(false)
              },
              ...index.issues.map(
                (issue, i) => el("p", { key: i, role: "alert" }, issueText(issue))
              ),
              hasLink ? el(
                "p",
                { role: "alert" },
                translate("Technical references must not be inside links or images")
              ) : null,
              el(wp.components.SelectControl, {
                label: refKind === "xref" ? translate("Reference target") : translate("Bibliography keys (at most eight)"),
                multiple: refKind === "cite",
                value: refKind === "cite" ? selected : selected[0] || "",
                options: refKind === "xref" ? [{ label: translate("Choose a reference target"), value: "" }, ...options] : options,
                onChange: (next) => setSelected(Array.isArray(next) ? next : [next].filter(Boolean))
              }),
              preview ? el("p", { role: "status" }, preview) : null,
              error3 ? el("p", { role: "alert" }, error3) : null,
              el(
                wp.components.Button,
                {
                  variant: "primary",
                  disabled: hasLink || !selected.length || selected.length > 8,
                  onClick: () => {
                    try {
                      if (selected.some((key) => !options.some((option) => option.value === key)))
                        throw Error(translate("The selected reference target no longer exists."));
                      let start = value.start, end = value.end;
                      if (active)
                        ({ start, end } = technicalReferenceSelection(
                          value,
                          refKind,
                          active.attributes.identity
                        ));
                      onChange(
                        wp.richText.insert(
                          value,
                          wp.richText.create({ html: referenceHTML(refKind, selected) }),
                          start,
                          end
                        )
                      );
                      setOpened(false);
                    } catch (error4) {
                      setError(error4.message);
                    }
                  }
                },
                translate("Insert reference")
              )
            ) : null
          );
        }
      });
    }
  }
  function registerTechnical({ drafts, syncDraftLock, retainDraftOwner }) {
    const el = wp.element.createElement;
    for (const [kind, schema] of Object.entries(technicalSchemas)) {
      const name = "mbb/" + kind;
      if (wp.blocks.getBlockType(name)) continue;
      wp.blocks.registerBlockType(name, {
        apiVersion: 3,
        title: {
          object: translate("Numbered object"),
          statement: translate("Definition, theorem or proof"),
          bibliography: translate("Bibliography")
        }[kind],
        category: "text",
        attributes: Object.fromEntries(
          Object.entries({
            ...schema,
            ...kind === "bibliography" ? { style: "string", origins: "array" } : {},
            version: "number"
          }).map(([key, type]) => [key, { type: key === "entries" ? "array" : type }])
        ),
        supports: {
          html: false,
          className: false,
          customClassName: false,
          anchor: false,
          ...kind === "bibliography" ? { multiple: false } : {}
        },
        edit: ({ attributes: a, setAttributes, clientId, isSelected }) => {
          const registry2 = wp.data.useRegistry(), blocks = wp.data.useSelect((select) => select("core/block-editor").getBlocks(), []);
          const session = wp.element.useRef({ renames: {} }).current;
          wp.element.useEffect(() => retainDraftOwner(registry2, clientId), [registry2, clientId]);
          let derived;
          try {
            derived = editorState(blocks).targets.find((target) => target.clientId === clientId);
          } catch {
          }
          wp.element.useEffect(() => {
            const defaults2 = {
              id: "mbb-" + clientId,
              version: 1,
              ...kind === "object" ? { kind: "equation", caption: translate("Caption") } : kind === "statement" ? { kind: "definition", title: translate("Title"), open: true } : { entries: [entry("reference-1")] }
            };
            const patch = Object.fromEntries(
              Object.entries(defaults2).filter(([key]) => a[key] === void 0)
            );
            if (Object.keys(patch).length) setAttributes(patch);
          }, []);
          const caption = (kinds[a.kind]?.() || "") + (derived ? " " + derived.number : "") + ": " + (a.caption ?? a.title ?? "");
          const body = kind === "bibliography" ? null : el(
            "div",
            { className: "mbb-technical-body" },
            el(
              wp.blockEditor.InnerBlocks,
              kind === "object" ? {
                allowedBlocks: [bodyTypes[a.kind || "equation"]],
                template: [
                  [
                    bodyTypes[a.kind || "equation"],
                    a.kind === "equation" || a.kind === void 0 ? { tex: "x" } : a.kind === "listing" ? { code: "\n", language: "" } : {}
                  ]
                ],
                templateLock: false
              } : {}
            )
          );
          let bibNumbers = /* @__PURE__ */ new Map();
          try {
            bibNumbers = new Map(
              technicalIndex(blocks).entries.map((item) => [item.key, item.number])
            );
          } catch {
          }
          let issues = [];
          try {
            issues = editorState(blocks).issues;
          } catch {
          }
          return el(
            "div",
            wp.blockEditor.useBlockProps({ className: "mbb-technical-editor" }),
            isSelected ? el(
              wp.blockEditor.InspectorControls,
              {},
              el(
                wp.components.PanelBody,
                {
                  title: kind === "bibliography" ? translate("Bibliography settings") : translate("Technical object settings"),
                  initialOpen: true,
                  className: "mbb-technical-settings"
                },
                ...issues.map((issue, i) => el("p", { key: i, role: "alert" }, issueText(issue))),
                el(wp.components.TextControl, {
                  label: translate("Stable ID"),
                  value: a.id || "",
                  readOnly: true
                }),
                kind !== "bibliography" ? el(TechnicalTextDraft, {
                  kind,
                  a,
                  setAttributes,
                  clientId,
                  drafts,
                  syncDraftLock
                }) : null,
                kind !== "bibliography" ? el(Rename, { type: "label", identity: a.id, registry: registry2, session }) : null,
                kind !== "bibliography" ? el(wp.components.SelectControl, {
                  label: translate("Object or statement kind"),
                  value: a.kind || "",
                  options: (kind === "object" ? ["equation", "figure", "table", "listing"] : ["definition", "theorem", "proof"]).map((value) => ({ label: kinds[value](), value })),
                  onChange: (value) => setAttributes({
                    kind: value,
                    ...kind === "statement" && value !== "proof" ? { open: true } : {}
                  })
                }) : null,
                kind === "statement" && a.kind === "proof" ? el(wp.components.ToggleControl, {
                  label: translate("Initially open"),
                  checked: a.open !== false,
                  onChange: (open) => setAttributes({ open })
                }) : null,
                kind === "bibliography" ? el(BibliographyDraft, {
                  a,
                  setAttributes,
                  registry: registry2,
                  clientId,
                  session,
                  drafts,
                  syncDraftLock
                }) : null
              )
            ) : null,
            kind === "bibliography" ? el(
              "section",
              { className: "mbb-bibliography" },
              el("p", { className: "mbb-bibliography-title" }, translate("Bibliography")),
              el(
                "ul",
                {},
                ...(a.entries || []).map((value) => a.version === 2 ? bibliographyProjection(value) : value).map(
                  (item) => el(
                    "li",
                    { key: item.key },
                    "[" + (bibNumbers.get(item.key) || "?") + "] " + item.title + (item.authors.length ? " \u2014 " + item.authors.join(", ") : "") + (item.year ? " (" + item.year + ")" : "")
                  )
                )
              )
            ) : el(
              kind === "object" ? "figure" : "section",
              {
                className: kind === "object" ? "mbb-technical-object" : "mbb-technical-statement"
              },
              kind === "statement" ? el("p", { className: "mbb-technical-heading" }, caption) : null,
              body,
              kind === "object" ? el("figcaption", { className: "mbb-technical-caption" }, caption) : null
            )
          );
        },
        save: ({ attributes }) => technicalSave(kind, attributes)
      });
    }
    registerReferences();
  }

  // src/component-data.js
  function componentParams(value, fail2) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail2("COMPONENT_PARAMS", "Component parameters must be a JSON object");
    let nodes = 0;
    const walk = (v, depth) => {
      if (++nodes > 1024 || depth > 8)
        fail2("COMPONENT_PARAMS", "Component parameters exceed the depth or node budget");
      if (v === null || typeof v === "boolean") return;
      if (typeof v === "number") {
        if (!Number.isFinite(v)) fail2("COMPONENT_PARAMS", "Component numbers must be finite");
        return;
      }
      if (typeof v === "string") {
        if (/[\uD800-\uDFFF]/u.test(v))
          fail2("COMPONENT_PARAMS", "Component text must be valid Unicode");
        return;
      }
      if (typeof v !== "object")
        fail2("COMPONENT_PARAMS", "Component parameters must contain only JSON data");
      for (const [key, child] of Object.entries(v)) {
        if (/[\uD800-\uDFFF]/u.test(key) || ["__proto__", "prototype", "constructor"].includes(key))
          fail2("COMPONENT_PARAMS", "Invalid component property name");
        walk(child, depth + 1);
      }
    };
    walk(value, 0);
    if (new TextEncoder().encode(JSON.stringify(value)).length > 16384)
      fail2("COMPONENT_PARAMS", "Component parameters are limited to 16 KiB");
    return value;
  }

  // src/component-parameters.js
  var own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  var object3 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var forbidden = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
  var clone2 = (value) => JSON.parse(JSON.stringify(value));
  var keyOf = (path) => JSON.stringify(path);
  function parameterLabel(path) {
    const words = {
      format: translate("Format"),
      groups: translate("Groups"),
      group: translate("Group"),
      id: translate("Identifier"),
      url: translate("URL"),
      description: translate("Description"),
      from: translate("From"),
      to: translate("To"),
      why: translate("Relationship explanation"),
      dataset: translate("Dataset"),
      kind: translate("Kind"),
      value: translate("Value"),
      values: translate("Values"),
      title: translate("Title"),
      label: translate("Label"),
      name: translate("Name"),
      items: translate("Items"),
      rows: translate("Rows"),
      columns: translate("Columns"),
      nodes: translate("Nodes"),
      edges: translate("Edges"),
      source: translate("Source"),
      target: translate("Target"),
      role: translate("Node role"),
      start: translate("Start"),
      count: translate("Count"),
      size: translate("Size"),
      enabled: translate("Enabled"),
      mode: translate("Mode"),
      details: translate("Details"),
      unit: translate("Unit"),
      series: translate("Series"),
      initial: translate("Initial values"),
      push: translate("Append values"),
      pops: translate("Removal count"),
      answer: translate("Answer"),
      tolerance: translate("Tolerance"),
      integer: translate("Integers only"),
      options: translate("Options"),
      correct: translate("Correct option"),
      order: translate("Order"),
      directed: translate("Directed"),
      n: translate("Count")
    };
    return path.length ? path.map(
      (key) => typeof key === "number" ? translate("Item") + " " + (key + 1) : (own(words, key) ? words[key] : null) || String(key).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase())
    ).join(" \u203A ") : translate("Parameters");
  }
  var equal = (a, b) => {
    if (typeof a !== typeof b || a === null || b === null) return a === b;
    if (Array.isArray(a) || Array.isArray(b))
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
    if (object3(a)) {
      const keys2 = Object.keys(a);
      return keys2.length === Object.keys(b).length && keys2.every((k) => own(b, k) && equal(a[k], b[k]));
    }
    return a === b;
  };
  function parameterSchemaKnown(schema) {
    let nodes = 0;
    const walk = (s, depth) => {
      if (++nodes > 1024 || depth > 8 || !object3(s) || !["object", "array", "string", "number", "integer", "boolean", "null"].includes(s.type))
        return false;
      const fields = {
        object: ["properties", "required", "additionalProperties"],
        array: ["items", "minItems", "maxItems"],
        string: ["minLength", "maxLength"],
        number: ["minimum", "maximum"],
        integer: ["minimum", "maximum"],
        boolean: [],
        null: []
      };
      if (Object.keys(s).some((k) => !["type", "enum", ...fields[s.type]].includes(k))) return false;
      for (const k of ["minItems", "maxItems", "minLength", "maxLength"])
        if (own(s, k) && (!Number.isInteger(s[k]) || s[k] < 0 || s[k] > 1024)) return false;
      for (const k of ["minimum", "maximum"])
        if (own(s, k) && (typeof s[k] !== "number" || !Number.isFinite(s[k]))) return false;
      for (const [min, max] of [
        ["minItems", "maxItems"],
        ["minLength", "maxLength"],
        ["minimum", "maximum"]
      ])
        if (own(s, min) && own(s, max) && s[min] > s[max]) return false;
      if (s.type === "object") {
        if (s.additionalProperties !== false || !object3(s.properties) || Object.keys(s.properties).some((k) => forbidden.has(k)))
          return false;
        if (own(s, "required") && (!Array.isArray(s.required) || new Set(s.required).size !== s.required.length || s.required.some((k) => typeof k !== "string" || !own(s.properties, k))))
          return false;
        if (!Object.values(s.properties).every((child) => walk(child, depth + 1))) return false;
      }
      if (s.type === "array" && !walk(s.items, depth + 1)) return false;
      if (own(s, "enum")) {
        if (!Array.isArray(s.enum) || !s.enum.length) return false;
        const { enum: choices, ...base2 } = s;
        if (choices.some((value) => validateParameterSchema(value, base2).length)) return false;
      }
      return true;
    };
    return walk(schema, 0);
  }
  function validateParameterSchema(value, schema) {
    if (!parameterSchemaKnown(schema)) return [];
    const errors2 = [];
    const error3 = (path, code2, message) => {
      if (errors2.length < 32) errors2.push({ path, code: code2, message });
    };
    const walk = (v, s, path, depth) => {
      if (depth > 8) {
        error3(path, "depth", "Parameters exceed the supported depth.");
        return;
      }
      const valid = {
        object: object3(v),
        array: Array.isArray(v),
        string: typeof v === "string",
        number: typeof v === "number" && Number.isFinite(v),
        integer: typeof v === "number" && Number.isInteger(v),
        boolean: typeof v === "boolean",
        null: v === null
      }[s.type];
      if (!valid) {
        error3(path, "type", "The field has an invalid type.");
        return;
      }
      if (s.enum && !s.enum.some((candidate) => equal(v, candidate)))
        error3(path, "enum", "Choose one of the registered values.");
      if (typeof v === "number" && (own(s, "minimum") && v < s.minimum || own(s, "maximum") && v > s.maximum))
        error3(path, "bounds", "The number is outside the registered bounds.");
      if (typeof v === "string" && (own(s, "minLength") && [...v].length < s.minLength || own(s, "maxLength") && [...v].length > s.maxLength))
        error3(path, "length", "The text length is outside the registered bounds.");
      if (s.type === "object") {
        for (const k of s.required || [])
          if (!own(v, k)) error3([...path, k], "required", "This registered field is required.");
        for (const [k, child] of Object.entries(v)) {
          if (!own(s.properties, k))
            error3([...path, k], "unknown", "This field is not in the registered schema.");
          else walk(child, s.properties[k], [...path, k], depth + 1);
        }
      }
      if (s.type === "array") {
        if (v.length < (s.minItems || 0) || v.length > (s.maxItems ?? 1024))
          error3(path, "items", "The item count is outside the registered bounds.");
        v.forEach((child, i) => walk(child, s.items, [...path, i], depth + 1));
      }
    };
    walk(value, schema, [], 0);
    return errors2;
  }
  function relationParameterSchema(schema) {
    const v3 = schema?.properties?.format?.enum?.[0] === "relation-map/v3";
    const keys2 = ["format", "title", "groups", "nodes", "edges", ...v3 ? ["display"] : []];
    if (!object3(schema) || schema.type !== "object" || schema.additionalProperties !== false || !object3(schema.properties) || Object.keys(schema.properties).length !== keys2.length || !keys2.every((k) => own(schema.properties, k)) || !Array.isArray(schema.required) || !keys2.every((k) => schema.required.includes(k)) || schema.properties.title?.type !== "string" || schema.properties.format?.type !== "string" || schema.properties.format.enum?.length !== 1 || !["relation-map/v1", "relation-map/v2", "relation-map/v3", "knowledge-map/v1"].includes(
      schema.properties.format.enum[0]
    ))
      return false;
    const knowledge = schema.properties.format.enum[0] === "knowledge-map/v1";
    const v2 = knowledge || ["relation-map/v2", "relation-map/v3"].includes(schema.properties.format.enum[0]);
    const target = schema.properties.nodes?.items?.properties?.target;
    if (v2 && (!target || target.type !== "object" || target.additionalProperties !== false || Object.keys(target.properties || {}).sort().join(",") !== (knowledge ? "document,documentId,kind,namespace,site,target" : "document,documentId,kind,namespace,site") || !Object.values(target.properties).every((s) => s.type === "string")))
      return false;
    return [
      ["groups", 8, ["id", "title"]],
      [
        "nodes",
        64,
        v2 ? ["id", "group", "title", "target", "description", ...knowledge ? ["role"] : []] : ["id", "group", "title", "url", "description"]
      ],
      ["edges", 128, v2 ? ["id", "from", "to", "kind", "why"] : ["from", "to", "kind", "why"]]
    ].every(([name, max, fields]) => {
      const array = schema.properties[name], item = array?.items;
      return array?.type === "array" && Number.isInteger(array.maxItems) && array.maxItems > 0 && array.maxItems <= max && item?.type === "object" && item.additionalProperties === false && object3(item.properties) && Object.keys(item.properties).length === fields.length && fields.every((k) => item.properties[k]?.type === (k === "target" ? "object" : "string"));
    });
  }
  function parameterFormSupport(schema, value) {
    if (!parameterSchemaKnown(schema) || schema.type !== "object") return false;
    const relation = relationParameterSchema(schema);
    let controls = 0;
    const walk = (s, v, depth) => {
      if (++controls > (relation ? 1536 : 128) || depth > 6 || s.type === "null") return false;
      if (s.enum && s.enum.some((item) => item !== null && typeof item === "object")) return false;
      if (s.type === "object") {
        if (v !== void 0 && !object3(v)) return false;
        if (Object.keys(s.properties).length > 32 || v && Object.keys(v).some((k) => !own(s.properties, k)))
          return false;
        return Object.entries(s.properties).every(([k, child]) => walk(child, v?.[k], depth + 1));
      }
      if (s.type === "array") {
        if (!Number.isInteger(s.maxItems) || s.maxItems > (relation ? 128 : 64) || v !== void 0 && !Array.isArray(v))
          return false;
        return (v || []).every((child) => walk(s.items, child, depth + 1));
      }
      return true;
    };
    return walk(schema, value, 0);
  }
  function updateParameterValue(value, path, next, remove = false) {
    if (!path.length) return next;
    if (path.some((k) => forbidden.has(String(k)))) throw Error("Invalid component property name");
    const [key, ...rest] = path;
    const copy = Array.isArray(value) ? [...value] : { ...value };
    if (rest.length) copy[key] = updateParameterValue(value?.[key], rest, next, remove);
    else if (remove) {
      if (Array.isArray(copy)) copy.splice(Number(key), 1);
      else delete copy[key];
    } else copy[key] = next;
    return copy;
  }
  function initialValue(schema, seed) {
    if (seed !== void 0) return clone2(seed);
    if (schema.enum) return clone2(schema.enum[0]);
    if (schema.type === "object")
      return Object.fromEntries(
        (schema.required || []).map((k) => [k, initialValue(schema.properties[k])])
      );
    if (schema.type === "array")
      return Array.from({ length: schema.minItems || 0 }, () => initialValue(schema.items));
    if (schema.type === "string") return "";
    if (schema.type === "boolean") return false;
    if (schema.type === "null") return null;
    return schema.minimum ?? Math.min(0, schema.maximum ?? 0);
  }
  function componentLocalDraft(value) {
    if (value === null) return null;
    if (typeof value !== "object" || Array.isArray(value))
      throw Error(translate("Invalid local author draft"));
    let nodes = 0;
    const walk = (v, depth) => {
      if (++nodes > 1024 || depth > 8) throw Error(translate("Invalid local author draft"));
      if (v === null || ["string", "boolean", "number"].includes(typeof v)) return;
      if (!v || typeof v !== "object" || !Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
        throw Error(translate("Invalid local author draft"));
      if (Object.getOwnPropertySymbols(v).length) throw Error(translate("Invalid local author draft"));
      const descriptors = Object.getOwnPropertyDescriptors(v);
      if (Object.values(descriptors).some((d) => d.get || d.set))
        throw Error(translate("Invalid local author draft"));
      if (Array.isArray(v) && (Object.keys(v).length !== v.length || Object.keys(v).some((k, i) => k !== String(i))))
        throw Error(translate("Invalid local author draft"));
      for (const [key, d] of Object.entries(descriptors)) {
        if (Array.isArray(v) && key === "length") continue;
        if (!d.enumerable) throw Error(translate("Invalid local author draft"));
        walk(d.value, depth + 1);
      }
    };
    walk(value, 0);
    componentParams(value, (_code, message) => {
      throw Error(message);
    });
    return clone2(value);
  }
  function componentAuthorScope() {
    const cfg = globalThis.MBB_EDITOR;
    return JSON.stringify([
      cfg?.postId || 0,
      cfg?.state?.expected || null,
      cfg?.state?.source_sha256 || null
    ]);
  }
  function createParameterEditor({
    wp: wp2,
    drafts,
    syncDraftLock,
    parse,
    providers: providers2 = () => window.MBBComponents || []
  }) {
    const el = wp2.element.createElement;
    const find2 = (component, version2) => providers2().find((p) => p.id === component && p.version === version2);
    function ArticleTarget({ value, label, onChange, assertCurrent, knowledge = false }) {
      const [query, setQuery] = wp2.element.useState("");
      const [targetKind, setTargetKind] = wp2.element.useState(
        ["step", "activity"].includes(value?.kind) ? value.kind : "document"
      );
      const [items, setItems] = wp2.element.useState([]);
      const [error3, setError] = wp2.element.useState("");
      const [busy, setBusy] = wp2.element.useState(false);
      const [currentTarget, setCurrentTarget] = wp2.element.useState({ state: "loading" });
      const currentGuard = wp2.element.useRef(assertCurrent);
      currentGuard.current = assertCurrent;
      const alive = wp2.element.useRef(true);
      const queryGeneration = wp2.element.useRef(0);
      wp2.element.useEffect(() => {
        alive.current = true;
        return () => {
          alive.current = false;
        };
      }, []);
      wp2.element.useEffect(() => {
        let active = true;
        setCurrentTarget({ state: "loading" });
        wp2.apiFetch({
          path: ["step", "activity"].includes(value?.kind) ? "/mbb/v1/references/resolve" : "/mbb/v1/references/articles",
          method: "POST",
          data: ["step", "activity"].includes(value?.kind) ? { targets: [value] } : { target: value }
        }).then(
          (result) => {
            if (active && alive.current) {
              try {
                currentGuard.current();
                setCurrentTarget(
                  ["step", "activity"].includes(value?.kind) ? result.items?.[0] || { state: "unavailable" } : result
                );
              } catch {
                setCurrentTarget({ state: "unavailable" });
              }
            }
          },
          () => {
            if (active && alive.current) setCurrentTarget({ state: "unavailable" });
          }
        );
        return () => {
          active = false;
        };
      }, [JSON.stringify(value)]);
      return el(
        "fieldset",
        {},
        el("legend", {}, label),
        knowledge ? el(wp2.components.SelectControl, {
          label: translate("Target type"),
          value: targetKind,
          options: [
            { label: translate("Article"), value: "document" },
            { label: translate("Stage"), value: "step" },
            { label: translate("Activity"), value: "activity" }
          ],
          onChange: (kind) => {
            queryGeneration.current++;
            setTargetKind(kind);
            setItems([]);
          }
        }) : null,
        el(
          "p",
          { "data-mbb-current-article": "" },
          translate("Current article target") + ": " + (currentTarget.state === "available" ? translate("Available") + " \xB7 " + currentTarget.title : currentTarget.state === "loading" ? translate("Checking the current article target\u2026") : translate("This article is unavailable."))
        ),
        el(
          "p",
          {},
          value?.kind === "document" ? translate("Portable document reference") : translate("Local document reference")
        ),
        el(wp2.components.TextControl, {
          label: translate("Search managed articles"),
          value: query,
          onChange: (value2) => {
            queryGeneration.current++;
            setQuery(value2);
            setItems([]);
          }
        }),
        el(
          wp2.components.Button,
          {
            variant: "secondary",
            disabled: busy,
            onClick: async () => {
              setBusy(true);
              setError("");
              try {
                assertCurrent();
                const currentQuery = ++queryGeneration.current;
                const result = await wp2.apiFetch({
                  path: (targetKind === "document" ? "/mbb/v1/references/articles?q=" : "/mbb/v1/references/search?q=") + encodeURIComponent(query)
                });
                assertCurrent();
                if (alive.current && currentQuery === queryGeneration.current)
                  setItems(
                    (result.items || []).filter(
                      (item) => targetKind === "document" || item.target?.kind === targetKind
                    )
                  );
              } catch (e) {
                if (alive.current) setError(translateError(e));
              } finally {
                if (alive.current) setBusy(false);
              }
            }
          },
          translate("Search articles")
        ),
        error3 ? el("p", { role: "alert" }, error3) : null,
        ...items.map(
          (item, index) => el(
            wp2.components.Button,
            {
              key: index,
              variant: "secondary",
              onClick: () => {
                try {
                  assertCurrent();
                  queryGeneration.current++;
                  onChange(clone2(item.target));
                  setItems([]);
                } catch (e) {
                  setError(translateError(e));
                }
              }
            },
            (item.article ? item.article + " \xB7 " : "") + (item.label ? item.label + " \xB7 " : "") + item.title
          )
        ),
        knowledge && targetKind !== "document" ? el(
          "p",
          {},
          translate(
            "Stage and activity targets require an existing logical identity. Maintain it with the document identity tools before choosing a target."
          )
        ) : null,
        el(
          "p",
          {},
          translate(
            "Choose a currently readable managed article. Unavailable references remain stored without exposing their content to readers."
          )
        )
      );
    }
    return function ParameterEditor({
      value,
      onCommit,
      clientId,
      component,
      componentVersion,
      instanceId,
      activity,
      parts = []
    }) {
      const original = JSON.stringify(value || {}, null, 2);
      const identity = component + "@" + componentVersion + ":" + (instanceId || "") + (activity ? ":" + JSON.stringify(activity) : "");
      const [candidateActivity, setCandidateActivity] = wp2.element.useState(
        drafts.get(clientId)?.activity ?? activity
      );
      const [candidateVersion, setCandidateVersion] = wp2.element.useState(
        drafts.get(clientId)?.componentVersion ?? componentVersion
      );
      useComponentDescriptor(wp2, component, candidateVersion);
      const relationUpgrade = useComponentDescriptor(
        wp2,
        component === "navigation-map" ? component : null,
        "0.2.0"
      );
      const relationV3Upgrade = useComponentDescriptor(
        wp2,
        component === "navigation-map" ? component : null,
        "0.3.0"
      );
      const provider = find2(component, candidateVersion);
      const schema = provider?.schema;
      const [raw, setRaw] = wp2.element.useState(drafts.get(clientId)?.raw ?? original);
      const [error3, setError] = wp2.element.useState(drafts.get(clientId)?.error || "");
      const [mode, setMode] = wp2.element.useState("form");
      const [selectedItems, setSelectedItems] = wp2.element.useState({});
      const [fieldIssue, setFieldIssue] = wp2.element.useState(null);
      const [removalIssue, setRemovalIssue] = wp2.element.useState(null);
      const editorRoot = wp2.element.useRef(null);
      const controlId = (path) => "mbb-parameter-" + clientId + "-" + path.join("-");
      const mobileErrorId = controlId(["mobile-error"]);
      const jsonId = controlId(["json"]);
      const jsonErrorId = controlId(["json-error"]);
      const focusControl = (id2) => requestAnimationFrame(() => {
        const control = editorRoot.current?.querySelector(
          id2 === jsonId ? "[data-mbb-parameter-json] textarea" : '[id="' + id2 + '"]'
        );
        control?.focus();
      });
      const relationForm = relationParameterSchema(schema);
      const knowledge = relationForm && schema.properties.format.enum[0] === "knowledge-map/v1";
      const relationV3 = relationForm && schema.properties.format.enum[0] === "relation-map/v3";
      const relationV2 = relationForm && ["relation-map/v2", "relation-map/v3", "knowledge-map/v1"].includes(
        schema.properties.format.enum[0]
      );
      const authorSession = wp2.element.useRef({});
      const authorLife = wp2.element.useRef({ active: true, signature: "", generation: 0 });
      const [, refreshLocalDraft] = wp2.element.useState(0);
      const localDraft = drafts.get(clientId)?.localDraft ?? null;
      const openingScope = componentAuthorScope();
      const fingerprint = () => {
        const d = drafts.get(clientId);
        return JSON.stringify([
          d?.raw ?? original,
          d?.componentVersion ?? componentVersion,
          d?.activity ?? activity,
          d?.localDraft ?? null,
          d?.baseline ?? original,
          d?.identity ?? identity,
          d?.error ?? ""
        ]);
      };
      const openingFingerprint = fingerprint();
      const authorSignature = JSON.stringify([
        clientId,
        identity,
        original,
        raw,
        candidateVersion,
        candidateActivity,
        localDraft,
        mode,
        openingScope
      ]);
      if (authorLife.current.signature !== authorSignature) {
        authorLife.current.signature = authorSignature;
        authorLife.current.generation++;
      }
      const generation = authorLife.current.generation, session = authorSession.current;
      wp2.element.useEffect(() => {
        authorLife.current.active = true;
        return () => {
          authorLife.current.active = false;
        };
      }, [clientId]);
      const assertAuthorCurrent = () => {
        const d = drafts.get(clientId);
        if (!authorLife.current.active || authorLife.current.generation !== generation || authorSession.current !== session || openingScope !== componentAuthorScope() || openingFingerprint !== fingerprint() || d && (d.identity !== identity || d.baseline !== original))
          throw Error(translate("The author candidate changed. Preview again."));
      };
      const chooseMode = (next) => {
        if (next === mode) return;
        authorLife.current.generation++;
        setMode(next);
      };
      let candidate, parseError;
      try {
        candidate = parse(raw);
      } catch (e) {
        parseError = translateError(e);
      }
      const schemaErrors = candidate === void 0 ? [] : validateParameterSchema(candidate, schema);
      const errors2 = new Map(schemaErrors.map((e) => [keyOf(e.path), translate(e.message)]));
      const form = candidate !== void 0 && parameterFormSupport(schema, candidate);
      const author = provider ? componentAuthor(component, candidateVersion) : void 0;
      let authorSupported = false;
      try {
        authorSupported = candidate !== void 0 && !!author?.supports(clone2(candidate), { activity: candidateActivity });
      } catch {
      }
      useComponentDescriptor(
        wp2,
        component,
        authorSupported ? author?.upgrade?.componentVersion : void 0
      );
      const upgrade = authorSupported && author?.upgrade && find2(component, author.upgrade.componentVersion);
      const currentIssues = (text3, currentSchema = schema) => {
        try {
          const parsed = parse(text3);
          componentParams(parsed, (code2, message) => {
            throw Error(message);
          });
          return validateParameterSchema(parsed, currentSchema);
        } catch (e) {
          return [{ path: [], message: translateError(e) }];
        }
      };
      wp2.element.useEffect(() => {
        const pending2 = drafts.get(clientId);
        if (pending2) {
          setRaw(pending2.raw);
          setCandidateActivity(pending2.activity ?? activity);
          setCandidateVersion(pending2.componentVersion ?? componentVersion);
          setError(pending2.error || "");
        } else {
          setRaw(original);
          setCandidateActivity(activity);
          setCandidateVersion(componentVersion);
          setError("");
          if (currentIssues(original, find2(component, componentVersion)?.schema).length) {
            drafts.set(clientId, { raw: original, baseline: original, identity });
            syncDraftLock();
          }
        }
      }, [original, identity, JSON.stringify(schema)]);
      const change = (text3, targetVersion = candidateVersion, consumeLocalDraft = false) => {
        authorLife.current.generation++;
        setCandidateVersion(targetVersion);
        setRaw(text3);
        setError("");
        setFieldIssue(null);
        setRemovalIssue(null);
        const prior = drafts.get(clientId);
        if (text3 === original && targetVersion === componentVersion && equal(candidateActivity, activity) && (consumeLocalDraft || prior?.localDraft == null) && !currentIssues(text3).length)
          drafts.delete(clientId);
        else
          drafts.set(clientId, {
            raw: text3,
            ...candidateActivity ? { activity: clone2(candidateActivity) } : {},
            componentVersion: targetVersion,
            error: "",
            baseline: prior?.baseline ?? original,
            identity: prior?.identity ?? identity,
            ...!consumeLocalDraft && prior?.localDraft != null ? { localDraft: prior.localDraft } : {}
          });
        syncDraftLock();
        refreshLocalDraft((n) => n + 1);
      };
      const updateLocalDraft = (next) => {
        assertAuthorCurrent();
        const checked = componentLocalDraft(next);
        if (checked === null) change(raw, candidateVersion, true);
        else {
          const prior = drafts.get(clientId);
          authorLife.current.generation++;
          drafts.set(clientId, {
            raw,
            ...candidateActivity ? { activity: clone2(candidateActivity) } : {},
            componentVersion: candidateVersion,
            error: "",
            baseline: prior?.baseline ?? original,
            identity: prior?.identity ?? identity,
            localDraft: checked
          });
          setError("");
          syncDraftLock();
        }
        refreshLocalDraft((n) => n + 1);
      };
      const commit = () => {
        let issuePath = null;
        try {
          if (drafts.get(clientId)?.localDraft != null)
            throw Error(translate("Prepare or discard local author edits before applying parameters."));
          const registered = find2(component, candidateVersion);
          if (activity && (!registered || registered.activityVersion !== 1))
            throw Error(
              translate(
                "The component is missing or incompatible. Preserve its configuration or enable the matching extension before editing."
              )
            );
          if (candidateVersion !== componentVersion && !registered)
            throw Error(
              translate(
                "The upgrade target is no longer registered. Discard the candidate or restore the extension."
              )
            );
          const parsed = parse(raw);
          componentParams(parsed, (code2, message) => {
            throw Error(message);
          });
          const issues = validateParameterSchema(parsed, registered?.schema);
          if (issues.length) {
            issuePath = issues[0].path;
            throw Error(parameterLabel(issues[0].path) + ": " + translate(issues[0].message));
          }
          if (relationV3) {
            const hint = parsed.display?.mobileStart;
            if (hint && ["group", "node"].includes(hint.kind) && !(hint.kind === "group" ? parsed.groups : parsed.nodes)?.some(
              (item) => item.id === hint.id
            )) {
              issuePath = ["display", "mobileStart", "id"];
              throw Error(translate("Choose an existing mobile starting item, or use Automatic."));
            }
          }
          if (relationForm && ["relation-map/v1", "relation-map/v2", "relation-map/v3", "knowledge-map/v1"].includes(
            registered?.readerMode
          )) {
            if (!globalThis.MBBRelationMap)
              throw Error(
                translate(
                  "The relationship map validator is unavailable. Reload before applying parameters."
                )
              );
            (knowledge ? globalThis.MBBKnowledgeMap : relationV3 ? globalThis.MBBRelationMapV3 : relationV2 ? globalThis.MBBRelationMapV2 : globalThis.MBBRelationMap).validate(parsed);
          }
          if (author?.apiVersion === 2) author.validate(parsed, candidateActivity);
          const pending2 = drafts.get(clientId);
          if (pending2 && (pending2.identity !== identity || pending2.baseline !== original))
            throw Error(
              translate(
                "The component changed while this candidate was open. Review or discard the candidate."
              )
            );
          if (!equal(parsed, value) || candidateVersion !== componentVersion || !equal(candidateActivity, activity))
            onCommit(parsed, {
              componentVersion: candidateVersion,
              ...candidateActivity ? { activity: clone2(candidateActivity) } : {}
            });
          drafts.delete(clientId);
          authorLife.current.generation++;
          authorSession.current = {};
          refreshLocalDraft((n) => n + 1);
          syncDraftLock();
          setError("");
          setFieldIssue(null);
          setRemovalIssue(null);
        } catch (e) {
          const message = translateError(e);
          if (relationV3) {
            if (form && mode === "form" && issuePath?.[0] === "display" && ["group", "node"].includes(candidate.display?.mobileStart?.kind)) {
              setFieldIssue({ target: "mobile", message });
              focusControl(controlId(["mobile-item"]));
            } else {
              setFieldIssue({ target: "json", message });
              setMode("json");
              focusControl(jsonId);
            }
          }
          setError(message);
          drafts.set(clientId, {
            raw,
            ...candidateActivity ? { activity: clone2(candidateActivity) } : {},
            componentVersion: candidateVersion,
            error: message,
            baseline: drafts.get(clientId)?.baseline ?? original,
            identity: drafts.get(clientId)?.identity ?? identity,
            ...drafts.get(clientId)?.localDraft != null ? { localDraft: drafts.get(clientId).localDraft } : {}
          });
          syncDraftLock();
        }
      };
      const set2 = (path, next, remove) => {
        if (relationV3 && remove && path.length === 2 && ["groups", "nodes"].includes(path[0])) {
          const item = candidate[path[0]][path[1]], references = [];
          if (path[0] === "groups") {
            const nodes = candidate.nodes.filter((n) => n.group === item.id);
            if (nodes.length)
              references.push(translate("Nodes") + ": " + nodes.map((n) => n.title || n.id).join(", "));
          } else {
            const edges = candidate.edges.filter((e) => e.from === item.id || e.to === item.id);
            if (edges.length) references.push(translate("Edges") + ": " + edges.map((e) => e.id).join(", "));
          }
          const hint = candidate.display?.mobileStart;
          if (hint?.kind === (path[0] === "groups" ? "group" : "node") && hint.id === item.id)
            references.push(translate("Mobile starting branch") + ": " + (item.title || item.id));
          if (references.length) {
            setRemovalIssue({
              path: keyOf(path),
              message: translate("Remove references before deleting this item:") + " " + references.join("; ")
            });
            return;
          }
        }
        change(JSON.stringify(updateParameterValue(candidate, path, next, remove), null, 2));
      };
      const render = (s, v, path, required = true, seed) => {
        const label = parameterLabel(path), issue = errors2.get(keyOf(path));
        if (v === void 0)
          return el(
            "div",
            { key: keyOf(path), className: "mbb-parameter-missing" },
            el(
              wp2.components.Button,
              { variant: "secondary", onClick: () => set2(path, initialValue(s, seed)) },
              translate("Add field") + ": " + label
            ),
            issue ? el("p", { role: "alert" }, issue) : null
          );
        const common = {
          key: keyOf(path),
          label,
          help: issue,
          "aria-invalid": issue ? "true" : void 0
        };
        let control;
        if (relationV3 && path.length === 1 && path[0] === "display" && object3(v.mobileStart)) {
          const hint = v.mobileStart;
          const choices = hint.kind === "group" ? candidate.groups : hint.kind === "node" ? candidate.nodes : [];
          control = el(
            "fieldset",
            { key: keyOf(path), "data-mbb-mobile-start": "" },
            el("legend", {}, translate("Mobile starting branch")),
            el(
              "p",
              {},
              translate("Sets the first mobile view. Readers can switch branches or open the full map.")
            ),
            el(wp2.components.SelectControl, {
              id: controlId(["mobile-kind"]),
              label: translate("Initial focus"),
              value: hint.kind,
              options: [
                { value: "auto", label: translate("Automatic") },
                { value: "group", label: translate("Group") },
                { value: "node", label: translate("Node") }
              ],
              onChange: (kind) => set2(path, {
                mobileStart: {
                  kind,
                  id: kind === "auto" ? "" : (kind === "group" ? candidate.groups : candidate.nodes)?.[0]?.id || ""
                }
              })
            }),
            hint.kind !== "auto" ? el(wp2.components.SelectControl, {
              id: controlId(["mobile-item"]),
              label: translate("Starting item"),
              value: hint.id,
              "aria-invalid": fieldIssue?.target === "mobile" ? "true" : void 0,
              help: fieldIssue?.target === "mobile" ? el("span", { id: mobileErrorId, role: "alert" }, fieldIssue.message) : void 0,
              options: [
                { value: "", label: translate("Choose an existing item") },
                ...hint.id && !choices.some((n) => n.id === hint.id) ? [{ value: hint.id, label: translate("Unavailable starting item") + ": " + hint.id }] : [],
                ...choices.map((n) => ({ value: n.id, label: n.title }))
              ],
              onChange: (id2) => set2(path, { mobileStart: { ...hint, id: id2 } })
            }) : null
          );
        } else if (relationV2 && path.length === 3 && path[0] === "nodes" && path[2] === "target") {
          control = el(ArticleTarget, {
            key: String(candidate.nodes?.[path[1]]?.id || keyOf(path)),
            value: v,
            label,
            knowledge,
            assertCurrent: assertAuthorCurrent,
            onChange: (next) => set2(path, next)
          });
        } else if (relationV2 && path.length === 3 && path[2] === "id") {
          control = el(wp2.components.TextControl, { ...common, value: v, readOnly: true });
        } else if (relationForm && path.length === 3 && (path[0] === "nodes" && path[2] === "group" || path[0] === "edges" && ["from", "to"].includes(path[2]))) {
          const referenced = path[0] === "nodes" ? candidate.groups : candidate.nodes;
          const choices = Array.isArray(referenced) ? referenced.filter((item) => object3(item) && typeof item.id === "string" && item.id) : [];
          const options = choices.map((item) => ({
            value: item.id,
            label: (item.title || item.id) + " \xB7 " + item.id
          }));
          if (!options.some((item) => item.value === v))
            options.unshift({ value: v, label: translate("Choose an existing item") + (v ? ": " + v : "") });
          control = el(wp2.components.SelectControl, {
            ...common,
            value: v,
            options,
            onChange: (value2) => set2(path, value2)
          });
        } else if (s.enum) {
          const options = s.enum.map((item, i) => ({
            label: [
              "recommended",
              "compare",
              "optimization",
              "prerequisite",
              "explains",
              "practises",
              "concept",
              "reading",
              "practice"
            ].includes(item) && schema.properties?.format?.enum?.some(
              (v2) => [
                "relation-map/v1",
                "relation-map/v2",
                "relation-map/v3",
                "knowledge-map/v1"
              ].includes(v2)
            ) ? {
              prerequisite: translate("Prior understanding"),
              explains: translate("Explanation relationship"),
              practises: translate("Related practice"),
              concept: translate("Concept"),
              reading: translate("Reading"),
              practice: translate("Practice"),
              recommended: translate("Suggested reading order"),
              compare: translate("Compare ideas"),
              optimization: translate("For further optimization")
            }[item] : typeof item === "string" ? item : JSON.stringify(item),
            value: String(i)
          }));
          const index = s.enum.findIndex((item) => equal(v, item));
          if (index < 0)
            options.unshift({
              label: translate("Current value is outside the registered choices"),
              value: ""
            });
          control = el(wp2.components.SelectControl, {
            ...common,
            options,
            value: index < 0 ? "" : String(index),
            onChange: (n) => {
              if (n !== "") set2(path, clone2(s.enum[Number(n)]));
            }
          });
        } else if (s.type === "object")
          control = el(
            "fieldset",
            { key: keyOf(path) },
            el("legend", {}, label),
            ...(relationV3 && path.length === 0 ? [
              ...["format", "title", "display"].map((k) => [k, s.properties[k]]),
              ...Object.entries(s.properties).filter(
                ([k]) => !["format", "title", "display"].includes(k)
              )
            ] : Object.entries(s.properties)).map(
              ([k, child]) => render(child, v[k], [...path, k], (s.required || []).includes(k), seed?.[k])
            )
          );
        else if (s.type === "array") {
          const paged = relationForm && s.items.type === "object";
          const selected = Math.max(0, Math.min(selectedItems[keyOf(path)] || 0, v.length - 1));
          control = el(
            "fieldset",
            { key: keyOf(path) },
            el("legend", {}, label),
            issue ? el("p", { role: "alert" }, issue) : null,
            paged && v.length ? el(wp2.components.SelectControl, {
              label: translate("Edit item") + ": " + label,
              value: String(selected),
              options: v.map((child, i) => ({
                value: String(i),
                label: i + 1 + " \xB7 " + (child.title || (child.from && child.to ? (Array.isArray(candidate.nodes) && candidate.nodes.find((n) => n.id === child.from)?.title || child.from) + " \u2192 " + (Array.isArray(candidate.nodes) && candidate.nodes.find((n) => n.id === child.to)?.title || child.to) + " \xB7 " + ({
                  prerequisite: translate("Prior understanding"),
                  explains: translate("Explanation relationship"),
                  practises: translate("Related practice"),
                  concept: translate("Concept"),
                  reading: translate("Reading"),
                  practice: translate("Practice"),
                  recommended: translate("Suggested reading order"),
                  compare: translate("Compare ideas"),
                  optimization: translate("For further optimization")
                }[child.kind] || child.kind) : child.id || ""))
              })),
              onChange: (value2) => setSelectedItems({ ...selectedItems, [keyOf(path)]: Number(value2) })
            }) : null,
            ...v.map(
              (child, i) => (!paged || i === selected) && el(
                "div",
                {
                  key: i,
                  className: "mbb-parameter-array-item" + (["string", "number", "integer"].includes(s.items.type) ? " mbb-parameter-scalar-item" : "")
                },
                render(s.items, child, [...path, i], true, seed?.[i]),
                el(
                  wp2.components.Button,
                  {
                    variant: "tertiary",
                    ...relationV3 && removalIssue?.path === keyOf([...path, i]) ? { "aria-describedby": controlId([...path, i, "remove-error"]) } : {},
                    disabled: v.length <= (s.minItems || 0),
                    onClick: () => set2([...path, i], void 0, true)
                  },
                  translate("Remove item") + " " + (i + 1)
                ),
                relationV3 && removalIssue?.path === keyOf([...path, i]) ? el(
                  "p",
                  {
                    id: controlId([...path, i, "remove-error"]),
                    role: "alert",
                    "data-mbb-removal-error": ""
                  },
                  removalIssue.message
                ) : null
              )
            ),
            el(
              wp2.components.Button,
              {
                variant: "secondary",
                disabled: v.length >= s.maxItems,
                onClick: () => {
                  if (paged) setSelectedItems({ ...selectedItems, [keyOf(path)]: v.length });
                  const item = initialValue(s.items);
                  if (relationV2 && ["groups", "nodes", "edges"].includes(path[0]))
                    item.id = path[0].slice(0, -1) + "_" + crypto.randomUUID().replaceAll("-", "");
                  set2(path, [...v, item]);
                }
              },
              translate("Add item") + ": " + label
            )
          );
        } else if (s.type === "boolean")
          control = el(wp2.components.ToggleControl, {
            ...common,
            checked: v === true,
            onChange: (next) => set2(path, next)
          });
        else if (s.type === "number" || s.type === "integer")
          control = el(wp2.components.TextControl, {
            ...common,
            type: "text",
            inputMode: "decimal",
            value: String(v),
            onChange: (text3) => {
              const valid = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text3) && Number.isFinite(Number(text3));
              set2(path, valid ? Number(text3) : text3);
            }
          });
        else
          control = el(wp2.components.TextareaControl, {
            ...common,
            rows: 2,
            value: typeof v === "string" ? v : JSON.stringify(v),
            onChange: (text3) => set2(path, text3)
          });
        return required || !path.length ? control : el(
          "div",
          { key: keyOf(path) },
          control,
          el(
            wp2.components.Button,
            { variant: "tertiary", onClick: () => set2(path, void 0, true) },
            translate("Remove field") + ": " + label
          )
        );
      };
      const draft = drafts.get(clientId);
      const notice = error3 || (draft ? draft.baseline !== original || draft.identity && draft.identity !== identity ? translate(
        "Applied configuration changed. The current candidate is preserved and unapplied. Saving is paused."
      ) : draft.localDraft != null ? translate(
        "Local author edits are unapplied and not saved. Prepare or discard them to continue."
      ) : translate(
        "Parameters are unapplied; article saving is paused. Apply or discard them to continue."
      ) : "");
      return el(
        "div",
        { className: "mbb-parameter-editor", ref: editorRoot },
        form || authorSupported && author?.Editor ? el(
          "div",
          { className: "mbb-parameter-modes" },
          authorSupported && author?.Editor ? el(
            wp2.components.Button,
            {
              variant: mode === "author" ? "primary" : "secondary",
              "aria-pressed": mode === "author",
              onClick: () => chooseMode("author")
            },
            translate("Visual editor")
          ) : null,
          form ? el(
            wp2.components.Button,
            {
              variant: mode === "form" ? "primary" : "secondary",
              "aria-pressed": mode === "form",
              onClick: () => chooseMode("form")
            },
            translate("Parameter form")
          ) : null,
          el(
            wp2.components.Button,
            {
              variant: mode === "json" ? "primary" : "secondary",
              "aria-pressed": mode === "json",
              onClick: () => chooseMode("json")
            },
            translate("Advanced JSON")
          )
        ) : null,
        el(
          "details",
          { className: "mbb-parameter-technical" },
          el("summary", {}, translate("Component details")),
          el("p", {}, component + "@" + candidateVersion),
          el("pre", {}, JSON.stringify(candidate, null, 2))
        ),
        authorSupported && author?.Editor && mode === "author" ? el(author.Editor, {
          wp: wp2,
          session,
          generation,
          baseline: JSON.stringify([identity, original, openingScope]),
          localDraft: clone2(localDraft),
          onLocalDraftChange: updateLocalDraft,
          ...author.apiVersion === 2 ? {
            activity: clone2(candidateActivity ?? null),
            parts: clone2(parts),
            onActivityChange(next) {
              assertAuthorCurrent();
              authorLife.current.generation++;
              setCandidateActivity(clone2(next));
              const prior = drafts.get(clientId);
              drafts.set(clientId, {
                raw,
                activity: clone2(next),
                componentVersion: candidateVersion,
                error: "",
                baseline: prior?.baseline ?? original,
                identity: prior?.identity ?? identity,
                ...prior?.localDraft != null ? { localDraft: prior.localDraft } : {}
              });
              syncDraftLock();
            }
          } : {},
          value: clone2(candidate),
          onChange: (next, options = {}) => {
            assertAuthorCurrent();
            try {
              if (!object3(options) || Object.keys(options).some((k) => k !== "consumeLocalDraft") || own(options, "consumeLocalDraft") && typeof options.consumeLocalDraft !== "boolean")
                throw Error(translate("Invalid local author draft"));
              componentParams(next, (code2, message) => {
                throw Error(message);
              });
              if (options.consumeLocalDraft === true) {
                const current = find2(component, candidateVersion);
                if (!current)
                  throw Error(
                    translate(
                      "The upgrade target is no longer registered. Discard the candidate or restore the extension."
                    )
                  );
                const issues = validateParameterSchema(next, current.schema);
                if (issues.length)
                  throw Error(parameterLabel(issues[0].path) + ": " + translate(issues[0].message));
                if (author.apiVersion === 2) author.validate(next, candidateActivity);
              }
              change(
                JSON.stringify(next, null, 2),
                candidateVersion,
                options.consumeLocalDraft === true
              );
              return true;
            } catch (e) {
              setError(translateError(e));
              return false;
            }
          }
        }) : form && mode === "form" ? el(
          "div",
          { className: "mbb-parameter-form" },
          render(schema, candidate, [], true, provider?.defaults)
        ) : el(
          "div",
          relationV3 ? { "data-mbb-parameter-json": "" } : {},
          el(wp2.components.TextareaControl, {
            ...relationV3 ? {
              "aria-invalid": fieldIssue?.target === "json" ? "true" : void 0,
              "aria-describedby": fieldIssue?.target === "json" ? jsonErrorId : void 0
            } : {},
            label: translate("Parameter JSON (data only)"),
            value: raw,
            onChange: change,
            help: form ? void 0 : translate(
              "These parameters use the JSON editor. All fields are preserved; the server verifies them when saving."
            )
          }),
          relationV3 && fieldIssue?.target === "json" ? el("p", { id: jsonErrorId, role: "alert" }, fieldIssue.message) : null
        ),
        component === "navigation-map" && candidateVersion === "0.2.0" && relationV3Upgrade?.schema ? el(
          wp2.components.Button,
          {
            variant: "secondary",
            onClick: () => {
              const next = {
                ...clone2(candidate),
                format: "relation-map/v3",
                display: { mobileStart: { kind: "auto", id: "" } }
              };
              change(JSON.stringify(next, null, 2), "0.3.0");
              setMode("form");
            }
          },
          translate("Prepare relationship layout upgrade")
        ) : null,
        component === "navigation-map" && candidateVersion === "0.1.0" && relationUpgrade?.schema ? el(
          wp2.components.Button,
          {
            variant: "secondary",
            onClick: () => {
              const next = clone2(candidate);
              next.format = "relation-map/v2";
              next.nodes = next.nodes.map(({ url, ...node }) => ({
                ...node,
                target: { kind: "document", namespace: "", document: "" }
              }));
              next.edges = next.edges.map((edge) => ({
                ...edge,
                id: "edge_" + crypto.randomUUID().replaceAll("-", "")
              }));
              change(JSON.stringify(next, null, 2), "0.2.0");
              setMode("form");
            }
          },
          translate("Prepare controlled document links upgrade")
        ) : null,
        upgrade ? el(
          wp2.components.Button,
          {
            variant: "secondary",
            onClick: () => {
              try {
                const next = author.upgrade.migrate(clone2(candidate));
                componentParams(next, (code2, message) => {
                  throw Error(message);
                });
                const issues = validateParameterSchema(next, upgrade.schema);
                if (issues.length) throw Error(translate(issues[0].message));
                change(JSON.stringify(next, null, 2), upgrade.version);
                setMode("author");
              } catch (e) {
                setError(translateError(e));
              }
            }
          },
          translate("Upgrade diagram to use the visual editor")
        ) : null,
        candidateVersion !== componentVersion ? el(
          "p",
          { role: "status" },
          translate("Unapplied component version change:") + " " + componentVersion + " \u2192 " + candidateVersion
        ) : null,
        (notice || parseError) && !(relationV3 && fieldIssue) ? el("p", { role: error3 ? "alert" : "status" }, notice || parseError) : null,
        el(wp2.components.Button, { variant: "primary", onClick: commit }, translate("Apply parameters")),
        el(
          wp2.components.Button,
          {
            variant: "tertiary",
            onClick: () => {
              drafts.delete(clientId);
              authorLife.current.generation++;
              refreshLocalDraft((n) => n + 1);
              setCandidateVersion(componentVersion);
              setFieldIssue(null);
              setRemovalIssue(null);
              authorSession.current = {};
              if (currentIssues(original, find2(component, componentVersion)?.schema).length)
                drafts.set(clientId, { raw: original, baseline: original, identity });
              syncDraftLock();
              setRaw(original);
              setCandidateActivity(activity);
              setError("");
            }
          },
          translate("Discard parameter input")
        )
      );
    };
  }

  // src/code-runner-static.js
  function codeRunnerModel(value, version2 = "0.1.0") {
    try {
      componentParams(value, () => {
        throw Error("invalid");
      });
      const keys2 = ["version", "language", "title", "sourceChunks", "stdinChunks"];
      const size = (s) => new TextEncoder().encode(s).length;
      if (Object.keys(value).length !== keys2.length || Object.keys(value).some((k) => !keys2.includes(k)) || !["0.1.0", "0.2.0"].includes(version2) || value.version !== (version2 === "0.2.0" ? 2 : 1) || !(version2 === "0.2.0" ? ["javascript", "python", "cpp"] : ["python", "cpp"]).includes(
        value.language
      ) || typeof value.title !== "string" || size(value.title) < 1 || size(value.title) > 160 || /[\x00-\x1f\x7f]/.test(value.title))
        return null;
      for (const [field, max] of [
        ["sourceChunks", 8],
        ["stdinChunks", 4]
      ]) {
        const a = value[field];
        if (!Array.isArray(a) || a.length < 1 || a.length > max || a.some(
          (s) => typeof s !== "string" || size(s) > 1024 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s)
        ))
          return null;
      }
      return value;
    } catch {
      return null;
    }
  }
  function codeRunnerStaticElement(el, params, version2 = "0.1.0") {
    const p = codeRunnerModel(params, version2);
    if (!p)
      return el(
        "p",
        {},
        translate(
          "The code example parameters are invalid. Preserve the original content and check the source and input."
        )
      );
    return el(
      "section",
      { className: "mbb-code-runner-static" },
      el("h3", {}, p.title),
      el(
        "p",
        {},
        { javascript: "JavaScript", python: "Python", cpp: "C++20" }[p.language] + " \xB7 " + translate(
          p.language === "javascript" ? "Synchronous JavaScript. The input variable contains the standard input text. The editor preview does not execute programs." : "One source file and the standard library. The editor preview does not execute programs."
        )
      ),
      el("pre", {}, el("code", {}, p.sourceChunks.join(""))),
      el("p", {}, translate("Standard input")),
      el("pre", {}, p.stdinChunks.join(""))
    );
  }

  // src/code-tabs.js
  var languageLabel = (language) => ({
    __proto__: null,
    javascript: "JavaScript",
    js: "JavaScript",
    typescript: "TypeScript",
    ts: "TypeScript",
    python: "Python",
    py: "Python",
    cpp: "C++",
    c: "C",
    csharp: "C#",
    cs: "C#",
    java: "Java",
    ruby: "Ruby",
    rb: "Ruby",
    rust: "Rust",
    go: "Go",
    php: "PHP",
    swift: "Swift",
    kotlin: "Kotlin",
    sql: "SQL",
    html: "HTML",
    css: "CSS",
    json: "JSON",
    bash: "Bash",
    shell: "Shell",
    text: "Text",
    plaintext: "Text"
  })[language.toLowerCase()] || language || translate("Code");
  var displayLabel = (tab) => tab.title || tab.language || translate("Code");
  var tabsLabel = (tab) => tab.title || tab.language || "\u4EE3\u7801";
  function codeTabLines(tab, source, fail2) {
    const count = source ? null : Math.max(
      1,
      tab.code.replace(/\r\n|\r/g, "\n").replace(/\n$/, "").split("\n").length
    );
    if (!Number.isInteger(tab.startLine) || tab.startLine < 1 || tab.startLine > 999999 || count !== null && tab.startLine + count - 1 > 999999)
      fail2("CODE_TABS_LINES", "Code line numbers must remain between 1 and 999999");
    if (typeof tab.highlights !== "string" || tab.highlights.length > 512 || !/^(?:[1-9]\d{0,5}(?:-[1-9]\d{0,5})?(?:,[1-9]\d{0,5}(?:-[1-9]\d{0,5})?)*)?$/.test(
      tab.highlights
    ))
      fail2("CODE_TABS_LINES", "Highlights require comma-separated lines or closed ranges");
    const ranges = tab.highlights ? tab.highlights.split(",").map((x) => x.split("-").map(Number)) : [];
    if (ranges.length > 32) fail2("CODE_TABS_LINES", "At most 32 highlighted ranges are allowed");
    let previous = 0;
    for (const [start, end = start] of ranges) {
      if (start < tab.startLine || end < start || start <= previous || count !== null && end >= tab.startLine + count)
        fail2("CODE_TABS_LINES", "Highlighted ranges must be ordered, disjoint and within the code");
      previous = end;
    }
    return ranges;
  }
  function codeTabsAttributes(attrs2, source, fail2) {
    const keys2 = [
      ...source ? ["id", "title", "terminalNewline"] : ["id", "title", "language", "code"],
      ...attrs2.version === 2 ? ["startLine", "highlights"] : []
    ];
    if (!Array.isArray(attrs2.tabs) || attrs2.tabs.length < 1 || attrs2.tabs.length > 8)
      fail2("CODE_TABS_STRUCTURE", "A code group requires 1\u20138 versions");
    const ids = /* @__PURE__ */ new Set();
    let bytes4 = 0;
    const tabs = attrs2.tabs.map((tab) => {
      if (!tab || Array.isArray(tab) || typeof tab !== "object" || Object.keys(tab).length !== keys2.length || Object.keys(tab).some((key) => !keys2.includes(key)))
        fail2("CODE_TABS_ATTRIBUTES", "Code version attributes are incomplete or unknown");
      if (typeof tab.id !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(tab.id) || ids.has(tab.id))
        fail2("TEACHING_ID", "Code version IDs are invalid or duplicated");
      ids.add(tab.id);
      if (typeof tab.title !== "string" || [...tab.title].length > 200 || /[\r\n\0\uD800-\uDFFF]/u.test(tab.title))
        fail2(
          "TEACHING_TITLE",
          "A code version title must be empty or single-line text of at most 200 characters"
        );
      if (source) {
        if (typeof tab.terminalNewline !== "boolean")
          fail2("CODE_TABS_ATTRIBUTES", "The terminal newline marker must be boolean");
      } else {
        if (typeof tab.language !== "string" || !/^[A-Za-z0-9_+-]{0,64}$/.test(tab.language))
          fail2("CODE_INFO", "The code language must be a safe ASCII token of at most 64 characters");
        if (typeof tab.code !== "string" || /[\0\uD800-\uDFFF]/u.test(tab.code))
          fail2("CODE_TABS_CODE", "Code must be valid Unicode without NUL");
        const size = new TextEncoder().encode(tab.code).length;
        bytes4 += size;
        if (size > 65536 || bytes4 > 131072)
          fail2("CODE_TABS_LIMIT", "Each version is limited to 64 KiB and the group to 128 KiB");
      }
      if (attrs2.version === 2) codeTabLines(tab, source, fail2);
      return Object.fromEntries(keys2.map((key) => [key, tab[key]]));
    });
    if (!ids.has(attrs2.defaultTab))
      fail2("CODE_TABS_DEFAULT", "The default version must reference an ID in the group");
    return tabs;
  }
  function codeTabsMarkdown(a) {
    const tabs = a.tabs.map(({ id: id2, title, code: code2, startLine, highlights }) => ({
      id: id2,
      title,
      terminalNewline: code2.endsWith("\n"),
      ...a.version === 2 ? { startLine, highlights } : {}
    }));
    const codes = a.tabs.map((tab) => {
      const runs = tab.code.match(/`+/g) || [];
      const fence3 = "`".repeat(runs.reduce((n, s) => Math.max(n, s.length + 1), 3));
      return fence3 + tab.language + "\n" + tab.code + (tab.code.endsWith("\n") ? "" : "\n") + fence3;
    }).join("\n\n");
    return ":::mbb:v" + a.version + " code-tabs " + JSON.stringify({ id: a.id, defaultTab: a.defaultTab, tabs }) + "\n\n" + codes + "\n\n:::mbb:end";
  }
  function codeTabsSave(a, el) {
    return el(
      "div",
      wp.blockEditor.useBlockProps.save({ id: a.id }),
      ...(a.tabs || []).map(
        (tab) => el(
          "div",
          { id: tab.id, key: tab.id, className: "mbb-code-tab" },
          el("p", { "data-mbb-generated": "", className: "mbb-code-tab-title" }, tabsLabel(tab)),
          ...a.version === 2 ? [
            el(
              "p",
              { "data-mbb-generated": "", className: "mbb-code-line-summary" },
              "Starting line: " + tab.startLine + (tab.highlights ? "; highlights: " + tab.highlights : "")
            )
          ] : [],
          el(
            "pre",
            {},
            el("code", tab.language ? { className: "language-" + tab.language } : {}, tab.code)
          )
        )
      )
    );
  }
  function registerCodeTabs() {
    const el = wp.element.createElement;
    let serial = 0;
    const selections = /* @__PURE__ */ new Map();
    const freshId = () => "mbb-" + Date.now().toString(36) + "-" + (++serial).toString(36) + "-" + Math.random().toString(36).slice(2, 12);
    const freshTab = () => ({ id: freshId(), title: "", language: "", code: "" });
    wp.blocks.registerBlockType("mbb/code-tabs", {
      apiVersion: 3,
      title: translate("Multilingual code tabs"),
      category: "text",
      attributes: {
        id: { type: "string" },
        defaultTab: { type: "string" },
        tabs: { type: "array" },
        version: { type: "number" }
      },
      supports: { html: false, customClassName: false, anchor: false },
      edit: ({ attributes: a, setAttributes, clientId }) => {
        const actions = wp.data.useDispatch("core/block-editor");
        const store = wp.data.useSelect((select2) => select2("core/block-editor"), []);
        const [selected, setSelected] = wp.element.useState(
          selections.get(clientId) ?? Math.max(
            0,
            (a.tabs || []).findIndex((t) => t.id === a.defaultTab)
          )
        );
        const select = (index2) => {
          selections.set(clientId, index2);
          if (selections.size > 2e3) selections.delete(selections.keys().next().value);
          setSelected(index2);
        };
        wp.element.useEffect(() => {
          if (a.version === void 0) {
            const tab2 = freshTab();
            setAttributes({ version: 1, id: freshId(), defaultTab: tab2.id, tabs: [tab2] });
            select(0);
          }
        }, []);
        const tabs = a.tabs || [], index = Math.max(0, Math.min(selected, tabs.length - 1)), tab = tabs[index];
        const update = (changes) => setAttributes({
          tabs: tabs.map((t, i) => i === index ? { ...t, ...changes } : t),
          ..."id" in changes && a.defaultTab === tab.id ? { defaultTab: changes.id } : {}
        });
        const updateLines = (changes) => setAttributes({
          version: 2,
          tabs: tabs.map((t, i) => ({
            startLine: 1,
            highlights: "",
            ...t,
            ...i === index ? changes : {}
          }))
        });
        const action = (label, onClick, disabled = false) => el(wp.components.Button, { variant: "secondary", onClick, disabled }, label);
        const move = (delta) => {
          const reordered = [...tabs];
          [reordered[index], reordered[index + delta]] = [reordered[index + delta], reordered[index]];
          setAttributes({ tabs: reordered });
          select(index + delta);
        };
        const field = (label, key) => el(wp.components.TextControl, {
          label,
          value: tab?.[key] || "",
          onChange: (value) => {
            update({ [key]: value });
          }
        });
        return el(
          "div",
          wp.blockEditor.useBlockProps({ className: "mbb-code-tabs-editor mbb-teaching-editor" }),
          el(
            wp.blockEditor.InspectorControls,
            {},
            el(
              wp.components.PanelBody,
              { title: translate("Code group settings"), initialOpen: true },
              el(wp.components.TextControl, {
                label: translate("Stable code group ID"),
                value: a.id || "",
                onChange: (id2) => setAttributes({ id: id2 })
              }),
              tab ? el(
                "div",
                {},
                field(translate("Stable version ID"), "id"),
                field(translate("Version title (optional)"), "title"),
                field(translate("Version language"), "language"),
                el(wp.components.TextControl, {
                  label: translate("Starting line number"),
                  type: "number",
                  min: 1,
                  max: 999999,
                  value: tab.startLine ?? 1,
                  onChange: (value) => updateLines({ startLine: Number(value) })
                }),
                el(wp.components.TextControl, {
                  label: translate("Highlighted lines or ranges"),
                  help: translate("Use displayed line numbers, for example 12,15-18."),
                  value: tab.highlights ?? "",
                  onChange: (value) => updateLines({ highlights: value })
                })
              ) : null,
              el(wp.components.SelectControl, {
                label: translate("Default code version"),
                value: a.defaultTab || "",
                options: tabs.map((t) => ({ value: t.id, label: displayLabel(t) })),
                onChange: (defaultTab) => setAttributes({ defaultTab })
              })
            )
          ),
          el(
            "div",
            { role: "tablist", "aria-label": translate("Code versions") },
            ...tabs.map(
              (t, i) => el(
                "button",
                {
                  key: i,
                  id: "mbb-editor-tab-" + clientId + "-" + i,
                  type: "button",
                  role: "tab",
                  "aria-controls": "mbb-editor-code-" + clientId,
                  "aria-selected": index === i,
                  tabIndex: index === i ? 0 : -1,
                  onClick: () => select(i),
                  onKeyDown: (event) => {
                    let next = index;
                    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
                    else if (event.key === "ArrowLeft")
                      next = (index + tabs.length - 1) % tabs.length;
                    else if (event.key === "Home") next = 0;
                    else if (event.key === "End") next = tabs.length - 1;
                    else return;
                    event.preventDefault();
                    select(next);
                    event.currentTarget.parentElement.children[next].focus();
                  }
                },
                languageLabel(t.language || "")
              )
            )
          ),
          tab ? el(
            "div",
            {
              id: "mbb-editor-code-" + clientId,
              role: "tabpanel",
              "aria-labelledby": "mbb-editor-tab-" + clientId + "-" + index
            },
            el(wp.components.TextareaControl, {
              label: translate("Original code for the current version"),
              value: tab.code,
              help: /\r/.test(tab.code) ? translate(
                "The original code contains CR/CRLF and may display as LF here. Switching and reopening preserve original bytes; actual input uses the browser textarea's newlines."
              ) : translate(
                "All whitespace is preserved. Empty code and code without a trailing newline are allowed."
              ),
              onChange: (code2) => update({ code: code2 })
            })
          ) : null,
          el(
            "p",
            {},
            format(
              translate("%1$s / 8 versions; %2$s / 131072 bytes"),
              tabs.length,
              tabs.reduce((n, t) => n + new TextEncoder().encode(t.code).length, 0)
            )
          ),
          action(
            translate("Add code version"),
            () => {
              const t = freshTab();
              setAttributes({
                tabs: [...tabs, a.version === 2 ? { ...t, startLine: 1, highlights: "" } : t]
              });
              select(tabs.length);
            },
            tabs.length >= 8
          ),
          action(
            translate("Delete current version"),
            () => {
              const remaining = tabs.filter((_, i) => i !== index);
              setAttributes({ tabs: remaining });
              select(Math.min(index, remaining.length - 1));
            },
            tabs.length <= 1 || a.defaultTab === tab?.id
          ),
          a.defaultTab === tab?.id && tabs.length > 1 ? el(
            "p",
            {},
            translate(
              "Choose a different default version explicitly before deleting the default version."
            )
          ) : null,
          tabs.length === 1 ? action(translate("Delete entire code group"), () => actions.removeBlock(clientId)) : null,
          action(translate("Move current version up"), () => move(-1), index === 0),
          action(translate("Move current version down"), () => move(1), index === tabs.length - 1),
          action(
            translate("Set current version as default"),
            () => setAttributes({ defaultTab: tab.id }),
            !tab || a.defaultTab === tab.id
          ),
          action(translate("Duplicate code group"), () => {
            const copies = tabs.map((t) => ({ ...t, id: freshId() }));
            const block2 = wp.blocks.createBlock("mbb/code-tabs", {
              version: a.version,
              id: freshId(),
              defaultTab: copies[tabs.findIndex((t) => t.id === a.defaultTab)].id,
              tabs: copies
            });
            actions.insertBlocks(
              block2,
              store.getBlockIndex(clientId) + 1,
              store.getBlockRootClientId(clientId)
            );
          })
        );
      },
      save: ({ attributes }) => codeTabsSave(attributes, el)
    });
  }

  // src/teaching.js
  var teachingSchemas = {
    identity: { namespace: "string", document: "string" },
    image: {},
    gallery: {},
    ...technicalSchemas,
    "native-code": {},
    preformatted: {},
    group: {},
    columns: {},
    column: {},
    details: { summary: "string", showContent: "boolean" },
    buttons: {},
    button: { url: "string" },
    adapter: { name: "string", version: "string", attrs: "object" },
    "code-tabs": { id: "string", defaultTab: "string", tabs: "object" },
    component: { id: "string", component: "string", componentVersion: "string", params: "object" },
    collapse: { id: "string", title: "string", open: "boolean" },
    steps: {
      id: "string",
      title: "string",
      mode: "string",
      previous: "boolean",
      next: "boolean",
      full: "boolean"
    },
    step: { id: "string", title: "string" },
    "code-compare": {
      id: "string",
      leftTitle: "string",
      rightTitle: "string",
      leftHighlights: "string",
      rightHighlights: "string"
    }
  };
  var sourceFields = {
    codeLeft: "string",
    languageLeft: "string",
    codeRight: "string",
    languageRight: "string"
  };
  var teachingKind = (name) => nativeAdapterKind(name) || (staticAdapterKind(name) ? "adapter" : null) || (name?.startsWith("mbb/") && Object.hasOwn(teachingSchemas, name.slice(4)) ? name.slice(4) : null);
  function teachingAttributes(kind, attrs2, fail2, source = false, blockName = null, sourceVersion = 1) {
    if (mediaKinds.has(kind)) return mediaAttributes(kind, attrs2, fail2, source);
    if (nativeAdapterKinds.has(kind)) return nativeAttributes(kind, attrs2, fail2, source);
    if (kind === "adapter") {
      if (source) {
        const a = adapterSourceAttributes(attrs2, fail2);
        return {
          name: a.descriptor.name,
          version: a.descriptor.version,
          attrs: Object.fromEntries(
            Object.keys(a.descriptor.attributes).map((key) => [key, a.attributes[key]])
          )
        };
      }
      const d = staticAdapterKind(blockName);
      if (!d) fail2("ADAPTER_VERSION", "The static adapter is missing or incompatible");
      return staticAdapterAttributes(d, attrs2, fail2);
    }
    const schema = {
      ...teachingSchemas[kind],
      ...kind === "component" && (attrs2?.version === 2 || source && Object.hasOwn(attrs2 || {}, "activity")) ? { activity: "object" } : {},
      ...kind === "bibliography" && (attrs2?.version === 2 || source && Object.hasOwn(attrs2 || {}, "style")) ? { style: "string", ...Object.hasOwn(attrs2 || {}, "origins") ? { origins: "object" } : {} } : {},
      ...!source ? { version: "number" } : {},
      ...kind === "code-compare" && !source ? sourceFields : {}
    };
    if (!attrs2 || Array.isArray(attrs2) || typeof attrs2 !== "object" || Object.keys(attrs2).length !== Object.keys(schema).length || Object.keys(attrs2).some((k) => !Object.hasOwn(schema, k) || typeof attrs2[k] !== schema[k]))
      fail2(
        "TEACHING_ATTRIBUTES",
        "Teaching container attributes are incomplete, unknown, or have invalid types"
      );
    if (!source && attrs2.version !== 1 && !(["bibliography", "component", "code-tabs"].includes(kind) && attrs2.version === 2))
      fail2("TEACHING_VERSION", "The teaching block version must be 1");
    if (Object.values(attrs2).some((v) => typeof v === "string" && /[\uD800-\uDFFF]/u.test(v)))
      fail2("TEACHING_ATTRIBUTES", "Teaching attributes must be valid Unicode");
    const out = Object.fromEntries(Object.keys(schema).map((key) => [key, attrs2[key]]));
    if (kind === "identity") {
      if (!/^S_[a-f0-9]{32}$/.test(out.namespace) || !/^D_[a-f0-9]{32}$/.test(out.document))
        fail2(
          "DOCUMENT_IDENTITY",
          "A logical identity requires a closed namespace and document tuple"
        );
      return out;
    }
    if (technicalKind("mbb/" + kind)) technicalAttributes(kind, out, fail2);
    if (kind === "code-tabs")
      out.tabs = codeTabsAttributes(source ? { ...out, version: sourceVersion } : out, source, fail2);
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(out.id))
      fail2(
        "TEACHING_ID",
        "A teaching ID must begin with a letter and contain 1\u201364 ASCII letters, digits, underscores, or hyphens"
      );
    for (const key of ["title", "leftTitle", "rightTitle"])
      if (key in out && (!out[key].replace(
        /[ \t\r\n\f\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/gu,
        ""
      ) || [...out[key]].length > 200 || /[\r\n\x00]/.test(out[key])))
        fail2("TEACHING_TITLE", "A teaching title must be single-line plain text of 1\u2013200 characters");
    if (kind === "component") {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(out.component) || !/^\d+\.\d+\.\d+$/.test(out.componentVersion))
        fail2("COMPONENT_VERSION", "Invalid component name or version");
      componentParams(out.params, fail2);
      if (Object.hasOwn(out, "activity")) activityRelations(out.activity, fail2);
    }
    if (kind === "steps" && (!["full", "staged"].includes(out.mode) || out.full !== true))
      fail2("TEACHING_MODE", "Stage mode must be full/staged and the full-text entry must be enabled");
    if (kind === "code-compare") {
      for (const key of ["leftHighlights", "rightHighlights"])
        if (!/^(?:[1-9]\d*(?:,[1-9]\d*)*)?$/.test(out[key]) || new Set(out[key].split(",")).size !== out[key].split(",").length)
          fail2(
            "TEACHING_LINES",
            "Highlighted lines must be unique positive integers separated by commas"
          );
      if (!source) {
        for (const side of ["Left", "Right"])
          if (!/^[\w+-]*$/.test(out["language" + side]) || !out["code" + side].endsWith("\n"))
            fail2("TEACHING_CODE", "The code language is invalid or the trailing newline is missing");
      }
    }
    return out;
  }
  function teachingJSON(raw, fail2) {
    const tokens = raw.match(/"(?:\\.|[^"\\])*"|[^\s]/g) || [];
    const stack = [];
    for (let i = 0; i < tokens.length; i++) {
      const token3 = tokens[i];
      if (token3 === "{") stack.push(/* @__PURE__ */ new Set());
      else if (token3 === "[") stack.push(null);
      else if (token3 === "}" || token3 === "]") stack.pop();
      else if (token3.startsWith('"') && tokens[i + 1] === ":" && stack.at(-1)) {
        let key;
        try {
          key = JSON.parse(token3);
        } catch {
          fail2("TEACHING_ATTRIBUTES", "Invalid JSON property");
        }
        if (stack.at(-1).has(key)) fail2("TEACHING_ATTRIBUTES", "Duplicate teaching JSON property");
        stack.at(-1).add(key);
      }
    }
    try {
      return JSON.parse(raw);
    } catch {
      fail2("TEACHING_ATTRIBUTES", "Teaching attributes must be a valid JSON object");
    }
  }
  function validateTeachingSerialized(serialized, fail2) {
    for (const m of serialized.matchAll(
      /<!-- wp:mbb\/(collapse|steps|step|code-compare|component|code-tabs|object|statement|bibliography)(?: (\{[\s\S]*?\}))? -->/g
    ))
      teachingAttributes(m[1], teachingJSON(m[2] || "{}", fail2), fail2);
  }
  function teachingSource(source, fail2, ignored = /* @__PURE__ */ new Set(), nonce, fences = []) {
    const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || [];
    if (lines.at(-1) === "") lines.pop();
    const text3 = (i) => lines[i]?.replace(/[\r\n]+$/, "");
    const marker = (data) => "<!--mbb-teaching " + nonce + ":" + [...new TextEncoder().encode(JSON.stringify(data))].map((b) => b.toString(16).padStart(2, "0")).join("") + "-->";
    const replacements = /* @__PURE__ */ new Map();
    const offsets = [];
    let cursor = 0;
    for (const line of lines) {
      offsets.push(cursor);
      cursor += line.length;
    }
    const inlineLiterals = [];
    for (const token3 of fences) {
      if (token3.type !== "inline" || !token3.map || !token3.children?.some((t) => t.type === "code_inline"))
        continue;
      const begin = offsets[token3.map[0]], raw = source.slice(begin, offsets[token3.map[1]] ?? source.length), runs = [...raw.matchAll(/`+/g)];
      for (let i = 0; i < runs.length; i++) {
        let slashes = 0;
        for (let p = runs[i].index - 1; p >= 0 && raw[p] === "\\"; p--) slashes++;
        if (slashes % 2) continue;
        let end = -1;
        for (let j = i + 1; j < runs.length; j++)
          if (runs[j][0].length === runs[i][0].length) {
            end = j;
            break;
          }
        if (end < 0) continue;
        inlineLiterals.push([begin + runs[i].index, begin + runs[end].index + runs[end][0].length]);
        i = end;
      }
    }
    const protectedHTML = [];
    let consumed = 0;
    const closes = { pre: [], code: [] };
    for (const close of source.matchAll(/<\/(pre|code)>/gi))
      closes[close[1].toLowerCase()].push([close.index, close.index + close[0].length]);
    for (const m of source.matchAll(/<(pre|code)\b[^>]*>/gi)) {
      if (m.index < consumed) continue;
      let lo = 0, hi = offsets.length;
      while (lo < hi) {
        const mid = lo + hi >>> 1;
        if (offsets[mid] <= m.index) lo = mid + 1;
        else hi = mid;
      }
      if (ignored.has(lo - 1) || text3(lo - 1)?.startsWith(":::mbb:") || inlineLiterals.some(([a, b]) => m.index >= a && m.index < b))
        continue;
      const after = m.index + m[0].length, ends = closes[m[1].toLowerCase()];
      let left = 0, right = ends.length;
      while (left < right) {
        const mid = left + right >>> 1;
        if (ends[mid][0] < after) left = mid + 1;
        else right = mid;
      }
      if (!ends[left]) continue;
      consumed = ends[left][1];
      protectedHTML.push([m.index, consumed]);
    }
    const ranges = new Map(
      fences.filter((t) => t.type === "fence" && t.map).map((t) => [t.map[0], t.map[1]])
    );
    for (let i = 0; i < lines.length; i++) {
      if (ignored.has(i) || protectedHTML.some(([a2, b]) => offsets[i] >= a2 && offsets[i] < b))
        continue;
      const match2 = /^:::mbb:v([12]) code-tabs (\{[^\r\n]*\})$/.exec(text3(i));
      if (!match2) continue;
      const a = teachingAttributes(
        "code-tabs",
        teachingJSON(match2[2], fail2),
        fail2,
        true,
        null,
        Number(match2[1])
      );
      let next = i + 1;
      for (const tab of a.tabs) {
        while (next < lines.length && /^[ \t]*$/.test(text3(next))) next++;
        const end = ranges.get(next), open = /^(`{3,}|~{3,})[ \t]*([A-Za-z0-9_+-]{0,64})[ \t]*$/.exec(text3(next));
        if (!end || !open || !new RegExp("^" + open[1][0] + "{" + open[1].length + ",}[ \\t]*$").test(text3(end - 1)))
          fail2(
            "CODE_TABS_STRUCTURE",
            "Each code version requires a complete corresponding fence without container prefixes"
          );
        let code2 = lines.slice(next + 1, end - 1).join("");
        if (tab.terminalNewline) {
          if (!code2.endsWith("\n"))
            fail2("CODE_TABS_CODE", "The terminal newline marker does not match the code");
        } else {
          if (code2 && !code2.endsWith("\n"))
            fail2("CODE_TABS_CODE", "Code requires an explicit structural LF separator");
          if (code2) code2 = code2.slice(0, -1);
        }
        replacements.set(next, marker({ rawCode: { code: code2, language: open[2] } }));
        for (let line = next + 1; line < end; line++) replacements.set(line, "");
        next = end;
      }
      while (next < lines.length && /^[ \t]*$/.test(text3(next))) next++;
      if (text3(next) !== ":::mbb:end")
        fail2(
          "CODE_TABS_STRUCTURE",
          "A code group may contain only the corresponding number of fences"
        );
    }
    for (let i = 0; i < lines.length; i++) {
      if (ignored.has(i) || protectedHTML.some(([a, b]) => offsets[i] >= a && offsets[i] < b) || !/^:::mbb:v1 button /.test(text3(i)))
        continue;
      let begin = i + 1;
      while (/^[ \t]*$/.test(text3(begin) || "") && begin < lines.length) begin++;
      if (!text3(begin)?.startsWith("<p>")) continue;
      let end = begin;
      while (end < lines.length && !text3(end)?.endsWith("</p>")) end++;
      if (end === lines.length) fail2("ADAPTER_STRUCTURE", "The button text paragraph is unclosed");
      const html = lines.slice(begin, end + 1).join("").replace(/[\r\n]+$/, "");
      replacements.set(begin, marker({ rawButton: buttonParagraph(html, fail2) }));
      for (let n = begin + 1; n <= end; n++) replacements.set(n, "");
    }
    let offset = 0;
    let definitionBeforeBibliography = false;
    return source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g).map((raw, index) => {
      const line = raw.replace(/[\r\n]+$/, "");
      const start = offset;
      offset += raw.length;
      if (replacements.has(index)) return replacements.get(index);
      if (ignored.has(index) || protectedHTML.some(([a, b]) => start >= a && start < b))
        return line;
      if (/^ {0,3}<!--mbb-teaching/.test(line))
        fail2("TEACHING_SYNTAX", "Reserved internal teaching markers cannot be Markdown input");
      if (/^ {0,3}\[\^[^\]\r\n]+\]:[ \t]*:::mbb:v1 (?:object|statement) \{/.test(line))
        fail2(
          "TECHNICAL_STRUCTURE",
          "Technical objects and statements must not be inside footnotes"
        );
      if (/^ {0,3}\[\^[^\]\r\n]+\]:/.test(line)) definitionBeforeBibliography = true;
      if (definitionBeforeBibliography && /^:::mbb:v[12] bibliography /.test(line))
        fail2("TECHNICAL_STRUCTURE", "The bibliography must precede footnote definitions");
      if (!line.startsWith(":::mbb:")) return line;
      let data;
      if (line === ":::mbb:end") data = { end: true };
      else {
        const match2 = /^:::mbb:v([12]) (identity|collapse|steps|step|code-compare|component|code-tabs|native-code|preformatted|group|columns|column|details|buttons|button|adapter|object|statement|bibliography|image|gallery) (\{[^\r\n]*\})$/.exec(
          line
        );
        if (!match2)
          fail2(
            "TEACHING_SYNTAX",
            "Teaching containers require a complete :::mbb:v1 name and JSON attributes"
          );
        let attrs2;
        try {
          attrs2 = teachingJSON(match2[3], fail2);
        } catch {
          fail2("TEACHING_ATTRIBUTES", "Teaching attributes must be a valid JSON object");
        }
        if (match2[1] === "2" && !["bibliography", "component", "code-tabs"].includes(match2[2]))
          fail2("TEACHING_VERSION", "The teaching block version must be 1");
        if (match2[2] === "component" && match2[1] === "2" !== Object.hasOwn(attrs2, "activity"))
          fail2(
            "ACTIVITY_RELATION",
            "Activity relations require a closed map of unique local static targets"
          );
        if (match2[2] === "bibliography" && match2[1] === "2" !== Object.hasOwn(attrs2, "style"))
          fail2(
            "TEACHING_ATTRIBUTES",
            "Teaching container attributes are incomplete, unknown, or have invalid types"
          );
        data = {
          kind: match2[2],
          version: Number(match2[1]),
          attrs: teachingAttributes(match2[2], attrs2, fail2, true, null, Number(match2[1]))
        };
      }
      const hex = [...new TextEncoder().encode(JSON.stringify(data))].map((b) => b.toString(16).padStart(2, "0")).join("");
      return "<!--mbb-teaching " + nonce + ":" + hex + "-->";
    }).join("\n");
  }
  function teachingMarker(raw, nonce) {
    const m = /^<!--mbb-teaching ([0-9a-f]{32}):([0-9a-f]+)-->\s*$/.exec(raw);
    if (!m || m[1] !== nonce) return null;
    return JSON.parse(
      new TextDecoder().decode(Uint8Array.from(m[2].match(/../g), (v) => parseInt(v, 16)))
    );
  }
  function assembleTeaching(blocks, make2, fail2) {
    const root = [], stack = [{ children: root }];
    for (const b of blocks) {
      if (!b.teachingMarker) {
        stack.at(-1).children.push(b);
        continue;
      }
      const data = b.teachingMarker;
      if (Object.hasOwn(data, "rawButton")) {
        stack.at(-1).children.push(make2("core/paragraph", { content: buttonText(data.rawButton, fail2) }));
        continue;
      }
      if (data.rawCode) {
        stack.at(-1).children.push({ name: "mbb/code", attributes: data.rawCode, exactCode: true });
        continue;
      }
      if (!data.end) {
        if (stack.length >= 32)
          fail2("STRUCTURE_LIMIT", "Teaching container depth must not exceed 31 levels");
        stack.push({ ...data, children: [] });
        continue;
      }
      if (stack.length === 1)
        fail2("TEACHING_STRUCTURE", "The teaching closing marker has no corresponding opening marker");
      const item = stack.pop();
      if (mediaKinds.has(item.kind)) {
        stack.at(-1).children.push(assembleMedia(item, make2, fail2));
        continue;
      }
      if (nativeAdapterKinds.has(item.kind)) {
        let attrs2 = nativeBlockAttributes(item.kind, item.attrs, fail2);
        if (nativeTextKind(item.kind) && item.children.length)
          fail2("ADAPTER_STRUCTURE", "Native text leaves cannot contain body content");
        if (item.kind === "button") {
          if (item.children.length !== 1 || !["core/paragraph", "core/html"].includes(item.children[0].name) || item.children[0].innerBlocks?.length)
            fail2(
              "ADAPTER_STRUCTURE",
              "A link button must contain exactly one controlled text paragraph"
            );
          attrs2.text = item.children[0].name === "core/html" ? buttonParagraph(
            item.children[0].innerContent?.join("") ?? item.children[0].attributes.content ?? item.children[0].originalContent,
            fail2
          ) : buttonText(item.children[0].attributes.content, fail2);
          item.children = [];
        }
        stack.at(-1).children.push(make2(nativeAdapterName(item.kind), attrs2, item.children));
        continue;
      }
      if (item.kind === "adapter") {
        if (item.children.length)
          fail2("ADAPTER_STRUCTURE", "Static adapter containers must not contain body content");
        const a = adapterSourceAttributes(item.attrs, fail2);
        stack.at(-1).children.push(make2(a.descriptor.blockName, a.attributes, []));
        continue;
      }
      item.attrs.version = item.version || 1;
      if (item.kind === "code-tabs") {
        if (item.children.length !== item.attrs.tabs.length || item.children.some((b2) => !b2.exactCode))
          fail2("CODE_TABS_STRUCTURE", "The code group fence structure is incomplete");
        item.attrs.tabs = item.attrs.tabs.map((t, i) => ({
          id: t.id,
          title: t.title,
          language: item.children[i].attributes.language,
          code: item.children[i].attributes.code,
          ...item.attrs.version === 2 ? { startLine: t.startLine, highlights: t.highlights } : {}
        }));
        item.children = [];
      }
      if (item.kind === "code-compare") {
        const [left, right, ...body] = item.children;
        if (left?.name !== "mbb/code" || right?.name !== "mbb/code")
          fail2("TEACHING_CODE", "A code comparison must begin with two fenced code blocks");
        Object.assign(item.attrs, {
          codeLeft: left.attributes.code,
          languageLeft: left.attributes.language || "",
          codeRight: right.attributes.code,
          languageRight: right.attributes.language || ""
        });
        item.children = body;
      }
      stack.at(-1).children.push(make2("mbb/" + item.kind, item.attrs, item.children));
    }
    if (stack.length !== 1)
      fail2("TEACHING_STRUCTURE", "The teaching container closing marker is missing");
    validateTeaching(root, fail2);
    return root;
  }
  function validateTeaching(blocks, fail2) {
    validateMedia(blocks, fail2);
    const ids = /* @__PURE__ */ new Set();
    let count = 0;
    let groups = 0;
    let identities = 0;
    function walk(list3, parent = "", depth = 0, collapseDepth = 0, detailsDepth = 0) {
      for (const b of list3) {
        if (depth > 32 || ++count > 1e4)
          fail2("STRUCTURE_LIMIT", "Teaching structure exceeds its depth or node budget");
        const kind = teachingKind(b.name), inner = b.innerBlocks || [];
        if (parent === "steps" && kind !== "step")
          fail2("TEACHING_STRUCTURE", "A stage group may only contain stages");
        if (kind) {
          const a = teachingAttributes(kind, b.attributes, fail2, false, b.name);
          if (kind === "component") validateActivity(b, fail2);
          if (kind === "identity") {
            if (depth || ++identities > 1 || inner.length)
              fail2("DOCUMENT_IDENTITY", "A document permits one empty top-level logical identity");
            continue;
          }
          if (nativeAdapterKinds.has(kind) || kind === "adapter") {
            if (kind === "details" && detailsDepth >= 8)
              fail2("ADAPTER_LIMIT", "Native details are limited to 8 nested levels");
            if (a.anchor) {
              if (ids.has(a.anchor)) fail2("ADAPTER_ANCHOR", "The anchor duplicates a document ID");
              ids.add(a.anchor);
            }
            if (kind === "buttons" && (!inner.length || inner.length > 32 || inner.some((child) => child.name !== "core/button")))
              fail2("ADAPTER_STRUCTURE", "A button group requires 1\u201332 direct link buttons");
            if (kind === "columns" && (inner.length > 6 || inner.some((child) => child.name !== "core/column")))
              fail2("ADAPTER_STRUCTURE", "Columns may contain only 0\u20136 direct column blocks");
            if (kind === "column" && parent !== "columns")
              fail2("ADAPTER_STRUCTURE", "A column must be a direct child of columns");
            if (kind === "button" && (parent !== "buttons" || inner.length))
              fail2("ADAPTER_STRUCTURE", "A link button must be a direct leaf of a button group");
            if (nativeTextKind(kind) && inner.length)
              fail2("ADAPTER_STRUCTURE", "Native text leaves cannot contain body content");
            if (kind === "adapter" && inner.length)
              fail2("ADAPTER_STRUCTURE", "Static adapters must not contain nested blocks");
            walk(inner, kind, depth + 1, collapseDepth, detailsDepth + (kind === "details" ? 1 : 0));
            continue;
          }
          if (ids.has(a.id)) fail2("TEACHING_ID", "Teaching IDs must be unique within the document");
          ids.add(a.id);
          if (kind === "code-tabs") {
            if (inner.length)
              fail2("CODE_TABS_STRUCTURE", "Code groups must not contain nested body content");
            for (const tab of a.tabs) {
              if (ids.has(tab.id))
                fail2("TEACHING_ID", "A code version ID duplicates a document anchor");
              ids.add(tab.id);
            }
          }
          if (kind === "steps" && (depth || ++groups > 1 || !inner.length))
            fail2(
              "TEACHING_STRUCTURE",
              "Each document may contain only one nonempty top-level stage group"
            );
          if (kind === "step" && parent !== "steps")
            fail2("TEACHING_STRUCTURE", "A stage must be a direct child of a stage group");
          if ((kind === "collapse" || kind === "step" || kind === "component") && !inner.length)
            fail2("TEACHING_STRUCTURE", "Teaching body content must not be empty");
          if (kind === "collapse" && collapseDepth >= 3)
            fail2("TEACHING_DEPTH", "Collapsible content is limited to three nested levels");
          if (kind === "code-compare") {
            for (const side of ["Left", "Right"])
              if (a[side.toLowerCase() + "Highlights"].split(",").filter(Boolean).some((v) => Number(v) > a["code" + side].split("\n").length - 1))
                fail2("TEACHING_LINES", "Highlighted lines exceed the corresponding code range");
          }
        }
        walk(
          inner,
          kind || b.name,
          depth + 1,
          collapseDepth + (kind === "collapse" ? 1 : 0),
          detailsDepth
        );
      }
    }
    const anchors = [];
    function collect(list3) {
      for (const b of list3) {
        if (!teachingKind(b.name)) {
          const raw = b.name === "core/html" ? b.innerContent?.join("") ?? b.attributes?.content : b.attributes?.content;
          if (typeof raw === "string") {
            const template = document.createElement("template");
            template.innerHTML = raw;
            for (const node of template.content.querySelectorAll("[id]")) anchors.push(node.id);
          }
        }
        collect(b.innerBlocks || []);
      }
    }
    collect(blocks);
    walk(blocks);
    validateTechnical(blocks, fail2);
    if (anchors.some((id2) => ids.has(id2)))
      fail2("TEACHING_ID", "A teaching ID conflicts with a body anchor");
  }
  function teachingMarkdown(b, body, fail2) {
    const kind = teachingKind(b.name);
    const a = teachingAttributes(kind, b.attributes, fail2, false, b.name);
    if (nativeAdapterKinds.has(kind) || kind === "adapter") {
      const header = nativeTextKind(kind) ? {
        ...Object.fromEntries(Object.entries(a).filter(([key]) => key !== "content")),
        text: nativeContentText(a.content, kind, fail2)
      } : kind === "adapter" ? {
        name: staticAdapterKind(b.name).name,
        version: a.mbbAdapterVersion,
        attrs: Object.fromEntries(
          Object.keys(staticAdapterKind(b.name).attributes).map((key) => [key, a[key]])
        )
      } : Object.fromEntries(Object.entries(a).filter(([key]) => key !== "text"));
      return ":::mbb:v1 " + kind + " " + JSON.stringify(header) + "\n\n" + body.trimEnd() + "\n\n:::mbb:end";
    }
    if (kind === "code-tabs") return codeTabsMarkdown(a);
    const attrs2 = Object.fromEntries(
      [
        ...Object.keys(teachingSchemas[kind]),
        ...kind === "component" && a.version === 2 ? ["activity"] : [],
        ...kind === "bibliography" && a.version === 2 ? ["style"] : [],
        ...kind === "bibliography" && a.version === 2 && Object.hasOwn(a, "origins") ? ["origins"] : []
      ].map((key) => [key, a[key]])
    );
    const code2 = (side) => {
      const value = a["code" + side];
      const fence3 = "`".repeat(Math.max(3, ...(value.match(/`+/g) || []).map((s) => s.length + 1)));
      return fence3 + a["language" + side] + "\n" + value + fence3 + "\n\n";
    };
    return ":::mbb:v" + (["bibliography", "component"].includes(kind) ? a.version : 1) + " " + kind + " " + JSON.stringify(attrs2) + "\n\n" + (kind === "code-compare" ? code2("Left") + code2("Right") : "") + body.trimEnd() + "\n\n:::mbb:end";
  }
  function registerTeaching() {
    if (!wp.blocks.getBlockType("mbb/code-tabs")) registerCodeTabs();
    const el = wp.element.createElement;
    class DraftRegistry extends Map {
      revision = 0;
      set(key, value) {
        this.revision++;
        return super.set(key, value);
      }
      delete(key) {
        this.revision++;
        return super.delete(key);
      }
      clear() {
        this.revision++;
        return super.clear();
      }
    }
    const drafts = new DraftRegistry();
    const syncDraftLock = () => {
      window.MarkBridgeParameterDrafts = { pending: () => drafts.size > 0 };
      try {
        const editor = wp.data.dispatch("core/editor");
        if (drafts.size) editor.lockPostSaving("mbb-component-params");
        else editor.unlockPostSaving("mbb-component-params");
      } catch {
      }
    };
    const draftRegistries = /* @__PURE__ */ new WeakMap();
    const draftOwners = /* @__PURE__ */ new Map();
    const retainDraftOwner = (registry2, clientId) => {
      let state = draftRegistries.get(registry2);
      if (!state) {
        state = { clients: /* @__PURE__ */ new Map(), checking: false, unsubscribe: null };
        const release = () => {
          if (!state.clients.size) {
            state.unsubscribe?.();
            draftRegistries.delete(registry2);
          }
        };
        const check = () => {
          if (state.checking) return;
          state.checking = true;
          let changed = false;
          try {
            const blocks = registry2.select("core/block-editor");
            for (const [id2, mounted] of state.clients) {
              if (draftOwners.get(id2) !== registry2) {
                state.clients.delete(id2);
                continue;
              }
              if (drafts.has(id2) && !blocks.getBlock(id2)) {
                drafts.delete(id2);
                changed = true;
              }
              if (!mounted && !drafts.has(id2)) {
                state.clients.delete(id2);
                draftOwners.delete(id2);
              }
            }
            if (changed) syncDraftLock();
            release();
          } finally {
            state.checking = false;
          }
        };
        state.check = check;
        draftRegistries.set(registry2, state);
        state.unsubscribe = registry2.subscribe(check, "core/block-editor");
      }
      draftOwners.set(clientId, registry2);
      state.clients.set(clientId, (state.clients.get(clientId) || 0) + 1);
      return () => {
        state.clients.set(clientId, Math.max(0, (state.clients.get(clientId) || 1) - 1));
        state.check();
      };
    };
    registerTechnical({ drafts, syncDraftLock, retainDraftOwner });
    const ComponentSelector = createComponentSelector(wp);
    const ParameterEditor = createParameterEditor({
      wp,
      drafts,
      syncDraftLock,
      parse: (raw) => teachingJSON(raw, (code2, message) => {
        throw Error(message);
      })
    });
    for (const [kind, schema] of Object.entries(teachingSchemas)) {
      if (nativeAdapterKinds.has(kind) || kind === "adapter") continue;
      if (kind === "code-tabs" || mediaKinds.has(kind) || technicalKind("mbb/" + kind)) continue;
      if (kind === "identity") {
        if (!wp.blocks.getBlockType("mbb/identity"))
          wp.blocks.registerBlockType("mbb/identity", {
            apiVersion: 3,
            title: translate("Logical document identity"),
            category: "text",
            attributes: {
              namespace: { type: "string" },
              document: { type: "string" },
              version: { type: "number" }
            },
            supports: { inserter: false, html: false, reusable: false, customClassName: false },
            edit: () => el(
              "p",
              wp.blockEditor.useBlockProps({ className: "mbb-identity-indicator" }),
              translate("Document identity enabled")
            ),
            save: () => null
          });
        continue;
      }
      const name = "mbb/" + kind;
      if (wp.blocks.getBlockType(name)) continue;
      wp.blocks.registerBlockType(name, {
        apiVersion: 3,
        title: {
          component: translate("Teaching component"),
          collapse: translate("Collapsible content"),
          steps: translate("Stage navigation"),
          step: translate("Stage"),
          "code-compare": translate("Code comparison")
        }[kind],
        category: "text",
        ...kind === "step" ? { parent: ["mbb/steps"] } : {},
        attributes: Object.fromEntries(
          Object.entries({
            ...schema,
            ...kind === "component" ? { activity: "object" } : {},
            version: "number",
            ...kind === "code-compare" ? sourceFields : {}
          }).map(([key, type]) => [key, { type }])
        ),
        supports: { html: false, customClassName: false, anchor: false },
        edit: ({ attributes: a, setAttributes, clientId }) => {
          const registry2 = wp.data.useRegistry();
          useComponentDescriptor(wp, a.component, a.componentVersion);
          const currentBlock = wp.data.useSelect(
            (select) => select("core/block-editor").getBlock(clientId),
            [clientId]
          );
          wp.element.useEffect(() => retainDraftOwner(registry2, clientId), [registry2, clientId]);
          wp.element.useEffect(() => {
            const initial = a.version === void 0 ? { version: 1 } : {};
            for (const [key, type] of Object.entries(schema))
              if (a[key] === void 0)
                initial[key] = key === "params" ? {} : key === "component" ? "" : key === "componentVersion" ? "" : key === "id" ? "mbb-" + clientId : type === "boolean" ? key !== "open" : key.endsWith("Highlights") ? "" : key === "mode" ? "full" : kind === "code-compare" ? key === "leftTitle" ? "\u539F\u4EE3\u7801" : "\u65B0\u4EE3\u7801" : "\u6807\u9898";
            if (kind === "code-compare") {
              for (const key of Object.keys(sourceFields))
                if (a[key] === void 0) initial[key] = key.startsWith("code") ? "\n" : "";
            }
            if (Object.keys(initial).length) setAttributes(initial);
            if (kind === "component" && !a.component && !a.componentVersion) {
              const id2 = Object.keys(globalThis.MBBComponentCatalog?.defaults || {})[0] || window.MBBComponents?.[0]?.id;
              if (id2)
                resolveDefaultComponent(id2).then(
                  (p) => {
                    const live = registry2.select("core/block-editor").getBlock(clientId)?.attributes;
                    if (p && live && !live.component && !live.componentVersion && !Object.keys(live.params || {}).length)
                      setAttributes({
                        component: p.id,
                        componentVersion: p.version,
                        params: p.defaults
                      });
                  },
                  () => {
                  }
                );
            }
          }, []);
          const controls = Object.entries({
            ...schema,
            ...kind === "code-compare" ? sourceFields : {}
          }).filter(
            ([key]) => key !== "full" && !(kind === "component" && ["component", "componentVersion"].includes(key))
          ).map(
            ([key, type]) => key === "params" ? el(ParameterEditor, {
              key,
              value: a.params,
              component: a.component,
              componentVersion: a.componentVersion,
              instanceId: a.id,
              clientId,
              activity: a.activity,
              parts: [...activityParts(currentBlock || { innerBlocks: [] })].map(([id2, b]) => ({
                id: id2,
                title: b.attributes.title,
                open: b.attributes.open,
                direct: (currentBlock?.innerBlocks || []).some(
                  (child) => child.clientId === b.clientId
                )
              })),
              onCommit: (params, meta) => {
                if (meta?.activity)
                  validateActivity(
                    {
                      ...registry2.select("core/block-editor").getBlock(clientId),
                      attributes: { ...a, params, version: 2, activity: meta.activity }
                    },
                    (code2, message) => {
                      throw Error(message);
                    }
                  );
                setAttributes({
                  params,
                  ...meta?.activity ? { activity: meta.activity, version: 2 } : {},
                  ...meta?.componentVersion ? { componentVersion: meta.componentVersion } : {}
                });
              }
            }) : el(
              key === "mode" ? wp.components.SelectControl : type === "boolean" ? wp.components.ToggleControl : key === "params" || key.startsWith("code") ? wp.components.TextareaControl : wp.components.TextControl,
              {
                key,
                ...key === "mode" ? {
                  options: [
                    { label: translate("Full text"), value: "full" },
                    { label: translate("By stage"), value: "staged" }
                  ]
                } : {},
                help: key === "params" || key.startsWith("code") ? translate(
                  "Source must preserve its trailing newline. Use the button below to add it explicitly."
                ) : void 0,
                label: {
                  component: translate("Component type"),
                  componentVersion: translate("Component version"),
                  params: translate("Parameter JSON (data only; verified on save)"),
                  id: translate("Stable ID"),
                  title: translate("Title"),
                  open: translate("Initially open"),
                  previous: translate("Previous stage"),
                  next: translate("Next stage"),
                  full: translate("Full-text mode"),
                  leftTitle: translate("Left title"),
                  rightTitle: translate("Right title"),
                  mode: translate("Reading mode (full / staged)"),
                  leftHighlights: translate("Left highlighted lines (comma-separated)"),
                  rightHighlights: translate("Right highlighted lines (comma-separated)"),
                  codeLeft: translate("Left original code"),
                  codeRight: translate("Right original code"),
                  languageLeft: translate("Left language"),
                  languageRight: translate("Right language")
                }[key],
                ...type === "boolean" ? { checked: !!a[key] } : {
                  value: key === "params" ? JSON.stringify(a[key] || {}, null, 2) : a[key] || ""
                },
                onChange: (value) => {
                  if (key === "params") {
                    try {
                      const parsed = teachingJSON(value, () => {
                        throw new Error("JSON");
                      });
                      componentParams(parsed, () => {
                        throw new Error("params");
                      });
                      setAttributes({ params: parsed });
                    } catch {
                    }
                  } else setAttributes({ [key]: value });
                }
              }
            )
          );
          const field = (key) => controls.find((control) => control.key === key);
          const visible = kind === "code-compare" ? ["leftTitle", "rightTitle", "codeLeft", "codeRight", "languageLeft", "languageRight"] : ["title"];
          const appendNewline = (side) => el(
            wp.components.Button,
            {
              variant: "secondary",
              disabled: (a["code" + side] || "").endsWith("\n"),
              onClick: () => setAttributes({ ["code" + side]: (a["code" + side] || "") + "\n" })
            },
            translate("Add a trailing newline to the ") + (side === "Left" ? translate("left") : translate("right")) + translate(" source")
          );
          return el(
            "div",
            wp.blockEditor.useBlockProps({ className: "mbb-teaching-editor" }),
            el(
              wp.blockEditor.InspectorControls,
              {},
              el(
                wp.components.PanelBody,
                { title: translate("Teaching settings"), initialOpen: true },
                kind === "component" ? el(ComponentSelector, {
                  draftFingerprint: JSON.stringify(a),
                  draftGeneration: () => drafts.revision,
                  component: a.component || "",
                  version: a.componentVersion || "",
                  clientId,
                  disabled: !!a.activity,
                  onChange: (p) => setAttributes({
                    component: p.id,
                    componentVersion: p.version,
                    params: p.defaults
                  })
                }) : null,
                ...controls.filter((control) => !visible.includes(control.key)),
                kind === "component" && !a.activity ? a.component === "code-runner" && ["0.1.0", "0.2.0"].includes(a.componentVersion) ? codeRunnerStaticElement(el, a.params, a.componentVersion) : el(
                  "div",
                  {
                    "data-mbb-generated": "",
                    "data-mbb-teaching": "component",
                    "data-mbb-teaching-config": JSON.stringify({
                      component: a.component,
                      componentVersion: a.componentVersion,
                      params: a.params,
                      status: (window.MBBComponents || []).some(
                        (p) => p.id === a.component && p.version === a.componentVersion
                      ) ? "available" : "missing",
                      provider: (window.MBBComponents || []).find(
                        (p) => p.id === a.component && p.version === a.componentVersion
                      )
                    })
                  },
                  el(
                    "div",
                    { className: "mbb-teaching-body" },
                    translate("Interactive editor preview. Edit the static fallback body below.")
                  )
                ) : null
              )
            ),
            el(
              "p",
              { className: "mbb-teaching-editor-label" },
              {
                component: translate("Teaching component"),
                collapse: translate("Collapsible content"),
                steps: translate("Stage navigation"),
                step: translate("Stage"),
                "code-compare": translate("Code comparison")
              }[kind]
            ),
            kind === "code-compare" ? el(
              "div",
              { className: "mbb-teaching-editor-columns" },
              ...["Left", "Right"].map(
                (side) => el(
                  "div",
                  { key: side },
                  field(side.toLowerCase() + "Title"),
                  field("language" + side),
                  field("code" + side),
                  appendNewline(side)
                )
              )
            ) : kind === "component" ? ["relation-map/v2", "relation-map/v3", "knowledge-map/v1"].includes(
              a.params?.format
            ) ? null : el(
              "p",
              {},
              (window.MBBComponents || []).find(
                (p) => p.id === a.component && p.version === a.componentVersion
              )?.title || a.component || translate("Choose a teaching component in the sidebar")
            ) : field("title"),
            el(
              wp.blockEditor.InnerBlocks,
              kind === "steps" ? { allowedBlocks: ["mbb/step"], template: [["mbb/step"]], templateLock: false } : {}
            )
          );
        },
        save: ({ attributes: a }) => el(
          "div",
          wp.blockEditor.useBlockProps.save({ id: a.id }),
          kind === "code-compare" ? ["Left", "Right"].map(
            (side) => el(
              "div",
              { key: side, className: "mbb-compare-" + side.toLowerCase() },
              el("p", { "data-mbb-generated": "" }, a[side.toLowerCase() + "Title"]),
              el(
                "pre",
                {},
                el(
                  "code",
                  a["language" + side] ? { className: "language-" + a["language" + side] } : {},
                  a["code" + side]
                )
              )
            )
          ) : kind === "component" ? ["relation-map/v2", "relation-map/v3", "knowledge-map/v1"].includes(
            a.params?.format
          ) ? null : el(
            "p",
            { "data-mbb-generated": "", className: "mbb-component-params" },
            btoa(
              String.fromCharCode(...new TextEncoder().encode(JSON.stringify(a.params)))
            )
          ) : el("p", { className: "mbb-teaching-title", "data-mbb-generated": "" }, a.title),
          el("div", { className: "mbb-teaching-body" }, el(wp.blockEditor.InnerBlocks.Content))
        )
      });
    }
  }

  // src/frontmatter.js
  var frontmatterFields = [
    "title",
    "excerpt",
    "slug",
    "status",
    "categories",
    "tags",
    "featured_media"
  ];
  var bytes3 = (text3) => new TextEncoder().encode(text3).length;
  var blank2 = (text3) => !text3.replace(/[\p{White_Space}\uFEFF]/gu, "");
  function parseFrontmatter(source, fail2) {
    const lines = source.match(/[^\n]*(?:\n|$)/g) || [];
    if (!/^---\r?\n$/.test(lines[0] || "") || !/^markbridge:/.test(lines[1] || "")) return null;
    if (!/^markbridge: 1\r?\n$/.test(lines[1]))
      fail2("FRONTMATTER_VERSION", "The FrontMatter version must be 1");
    let raw = lines[0] + lines[1];
    const proposal = {};
    let closed3 = false;
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].replace(/\r?\n$/, "");
      raw += lines[i];
      if (bytes3(raw) > 16384) fail2("FRONTMATTER_LIMIT", "A FrontMatter header is limited to 16 KiB");
      if (line === "---") {
        closed3 = true;
        break;
      }
      const match2 = /^([a-z_]+): ([^\r\n]+)$/.exec(line);
      if (!match2 || !frontmatterFields.includes(match2[1]) || Object.hasOwn(proposal, match2[1]))
        fail2(
          "FRONTMATTER_FIELD",
          "FrontMatter fields are unknown, duplicated, or not single-line JSON"
        );
      const key = match2[1];
      let value;
      try {
        value = JSON.parse(match2[2]);
      } catch {
        fail2("FRONTMATTER_VALUE", "FrontMatter values must be valid JSON");
      }
      if (key === "featured_media") {
        if (!/^(?:0|[1-9]\d*)$/.test(match2[2]) || !Number.isSafeInteger(value))
          fail2("FRONTMATTER_VALUE", "The featured image must be a nonnegative safe integer");
      } else if (key === "categories" || key === "tags") {
        if (!Array.isArray(value) || value.length > 100 || new Set(value).size !== value.length || value.some((slug) => typeof slug !== "string" || !/^[a-z0-9%_-]{1,200}$/.test(slug)))
          fail2(
            "FRONTMATTER_VALUE",
            "Categories and tags require at most 100 unique existing term slugs"
          );
      } else {
        if (typeof value !== "string" || /[\uD800-\uDFFF\x00]/u.test(value))
          fail2("FRONTMATTER_VALUE", "FrontMatter strings must be valid Unicode");
        if (key === "title" && (blank2(value) || [...value].length > 200 || /[\x00-\x1f\x7f]/.test(value)))
          fail2("FRONTMATTER_VALUE", "The title must be single-line text of 1\u2013200 characters");
        if (key === "excerpt" && (bytes3(value) > 8192 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)))
          fail2(
            "FRONTMATTER_VALUE",
            "The excerpt is limited to 8 KiB and must not contain invalid control characters"
          );
        if (key === "slug" && ([...value].length > 200 || /[\p{White_Space}\uFEFF<>\\/\x00-\x1f\x7f]/u.test(value)))
          fail2(
            "FRONTMATTER_VALUE",
            "The slug must be a single-line path name of at most 200 characters"
          );
        if (key === "status" && !["draft", "pending", "publish", "private"].includes(value))
          fail2("FRONTMATTER_VALUE", "Invalid FrontMatter status");
      }
      proposal[key] = value;
    }
    if (!closed3) fail2("FRONTMATTER_SYNTAX", "The FrontMatter closing delimiter is missing");
    return { raw, body: source.slice(raw.length), proposal };
  }
  function validateFrontmatter(blocks, fail2) {
    let found = false;
    function walk(items, top = false) {
      items.forEach((block2, index) => {
        if (block2.name === "mbb/frontmatter") {
          const attrs2 = block2.attributes;
          if (block2.isValid === false || !top || index !== 0 || found || block2.innerBlocks?.length)
            fail2("FRONTMATTER_STRUCTURE", "FrontMatter must be the unique first top-level block");
          found = true;
          if (!attrs2 || Object.keys(attrs2).length !== 2 || attrs2.version !== 1 || typeof attrs2.raw !== "string")
            fail2(
              "FRONTMATTER_ATTRIBUTES",
              "FrontMatter attributes may only contain version:1 and raw"
            );
          const parsed = parseFrontmatter(attrs2.raw, fail2);
          if (!parsed || parsed.body)
            fail2("FRONTMATTER_ATTRIBUTES", "raw must contain only the complete FrontMatter header");
        }
        walk(block2.innerBlocks || []);
      });
    }
    walk(blocks, true);
  }
  function validateFrontmatterSerialized(serialized, fail2) {
    for (const match2 of serialized.matchAll(
      /<!-- wp:mbb\/frontmatter(?: (\{[\s\S]*?\}))? (?:\/)?-->/g
    )) {
      const attrs2 = teachingJSON(match2[1] || "{}", fail2);
      validateFrontmatter([{ name: "mbb/frontmatter", attributes: attrs2, innerBlocks: [] }], fail2);
    }
  }
  function registerFrontmatter() {
    if (wp.blocks.getBlockType("mbb/frontmatter")) return;
    wp.blocks.registerBlockType("mbb/frontmatter", {
      apiVersion: 3,
      title: translate("Document metadata proposal"),
      category: "text",
      attributes: {
        version: { type: "number" },
        raw: { type: "string" }
      },
      supports: { html: false, reusable: false },
      edit: ({ attributes, setAttributes }) => {
        wp.element.useEffect(() => {
          if (attributes.version === void 0 && attributes.raw === void 0)
            setAttributes({ version: 1, raw: "---\nmarkbridge: 1\n---\n" });
        }, []);
        let error3 = "";
        try {
          validateFrontmatter(
            [{ name: "mbb/frontmatter", attributes, innerBlocks: [] }],
            (code2, message) => {
              throw Error(message);
            }
          );
        } catch (e) {
          error3 = translateError(e);
        }
        return wp.element.createElement(
          "div",
          wp.blockEditor.useBlockProps(),
          wp.element.createElement(
            "p",
            {},
            translate(
              "Metadata proposal: editing this header does not automatically change article settings. Select fields in the editing bridge, preview again, and confirm."
            )
          ),
          wp.element.createElement(wp.components.TextareaControl, {
            label: translate("Raw FrontMatter header"),
            value: attributes.raw || "",
            onChange: (raw) => setAttributes({ raw })
          }),
          error3 ? wp.element.createElement("p", { role: "alert" }, error3) : null
        );
      },
      save: () => wp.element.createElement("div", {
        className: "wp-block-mbb-frontmatter",
        "data-mbb-generated": ""
      })
    });
  }

  // src/resource-images.js
  function rewriteSerializedImageURLs(serialized, mappings, fail2, portable = false) {
    if (!Array.isArray(mappings) || mappings.length > 256)
      fail2("RESOURCE_MAP", "Image mappings are limited to 256 references and 32 targets");
    const replacements = /* @__PURE__ */ new Map();
    for (const item of mappings) {
      if (!item || Object.keys(item).sort().join(",") !== "from,to" || typeof item.from !== "string" || typeof item.to !== "string" || !item.from || [...item.from].length > 2048 || [...item.to].length > 4096 || /[\uD800-\uDFFF\x00]/u.test(item.from + item.to) || replacements.has(item.from) || !(portable ? /^images\/[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/ : /^(?:https?:\/\/[^\s<>"'\\]+|mbb-import\/[a-f0-9]{64})$/).test(item.to))
        fail2("RESOURCE_MAP", "Image mappings are invalid or duplicated");
      replacements.set(item.from, { url: item.to, count: 0 });
    }
    if (new Set([...replacements.values()].map((item) => item.url)).size > 32)
      fail2("RESOURCE_MAP", "Image mappings are limited to 32 targets");
    const decode3 = (value) => {
      const element = document.createElement("textarea");
      element.innerHTML = value;
      return element.value;
    };
    const escape3 = (value) => value.replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
    const result = serialized.replace(
      /<!--[\s\S]*?-->|<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>|<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi,
      (tag) => {
        if (!/^<img\b/i.test(tag)) return tag;
        return tag.replace(
          /(\s+[a-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi,
          (attr, name, double, single, plain4) => {
            if (name.trim().toLowerCase() !== "src" || double === void 0 && single === void 0 && plain4 === void 0)
              return attr;
            const mapped = replacements.get(decode3(double ?? single ?? plain4));
            if (!mapped) return attr;
            mapped.count++;
            if (portable) {
              const start = attr.indexOf("=") + 1;
              const prefix = attr.slice(0, start) + attr.slice(start).match(/^\s*/)[0];
              const quote2 = double !== void 0 ? '"' : single !== void 0 ? "'" : "";
              return prefix + quote2 + mapped.url + quote2;
            }
            return name + '="' + escape3(mapped.url) + '"';
          }
        );
      }
    );
    if ([...replacements.values()].some((item) => item.count === 0))
      fail2("RESOURCE_TARGET", "Image mappings must point to actual author images");
    return result;
  }

  // src/portable-images.js
  function portableImageSource(source, mappings, fail2) {
    const map2 = new Map(mappings.map(({ from, to }) => [from, to]));
    const chars = source.split("");
    const mask = (start, end2) => {
      for (let n = start; n < end2; n++) if (!/[\r\n]/.test(chars[n])) chars[n] = " ";
    };
    let offset = 0, fence3 = null, button = false, paragraph3 = false;
    for (const raw of source.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || []) {
      const line = raw.replace(/(?:\r\n|\r|\n)$/, "");
      if (button) {
        mask(offset, offset + raw.length);
        if (line.startsWith("<p>")) paragraph3 = true;
        if (paragraph3 && line.endsWith("</p>")) paragraph3 = false;
        else if (!paragraph3 && line === ":::mbb:end") button = false;
        offset += raw.length;
        continue;
      }
      if (/^:::mbb:v1 button /.test(line)) button = true;
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence3) {
        mask(offset, offset + raw.length);
        if (new RegExp("^ {0,3}" + fence3.char + "{" + fence3.length + ",}[ \\t\\r]*$").test(line))
          fence3 = null;
      } else if (opening && (opening[1][0] !== "`" || !opening[2].includes("`"))) {
        fence3 = { char: opening[1][0], length: opening[1].length };
        mask(offset, offset + raw.length);
      } else if (/^(?: {4}|\t|:::mbb:)/.test(line)) mask(offset, offset + raw.length);
      offset += raw.length;
    }
    const header = source.match(/^---\r?\nmarkbridge: 1\r?\n[\s\S]*?^---(?:\r?\n|$)/m);
    if (header?.index === 0) mask(0, header[0].length);
    let visible = chars.join("");
    for (const item of visible.matchAll(/(`+)([\s\S]*?)\1(?!`)/g))
      mask(item.index, item.index + item[0].length);
    visible = chars.join("");
    for (const item of visible.matchAll(/<!--[\s\S]*?-->|<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi))
      mask(item.index, item.index + item[0].length);
    visible = chars.join("");
    visible = visible.replace(/\r\n/g, " \n").replace(/\r/g, "\n");
    const decode3 = (value) => {
      const box = document.createElement("textarea");
      box.innerHTML = value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
      return box.value;
    };
    const label = (value) => value.replace(/\s+/g, " ").trim().toUpperCase();
    const definitions = /* @__PURE__ */ new Map();
    const destination = String.raw`(?:<((?:\\.|[^\\<>\r\n])*)>|((?:\\.|[^\\\s()])+))`;
    for (const item of visible.matchAll(
      new RegExp(
        "^ {0,3}\\[([^\\]\\r\\n]+)\\]:[ \\t]*" + destination + `([ \\t]+(?:"[^"\\r\\n]*"|'[^'\\r\\n]*'|\\([^\\r\\n]*\\)))?[ \\t]*$`,
        "gm"
      )
    ))
      if (!definitions.has(label(item[1])))
        definitions.set(label(item[1]), { url: decode3(item[2] ?? item[3]), title: item[4] || "" });
    const edits = [];
    const pattern = new RegExp(
      String.raw`!\[((?:\\.|[^\\\]\r\n])*)\](?:\([ \t]*` + destination + `([ \\t]+(?:"[^"\\r\\n]*"|'[^'\\r\\n]*'|\\([^\\r\\n]*\\)))?[ \\t]*\\)|\\[([^\\]\\r\\n]*)\\])?`,
      "gd"
    );
    for (const item of visible.matchAll(pattern)) {
      if (item.index && source[item.index - 1] === "\\") continue;
      const ref = item[2] === void 0 && item[3] === void 0 ? definitions.get(label(item[5] || item[1])) : null;
      const url = ref?.url ?? decode3(item[2] ?? item[3] ?? "");
      if (!map2.has(url)) continue;
      if (ref) {
        const alt = source.slice(item.index + 2, item.index + 2 + item[1].length);
        edits.push({
          start: item.index,
          end: item.index + item[0].length,
          value: "![" + alt + "](" + map2.get(url) + ref.title + ")"
        });
      } else {
        const range = item.indices[item[2] === void 0 ? 3 : 2];
        edits.push({ start: range[0], end: range[1], value: map2.get(url) });
      }
    }
    for (const item of visible.matchAll(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
      const original = source.slice(item.index, item.index + item[0].length);
      const value = original.replace(
        /(\s+src\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
        (all, prefix, a, b, c) => map2.has(decode3(a ?? b ?? c)) ? all.slice(0, prefix.length + (a !== void 0 || b !== void 0 ? 1 : 0)) + map2.get(decode3(a ?? b ?? c)) + (a !== void 0 ? '"' : b !== void 0 ? "'" : "") : all
      );
      if (value !== original)
        edits.push({ start: item.index, end: item.index + item[0].length, value });
    }
    edits.sort((a, b) => b.start - a.start);
    let end = source.length, result = source;
    for (const edit of edits) {
      if (edit.end > end)
        fail2("EXPORT_PROJECTION", "Overlapping image syntax cannot be projected reliably");
      result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
      end = edit.start;
    }
    return result;
  }

  // node_modules/markdown-it/lib/common/utils.mjs
  var utils_exports = {};
  __export(utils_exports, {
    arrayReplaceAt: () => arrayReplaceAt,
    asciiTrim: () => asciiTrim,
    assign: () => assign,
    escapeHtml: () => escapeHtml,
    escapeRE: () => escapeRE,
    fromCodePoint: () => fromCodePoint2,
    has: () => has,
    isMdAsciiPunct: () => isMdAsciiPunct,
    isPunctChar: () => isPunctChar,
    isPunctCharCode: () => isPunctCharCode,
    isSpace: () => isSpace,
    isString: () => isString,
    isValidEntityCode: () => isValidEntityCode,
    isWhiteSpace: () => isWhiteSpace,
    lib: () => lib,
    normalizeReference: () => normalizeReference,
    unescapeAll: () => unescapeAll,
    unescapeMd: () => unescapeMd
  });

  // node_modules/mdurl/index.mjs
  var mdurl_exports = {};
  __export(mdurl_exports, {
    decode: () => decode_default,
    encode: () => encode_default,
    format: () => format2,
    parse: () => parse_default
  });

  // node_modules/mdurl/lib/decode.mjs
  var decodeCache = {};
  function getDecodeCache(exclude) {
    let cache = decodeCache[exclude];
    if (cache) {
      return cache;
    }
    cache = decodeCache[exclude] = [];
    for (let i = 0; i < 128; i++) {
      const ch = String.fromCharCode(i);
      cache.push(ch);
    }
    for (let i = 0; i < exclude.length; i++) {
      const ch = exclude.charCodeAt(i);
      cache[ch] = "%" + ("0" + ch.toString(16).toUpperCase()).slice(-2);
    }
    return cache;
  }
  function decode(string, exclude) {
    if (typeof exclude !== "string") {
      exclude = decode.defaultChars;
    }
    const cache = getDecodeCache(exclude);
    return string.replace(/(%[a-f0-9]{2})+/gi, function(seq) {
      let result = "";
      for (let i = 0, l = seq.length; i < l; i += 3) {
        const b1 = parseInt(seq.slice(i + 1, i + 3), 16);
        if (b1 < 128) {
          result += cache[b1];
          continue;
        }
        if ((b1 & 224) === 192 && i + 3 < l) {
          const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
          if ((b2 & 192) === 128) {
            const chr = b1 << 6 & 1984 | b2 & 63;
            if (chr < 128) {
              result += "\uFFFD\uFFFD";
            } else {
              result += String.fromCharCode(chr);
            }
            i += 3;
            continue;
          }
        }
        if ((b1 & 240) === 224 && i + 6 < l) {
          const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
          const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
          if ((b2 & 192) === 128 && (b3 & 192) === 128) {
            const chr = b1 << 12 & 61440 | b2 << 6 & 4032 | b3 & 63;
            if (chr < 2048 || chr >= 55296 && chr <= 57343) {
              result += "\uFFFD\uFFFD\uFFFD";
            } else {
              result += String.fromCharCode(chr);
            }
            i += 6;
            continue;
          }
        }
        if ((b1 & 248) === 240 && i + 9 < l) {
          const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
          const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
          const b4 = parseInt(seq.slice(i + 10, i + 12), 16);
          if ((b2 & 192) === 128 && (b3 & 192) === 128 && (b4 & 192) === 128) {
            let chr = b1 << 18 & 1835008 | b2 << 12 & 258048 | b3 << 6 & 4032 | b4 & 63;
            if (chr < 65536 || chr > 1114111) {
              result += "\uFFFD\uFFFD\uFFFD\uFFFD";
            } else {
              chr -= 65536;
              result += String.fromCharCode(55296 + (chr >> 10), 56320 + (chr & 1023));
            }
            i += 9;
            continue;
          }
        }
        result += "\uFFFD";
      }
      return result;
    });
  }
  decode.defaultChars = ";/?:@&=+$,#";
  decode.componentChars = "";
  var decode_default = decode;

  // node_modules/mdurl/lib/encode.mjs
  var encodeCache = {};
  function getEncodeCache(exclude) {
    let cache = encodeCache[exclude];
    if (cache) {
      return cache;
    }
    cache = encodeCache[exclude] = [];
    for (let i = 0; i < 128; i++) {
      const ch = String.fromCharCode(i);
      if (/^[0-9a-z]$/i.test(ch)) {
        cache.push(ch);
      } else {
        cache.push("%" + ("0" + i.toString(16).toUpperCase()).slice(-2));
      }
    }
    for (let i = 0; i < exclude.length; i++) {
      cache[exclude.charCodeAt(i)] = exclude[i];
    }
    return cache;
  }
  function encode(string, exclude, keepEscaped) {
    if (typeof exclude !== "string") {
      keepEscaped = exclude;
      exclude = encode.defaultChars;
    }
    if (typeof keepEscaped === "undefined") {
      keepEscaped = true;
    }
    const cache = getEncodeCache(exclude);
    let result = "";
    for (let i = 0, l = string.length; i < l; i++) {
      const code2 = string.charCodeAt(i);
      if (keepEscaped && code2 === 37 && i + 2 < l) {
        if (/^[0-9a-f]{2}$/i.test(string.slice(i + 1, i + 3))) {
          result += string.slice(i, i + 3);
          i += 2;
          continue;
        }
      }
      if (code2 < 128) {
        result += cache[code2];
        continue;
      }
      if (code2 >= 55296 && code2 <= 57343) {
        if (code2 >= 55296 && code2 <= 56319 && i + 1 < l) {
          const nextCode = string.charCodeAt(i + 1);
          if (nextCode >= 56320 && nextCode <= 57343) {
            result += encodeURIComponent(string[i] + string[i + 1]);
            i++;
            continue;
          }
        }
        result += "%EF%BF%BD";
        continue;
      }
      result += encodeURIComponent(string[i]);
    }
    return result;
  }
  encode.defaultChars = ";/?:@&=+$,-_.!~*'()#";
  encode.componentChars = "-_.!~*'()";
  var encode_default = encode;

  // node_modules/mdurl/lib/format.mjs
  function format2(url) {
    let result = "";
    result += url.protocol || "";
    result += url.slashes ? "//" : "";
    result += url.auth ? url.auth + "@" : "";
    if (url.hostname && url.hostname.indexOf(":") !== -1) {
      result += "[" + url.hostname + "]";
    } else {
      result += url.hostname || "";
    }
    result += url.port ? ":" + url.port : "";
    result += url.pathname || "";
    result += url.search || "";
    result += url.hash || "";
    return result;
  }

  // node_modules/mdurl/lib/parse.mjs
  function Url() {
    this.protocol = null;
    this.slashes = null;
    this.auth = null;
    this.port = null;
    this.hostname = null;
    this.hash = null;
    this.search = null;
    this.pathname = null;
  }
  var protocolPattern = /^([a-z0-9.+-]+:)/i;
  var portPattern = /:[0-9]*$/;
  var simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/;
  var delims = ["<", ">", '"', "`", " ", "\r", "\n", "	"];
  var unwise = ["{", "}", "|", "\\", "^", "`"].concat(delims);
  var autoEscape = ["'"].concat(unwise);
  var nonHostChars = ["%", "/", "?", ";", "#"].concat(autoEscape);
  var hostEndingChars = ["/", "?", "#"];
  var hostnameMaxLen = 255;
  var hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/;
  var hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/;
  var hostlessProtocol = {
    javascript: true,
    "javascript:": true
  };
  var slashedProtocol = {
    http: true,
    https: true,
    ftp: true,
    gopher: true,
    file: true,
    "http:": true,
    "https:": true,
    "ftp:": true,
    "gopher:": true,
    "file:": true
  };
  function urlParse(url, slashesDenoteHost) {
    if (url && url instanceof Url) return url;
    const u = new Url();
    u.parse(url, slashesDenoteHost);
    return u;
  }
  Url.prototype.parse = function(url, slashesDenoteHost) {
    let lowerProto, hec, slashes;
    let rest = url;
    rest = rest.trim();
    if (!slashesDenoteHost && url.split("#").length === 1) {
      const simplePath = simplePathPattern.exec(rest);
      if (simplePath) {
        this.pathname = simplePath[1];
        if (simplePath[2]) {
          this.search = simplePath[2];
        }
        return this;
      }
    }
    let proto = protocolPattern.exec(rest);
    if (proto) {
      proto = proto[0];
      lowerProto = proto.toLowerCase();
      this.protocol = proto;
      rest = rest.substr(proto.length);
    }
    if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
      slashes = rest.substr(0, 2) === "//";
      if (slashes && !(proto && hostlessProtocol[proto])) {
        rest = rest.substr(2);
        this.slashes = true;
      }
    }
    if (!hostlessProtocol[proto] && (slashes || proto && !slashedProtocol[proto])) {
      let hostEnd = -1;
      for (let i = 0; i < hostEndingChars.length; i++) {
        hec = rest.indexOf(hostEndingChars[i]);
        if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
          hostEnd = hec;
        }
      }
      let auth, atSign;
      if (hostEnd === -1) {
        atSign = rest.lastIndexOf("@");
      } else {
        atSign = rest.lastIndexOf("@", hostEnd);
      }
      if (atSign !== -1) {
        auth = rest.slice(0, atSign);
        rest = rest.slice(atSign + 1);
        this.auth = auth;
      }
      hostEnd = -1;
      for (let i = 0; i < nonHostChars.length; i++) {
        hec = rest.indexOf(nonHostChars[i]);
        if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
          hostEnd = hec;
        }
      }
      if (hostEnd === -1) {
        hostEnd = rest.length;
      }
      if (rest[hostEnd - 1] === ":") {
        hostEnd--;
      }
      const host = rest.slice(0, hostEnd);
      rest = rest.slice(hostEnd);
      this.parseHost(host);
      this.hostname = this.hostname || "";
      const ipv6Hostname = this.hostname[0] === "[" && this.hostname[this.hostname.length - 1] === "]";
      if (!ipv6Hostname) {
        const hostparts = this.hostname.split(/\./);
        for (let i = 0, l = hostparts.length; i < l; i++) {
          const part = hostparts[i];
          if (!part) {
            continue;
          }
          if (!part.match(hostnamePartPattern)) {
            let newpart = "";
            for (let j = 0, k = part.length; j < k; j++) {
              if (part.charCodeAt(j) > 127) {
                newpart += "x";
              } else {
                newpart += part[j];
              }
            }
            if (!newpart.match(hostnamePartPattern)) {
              const validParts = hostparts.slice(0, i);
              const notHost = hostparts.slice(i + 1);
              const bit = part.match(hostnamePartStart);
              if (bit) {
                validParts.push(bit[1]);
                notHost.unshift(bit[2]);
              }
              if (notHost.length) {
                rest = notHost.join(".") + rest;
              }
              this.hostname = validParts.join(".");
              break;
            }
          }
        }
      }
      if (this.hostname.length > hostnameMaxLen) {
        this.hostname = "";
      }
      if (ipv6Hostname) {
        this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      }
    }
    const hash = rest.indexOf("#");
    if (hash !== -1) {
      this.hash = rest.substr(hash);
      rest = rest.slice(0, hash);
    }
    const qm = rest.indexOf("?");
    if (qm !== -1) {
      this.search = rest.substr(qm);
      rest = rest.slice(0, qm);
    }
    if (rest) {
      this.pathname = rest;
    }
    if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) {
      this.pathname = "";
    }
    return this;
  };
  Url.prototype.parseHost = function(host) {
    let port = portPattern.exec(host);
    if (port) {
      port = port[0];
      if (port !== ":") {
        this.port = port.substr(1);
      }
      host = host.substr(0, host.length - port.length);
    }
    if (host) {
      this.hostname = host;
    }
  };
  var parse_default = urlParse;

  // node_modules/uc.micro/index.mjs
  var uc_exports = {};
  __export(uc_exports, {
    Any: () => regex_default,
    Cc: () => regex_default2,
    Cf: () => regex_default3,
    P: () => regex_default4,
    S: () => regex_default5,
    Z: () => regex_default6
  });

  // node_modules/uc.micro/properties/Any/regex.mjs
  var regex_default = /[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;

  // node_modules/uc.micro/categories/Cc/regex.mjs
  var regex_default2 = /[\0-\x1F\x7F-\x9F]/;

  // node_modules/uc.micro/categories/Cf/regex.mjs
  var regex_default3 = /[\xAD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD80D[\uDC30-\uDC3F]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/;

  // node_modules/uc.micro/categories/P/regex.mjs
  var regex_default4 = /[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061D-\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C77\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1B7D\u1B7E\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4F\u2E52-\u2E5D\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDEAD\uDF55-\uDF59\uDF86-\uDF89]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9]|\uD805[\uDC4B-\uDC4F\uDC5A\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDEB9\uDF3C-\uDF3E]|\uD806[\uDC3B\uDD44-\uDD46\uDDE2\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2\uDF00-\uDF09]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8\uDF43-\uDF4F\uDFFF]|\uD809[\uDC70-\uDC74]|\uD80B[\uDFF1\uDFF2]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDE97-\uDE9A\uDFE2]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD83A[\uDD5E\uDD5F]/;

  // node_modules/uc.micro/categories/S/regex.mjs
  var regex_default5 = /[\$\+<->\^`\|~\xA2-\xA6\xA8\xA9\xAC\xAE-\xB1\xB4\xB8\xD7\xF7\u02C2-\u02C5\u02D2-\u02DF\u02E5-\u02EB\u02ED\u02EF-\u02FF\u0375\u0384\u0385\u03F6\u0482\u058D-\u058F\u0606-\u0608\u060B\u060E\u060F\u06DE\u06E9\u06FD\u06FE\u07F6\u07FE\u07FF\u0888\u09F2\u09F3\u09FA\u09FB\u0AF1\u0B70\u0BF3-\u0BFA\u0C7F\u0D4F\u0D79\u0E3F\u0F01-\u0F03\u0F13\u0F15-\u0F17\u0F1A-\u0F1F\u0F34\u0F36\u0F38\u0FBE-\u0FC5\u0FC7-\u0FCC\u0FCE\u0FCF\u0FD5-\u0FD8\u109E\u109F\u1390-\u1399\u166D\u17DB\u1940\u19DE-\u19FF\u1B61-\u1B6A\u1B74-\u1B7C\u1FBD\u1FBF-\u1FC1\u1FCD-\u1FCF\u1FDD-\u1FDF\u1FED-\u1FEF\u1FFD\u1FFE\u2044\u2052\u207A-\u207C\u208A-\u208C\u20A0-\u20C0\u2100\u2101\u2103-\u2106\u2108\u2109\u2114\u2116-\u2118\u211E-\u2123\u2125\u2127\u2129\u212E\u213A\u213B\u2140-\u2144\u214A-\u214D\u214F\u218A\u218B\u2190-\u2307\u230C-\u2328\u232B-\u2426\u2440-\u244A\u249C-\u24E9\u2500-\u2767\u2794-\u27C4\u27C7-\u27E5\u27F0-\u2982\u2999-\u29D7\u29DC-\u29FB\u29FE-\u2B73\u2B76-\u2B95\u2B97-\u2BFF\u2CE5-\u2CEA\u2E50\u2E51\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFF\u3004\u3012\u3013\u3020\u3036\u3037\u303E\u303F\u309B\u309C\u3190\u3191\u3196-\u319F\u31C0-\u31E3\u31EF\u3200-\u321E\u322A-\u3247\u3250\u3260-\u327F\u328A-\u32B0\u32C0-\u33FF\u4DC0-\u4DFF\uA490-\uA4C6\uA700-\uA716\uA720\uA721\uA789\uA78A\uA828-\uA82B\uA836-\uA839\uAA77-\uAA79\uAB5B\uAB6A\uAB6B\uFB29\uFBB2-\uFBC2\uFD40-\uFD4F\uFDCF\uFDFC-\uFDFF\uFE62\uFE64-\uFE66\uFE69\uFF04\uFF0B\uFF1C-\uFF1E\uFF3E\uFF40\uFF5C\uFF5E\uFFE0-\uFFE6\uFFE8-\uFFEE\uFFFC\uFFFD]|\uD800[\uDD37-\uDD3F\uDD79-\uDD89\uDD8C-\uDD8E\uDD90-\uDD9C\uDDA0\uDDD0-\uDDFC]|\uD802[\uDC77\uDC78\uDEC8]|\uD805\uDF3F|\uD807[\uDFD5-\uDFF1]|\uD81A[\uDF3C-\uDF3F\uDF45]|\uD82F\uDC9C|\uD833[\uDF50-\uDFC3]|\uD834[\uDC00-\uDCF5\uDD00-\uDD26\uDD29-\uDD64\uDD6A-\uDD6C\uDD83\uDD84\uDD8C-\uDDA9\uDDAE-\uDDEA\uDE00-\uDE41\uDE45\uDF00-\uDF56]|\uD835[\uDEC1\uDEDB\uDEFB\uDF15\uDF35\uDF4F\uDF6F\uDF89\uDFA9\uDFC3]|\uD836[\uDC00-\uDDFF\uDE37-\uDE3A\uDE6D-\uDE74\uDE76-\uDE83\uDE85\uDE86]|\uD838[\uDD4F\uDEFF]|\uD83B[\uDCAC\uDCB0\uDD2E\uDEF0\uDEF1]|\uD83C[\uDC00-\uDC2B\uDC30-\uDC93\uDCA0-\uDCAE\uDCB1-\uDCBF\uDCC1-\uDCCF\uDCD1-\uDCF5\uDD0D-\uDDAD\uDDE6-\uDE02\uDE10-\uDE3B\uDE40-\uDE48\uDE50\uDE51\uDE60-\uDE65\uDF00-\uDFFF]|\uD83D[\uDC00-\uDED7\uDEDC-\uDEEC\uDEF0-\uDEFC\uDF00-\uDF76\uDF7B-\uDFD9\uDFE0-\uDFEB\uDFF0]|\uD83E[\uDC00-\uDC0B\uDC10-\uDC47\uDC50-\uDC59\uDC60-\uDC87\uDC90-\uDCAD\uDCB0\uDCB1\uDD00-\uDE53\uDE60-\uDE6D\uDE70-\uDE7C\uDE80-\uDE88\uDE90-\uDEBD\uDEBF-\uDEC5\uDECE-\uDEDB\uDEE0-\uDEE8\uDEF0-\uDEF8\uDF00-\uDF92\uDF94-\uDFCA]/;

  // node_modules/uc.micro/categories/Z/regex.mjs
  var regex_default6 = /[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;

  // node_modules/entities/lib/esm/generated/decode-data-html.js
  var decode_data_html_default = new Uint16Array(
    // prettier-ignore
    '\u1D41<\xD5\u0131\u028A\u049D\u057B\u05D0\u0675\u06DE\u07A2\u07D6\u080F\u0A4A\u0A91\u0DA1\u0E6D\u0F09\u0F26\u10CA\u1228\u12E1\u1415\u149D\u14C3\u14DF\u1525\0\0\0\0\0\0\u156B\u16CD\u198D\u1C12\u1DDD\u1F7E\u2060\u21B0\u228D\u23C0\u23FB\u2442\u2824\u2912\u2D08\u2E48\u2FCE\u3016\u32BA\u3639\u37AC\u38FE\u3A28\u3A71\u3AE0\u3B2E\u0800EMabcfglmnoprstu\\bfms\x7F\x84\x8B\x90\x95\x98\xA6\xB3\xB9\xC8\xCFlig\u803B\xC6\u40C6P\u803B&\u4026cute\u803B\xC1\u40C1reve;\u4102\u0100iyx}rc\u803B\xC2\u40C2;\u4410r;\uC000\u{1D504}rave\u803B\xC0\u40C0pha;\u4391acr;\u4100d;\u6A53\u0100gp\x9D\xA1on;\u4104f;\uC000\u{1D538}plyFunction;\u6061ing\u803B\xC5\u40C5\u0100cs\xBE\xC3r;\uC000\u{1D49C}ign;\u6254ilde\u803B\xC3\u40C3ml\u803B\xC4\u40C4\u0400aceforsu\xE5\xFB\xFE\u0117\u011C\u0122\u0127\u012A\u0100cr\xEA\xF2kslash;\u6216\u0176\xF6\xF8;\u6AE7ed;\u6306y;\u4411\u0180crt\u0105\u010B\u0114ause;\u6235noullis;\u612Ca;\u4392r;\uC000\u{1D505}pf;\uC000\u{1D539}eve;\u42D8c\xF2\u0113mpeq;\u624E\u0700HOacdefhilorsu\u014D\u0151\u0156\u0180\u019E\u01A2\u01B5\u01B7\u01BA\u01DC\u0215\u0273\u0278\u027Ecy;\u4427PY\u803B\xA9\u40A9\u0180cpy\u015D\u0162\u017Aute;\u4106\u0100;i\u0167\u0168\u62D2talDifferentialD;\u6145leys;\u612D\u0200aeio\u0189\u018E\u0194\u0198ron;\u410Cdil\u803B\xC7\u40C7rc;\u4108nint;\u6230ot;\u410A\u0100dn\u01A7\u01ADilla;\u40B8terDot;\u40B7\xF2\u017Fi;\u43A7rcle\u0200DMPT\u01C7\u01CB\u01D1\u01D6ot;\u6299inus;\u6296lus;\u6295imes;\u6297o\u0100cs\u01E2\u01F8kwiseContourIntegral;\u6232eCurly\u0100DQ\u0203\u020FoubleQuote;\u601Duote;\u6019\u0200lnpu\u021E\u0228\u0247\u0255on\u0100;e\u0225\u0226\u6237;\u6A74\u0180git\u022F\u0236\u023Aruent;\u6261nt;\u622FourIntegral;\u622E\u0100fr\u024C\u024E;\u6102oduct;\u6210nterClockwiseContourIntegral;\u6233oss;\u6A2Fcr;\uC000\u{1D49E}p\u0100;C\u0284\u0285\u62D3ap;\u624D\u0580DJSZacefios\u02A0\u02AC\u02B0\u02B4\u02B8\u02CB\u02D7\u02E1\u02E6\u0333\u048D\u0100;o\u0179\u02A5trahd;\u6911cy;\u4402cy;\u4405cy;\u440F\u0180grs\u02BF\u02C4\u02C7ger;\u6021r;\u61A1hv;\u6AE4\u0100ay\u02D0\u02D5ron;\u410E;\u4414l\u0100;t\u02DD\u02DE\u6207a;\u4394r;\uC000\u{1D507}\u0100af\u02EB\u0327\u0100cm\u02F0\u0322ritical\u0200ADGT\u0300\u0306\u0316\u031Ccute;\u40B4o\u0174\u030B\u030D;\u42D9bleAcute;\u42DDrave;\u4060ilde;\u42DCond;\u62C4ferentialD;\u6146\u0470\u033D\0\0\0\u0342\u0354\0\u0405f;\uC000\u{1D53B}\u0180;DE\u0348\u0349\u034D\u40A8ot;\u60DCqual;\u6250ble\u0300CDLRUV\u0363\u0372\u0382\u03CF\u03E2\u03F8ontourIntegra\xEC\u0239o\u0274\u0379\0\0\u037B\xBB\u0349nArrow;\u61D3\u0100eo\u0387\u03A4ft\u0180ART\u0390\u0396\u03A1rrow;\u61D0ightArrow;\u61D4e\xE5\u02CAng\u0100LR\u03AB\u03C4eft\u0100AR\u03B3\u03B9rrow;\u67F8ightArrow;\u67FAightArrow;\u67F9ight\u0100AT\u03D8\u03DErrow;\u61D2ee;\u62A8p\u0241\u03E9\0\0\u03EFrrow;\u61D1ownArrow;\u61D5erticalBar;\u6225n\u0300ABLRTa\u0412\u042A\u0430\u045E\u047F\u037Crrow\u0180;BU\u041D\u041E\u0422\u6193ar;\u6913pArrow;\u61F5reve;\u4311eft\u02D2\u043A\0\u0446\0\u0450ightVector;\u6950eeVector;\u695Eector\u0100;B\u0459\u045A\u61BDar;\u6956ight\u01D4\u0467\0\u0471eeVector;\u695Fector\u0100;B\u047A\u047B\u61C1ar;\u6957ee\u0100;A\u0486\u0487\u62A4rrow;\u61A7\u0100ct\u0492\u0497r;\uC000\u{1D49F}rok;\u4110\u0800NTacdfglmopqstux\u04BD\u04C0\u04C4\u04CB\u04DE\u04E2\u04E7\u04EE\u04F5\u0521\u052F\u0536\u0552\u055D\u0560\u0565G;\u414AH\u803B\xD0\u40D0cute\u803B\xC9\u40C9\u0180aiy\u04D2\u04D7\u04DCron;\u411Arc\u803B\xCA\u40CA;\u442Dot;\u4116r;\uC000\u{1D508}rave\u803B\xC8\u40C8ement;\u6208\u0100ap\u04FA\u04FEcr;\u4112ty\u0253\u0506\0\0\u0512mallSquare;\u65FBerySmallSquare;\u65AB\u0100gp\u0526\u052Aon;\u4118f;\uC000\u{1D53C}silon;\u4395u\u0100ai\u053C\u0549l\u0100;T\u0542\u0543\u6A75ilde;\u6242librium;\u61CC\u0100ci\u0557\u055Ar;\u6130m;\u6A73a;\u4397ml\u803B\xCB\u40CB\u0100ip\u056A\u056Fsts;\u6203onentialE;\u6147\u0280cfios\u0585\u0588\u058D\u05B2\u05CCy;\u4424r;\uC000\u{1D509}lled\u0253\u0597\0\0\u05A3mallSquare;\u65FCerySmallSquare;\u65AA\u0370\u05BA\0\u05BF\0\0\u05C4f;\uC000\u{1D53D}All;\u6200riertrf;\u6131c\xF2\u05CB\u0600JTabcdfgorst\u05E8\u05EC\u05EF\u05FA\u0600\u0612\u0616\u061B\u061D\u0623\u066C\u0672cy;\u4403\u803B>\u403Emma\u0100;d\u05F7\u05F8\u4393;\u43DCreve;\u411E\u0180eiy\u0607\u060C\u0610dil;\u4122rc;\u411C;\u4413ot;\u4120r;\uC000\u{1D50A};\u62D9pf;\uC000\u{1D53E}eater\u0300EFGLST\u0635\u0644\u064E\u0656\u065B\u0666qual\u0100;L\u063E\u063F\u6265ess;\u62DBullEqual;\u6267reater;\u6AA2ess;\u6277lantEqual;\u6A7Eilde;\u6273cr;\uC000\u{1D4A2};\u626B\u0400Aacfiosu\u0685\u068B\u0696\u069B\u069E\u06AA\u06BE\u06CARDcy;\u442A\u0100ct\u0690\u0694ek;\u42C7;\u405Eirc;\u4124r;\u610ClbertSpace;\u610B\u01F0\u06AF\0\u06B2f;\u610DizontalLine;\u6500\u0100ct\u06C3\u06C5\xF2\u06A9rok;\u4126mp\u0144\u06D0\u06D8ownHum\xF0\u012Fqual;\u624F\u0700EJOacdfgmnostu\u06FA\u06FE\u0703\u0707\u070E\u071A\u071E\u0721\u0728\u0744\u0778\u078B\u078F\u0795cy;\u4415lig;\u4132cy;\u4401cute\u803B\xCD\u40CD\u0100iy\u0713\u0718rc\u803B\xCE\u40CE;\u4418ot;\u4130r;\u6111rave\u803B\xCC\u40CC\u0180;ap\u0720\u072F\u073F\u0100cg\u0734\u0737r;\u412AinaryI;\u6148lie\xF3\u03DD\u01F4\u0749\0\u0762\u0100;e\u074D\u074E\u622C\u0100gr\u0753\u0758ral;\u622Bsection;\u62C2isible\u0100CT\u076C\u0772omma;\u6063imes;\u6062\u0180gpt\u077F\u0783\u0788on;\u412Ef;\uC000\u{1D540}a;\u4399cr;\u6110ilde;\u4128\u01EB\u079A\0\u079Ecy;\u4406l\u803B\xCF\u40CF\u0280cfosu\u07AC\u07B7\u07BC\u07C2\u07D0\u0100iy\u07B1\u07B5rc;\u4134;\u4419r;\uC000\u{1D50D}pf;\uC000\u{1D541}\u01E3\u07C7\0\u07CCr;\uC000\u{1D4A5}rcy;\u4408kcy;\u4404\u0380HJacfos\u07E4\u07E8\u07EC\u07F1\u07FD\u0802\u0808cy;\u4425cy;\u440Cppa;\u439A\u0100ey\u07F6\u07FBdil;\u4136;\u441Ar;\uC000\u{1D50E}pf;\uC000\u{1D542}cr;\uC000\u{1D4A6}\u0580JTaceflmost\u0825\u0829\u082C\u0850\u0863\u09B3\u09B8\u09C7\u09CD\u0A37\u0A47cy;\u4409\u803B<\u403C\u0280cmnpr\u0837\u083C\u0841\u0844\u084Dute;\u4139bda;\u439Bg;\u67EAlacetrf;\u6112r;\u619E\u0180aey\u0857\u085C\u0861ron;\u413Ddil;\u413B;\u441B\u0100fs\u0868\u0970t\u0500ACDFRTUVar\u087E\u08A9\u08B1\u08E0\u08E6\u08FC\u092F\u095B\u0390\u096A\u0100nr\u0883\u088FgleBracket;\u67E8row\u0180;BR\u0899\u089A\u089E\u6190ar;\u61E4ightArrow;\u61C6eiling;\u6308o\u01F5\u08B7\0\u08C3bleBracket;\u67E6n\u01D4\u08C8\0\u08D2eeVector;\u6961ector\u0100;B\u08DB\u08DC\u61C3ar;\u6959loor;\u630Aight\u0100AV\u08EF\u08F5rrow;\u6194ector;\u694E\u0100er\u0901\u0917e\u0180;AV\u0909\u090A\u0910\u62A3rrow;\u61A4ector;\u695Aiangle\u0180;BE\u0924\u0925\u0929\u62B2ar;\u69CFqual;\u62B4p\u0180DTV\u0937\u0942\u094CownVector;\u6951eeVector;\u6960ector\u0100;B\u0956\u0957\u61BFar;\u6958ector\u0100;B\u0965\u0966\u61BCar;\u6952ight\xE1\u039Cs\u0300EFGLST\u097E\u098B\u0995\u099D\u09A2\u09ADqualGreater;\u62DAullEqual;\u6266reater;\u6276ess;\u6AA1lantEqual;\u6A7Dilde;\u6272r;\uC000\u{1D50F}\u0100;e\u09BD\u09BE\u62D8ftarrow;\u61DAidot;\u413F\u0180npw\u09D4\u0A16\u0A1Bg\u0200LRlr\u09DE\u09F7\u0A02\u0A10eft\u0100AR\u09E6\u09ECrrow;\u67F5ightArrow;\u67F7ightArrow;\u67F6eft\u0100ar\u03B3\u0A0Aight\xE1\u03BFight\xE1\u03CAf;\uC000\u{1D543}er\u0100LR\u0A22\u0A2CeftArrow;\u6199ightArrow;\u6198\u0180cht\u0A3E\u0A40\u0A42\xF2\u084C;\u61B0rok;\u4141;\u626A\u0400acefiosu\u0A5A\u0A5D\u0A60\u0A77\u0A7C\u0A85\u0A8B\u0A8Ep;\u6905y;\u441C\u0100dl\u0A65\u0A6FiumSpace;\u605Flintrf;\u6133r;\uC000\u{1D510}nusPlus;\u6213pf;\uC000\u{1D544}c\xF2\u0A76;\u439C\u0480Jacefostu\u0AA3\u0AA7\u0AAD\u0AC0\u0B14\u0B19\u0D91\u0D97\u0D9Ecy;\u440Acute;\u4143\u0180aey\u0AB4\u0AB9\u0ABEron;\u4147dil;\u4145;\u441D\u0180gsw\u0AC7\u0AF0\u0B0Eative\u0180MTV\u0AD3\u0ADF\u0AE8ediumSpace;\u600Bhi\u0100cn\u0AE6\u0AD8\xEB\u0AD9eryThi\xEE\u0AD9ted\u0100GL\u0AF8\u0B06reaterGreate\xF2\u0673essLes\xF3\u0A48Line;\u400Ar;\uC000\u{1D511}\u0200Bnpt\u0B22\u0B28\u0B37\u0B3Areak;\u6060BreakingSpace;\u40A0f;\u6115\u0680;CDEGHLNPRSTV\u0B55\u0B56\u0B6A\u0B7C\u0BA1\u0BEB\u0C04\u0C5E\u0C84\u0CA6\u0CD8\u0D61\u0D85\u6AEC\u0100ou\u0B5B\u0B64ngruent;\u6262pCap;\u626DoubleVerticalBar;\u6226\u0180lqx\u0B83\u0B8A\u0B9Bement;\u6209ual\u0100;T\u0B92\u0B93\u6260ilde;\uC000\u2242\u0338ists;\u6204reater\u0380;EFGLST\u0BB6\u0BB7\u0BBD\u0BC9\u0BD3\u0BD8\u0BE5\u626Fqual;\u6271ullEqual;\uC000\u2267\u0338reater;\uC000\u226B\u0338ess;\u6279lantEqual;\uC000\u2A7E\u0338ilde;\u6275ump\u0144\u0BF2\u0BFDownHump;\uC000\u224E\u0338qual;\uC000\u224F\u0338e\u0100fs\u0C0A\u0C27tTriangle\u0180;BE\u0C1A\u0C1B\u0C21\u62EAar;\uC000\u29CF\u0338qual;\u62ECs\u0300;EGLST\u0C35\u0C36\u0C3C\u0C44\u0C4B\u0C58\u626Equal;\u6270reater;\u6278ess;\uC000\u226A\u0338lantEqual;\uC000\u2A7D\u0338ilde;\u6274ested\u0100GL\u0C68\u0C79reaterGreater;\uC000\u2AA2\u0338essLess;\uC000\u2AA1\u0338recedes\u0180;ES\u0C92\u0C93\u0C9B\u6280qual;\uC000\u2AAF\u0338lantEqual;\u62E0\u0100ei\u0CAB\u0CB9verseElement;\u620CghtTriangle\u0180;BE\u0CCB\u0CCC\u0CD2\u62EBar;\uC000\u29D0\u0338qual;\u62ED\u0100qu\u0CDD\u0D0CuareSu\u0100bp\u0CE8\u0CF9set\u0100;E\u0CF0\u0CF3\uC000\u228F\u0338qual;\u62E2erset\u0100;E\u0D03\u0D06\uC000\u2290\u0338qual;\u62E3\u0180bcp\u0D13\u0D24\u0D4Eset\u0100;E\u0D1B\u0D1E\uC000\u2282\u20D2qual;\u6288ceeds\u0200;EST\u0D32\u0D33\u0D3B\u0D46\u6281qual;\uC000\u2AB0\u0338lantEqual;\u62E1ilde;\uC000\u227F\u0338erset\u0100;E\u0D58\u0D5B\uC000\u2283\u20D2qual;\u6289ilde\u0200;EFT\u0D6E\u0D6F\u0D75\u0D7F\u6241qual;\u6244ullEqual;\u6247ilde;\u6249erticalBar;\u6224cr;\uC000\u{1D4A9}ilde\u803B\xD1\u40D1;\u439D\u0700Eacdfgmoprstuv\u0DBD\u0DC2\u0DC9\u0DD5\u0DDB\u0DE0\u0DE7\u0DFC\u0E02\u0E20\u0E22\u0E32\u0E3F\u0E44lig;\u4152cute\u803B\xD3\u40D3\u0100iy\u0DCE\u0DD3rc\u803B\xD4\u40D4;\u441Eblac;\u4150r;\uC000\u{1D512}rave\u803B\xD2\u40D2\u0180aei\u0DEE\u0DF2\u0DF6cr;\u414Cga;\u43A9cron;\u439Fpf;\uC000\u{1D546}enCurly\u0100DQ\u0E0E\u0E1AoubleQuote;\u601Cuote;\u6018;\u6A54\u0100cl\u0E27\u0E2Cr;\uC000\u{1D4AA}ash\u803B\xD8\u40D8i\u016C\u0E37\u0E3Cde\u803B\xD5\u40D5es;\u6A37ml\u803B\xD6\u40D6er\u0100BP\u0E4B\u0E60\u0100ar\u0E50\u0E53r;\u603Eac\u0100ek\u0E5A\u0E5C;\u63DEet;\u63B4arenthesis;\u63DC\u0480acfhilors\u0E7F\u0E87\u0E8A\u0E8F\u0E92\u0E94\u0E9D\u0EB0\u0EFCrtialD;\u6202y;\u441Fr;\uC000\u{1D513}i;\u43A6;\u43A0usMinus;\u40B1\u0100ip\u0EA2\u0EADncareplan\xE5\u069Df;\u6119\u0200;eio\u0EB9\u0EBA\u0EE0\u0EE4\u6ABBcedes\u0200;EST\u0EC8\u0EC9\u0ECF\u0EDA\u627Aqual;\u6AAFlantEqual;\u627Cilde;\u627Eme;\u6033\u0100dp\u0EE9\u0EEEuct;\u620Fortion\u0100;a\u0225\u0EF9l;\u621D\u0100ci\u0F01\u0F06r;\uC000\u{1D4AB};\u43A8\u0200Ufos\u0F11\u0F16\u0F1B\u0F1FOT\u803B"\u4022r;\uC000\u{1D514}pf;\u611Acr;\uC000\u{1D4AC}\u0600BEacefhiorsu\u0F3E\u0F43\u0F47\u0F60\u0F73\u0FA7\u0FAA\u0FAD\u1096\u10A9\u10B4\u10BEarr;\u6910G\u803B\xAE\u40AE\u0180cnr\u0F4E\u0F53\u0F56ute;\u4154g;\u67EBr\u0100;t\u0F5C\u0F5D\u61A0l;\u6916\u0180aey\u0F67\u0F6C\u0F71ron;\u4158dil;\u4156;\u4420\u0100;v\u0F78\u0F79\u611Cerse\u0100EU\u0F82\u0F99\u0100lq\u0F87\u0F8Eement;\u620Builibrium;\u61CBpEquilibrium;\u696Fr\xBB\u0F79o;\u43A1ght\u0400ACDFTUVa\u0FC1\u0FEB\u0FF3\u1022\u1028\u105B\u1087\u03D8\u0100nr\u0FC6\u0FD2gleBracket;\u67E9row\u0180;BL\u0FDC\u0FDD\u0FE1\u6192ar;\u61E5eftArrow;\u61C4eiling;\u6309o\u01F5\u0FF9\0\u1005bleBracket;\u67E7n\u01D4\u100A\0\u1014eeVector;\u695Dector\u0100;B\u101D\u101E\u61C2ar;\u6955loor;\u630B\u0100er\u102D\u1043e\u0180;AV\u1035\u1036\u103C\u62A2rrow;\u61A6ector;\u695Biangle\u0180;BE\u1050\u1051\u1055\u62B3ar;\u69D0qual;\u62B5p\u0180DTV\u1063\u106E\u1078ownVector;\u694FeeVector;\u695Cector\u0100;B\u1082\u1083\u61BEar;\u6954ector\u0100;B\u1091\u1092\u61C0ar;\u6953\u0100pu\u109B\u109Ef;\u611DndImplies;\u6970ightarrow;\u61DB\u0100ch\u10B9\u10BCr;\u611B;\u61B1leDelayed;\u69F4\u0680HOacfhimoqstu\u10E4\u10F1\u10F7\u10FD\u1119\u111E\u1151\u1156\u1161\u1167\u11B5\u11BB\u11BF\u0100Cc\u10E9\u10EEHcy;\u4429y;\u4428FTcy;\u442Ccute;\u415A\u0280;aeiy\u1108\u1109\u110E\u1113\u1117\u6ABCron;\u4160dil;\u415Erc;\u415C;\u4421r;\uC000\u{1D516}ort\u0200DLRU\u112A\u1134\u113E\u1149ownArrow\xBB\u041EeftArrow\xBB\u089AightArrow\xBB\u0FDDpArrow;\u6191gma;\u43A3allCircle;\u6218pf;\uC000\u{1D54A}\u0272\u116D\0\0\u1170t;\u621Aare\u0200;ISU\u117B\u117C\u1189\u11AF\u65A1ntersection;\u6293u\u0100bp\u118F\u119Eset\u0100;E\u1197\u1198\u628Fqual;\u6291erset\u0100;E\u11A8\u11A9\u6290qual;\u6292nion;\u6294cr;\uC000\u{1D4AE}ar;\u62C6\u0200bcmp\u11C8\u11DB\u1209\u120B\u0100;s\u11CD\u11CE\u62D0et\u0100;E\u11CD\u11D5qual;\u6286\u0100ch\u11E0\u1205eeds\u0200;EST\u11ED\u11EE\u11F4\u11FF\u627Bqual;\u6AB0lantEqual;\u627Dilde;\u627FTh\xE1\u0F8C;\u6211\u0180;es\u1212\u1213\u1223\u62D1rset\u0100;E\u121C\u121D\u6283qual;\u6287et\xBB\u1213\u0580HRSacfhiors\u123E\u1244\u1249\u1255\u125E\u1271\u1276\u129F\u12C2\u12C8\u12D1ORN\u803B\xDE\u40DEADE;\u6122\u0100Hc\u124E\u1252cy;\u440By;\u4426\u0100bu\u125A\u125C;\u4009;\u43A4\u0180aey\u1265\u126A\u126Fron;\u4164dil;\u4162;\u4422r;\uC000\u{1D517}\u0100ei\u127B\u1289\u01F2\u1280\0\u1287efore;\u6234a;\u4398\u0100cn\u128E\u1298kSpace;\uC000\u205F\u200ASpace;\u6009lde\u0200;EFT\u12AB\u12AC\u12B2\u12BC\u623Cqual;\u6243ullEqual;\u6245ilde;\u6248pf;\uC000\u{1D54B}ipleDot;\u60DB\u0100ct\u12D6\u12DBr;\uC000\u{1D4AF}rok;\u4166\u0AE1\u12F7\u130E\u131A\u1326\0\u132C\u1331\0\0\0\0\0\u1338\u133D\u1377\u1385\0\u13FF\u1404\u140A\u1410\u0100cr\u12FB\u1301ute\u803B\xDA\u40DAr\u0100;o\u1307\u1308\u619Fcir;\u6949r\u01E3\u1313\0\u1316y;\u440Eve;\u416C\u0100iy\u131E\u1323rc\u803B\xDB\u40DB;\u4423blac;\u4170r;\uC000\u{1D518}rave\u803B\xD9\u40D9acr;\u416A\u0100di\u1341\u1369er\u0100BP\u1348\u135D\u0100ar\u134D\u1350r;\u405Fac\u0100ek\u1357\u1359;\u63DFet;\u63B5arenthesis;\u63DDon\u0100;P\u1370\u1371\u62C3lus;\u628E\u0100gp\u137B\u137Fon;\u4172f;\uC000\u{1D54C}\u0400ADETadps\u1395\u13AE\u13B8\u13C4\u03E8\u13D2\u13D7\u13F3rrow\u0180;BD\u1150\u13A0\u13A4ar;\u6912ownArrow;\u61C5ownArrow;\u6195quilibrium;\u696Eee\u0100;A\u13CB\u13CC\u62A5rrow;\u61A5own\xE1\u03F3er\u0100LR\u13DE\u13E8eftArrow;\u6196ightArrow;\u6197i\u0100;l\u13F9\u13FA\u43D2on;\u43A5ing;\u416Ecr;\uC000\u{1D4B0}ilde;\u4168ml\u803B\xDC\u40DC\u0480Dbcdefosv\u1427\u142C\u1430\u1433\u143E\u1485\u148A\u1490\u1496ash;\u62ABar;\u6AEBy;\u4412ash\u0100;l\u143B\u143C\u62A9;\u6AE6\u0100er\u1443\u1445;\u62C1\u0180bty\u144C\u1450\u147Aar;\u6016\u0100;i\u144F\u1455cal\u0200BLST\u1461\u1465\u146A\u1474ar;\u6223ine;\u407Ceparator;\u6758ilde;\u6240ThinSpace;\u600Ar;\uC000\u{1D519}pf;\uC000\u{1D54D}cr;\uC000\u{1D4B1}dash;\u62AA\u0280cefos\u14A7\u14AC\u14B1\u14B6\u14BCirc;\u4174dge;\u62C0r;\uC000\u{1D51A}pf;\uC000\u{1D54E}cr;\uC000\u{1D4B2}\u0200fios\u14CB\u14D0\u14D2\u14D8r;\uC000\u{1D51B};\u439Epf;\uC000\u{1D54F}cr;\uC000\u{1D4B3}\u0480AIUacfosu\u14F1\u14F5\u14F9\u14FD\u1504\u150F\u1514\u151A\u1520cy;\u442Fcy;\u4407cy;\u442Ecute\u803B\xDD\u40DD\u0100iy\u1509\u150Drc;\u4176;\u442Br;\uC000\u{1D51C}pf;\uC000\u{1D550}cr;\uC000\u{1D4B4}ml;\u4178\u0400Hacdefos\u1535\u1539\u153F\u154B\u154F\u155D\u1560\u1564cy;\u4416cute;\u4179\u0100ay\u1544\u1549ron;\u417D;\u4417ot;\u417B\u01F2\u1554\0\u155BoWidt\xE8\u0AD9a;\u4396r;\u6128pf;\u6124cr;\uC000\u{1D4B5}\u0BE1\u1583\u158A\u1590\0\u15B0\u15B6\u15BF\0\0\0\0\u15C6\u15DB\u15EB\u165F\u166D\0\u1695\u169B\u16B2\u16B9\0\u16BEcute\u803B\xE1\u40E1reve;\u4103\u0300;Ediuy\u159C\u159D\u15A1\u15A3\u15A8\u15AD\u623E;\uC000\u223E\u0333;\u623Frc\u803B\xE2\u40E2te\u80BB\xB4\u0306;\u4430lig\u803B\xE6\u40E6\u0100;r\xB2\u15BA;\uC000\u{1D51E}rave\u803B\xE0\u40E0\u0100ep\u15CA\u15D6\u0100fp\u15CF\u15D4sym;\u6135\xE8\u15D3ha;\u43B1\u0100ap\u15DFc\u0100cl\u15E4\u15E7r;\u4101g;\u6A3F\u0264\u15F0\0\0\u160A\u0280;adsv\u15FA\u15FB\u15FF\u1601\u1607\u6227nd;\u6A55;\u6A5Clope;\u6A58;\u6A5A\u0380;elmrsz\u1618\u1619\u161B\u161E\u163F\u164F\u1659\u6220;\u69A4e\xBB\u1619sd\u0100;a\u1625\u1626\u6221\u0461\u1630\u1632\u1634\u1636\u1638\u163A\u163C\u163E;\u69A8;\u69A9;\u69AA;\u69AB;\u69AC;\u69AD;\u69AE;\u69AFt\u0100;v\u1645\u1646\u621Fb\u0100;d\u164C\u164D\u62BE;\u699D\u0100pt\u1654\u1657h;\u6222\xBB\xB9arr;\u637C\u0100gp\u1663\u1667on;\u4105f;\uC000\u{1D552}\u0380;Eaeiop\u12C1\u167B\u167D\u1682\u1684\u1687\u168A;\u6A70cir;\u6A6F;\u624Ad;\u624Bs;\u4027rox\u0100;e\u12C1\u1692\xF1\u1683ing\u803B\xE5\u40E5\u0180cty\u16A1\u16A6\u16A8r;\uC000\u{1D4B6};\u402Amp\u0100;e\u12C1\u16AF\xF1\u0288ilde\u803B\xE3\u40E3ml\u803B\xE4\u40E4\u0100ci\u16C2\u16C8onin\xF4\u0272nt;\u6A11\u0800Nabcdefiklnoprsu\u16ED\u16F1\u1730\u173C\u1743\u1748\u1778\u177D\u17E0\u17E6\u1839\u1850\u170D\u193D\u1948\u1970ot;\u6AED\u0100cr\u16F6\u171Ek\u0200ceps\u1700\u1705\u170D\u1713ong;\u624Cpsilon;\u43F6rime;\u6035im\u0100;e\u171A\u171B\u623Dq;\u62CD\u0176\u1722\u1726ee;\u62BDed\u0100;g\u172C\u172D\u6305e\xBB\u172Drk\u0100;t\u135C\u1737brk;\u63B6\u0100oy\u1701\u1741;\u4431quo;\u601E\u0280cmprt\u1753\u175B\u1761\u1764\u1768aus\u0100;e\u010A\u0109ptyv;\u69B0s\xE9\u170Cno\xF5\u0113\u0180ahw\u176F\u1771\u1773;\u43B2;\u6136een;\u626Cr;\uC000\u{1D51F}g\u0380costuvw\u178D\u179D\u17B3\u17C1\u17D5\u17DB\u17DE\u0180aiu\u1794\u1796\u179A\xF0\u0760rc;\u65EFp\xBB\u1371\u0180dpt\u17A4\u17A8\u17ADot;\u6A00lus;\u6A01imes;\u6A02\u0271\u17B9\0\0\u17BEcup;\u6A06ar;\u6605riangle\u0100du\u17CD\u17D2own;\u65BDp;\u65B3plus;\u6A04e\xE5\u1444\xE5\u14ADarow;\u690D\u0180ako\u17ED\u1826\u1835\u0100cn\u17F2\u1823k\u0180lst\u17FA\u05AB\u1802ozenge;\u69EBriangle\u0200;dlr\u1812\u1813\u1818\u181D\u65B4own;\u65BEeft;\u65C2ight;\u65B8k;\u6423\u01B1\u182B\0\u1833\u01B2\u182F\0\u1831;\u6592;\u65914;\u6593ck;\u6588\u0100eo\u183E\u184D\u0100;q\u1843\u1846\uC000=\u20E5uiv;\uC000\u2261\u20E5t;\u6310\u0200ptwx\u1859\u185E\u1867\u186Cf;\uC000\u{1D553}\u0100;t\u13CB\u1863om\xBB\u13CCtie;\u62C8\u0600DHUVbdhmptuv\u1885\u1896\u18AA\u18BB\u18D7\u18DB\u18EC\u18FF\u1905\u190A\u1910\u1921\u0200LRlr\u188E\u1890\u1892\u1894;\u6557;\u6554;\u6556;\u6553\u0280;DUdu\u18A1\u18A2\u18A4\u18A6\u18A8\u6550;\u6566;\u6569;\u6564;\u6567\u0200LRlr\u18B3\u18B5\u18B7\u18B9;\u655D;\u655A;\u655C;\u6559\u0380;HLRhlr\u18CA\u18CB\u18CD\u18CF\u18D1\u18D3\u18D5\u6551;\u656C;\u6563;\u6560;\u656B;\u6562;\u655Fox;\u69C9\u0200LRlr\u18E4\u18E6\u18E8\u18EA;\u6555;\u6552;\u6510;\u650C\u0280;DUdu\u06BD\u18F7\u18F9\u18FB\u18FD;\u6565;\u6568;\u652C;\u6534inus;\u629Flus;\u629Eimes;\u62A0\u0200LRlr\u1919\u191B\u191D\u191F;\u655B;\u6558;\u6518;\u6514\u0380;HLRhlr\u1930\u1931\u1933\u1935\u1937\u1939\u193B\u6502;\u656A;\u6561;\u655E;\u653C;\u6524;\u651C\u0100ev\u0123\u1942bar\u803B\xA6\u40A6\u0200ceio\u1951\u1956\u195A\u1960r;\uC000\u{1D4B7}mi;\u604Fm\u0100;e\u171A\u171Cl\u0180;bh\u1968\u1969\u196B\u405C;\u69C5sub;\u67C8\u016C\u1974\u197El\u0100;e\u1979\u197A\u6022t\xBB\u197Ap\u0180;Ee\u012F\u1985\u1987;\u6AAE\u0100;q\u06DC\u06DB\u0CE1\u19A7\0\u19E8\u1A11\u1A15\u1A32\0\u1A37\u1A50\0\0\u1AB4\0\0\u1AC1\0\0\u1B21\u1B2E\u1B4D\u1B52\0\u1BFD\0\u1C0C\u0180cpr\u19AD\u19B2\u19DDute;\u4107\u0300;abcds\u19BF\u19C0\u19C4\u19CA\u19D5\u19D9\u6229nd;\u6A44rcup;\u6A49\u0100au\u19CF\u19D2p;\u6A4Bp;\u6A47ot;\u6A40;\uC000\u2229\uFE00\u0100eo\u19E2\u19E5t;\u6041\xEE\u0693\u0200aeiu\u19F0\u19FB\u1A01\u1A05\u01F0\u19F5\0\u19F8s;\u6A4Don;\u410Ddil\u803B\xE7\u40E7rc;\u4109ps\u0100;s\u1A0C\u1A0D\u6A4Cm;\u6A50ot;\u410B\u0180dmn\u1A1B\u1A20\u1A26il\u80BB\xB8\u01ADptyv;\u69B2t\u8100\xA2;e\u1A2D\u1A2E\u40A2r\xE4\u01B2r;\uC000\u{1D520}\u0180cei\u1A3D\u1A40\u1A4Dy;\u4447ck\u0100;m\u1A47\u1A48\u6713ark\xBB\u1A48;\u43C7r\u0380;Ecefms\u1A5F\u1A60\u1A62\u1A6B\u1AA4\u1AAA\u1AAE\u65CB;\u69C3\u0180;el\u1A69\u1A6A\u1A6D\u42C6q;\u6257e\u0261\u1A74\0\0\u1A88rrow\u0100lr\u1A7C\u1A81eft;\u61BAight;\u61BB\u0280RSacd\u1A92\u1A94\u1A96\u1A9A\u1A9F\xBB\u0F47;\u64C8st;\u629Birc;\u629Aash;\u629Dnint;\u6A10id;\u6AEFcir;\u69C2ubs\u0100;u\u1ABB\u1ABC\u6663it\xBB\u1ABC\u02EC\u1AC7\u1AD4\u1AFA\0\u1B0Aon\u0100;e\u1ACD\u1ACE\u403A\u0100;q\xC7\xC6\u026D\u1AD9\0\0\u1AE2a\u0100;t\u1ADE\u1ADF\u402C;\u4040\u0180;fl\u1AE8\u1AE9\u1AEB\u6201\xEE\u1160e\u0100mx\u1AF1\u1AF6ent\xBB\u1AE9e\xF3\u024D\u01E7\u1AFE\0\u1B07\u0100;d\u12BB\u1B02ot;\u6A6Dn\xF4\u0246\u0180fry\u1B10\u1B14\u1B17;\uC000\u{1D554}o\xE4\u0254\u8100\xA9;s\u0155\u1B1Dr;\u6117\u0100ao\u1B25\u1B29rr;\u61B5ss;\u6717\u0100cu\u1B32\u1B37r;\uC000\u{1D4B8}\u0100bp\u1B3C\u1B44\u0100;e\u1B41\u1B42\u6ACF;\u6AD1\u0100;e\u1B49\u1B4A\u6AD0;\u6AD2dot;\u62EF\u0380delprvw\u1B60\u1B6C\u1B77\u1B82\u1BAC\u1BD4\u1BF9arr\u0100lr\u1B68\u1B6A;\u6938;\u6935\u0270\u1B72\0\0\u1B75r;\u62DEc;\u62DFarr\u0100;p\u1B7F\u1B80\u61B6;\u693D\u0300;bcdos\u1B8F\u1B90\u1B96\u1BA1\u1BA5\u1BA8\u622Arcap;\u6A48\u0100au\u1B9B\u1B9Ep;\u6A46p;\u6A4Aot;\u628Dr;\u6A45;\uC000\u222A\uFE00\u0200alrv\u1BB5\u1BBF\u1BDE\u1BE3rr\u0100;m\u1BBC\u1BBD\u61B7;\u693Cy\u0180evw\u1BC7\u1BD4\u1BD8q\u0270\u1BCE\0\0\u1BD2re\xE3\u1B73u\xE3\u1B75ee;\u62CEedge;\u62CFen\u803B\xA4\u40A4earrow\u0100lr\u1BEE\u1BF3eft\xBB\u1B80ight\xBB\u1BBDe\xE4\u1BDD\u0100ci\u1C01\u1C07onin\xF4\u01F7nt;\u6231lcty;\u632D\u0980AHabcdefhijlorstuwz\u1C38\u1C3B\u1C3F\u1C5D\u1C69\u1C75\u1C8A\u1C9E\u1CAC\u1CB7\u1CFB\u1CFF\u1D0D\u1D7B\u1D91\u1DAB\u1DBB\u1DC6\u1DCDr\xF2\u0381ar;\u6965\u0200glrs\u1C48\u1C4D\u1C52\u1C54ger;\u6020eth;\u6138\xF2\u1133h\u0100;v\u1C5A\u1C5B\u6010\xBB\u090A\u016B\u1C61\u1C67arow;\u690Fa\xE3\u0315\u0100ay\u1C6E\u1C73ron;\u410F;\u4434\u0180;ao\u0332\u1C7C\u1C84\u0100gr\u02BF\u1C81r;\u61CAtseq;\u6A77\u0180glm\u1C91\u1C94\u1C98\u803B\xB0\u40B0ta;\u43B4ptyv;\u69B1\u0100ir\u1CA3\u1CA8sht;\u697F;\uC000\u{1D521}ar\u0100lr\u1CB3\u1CB5\xBB\u08DC\xBB\u101E\u0280aegsv\u1CC2\u0378\u1CD6\u1CDC\u1CE0m\u0180;os\u0326\u1CCA\u1CD4nd\u0100;s\u0326\u1CD1uit;\u6666amma;\u43DDin;\u62F2\u0180;io\u1CE7\u1CE8\u1CF8\u40F7de\u8100\xF7;o\u1CE7\u1CF0ntimes;\u62C7n\xF8\u1CF7cy;\u4452c\u026F\u1D06\0\0\u1D0Arn;\u631Eop;\u630D\u0280lptuw\u1D18\u1D1D\u1D22\u1D49\u1D55lar;\u4024f;\uC000\u{1D555}\u0280;emps\u030B\u1D2D\u1D37\u1D3D\u1D42q\u0100;d\u0352\u1D33ot;\u6251inus;\u6238lus;\u6214quare;\u62A1blebarwedg\xE5\xFAn\u0180adh\u112E\u1D5D\u1D67ownarrow\xF3\u1C83arpoon\u0100lr\u1D72\u1D76ef\xF4\u1CB4igh\xF4\u1CB6\u0162\u1D7F\u1D85karo\xF7\u0F42\u026F\u1D8A\0\0\u1D8Ern;\u631Fop;\u630C\u0180cot\u1D98\u1DA3\u1DA6\u0100ry\u1D9D\u1DA1;\uC000\u{1D4B9};\u4455l;\u69F6rok;\u4111\u0100dr\u1DB0\u1DB4ot;\u62F1i\u0100;f\u1DBA\u1816\u65BF\u0100ah\u1DC0\u1DC3r\xF2\u0429a\xF2\u0FA6angle;\u69A6\u0100ci\u1DD2\u1DD5y;\u445Fgrarr;\u67FF\u0900Dacdefglmnopqrstux\u1E01\u1E09\u1E19\u1E38\u0578\u1E3C\u1E49\u1E61\u1E7E\u1EA5\u1EAF\u1EBD\u1EE1\u1F2A\u1F37\u1F44\u1F4E\u1F5A\u0100Do\u1E06\u1D34o\xF4\u1C89\u0100cs\u1E0E\u1E14ute\u803B\xE9\u40E9ter;\u6A6E\u0200aioy\u1E22\u1E27\u1E31\u1E36ron;\u411Br\u0100;c\u1E2D\u1E2E\u6256\u803B\xEA\u40EAlon;\u6255;\u444Dot;\u4117\u0100Dr\u1E41\u1E45ot;\u6252;\uC000\u{1D522}\u0180;rs\u1E50\u1E51\u1E57\u6A9Aave\u803B\xE8\u40E8\u0100;d\u1E5C\u1E5D\u6A96ot;\u6A98\u0200;ils\u1E6A\u1E6B\u1E72\u1E74\u6A99nters;\u63E7;\u6113\u0100;d\u1E79\u1E7A\u6A95ot;\u6A97\u0180aps\u1E85\u1E89\u1E97cr;\u4113ty\u0180;sv\u1E92\u1E93\u1E95\u6205et\xBB\u1E93p\u01001;\u1E9D\u1EA4\u0133\u1EA1\u1EA3;\u6004;\u6005\u6003\u0100gs\u1EAA\u1EAC;\u414Bp;\u6002\u0100gp\u1EB4\u1EB8on;\u4119f;\uC000\u{1D556}\u0180als\u1EC4\u1ECE\u1ED2r\u0100;s\u1ECA\u1ECB\u62D5l;\u69E3us;\u6A71i\u0180;lv\u1EDA\u1EDB\u1EDF\u43B5on\xBB\u1EDB;\u43F5\u0200csuv\u1EEA\u1EF3\u1F0B\u1F23\u0100io\u1EEF\u1E31rc\xBB\u1E2E\u0269\u1EF9\0\0\u1EFB\xED\u0548ant\u0100gl\u1F02\u1F06tr\xBB\u1E5Dess\xBB\u1E7A\u0180aei\u1F12\u1F16\u1F1Als;\u403Dst;\u625Fv\u0100;D\u0235\u1F20D;\u6A78parsl;\u69E5\u0100Da\u1F2F\u1F33ot;\u6253rr;\u6971\u0180cdi\u1F3E\u1F41\u1EF8r;\u612Fo\xF4\u0352\u0100ah\u1F49\u1F4B;\u43B7\u803B\xF0\u40F0\u0100mr\u1F53\u1F57l\u803B\xEB\u40EBo;\u60AC\u0180cip\u1F61\u1F64\u1F67l;\u4021s\xF4\u056E\u0100eo\u1F6C\u1F74ctatio\xEE\u0559nential\xE5\u0579\u09E1\u1F92\0\u1F9E\0\u1FA1\u1FA7\0\0\u1FC6\u1FCC\0\u1FD3\0\u1FE6\u1FEA\u2000\0\u2008\u205Allingdotse\xF1\u1E44y;\u4444male;\u6640\u0180ilr\u1FAD\u1FB3\u1FC1lig;\u8000\uFB03\u0269\u1FB9\0\0\u1FBDg;\u8000\uFB00ig;\u8000\uFB04;\uC000\u{1D523}lig;\u8000\uFB01lig;\uC000fj\u0180alt\u1FD9\u1FDC\u1FE1t;\u666Dig;\u8000\uFB02ns;\u65B1of;\u4192\u01F0\u1FEE\0\u1FF3f;\uC000\u{1D557}\u0100ak\u05BF\u1FF7\u0100;v\u1FFC\u1FFD\u62D4;\u6AD9artint;\u6A0D\u0100ao\u200C\u2055\u0100cs\u2011\u2052\u03B1\u201A\u2030\u2038\u2045\u2048\0\u2050\u03B2\u2022\u2025\u2027\u202A\u202C\0\u202E\u803B\xBD\u40BD;\u6153\u803B\xBC\u40BC;\u6155;\u6159;\u615B\u01B3\u2034\0\u2036;\u6154;\u6156\u02B4\u203E\u2041\0\0\u2043\u803B\xBE\u40BE;\u6157;\u615C5;\u6158\u01B6\u204C\0\u204E;\u615A;\u615D8;\u615El;\u6044wn;\u6322cr;\uC000\u{1D4BB}\u0880Eabcdefgijlnorstv\u2082\u2089\u209F\u20A5\u20B0\u20B4\u20F0\u20F5\u20FA\u20FF\u2103\u2112\u2138\u0317\u213E\u2152\u219E\u0100;l\u064D\u2087;\u6A8C\u0180cmp\u2090\u2095\u209Dute;\u41F5ma\u0100;d\u209C\u1CDA\u43B3;\u6A86reve;\u411F\u0100iy\u20AA\u20AErc;\u411D;\u4433ot;\u4121\u0200;lqs\u063E\u0642\u20BD\u20C9\u0180;qs\u063E\u064C\u20C4lan\xF4\u0665\u0200;cdl\u0665\u20D2\u20D5\u20E5c;\u6AA9ot\u0100;o\u20DC\u20DD\u6A80\u0100;l\u20E2\u20E3\u6A82;\u6A84\u0100;e\u20EA\u20ED\uC000\u22DB\uFE00s;\u6A94r;\uC000\u{1D524}\u0100;g\u0673\u061Bmel;\u6137cy;\u4453\u0200;Eaj\u065A\u210C\u210E\u2110;\u6A92;\u6AA5;\u6AA4\u0200Eaes\u211B\u211D\u2129\u2134;\u6269p\u0100;p\u2123\u2124\u6A8Arox\xBB\u2124\u0100;q\u212E\u212F\u6A88\u0100;q\u212E\u211Bim;\u62E7pf;\uC000\u{1D558}\u0100ci\u2143\u2146r;\u610Am\u0180;el\u066B\u214E\u2150;\u6A8E;\u6A90\u8300>;cdlqr\u05EE\u2160\u216A\u216E\u2173\u2179\u0100ci\u2165\u2167;\u6AA7r;\u6A7Aot;\u62D7Par;\u6995uest;\u6A7C\u0280adels\u2184\u216A\u2190\u0656\u219B\u01F0\u2189\0\u218Epro\xF8\u209Er;\u6978q\u0100lq\u063F\u2196les\xF3\u2088i\xED\u066B\u0100en\u21A3\u21ADrtneqq;\uC000\u2269\uFE00\xC5\u21AA\u0500Aabcefkosy\u21C4\u21C7\u21F1\u21F5\u21FA\u2218\u221D\u222F\u2268\u227Dr\xF2\u03A0\u0200ilmr\u21D0\u21D4\u21D7\u21DBrs\xF0\u1484f\xBB\u2024il\xF4\u06A9\u0100dr\u21E0\u21E4cy;\u444A\u0180;cw\u08F4\u21EB\u21EFir;\u6948;\u61ADar;\u610Firc;\u4125\u0180alr\u2201\u220E\u2213rts\u0100;u\u2209\u220A\u6665it\xBB\u220Alip;\u6026con;\u62B9r;\uC000\u{1D525}s\u0100ew\u2223\u2229arow;\u6925arow;\u6926\u0280amopr\u223A\u223E\u2243\u225E\u2263rr;\u61FFtht;\u623Bk\u0100lr\u2249\u2253eftarrow;\u61A9ightarrow;\u61AAf;\uC000\u{1D559}bar;\u6015\u0180clt\u226F\u2274\u2278r;\uC000\u{1D4BD}as\xE8\u21F4rok;\u4127\u0100bp\u2282\u2287ull;\u6043hen\xBB\u1C5B\u0AE1\u22A3\0\u22AA\0\u22B8\u22C5\u22CE\0\u22D5\u22F3\0\0\u22F8\u2322\u2367\u2362\u237F\0\u2386\u23AA\u23B4cute\u803B\xED\u40ED\u0180;iy\u0771\u22B0\u22B5rc\u803B\xEE\u40EE;\u4438\u0100cx\u22BC\u22BFy;\u4435cl\u803B\xA1\u40A1\u0100fr\u039F\u22C9;\uC000\u{1D526}rave\u803B\xEC\u40EC\u0200;ino\u073E\u22DD\u22E9\u22EE\u0100in\u22E2\u22E6nt;\u6A0Ct;\u622Dfin;\u69DCta;\u6129lig;\u4133\u0180aop\u22FE\u231A\u231D\u0180cgt\u2305\u2308\u2317r;\u412B\u0180elp\u071F\u230F\u2313in\xE5\u078Ear\xF4\u0720h;\u4131f;\u62B7ed;\u41B5\u0280;cfot\u04F4\u232C\u2331\u233D\u2341are;\u6105in\u0100;t\u2338\u2339\u621Eie;\u69DDdo\xF4\u2319\u0280;celp\u0757\u234C\u2350\u235B\u2361al;\u62BA\u0100gr\u2355\u2359er\xF3\u1563\xE3\u234Darhk;\u6A17rod;\u6A3C\u0200cgpt\u236F\u2372\u2376\u237By;\u4451on;\u412Ff;\uC000\u{1D55A}a;\u43B9uest\u803B\xBF\u40BF\u0100ci\u238A\u238Fr;\uC000\u{1D4BE}n\u0280;Edsv\u04F4\u239B\u239D\u23A1\u04F3;\u62F9ot;\u62F5\u0100;v\u23A6\u23A7\u62F4;\u62F3\u0100;i\u0777\u23AElde;\u4129\u01EB\u23B8\0\u23BCcy;\u4456l\u803B\xEF\u40EF\u0300cfmosu\u23CC\u23D7\u23DC\u23E1\u23E7\u23F5\u0100iy\u23D1\u23D5rc;\u4135;\u4439r;\uC000\u{1D527}ath;\u4237pf;\uC000\u{1D55B}\u01E3\u23EC\0\u23F1r;\uC000\u{1D4BF}rcy;\u4458kcy;\u4454\u0400acfghjos\u240B\u2416\u2422\u2427\u242D\u2431\u2435\u243Bppa\u0100;v\u2413\u2414\u43BA;\u43F0\u0100ey\u241B\u2420dil;\u4137;\u443Ar;\uC000\u{1D528}reen;\u4138cy;\u4445cy;\u445Cpf;\uC000\u{1D55C}cr;\uC000\u{1D4C0}\u0B80ABEHabcdefghjlmnoprstuv\u2470\u2481\u2486\u248D\u2491\u250E\u253D\u255A\u2580\u264E\u265E\u2665\u2679\u267D\u269A\u26B2\u26D8\u275D\u2768\u278B\u27C0\u2801\u2812\u0180art\u2477\u247A\u247Cr\xF2\u09C6\xF2\u0395ail;\u691Barr;\u690E\u0100;g\u0994\u248B;\u6A8Bar;\u6962\u0963\u24A5\0\u24AA\0\u24B1\0\0\0\0\0\u24B5\u24BA\0\u24C6\u24C8\u24CD\0\u24F9ute;\u413Amptyv;\u69B4ra\xEE\u084Cbda;\u43BBg\u0180;dl\u088E\u24C1\u24C3;\u6991\xE5\u088E;\u6A85uo\u803B\xAB\u40ABr\u0400;bfhlpst\u0899\u24DE\u24E6\u24E9\u24EB\u24EE\u24F1\u24F5\u0100;f\u089D\u24E3s;\u691Fs;\u691D\xEB\u2252p;\u61ABl;\u6939im;\u6973l;\u61A2\u0180;ae\u24FF\u2500\u2504\u6AABil;\u6919\u0100;s\u2509\u250A\u6AAD;\uC000\u2AAD\uFE00\u0180abr\u2515\u2519\u251Drr;\u690Crk;\u6772\u0100ak\u2522\u252Cc\u0100ek\u2528\u252A;\u407B;\u405B\u0100es\u2531\u2533;\u698Bl\u0100du\u2539\u253B;\u698F;\u698D\u0200aeuy\u2546\u254B\u2556\u2558ron;\u413E\u0100di\u2550\u2554il;\u413C\xEC\u08B0\xE2\u2529;\u443B\u0200cqrs\u2563\u2566\u256D\u257Da;\u6936uo\u0100;r\u0E19\u1746\u0100du\u2572\u2577har;\u6967shar;\u694Bh;\u61B2\u0280;fgqs\u258B\u258C\u0989\u25F3\u25FF\u6264t\u0280ahlrt\u2598\u25A4\u25B7\u25C2\u25E8rrow\u0100;t\u0899\u25A1a\xE9\u24F6arpoon\u0100du\u25AF\u25B4own\xBB\u045Ap\xBB\u0966eftarrows;\u61C7ight\u0180ahs\u25CD\u25D6\u25DErrow\u0100;s\u08F4\u08A7arpoon\xF3\u0F98quigarro\xF7\u21F0hreetimes;\u62CB\u0180;qs\u258B\u0993\u25FAlan\xF4\u09AC\u0280;cdgs\u09AC\u260A\u260D\u261D\u2628c;\u6AA8ot\u0100;o\u2614\u2615\u6A7F\u0100;r\u261A\u261B\u6A81;\u6A83\u0100;e\u2622\u2625\uC000\u22DA\uFE00s;\u6A93\u0280adegs\u2633\u2639\u263D\u2649\u264Bppro\xF8\u24C6ot;\u62D6q\u0100gq\u2643\u2645\xF4\u0989gt\xF2\u248C\xF4\u099Bi\xED\u09B2\u0180ilr\u2655\u08E1\u265Asht;\u697C;\uC000\u{1D529}\u0100;E\u099C\u2663;\u6A91\u0161\u2669\u2676r\u0100du\u25B2\u266E\u0100;l\u0965\u2673;\u696Alk;\u6584cy;\u4459\u0280;acht\u0A48\u2688\u268B\u2691\u2696r\xF2\u25C1orne\xF2\u1D08ard;\u696Bri;\u65FA\u0100io\u269F\u26A4dot;\u4140ust\u0100;a\u26AC\u26AD\u63B0che\xBB\u26AD\u0200Eaes\u26BB\u26BD\u26C9\u26D4;\u6268p\u0100;p\u26C3\u26C4\u6A89rox\xBB\u26C4\u0100;q\u26CE\u26CF\u6A87\u0100;q\u26CE\u26BBim;\u62E6\u0400abnoptwz\u26E9\u26F4\u26F7\u271A\u272F\u2741\u2747\u2750\u0100nr\u26EE\u26F1g;\u67ECr;\u61FDr\xEB\u08C1g\u0180lmr\u26FF\u270D\u2714eft\u0100ar\u09E6\u2707ight\xE1\u09F2apsto;\u67FCight\xE1\u09FDparrow\u0100lr\u2725\u2729ef\xF4\u24EDight;\u61AC\u0180afl\u2736\u2739\u273Dr;\u6985;\uC000\u{1D55D}us;\u6A2Dimes;\u6A34\u0161\u274B\u274Fst;\u6217\xE1\u134E\u0180;ef\u2757\u2758\u1800\u65CAnge\xBB\u2758ar\u0100;l\u2764\u2765\u4028t;\u6993\u0280achmt\u2773\u2776\u277C\u2785\u2787r\xF2\u08A8orne\xF2\u1D8Car\u0100;d\u0F98\u2783;\u696D;\u600Eri;\u62BF\u0300achiqt\u2798\u279D\u0A40\u27A2\u27AE\u27BBquo;\u6039r;\uC000\u{1D4C1}m\u0180;eg\u09B2\u27AA\u27AC;\u6A8D;\u6A8F\u0100bu\u252A\u27B3o\u0100;r\u0E1F\u27B9;\u601Arok;\u4142\u8400<;cdhilqr\u082B\u27D2\u2639\u27DC\u27E0\u27E5\u27EA\u27F0\u0100ci\u27D7\u27D9;\u6AA6r;\u6A79re\xE5\u25F2mes;\u62C9arr;\u6976uest;\u6A7B\u0100Pi\u27F5\u27F9ar;\u6996\u0180;ef\u2800\u092D\u181B\u65C3r\u0100du\u2807\u280Dshar;\u694Ahar;\u6966\u0100en\u2817\u2821rtneqq;\uC000\u2268\uFE00\xC5\u281E\u0700Dacdefhilnopsu\u2840\u2845\u2882\u288E\u2893\u28A0\u28A5\u28A8\u28DA\u28E2\u28E4\u0A83\u28F3\u2902Dot;\u623A\u0200clpr\u284E\u2852\u2863\u287Dr\u803B\xAF\u40AF\u0100et\u2857\u2859;\u6642\u0100;e\u285E\u285F\u6720se\xBB\u285F\u0100;s\u103B\u2868to\u0200;dlu\u103B\u2873\u2877\u287Bow\xEE\u048Cef\xF4\u090F\xF0\u13D1ker;\u65AE\u0100oy\u2887\u288Cmma;\u6A29;\u443Cash;\u6014asuredangle\xBB\u1626r;\uC000\u{1D52A}o;\u6127\u0180cdn\u28AF\u28B4\u28C9ro\u803B\xB5\u40B5\u0200;acd\u1464\u28BD\u28C0\u28C4s\xF4\u16A7ir;\u6AF0ot\u80BB\xB7\u01B5us\u0180;bd\u28D2\u1903\u28D3\u6212\u0100;u\u1D3C\u28D8;\u6A2A\u0163\u28DE\u28E1p;\u6ADB\xF2\u2212\xF0\u0A81\u0100dp\u28E9\u28EEels;\u62A7f;\uC000\u{1D55E}\u0100ct\u28F8\u28FDr;\uC000\u{1D4C2}pos\xBB\u159D\u0180;lm\u2909\u290A\u290D\u43BCtimap;\u62B8\u0C00GLRVabcdefghijlmoprstuvw\u2942\u2953\u297E\u2989\u2998\u29DA\u29E9\u2A15\u2A1A\u2A58\u2A5D\u2A83\u2A95\u2AA4\u2AA8\u2B04\u2B07\u2B44\u2B7F\u2BAE\u2C34\u2C67\u2C7C\u2CE9\u0100gt\u2947\u294B;\uC000\u22D9\u0338\u0100;v\u2950\u0BCF\uC000\u226B\u20D2\u0180elt\u295A\u2972\u2976ft\u0100ar\u2961\u2967rrow;\u61CDightarrow;\u61CE;\uC000\u22D8\u0338\u0100;v\u297B\u0C47\uC000\u226A\u20D2ightarrow;\u61CF\u0100Dd\u298E\u2993ash;\u62AFash;\u62AE\u0280bcnpt\u29A3\u29A7\u29AC\u29B1\u29CCla\xBB\u02DEute;\u4144g;\uC000\u2220\u20D2\u0280;Eiop\u0D84\u29BC\u29C0\u29C5\u29C8;\uC000\u2A70\u0338d;\uC000\u224B\u0338s;\u4149ro\xF8\u0D84ur\u0100;a\u29D3\u29D4\u666El\u0100;s\u29D3\u0B38\u01F3\u29DF\0\u29E3p\u80BB\xA0\u0B37mp\u0100;e\u0BF9\u0C00\u0280aeouy\u29F4\u29FE\u2A03\u2A10\u2A13\u01F0\u29F9\0\u29FB;\u6A43on;\u4148dil;\u4146ng\u0100;d\u0D7E\u2A0Aot;\uC000\u2A6D\u0338p;\u6A42;\u443Dash;\u6013\u0380;Aadqsx\u0B92\u2A29\u2A2D\u2A3B\u2A41\u2A45\u2A50rr;\u61D7r\u0100hr\u2A33\u2A36k;\u6924\u0100;o\u13F2\u13F0ot;\uC000\u2250\u0338ui\xF6\u0B63\u0100ei\u2A4A\u2A4Ear;\u6928\xED\u0B98ist\u0100;s\u0BA0\u0B9Fr;\uC000\u{1D52B}\u0200Eest\u0BC5\u2A66\u2A79\u2A7C\u0180;qs\u0BBC\u2A6D\u0BE1\u0180;qs\u0BBC\u0BC5\u2A74lan\xF4\u0BE2i\xED\u0BEA\u0100;r\u0BB6\u2A81\xBB\u0BB7\u0180Aap\u2A8A\u2A8D\u2A91r\xF2\u2971rr;\u61AEar;\u6AF2\u0180;sv\u0F8D\u2A9C\u0F8C\u0100;d\u2AA1\u2AA2\u62FC;\u62FAcy;\u445A\u0380AEadest\u2AB7\u2ABA\u2ABE\u2AC2\u2AC5\u2AF6\u2AF9r\xF2\u2966;\uC000\u2266\u0338rr;\u619Ar;\u6025\u0200;fqs\u0C3B\u2ACE\u2AE3\u2AEFt\u0100ar\u2AD4\u2AD9rro\xF7\u2AC1ightarro\xF7\u2A90\u0180;qs\u0C3B\u2ABA\u2AEAlan\xF4\u0C55\u0100;s\u0C55\u2AF4\xBB\u0C36i\xED\u0C5D\u0100;r\u0C35\u2AFEi\u0100;e\u0C1A\u0C25i\xE4\u0D90\u0100pt\u2B0C\u2B11f;\uC000\u{1D55F}\u8180\xAC;in\u2B19\u2B1A\u2B36\u40ACn\u0200;Edv\u0B89\u2B24\u2B28\u2B2E;\uC000\u22F9\u0338ot;\uC000\u22F5\u0338\u01E1\u0B89\u2B33\u2B35;\u62F7;\u62F6i\u0100;v\u0CB8\u2B3C\u01E1\u0CB8\u2B41\u2B43;\u62FE;\u62FD\u0180aor\u2B4B\u2B63\u2B69r\u0200;ast\u0B7B\u2B55\u2B5A\u2B5Flle\xEC\u0B7Bl;\uC000\u2AFD\u20E5;\uC000\u2202\u0338lint;\u6A14\u0180;ce\u0C92\u2B70\u2B73u\xE5\u0CA5\u0100;c\u0C98\u2B78\u0100;e\u0C92\u2B7D\xF1\u0C98\u0200Aait\u2B88\u2B8B\u2B9D\u2BA7r\xF2\u2988rr\u0180;cw\u2B94\u2B95\u2B99\u619B;\uC000\u2933\u0338;\uC000\u219D\u0338ghtarrow\xBB\u2B95ri\u0100;e\u0CCB\u0CD6\u0380chimpqu\u2BBD\u2BCD\u2BD9\u2B04\u0B78\u2BE4\u2BEF\u0200;cer\u0D32\u2BC6\u0D37\u2BC9u\xE5\u0D45;\uC000\u{1D4C3}ort\u026D\u2B05\0\0\u2BD6ar\xE1\u2B56m\u0100;e\u0D6E\u2BDF\u0100;q\u0D74\u0D73su\u0100bp\u2BEB\u2BED\xE5\u0CF8\xE5\u0D0B\u0180bcp\u2BF6\u2C11\u2C19\u0200;Ees\u2BFF\u2C00\u0D22\u2C04\u6284;\uC000\u2AC5\u0338et\u0100;e\u0D1B\u2C0Bq\u0100;q\u0D23\u2C00c\u0100;e\u0D32\u2C17\xF1\u0D38\u0200;Ees\u2C22\u2C23\u0D5F\u2C27\u6285;\uC000\u2AC6\u0338et\u0100;e\u0D58\u2C2Eq\u0100;q\u0D60\u2C23\u0200gilr\u2C3D\u2C3F\u2C45\u2C47\xEC\u0BD7lde\u803B\xF1\u40F1\xE7\u0C43iangle\u0100lr\u2C52\u2C5Ceft\u0100;e\u0C1A\u2C5A\xF1\u0C26ight\u0100;e\u0CCB\u2C65\xF1\u0CD7\u0100;m\u2C6C\u2C6D\u43BD\u0180;es\u2C74\u2C75\u2C79\u4023ro;\u6116p;\u6007\u0480DHadgilrs\u2C8F\u2C94\u2C99\u2C9E\u2CA3\u2CB0\u2CB6\u2CD3\u2CE3ash;\u62ADarr;\u6904p;\uC000\u224D\u20D2ash;\u62AC\u0100et\u2CA8\u2CAC;\uC000\u2265\u20D2;\uC000>\u20D2nfin;\u69DE\u0180Aet\u2CBD\u2CC1\u2CC5rr;\u6902;\uC000\u2264\u20D2\u0100;r\u2CCA\u2CCD\uC000<\u20D2ie;\uC000\u22B4\u20D2\u0100At\u2CD8\u2CDCrr;\u6903rie;\uC000\u22B5\u20D2im;\uC000\u223C\u20D2\u0180Aan\u2CF0\u2CF4\u2D02rr;\u61D6r\u0100hr\u2CFA\u2CFDk;\u6923\u0100;o\u13E7\u13E5ear;\u6927\u1253\u1A95\0\0\0\0\0\0\0\0\0\0\0\0\0\u2D2D\0\u2D38\u2D48\u2D60\u2D65\u2D72\u2D84\u1B07\0\0\u2D8D\u2DAB\0\u2DC8\u2DCE\0\u2DDC\u2E19\u2E2B\u2E3E\u2E43\u0100cs\u2D31\u1A97ute\u803B\xF3\u40F3\u0100iy\u2D3C\u2D45r\u0100;c\u1A9E\u2D42\u803B\xF4\u40F4;\u443E\u0280abios\u1AA0\u2D52\u2D57\u01C8\u2D5Alac;\u4151v;\u6A38old;\u69BClig;\u4153\u0100cr\u2D69\u2D6Dir;\u69BF;\uC000\u{1D52C}\u036F\u2D79\0\0\u2D7C\0\u2D82n;\u42DBave\u803B\xF2\u40F2;\u69C1\u0100bm\u2D88\u0DF4ar;\u69B5\u0200acit\u2D95\u2D98\u2DA5\u2DA8r\xF2\u1A80\u0100ir\u2D9D\u2DA0r;\u69BEoss;\u69BBn\xE5\u0E52;\u69C0\u0180aei\u2DB1\u2DB5\u2DB9cr;\u414Dga;\u43C9\u0180cdn\u2DC0\u2DC5\u01CDron;\u43BF;\u69B6pf;\uC000\u{1D560}\u0180ael\u2DD4\u2DD7\u01D2r;\u69B7rp;\u69B9\u0380;adiosv\u2DEA\u2DEB\u2DEE\u2E08\u2E0D\u2E10\u2E16\u6228r\xF2\u1A86\u0200;efm\u2DF7\u2DF8\u2E02\u2E05\u6A5Dr\u0100;o\u2DFE\u2DFF\u6134f\xBB\u2DFF\u803B\xAA\u40AA\u803B\xBA\u40BAgof;\u62B6r;\u6A56lope;\u6A57;\u6A5B\u0180clo\u2E1F\u2E21\u2E27\xF2\u2E01ash\u803B\xF8\u40F8l;\u6298i\u016C\u2E2F\u2E34de\u803B\xF5\u40F5es\u0100;a\u01DB\u2E3As;\u6A36ml\u803B\xF6\u40F6bar;\u633D\u0AE1\u2E5E\0\u2E7D\0\u2E80\u2E9D\0\u2EA2\u2EB9\0\0\u2ECB\u0E9C\0\u2F13\0\0\u2F2B\u2FBC\0\u2FC8r\u0200;ast\u0403\u2E67\u2E72\u0E85\u8100\xB6;l\u2E6D\u2E6E\u40B6le\xEC\u0403\u0269\u2E78\0\0\u2E7Bm;\u6AF3;\u6AFDy;\u443Fr\u0280cimpt\u2E8B\u2E8F\u2E93\u1865\u2E97nt;\u4025od;\u402Eil;\u6030enk;\u6031r;\uC000\u{1D52D}\u0180imo\u2EA8\u2EB0\u2EB4\u0100;v\u2EAD\u2EAE\u43C6;\u43D5ma\xF4\u0A76ne;\u660E\u0180;tv\u2EBF\u2EC0\u2EC8\u43C0chfork\xBB\u1FFD;\u43D6\u0100au\u2ECF\u2EDFn\u0100ck\u2ED5\u2EDDk\u0100;h\u21F4\u2EDB;\u610E\xF6\u21F4s\u0480;abcdemst\u2EF3\u2EF4\u1908\u2EF9\u2EFD\u2F04\u2F06\u2F0A\u2F0E\u402Bcir;\u6A23ir;\u6A22\u0100ou\u1D40\u2F02;\u6A25;\u6A72n\u80BB\xB1\u0E9Dim;\u6A26wo;\u6A27\u0180ipu\u2F19\u2F20\u2F25ntint;\u6A15f;\uC000\u{1D561}nd\u803B\xA3\u40A3\u0500;Eaceinosu\u0EC8\u2F3F\u2F41\u2F44\u2F47\u2F81\u2F89\u2F92\u2F7E\u2FB6;\u6AB3p;\u6AB7u\xE5\u0ED9\u0100;c\u0ECE\u2F4C\u0300;acens\u0EC8\u2F59\u2F5F\u2F66\u2F68\u2F7Eppro\xF8\u2F43urlye\xF1\u0ED9\xF1\u0ECE\u0180aes\u2F6F\u2F76\u2F7Approx;\u6AB9qq;\u6AB5im;\u62E8i\xED\u0EDFme\u0100;s\u2F88\u0EAE\u6032\u0180Eas\u2F78\u2F90\u2F7A\xF0\u2F75\u0180dfp\u0EEC\u2F99\u2FAF\u0180als\u2FA0\u2FA5\u2FAAlar;\u632Eine;\u6312urf;\u6313\u0100;t\u0EFB\u2FB4\xEF\u0EFBrel;\u62B0\u0100ci\u2FC0\u2FC5r;\uC000\u{1D4C5};\u43C8ncsp;\u6008\u0300fiopsu\u2FDA\u22E2\u2FDF\u2FE5\u2FEB\u2FF1r;\uC000\u{1D52E}pf;\uC000\u{1D562}rime;\u6057cr;\uC000\u{1D4C6}\u0180aeo\u2FF8\u3009\u3013t\u0100ei\u2FFE\u3005rnion\xF3\u06B0nt;\u6A16st\u0100;e\u3010\u3011\u403F\xF1\u1F19\xF4\u0F14\u0A80ABHabcdefhilmnoprstux\u3040\u3051\u3055\u3059\u30E0\u310E\u312B\u3147\u3162\u3172\u318E\u3206\u3215\u3224\u3229\u3258\u326E\u3272\u3290\u32B0\u32B7\u0180art\u3047\u304A\u304Cr\xF2\u10B3\xF2\u03DDail;\u691Car\xF2\u1C65ar;\u6964\u0380cdenqrt\u3068\u3075\u3078\u307F\u308F\u3094\u30CC\u0100eu\u306D\u3071;\uC000\u223D\u0331te;\u4155i\xE3\u116Emptyv;\u69B3g\u0200;del\u0FD1\u3089\u308B\u308D;\u6992;\u69A5\xE5\u0FD1uo\u803B\xBB\u40BBr\u0580;abcfhlpstw\u0FDC\u30AC\u30AF\u30B7\u30B9\u30BC\u30BE\u30C0\u30C3\u30C7\u30CAp;\u6975\u0100;f\u0FE0\u30B4s;\u6920;\u6933s;\u691E\xEB\u225D\xF0\u272El;\u6945im;\u6974l;\u61A3;\u619D\u0100ai\u30D1\u30D5il;\u691Ao\u0100;n\u30DB\u30DC\u6236al\xF3\u0F1E\u0180abr\u30E7\u30EA\u30EEr\xF2\u17E5rk;\u6773\u0100ak\u30F3\u30FDc\u0100ek\u30F9\u30FB;\u407D;\u405D\u0100es\u3102\u3104;\u698Cl\u0100du\u310A\u310C;\u698E;\u6990\u0200aeuy\u3117\u311C\u3127\u3129ron;\u4159\u0100di\u3121\u3125il;\u4157\xEC\u0FF2\xE2\u30FA;\u4440\u0200clqs\u3134\u3137\u313D\u3144a;\u6937dhar;\u6969uo\u0100;r\u020E\u020Dh;\u61B3\u0180acg\u314E\u315F\u0F44l\u0200;ips\u0F78\u3158\u315B\u109Cn\xE5\u10BBar\xF4\u0FA9t;\u65AD\u0180ilr\u3169\u1023\u316Esht;\u697D;\uC000\u{1D52F}\u0100ao\u3177\u3186r\u0100du\u317D\u317F\xBB\u047B\u0100;l\u1091\u3184;\u696C\u0100;v\u318B\u318C\u43C1;\u43F1\u0180gns\u3195\u31F9\u31FCht\u0300ahlrst\u31A4\u31B0\u31C2\u31D8\u31E4\u31EErrow\u0100;t\u0FDC\u31ADa\xE9\u30C8arpoon\u0100du\u31BB\u31BFow\xEE\u317Ep\xBB\u1092eft\u0100ah\u31CA\u31D0rrow\xF3\u0FEAarpoon\xF3\u0551ightarrows;\u61C9quigarro\xF7\u30CBhreetimes;\u62CCg;\u42DAingdotse\xF1\u1F32\u0180ahm\u320D\u3210\u3213r\xF2\u0FEAa\xF2\u0551;\u600Foust\u0100;a\u321E\u321F\u63B1che\xBB\u321Fmid;\u6AEE\u0200abpt\u3232\u323D\u3240\u3252\u0100nr\u3237\u323Ag;\u67EDr;\u61FEr\xEB\u1003\u0180afl\u3247\u324A\u324Er;\u6986;\uC000\u{1D563}us;\u6A2Eimes;\u6A35\u0100ap\u325D\u3267r\u0100;g\u3263\u3264\u4029t;\u6994olint;\u6A12ar\xF2\u31E3\u0200achq\u327B\u3280\u10BC\u3285quo;\u603Ar;\uC000\u{1D4C7}\u0100bu\u30FB\u328Ao\u0100;r\u0214\u0213\u0180hir\u3297\u329B\u32A0re\xE5\u31F8mes;\u62CAi\u0200;efl\u32AA\u1059\u1821\u32AB\u65B9tri;\u69CEluhar;\u6968;\u611E\u0D61\u32D5\u32DB\u32DF\u332C\u3338\u3371\0\u337A\u33A4\0\0\u33EC\u33F0\0\u3428\u3448\u345A\u34AD\u34B1\u34CA\u34F1\0\u3616\0\0\u3633cute;\u415Bqu\xEF\u27BA\u0500;Eaceinpsy\u11ED\u32F3\u32F5\u32FF\u3302\u330B\u330F\u331F\u3326\u3329;\u6AB4\u01F0\u32FA\0\u32FC;\u6AB8on;\u4161u\xE5\u11FE\u0100;d\u11F3\u3307il;\u415Frc;\u415D\u0180Eas\u3316\u3318\u331B;\u6AB6p;\u6ABAim;\u62E9olint;\u6A13i\xED\u1204;\u4441ot\u0180;be\u3334\u1D47\u3335\u62C5;\u6A66\u0380Aacmstx\u3346\u334A\u3357\u335B\u335E\u3363\u336Drr;\u61D8r\u0100hr\u3350\u3352\xEB\u2228\u0100;o\u0A36\u0A34t\u803B\xA7\u40A7i;\u403Bwar;\u6929m\u0100in\u3369\xF0nu\xF3\xF1t;\u6736r\u0100;o\u3376\u2055\uC000\u{1D530}\u0200acoy\u3382\u3386\u3391\u33A0rp;\u666F\u0100hy\u338B\u338Fcy;\u4449;\u4448rt\u026D\u3399\0\0\u339Ci\xE4\u1464ara\xEC\u2E6F\u803B\xAD\u40AD\u0100gm\u33A8\u33B4ma\u0180;fv\u33B1\u33B2\u33B2\u43C3;\u43C2\u0400;deglnpr\u12AB\u33C5\u33C9\u33CE\u33D6\u33DE\u33E1\u33E6ot;\u6A6A\u0100;q\u12B1\u12B0\u0100;E\u33D3\u33D4\u6A9E;\u6AA0\u0100;E\u33DB\u33DC\u6A9D;\u6A9Fe;\u6246lus;\u6A24arr;\u6972ar\xF2\u113D\u0200aeit\u33F8\u3408\u340F\u3417\u0100ls\u33FD\u3404lsetm\xE9\u336Ahp;\u6A33parsl;\u69E4\u0100dl\u1463\u3414e;\u6323\u0100;e\u341C\u341D\u6AAA\u0100;s\u3422\u3423\u6AAC;\uC000\u2AAC\uFE00\u0180flp\u342E\u3433\u3442tcy;\u444C\u0100;b\u3438\u3439\u402F\u0100;a\u343E\u343F\u69C4r;\u633Ff;\uC000\u{1D564}a\u0100dr\u344D\u0402es\u0100;u\u3454\u3455\u6660it\xBB\u3455\u0180csu\u3460\u3479\u349F\u0100au\u3465\u346Fp\u0100;s\u1188\u346B;\uC000\u2293\uFE00p\u0100;s\u11B4\u3475;\uC000\u2294\uFE00u\u0100bp\u347F\u348F\u0180;es\u1197\u119C\u3486et\u0100;e\u1197\u348D\xF1\u119D\u0180;es\u11A8\u11AD\u3496et\u0100;e\u11A8\u349D\xF1\u11AE\u0180;af\u117B\u34A6\u05B0r\u0165\u34AB\u05B1\xBB\u117Car\xF2\u1148\u0200cemt\u34B9\u34BE\u34C2\u34C5r;\uC000\u{1D4C8}tm\xEE\xF1i\xEC\u3415ar\xE6\u11BE\u0100ar\u34CE\u34D5r\u0100;f\u34D4\u17BF\u6606\u0100an\u34DA\u34EDight\u0100ep\u34E3\u34EApsilo\xEE\u1EE0h\xE9\u2EAFs\xBB\u2852\u0280bcmnp\u34FB\u355E\u1209\u358B\u358E\u0480;Edemnprs\u350E\u350F\u3511\u3515\u351E\u3523\u352C\u3531\u3536\u6282;\u6AC5ot;\u6ABD\u0100;d\u11DA\u351Aot;\u6AC3ult;\u6AC1\u0100Ee\u3528\u352A;\u6ACB;\u628Alus;\u6ABFarr;\u6979\u0180eiu\u353D\u3552\u3555t\u0180;en\u350E\u3545\u354Bq\u0100;q\u11DA\u350Feq\u0100;q\u352B\u3528m;\u6AC7\u0100bp\u355A\u355C;\u6AD5;\u6AD3c\u0300;acens\u11ED\u356C\u3572\u3579\u357B\u3326ppro\xF8\u32FAurlye\xF1\u11FE\xF1\u11F3\u0180aes\u3582\u3588\u331Bppro\xF8\u331Aq\xF1\u3317g;\u666A\u0680123;Edehlmnps\u35A9\u35AC\u35AF\u121C\u35B2\u35B4\u35C0\u35C9\u35D5\u35DA\u35DF\u35E8\u35ED\u803B\xB9\u40B9\u803B\xB2\u40B2\u803B\xB3\u40B3;\u6AC6\u0100os\u35B9\u35BCt;\u6ABEub;\u6AD8\u0100;d\u1222\u35C5ot;\u6AC4s\u0100ou\u35CF\u35D2l;\u67C9b;\u6AD7arr;\u697Bult;\u6AC2\u0100Ee\u35E4\u35E6;\u6ACC;\u628Blus;\u6AC0\u0180eiu\u35F4\u3609\u360Ct\u0180;en\u121C\u35FC\u3602q\u0100;q\u1222\u35B2eq\u0100;q\u35E7\u35E4m;\u6AC8\u0100bp\u3611\u3613;\u6AD4;\u6AD6\u0180Aan\u361C\u3620\u362Drr;\u61D9r\u0100hr\u3626\u3628\xEB\u222E\u0100;o\u0A2B\u0A29war;\u692Alig\u803B\xDF\u40DF\u0BE1\u3651\u365D\u3660\u12CE\u3673\u3679\0\u367E\u36C2\0\0\0\0\0\u36DB\u3703\0\u3709\u376C\0\0\0\u3787\u0272\u3656\0\0\u365Bget;\u6316;\u43C4r\xEB\u0E5F\u0180aey\u3666\u366B\u3670ron;\u4165dil;\u4163;\u4442lrec;\u6315r;\uC000\u{1D531}\u0200eiko\u3686\u369D\u36B5\u36BC\u01F2\u368B\0\u3691e\u01004f\u1284\u1281a\u0180;sv\u3698\u3699\u369B\u43B8ym;\u43D1\u0100cn\u36A2\u36B2k\u0100as\u36A8\u36AEppro\xF8\u12C1im\xBB\u12ACs\xF0\u129E\u0100as\u36BA\u36AE\xF0\u12C1rn\u803B\xFE\u40FE\u01EC\u031F\u36C6\u22E7es\u8180\xD7;bd\u36CF\u36D0\u36D8\u40D7\u0100;a\u190F\u36D5r;\u6A31;\u6A30\u0180eps\u36E1\u36E3\u3700\xE1\u2A4D\u0200;bcf\u0486\u36EC\u36F0\u36F4ot;\u6336ir;\u6AF1\u0100;o\u36F9\u36FC\uC000\u{1D565}rk;\u6ADA\xE1\u3362rime;\u6034\u0180aip\u370F\u3712\u3764d\xE5\u1248\u0380adempst\u3721\u374D\u3740\u3751\u3757\u375C\u375Fngle\u0280;dlqr\u3730\u3731\u3736\u3740\u3742\u65B5own\xBB\u1DBBeft\u0100;e\u2800\u373E\xF1\u092E;\u625Cight\u0100;e\u32AA\u374B\xF1\u105Aot;\u65ECinus;\u6A3Alus;\u6A39b;\u69CDime;\u6A3Bezium;\u63E2\u0180cht\u3772\u377D\u3781\u0100ry\u3777\u377B;\uC000\u{1D4C9};\u4446cy;\u445Brok;\u4167\u0100io\u378B\u378Ex\xF4\u1777head\u0100lr\u3797\u37A0eftarro\xF7\u084Fightarrow\xBB\u0F5D\u0900AHabcdfghlmoprstuw\u37D0\u37D3\u37D7\u37E4\u37F0\u37FC\u380E\u381C\u3823\u3834\u3851\u385D\u386B\u38A9\u38CC\u38D2\u38EA\u38F6r\xF2\u03EDar;\u6963\u0100cr\u37DC\u37E2ute\u803B\xFA\u40FA\xF2\u1150r\u01E3\u37EA\0\u37EDy;\u445Eve;\u416D\u0100iy\u37F5\u37FArc\u803B\xFB\u40FB;\u4443\u0180abh\u3803\u3806\u380Br\xF2\u13ADlac;\u4171a\xF2\u13C3\u0100ir\u3813\u3818sht;\u697E;\uC000\u{1D532}rave\u803B\xF9\u40F9\u0161\u3827\u3831r\u0100lr\u382C\u382E\xBB\u0957\xBB\u1083lk;\u6580\u0100ct\u3839\u384D\u026F\u383F\0\0\u384Arn\u0100;e\u3845\u3846\u631Cr\xBB\u3846op;\u630Fri;\u65F8\u0100al\u3856\u385Acr;\u416B\u80BB\xA8\u0349\u0100gp\u3862\u3866on;\u4173f;\uC000\u{1D566}\u0300adhlsu\u114B\u3878\u387D\u1372\u3891\u38A0own\xE1\u13B3arpoon\u0100lr\u3888\u388Cef\xF4\u382Digh\xF4\u382Fi\u0180;hl\u3899\u389A\u389C\u43C5\xBB\u13FAon\xBB\u389Aparrows;\u61C8\u0180cit\u38B0\u38C4\u38C8\u026F\u38B6\0\0\u38C1rn\u0100;e\u38BC\u38BD\u631Dr\xBB\u38BDop;\u630Eng;\u416Fri;\u65F9cr;\uC000\u{1D4CA}\u0180dir\u38D9\u38DD\u38E2ot;\u62F0lde;\u4169i\u0100;f\u3730\u38E8\xBB\u1813\u0100am\u38EF\u38F2r\xF2\u38A8l\u803B\xFC\u40FCangle;\u69A7\u0780ABDacdeflnoprsz\u391C\u391F\u3929\u392D\u39B5\u39B8\u39BD\u39DF\u39E4\u39E8\u39F3\u39F9\u39FD\u3A01\u3A20r\xF2\u03F7ar\u0100;v\u3926\u3927\u6AE8;\u6AE9as\xE8\u03E1\u0100nr\u3932\u3937grt;\u699C\u0380eknprst\u34E3\u3946\u394B\u3952\u395D\u3964\u3996app\xE1\u2415othin\xE7\u1E96\u0180hir\u34EB\u2EC8\u3959op\xF4\u2FB5\u0100;h\u13B7\u3962\xEF\u318D\u0100iu\u3969\u396Dgm\xE1\u33B3\u0100bp\u3972\u3984setneq\u0100;q\u397D\u3980\uC000\u228A\uFE00;\uC000\u2ACB\uFE00setneq\u0100;q\u398F\u3992\uC000\u228B\uFE00;\uC000\u2ACC\uFE00\u0100hr\u399B\u399Fet\xE1\u369Ciangle\u0100lr\u39AA\u39AFeft\xBB\u0925ight\xBB\u1051y;\u4432ash\xBB\u1036\u0180elr\u39C4\u39D2\u39D7\u0180;be\u2DEA\u39CB\u39CFar;\u62BBq;\u625Alip;\u62EE\u0100bt\u39DC\u1468a\xF2\u1469r;\uC000\u{1D533}tr\xE9\u39AEsu\u0100bp\u39EF\u39F1\xBB\u0D1C\xBB\u0D59pf;\uC000\u{1D567}ro\xF0\u0EFBtr\xE9\u39B4\u0100cu\u3A06\u3A0Br;\uC000\u{1D4CB}\u0100bp\u3A10\u3A18n\u0100Ee\u3980\u3A16\xBB\u397En\u0100Ee\u3992\u3A1E\xBB\u3990igzag;\u699A\u0380cefoprs\u3A36\u3A3B\u3A56\u3A5B\u3A54\u3A61\u3A6Airc;\u4175\u0100di\u3A40\u3A51\u0100bg\u3A45\u3A49ar;\u6A5Fe\u0100;q\u15FA\u3A4F;\u6259erp;\u6118r;\uC000\u{1D534}pf;\uC000\u{1D568}\u0100;e\u1479\u3A66at\xE8\u1479cr;\uC000\u{1D4CC}\u0AE3\u178E\u3A87\0\u3A8B\0\u3A90\u3A9B\0\0\u3A9D\u3AA8\u3AAB\u3AAF\0\0\u3AC3\u3ACE\0\u3AD8\u17DC\u17DFtr\xE9\u17D1r;\uC000\u{1D535}\u0100Aa\u3A94\u3A97r\xF2\u03C3r\xF2\u09F6;\u43BE\u0100Aa\u3AA1\u3AA4r\xF2\u03B8r\xF2\u09EBa\xF0\u2713is;\u62FB\u0180dpt\u17A4\u3AB5\u3ABE\u0100fl\u3ABA\u17A9;\uC000\u{1D569}im\xE5\u17B2\u0100Aa\u3AC7\u3ACAr\xF2\u03CEr\xF2\u0A01\u0100cq\u3AD2\u17B8r;\uC000\u{1D4CD}\u0100pt\u17D6\u3ADCr\xE9\u17D4\u0400acefiosu\u3AF0\u3AFD\u3B08\u3B0C\u3B11\u3B15\u3B1B\u3B21c\u0100uy\u3AF6\u3AFBte\u803B\xFD\u40FD;\u444F\u0100iy\u3B02\u3B06rc;\u4177;\u444Bn\u803B\xA5\u40A5r;\uC000\u{1D536}cy;\u4457pf;\uC000\u{1D56A}cr;\uC000\u{1D4CE}\u0100cm\u3B26\u3B29y;\u444El\u803B\xFF\u40FF\u0500acdefhiosw\u3B42\u3B48\u3B54\u3B58\u3B64\u3B69\u3B6D\u3B74\u3B7A\u3B80cute;\u417A\u0100ay\u3B4D\u3B52ron;\u417E;\u4437ot;\u417C\u0100et\u3B5D\u3B61tr\xE6\u155Fa;\u43B6r;\uC000\u{1D537}cy;\u4436grarr;\u61DDpf;\uC000\u{1D56B}cr;\uC000\u{1D4CF}\u0100jn\u3B85\u3B87;\u600Dj;\u600C'.split("").map((c) => c.charCodeAt(0))
  );

  // node_modules/entities/lib/esm/generated/decode-data-xml.js
  var decode_data_xml_default = new Uint16Array(
    // prettier-ignore
    "\u0200aglq	\x1B\u026D\0\0p;\u4026os;\u4027t;\u403Et;\u403Cuot;\u4022".split("").map((c) => c.charCodeAt(0))
  );

  // node_modules/entities/lib/esm/decode_codepoint.js
  var _a;
  var decodeMap = /* @__PURE__ */ new Map([
    [0, 65533],
    // C1 Unicode control character reference replacements
    [128, 8364],
    [130, 8218],
    [131, 402],
    [132, 8222],
    [133, 8230],
    [134, 8224],
    [135, 8225],
    [136, 710],
    [137, 8240],
    [138, 352],
    [139, 8249],
    [140, 338],
    [142, 381],
    [145, 8216],
    [146, 8217],
    [147, 8220],
    [148, 8221],
    [149, 8226],
    [150, 8211],
    [151, 8212],
    [152, 732],
    [153, 8482],
    [154, 353],
    [155, 8250],
    [156, 339],
    [158, 382],
    [159, 376]
  ]);
  var fromCodePoint = (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, node/no-unsupported-features/es-builtins
    (_a = String.fromCodePoint) !== null && _a !== void 0 ? _a : function(codePoint) {
      let output = "";
      if (codePoint > 65535) {
        codePoint -= 65536;
        output += String.fromCharCode(codePoint >>> 10 & 1023 | 55296);
        codePoint = 56320 | codePoint & 1023;
      }
      output += String.fromCharCode(codePoint);
      return output;
    }
  );
  function replaceCodePoint(codePoint) {
    var _a2;
    if (codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111) {
      return 65533;
    }
    return (_a2 = decodeMap.get(codePoint)) !== null && _a2 !== void 0 ? _a2 : codePoint;
  }

  // node_modules/entities/lib/esm/decode.js
  var CharCodes;
  (function(CharCodes2) {
    CharCodes2[CharCodes2["NUM"] = 35] = "NUM";
    CharCodes2[CharCodes2["SEMI"] = 59] = "SEMI";
    CharCodes2[CharCodes2["EQUALS"] = 61] = "EQUALS";
    CharCodes2[CharCodes2["ZERO"] = 48] = "ZERO";
    CharCodes2[CharCodes2["NINE"] = 57] = "NINE";
    CharCodes2[CharCodes2["LOWER_A"] = 97] = "LOWER_A";
    CharCodes2[CharCodes2["LOWER_F"] = 102] = "LOWER_F";
    CharCodes2[CharCodes2["LOWER_X"] = 120] = "LOWER_X";
    CharCodes2[CharCodes2["LOWER_Z"] = 122] = "LOWER_Z";
    CharCodes2[CharCodes2["UPPER_A"] = 65] = "UPPER_A";
    CharCodes2[CharCodes2["UPPER_F"] = 70] = "UPPER_F";
    CharCodes2[CharCodes2["UPPER_Z"] = 90] = "UPPER_Z";
  })(CharCodes || (CharCodes = {}));
  var TO_LOWER_BIT = 32;
  var BinTrieFlags;
  (function(BinTrieFlags2) {
    BinTrieFlags2[BinTrieFlags2["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
    BinTrieFlags2[BinTrieFlags2["BRANCH_LENGTH"] = 16256] = "BRANCH_LENGTH";
    BinTrieFlags2[BinTrieFlags2["JUMP_TABLE"] = 127] = "JUMP_TABLE";
  })(BinTrieFlags || (BinTrieFlags = {}));
  function isNumber(code2) {
    return code2 >= CharCodes.ZERO && code2 <= CharCodes.NINE;
  }
  function isHexadecimalCharacter(code2) {
    return code2 >= CharCodes.UPPER_A && code2 <= CharCodes.UPPER_F || code2 >= CharCodes.LOWER_A && code2 <= CharCodes.LOWER_F;
  }
  function isAsciiAlphaNumeric(code2) {
    return code2 >= CharCodes.UPPER_A && code2 <= CharCodes.UPPER_Z || code2 >= CharCodes.LOWER_A && code2 <= CharCodes.LOWER_Z || isNumber(code2);
  }
  function isEntityInAttributeInvalidEnd(code2) {
    return code2 === CharCodes.EQUALS || isAsciiAlphaNumeric(code2);
  }
  var EntityDecoderState;
  (function(EntityDecoderState2) {
    EntityDecoderState2[EntityDecoderState2["EntityStart"] = 0] = "EntityStart";
    EntityDecoderState2[EntityDecoderState2["NumericStart"] = 1] = "NumericStart";
    EntityDecoderState2[EntityDecoderState2["NumericDecimal"] = 2] = "NumericDecimal";
    EntityDecoderState2[EntityDecoderState2["NumericHex"] = 3] = "NumericHex";
    EntityDecoderState2[EntityDecoderState2["NamedEntity"] = 4] = "NamedEntity";
  })(EntityDecoderState || (EntityDecoderState = {}));
  var DecodingMode;
  (function(DecodingMode2) {
    DecodingMode2[DecodingMode2["Legacy"] = 0] = "Legacy";
    DecodingMode2[DecodingMode2["Strict"] = 1] = "Strict";
    DecodingMode2[DecodingMode2["Attribute"] = 2] = "Attribute";
  })(DecodingMode || (DecodingMode = {}));
  var EntityDecoder = class {
    constructor(decodeTree, emitCodePoint, errors2) {
      this.decodeTree = decodeTree;
      this.emitCodePoint = emitCodePoint;
      this.errors = errors2;
      this.state = EntityDecoderState.EntityStart;
      this.consumed = 1;
      this.result = 0;
      this.treeIndex = 0;
      this.excess = 1;
      this.decodeMode = DecodingMode.Strict;
    }
    /** Resets the instance to make it reusable. */
    startEntity(decodeMode) {
      this.decodeMode = decodeMode;
      this.state = EntityDecoderState.EntityStart;
      this.result = 0;
      this.treeIndex = 0;
      this.excess = 1;
      this.consumed = 1;
    }
    /**
     * Write an entity to the decoder. This can be called multiple times with partial entities.
     * If the entity is incomplete, the decoder will return -1.
     *
     * Mirrors the implementation of `getDecoder`, but with the ability to stop decoding if the
     * entity is incomplete, and resume when the next string is written.
     *
     * @param string The string containing the entity (or a continuation of the entity).
     * @param offset The offset at which the entity begins. Should be 0 if this is not the first call.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    write(str, offset) {
      switch (this.state) {
        case EntityDecoderState.EntityStart: {
          if (str.charCodeAt(offset) === CharCodes.NUM) {
            this.state = EntityDecoderState.NumericStart;
            this.consumed += 1;
            return this.stateNumericStart(str, offset + 1);
          }
          this.state = EntityDecoderState.NamedEntity;
          return this.stateNamedEntity(str, offset);
        }
        case EntityDecoderState.NumericStart: {
          return this.stateNumericStart(str, offset);
        }
        case EntityDecoderState.NumericDecimal: {
          return this.stateNumericDecimal(str, offset);
        }
        case EntityDecoderState.NumericHex: {
          return this.stateNumericHex(str, offset);
        }
        case EntityDecoderState.NamedEntity: {
          return this.stateNamedEntity(str, offset);
        }
      }
    }
    /**
     * Switches between the numeric decimal and hexadecimal states.
     *
     * Equivalent to the `Numeric character reference state` in the HTML spec.
     *
     * @param str The string containing the entity (or a continuation of the entity).
     * @param offset The current offset.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    stateNumericStart(str, offset) {
      if (offset >= str.length) {
        return -1;
      }
      if ((str.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
        this.state = EntityDecoderState.NumericHex;
        this.consumed += 1;
        return this.stateNumericHex(str, offset + 1);
      }
      this.state = EntityDecoderState.NumericDecimal;
      return this.stateNumericDecimal(str, offset);
    }
    addToNumericResult(str, start, end, base2) {
      if (start !== end) {
        const digitCount = end - start;
        this.result = this.result * Math.pow(base2, digitCount) + parseInt(str.substr(start, digitCount), base2);
        this.consumed += digitCount;
      }
    }
    /**
     * Parses a hexadecimal numeric entity.
     *
     * Equivalent to the `Hexademical character reference state` in the HTML spec.
     *
     * @param str The string containing the entity (or a continuation of the entity).
     * @param offset The current offset.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    stateNumericHex(str, offset) {
      const startIdx = offset;
      while (offset < str.length) {
        const char = str.charCodeAt(offset);
        if (isNumber(char) || isHexadecimalCharacter(char)) {
          offset += 1;
        } else {
          this.addToNumericResult(str, startIdx, offset, 16);
          return this.emitNumericEntity(char, 3);
        }
      }
      this.addToNumericResult(str, startIdx, offset, 16);
      return -1;
    }
    /**
     * Parses a decimal numeric entity.
     *
     * Equivalent to the `Decimal character reference state` in the HTML spec.
     *
     * @param str The string containing the entity (or a continuation of the entity).
     * @param offset The current offset.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    stateNumericDecimal(str, offset) {
      const startIdx = offset;
      while (offset < str.length) {
        const char = str.charCodeAt(offset);
        if (isNumber(char)) {
          offset += 1;
        } else {
          this.addToNumericResult(str, startIdx, offset, 10);
          return this.emitNumericEntity(char, 2);
        }
      }
      this.addToNumericResult(str, startIdx, offset, 10);
      return -1;
    }
    /**
     * Validate and emit a numeric entity.
     *
     * Implements the logic from the `Hexademical character reference start
     * state` and `Numeric character reference end state` in the HTML spec.
     *
     * @param lastCp The last code point of the entity. Used to see if the
     *               entity was terminated with a semicolon.
     * @param expectedLength The minimum number of characters that should be
     *                       consumed. Used to validate that at least one digit
     *                       was consumed.
     * @returns The number of characters that were consumed.
     */
    emitNumericEntity(lastCp, expectedLength) {
      var _a2;
      if (this.consumed <= expectedLength) {
        (_a2 = this.errors) === null || _a2 === void 0 ? void 0 : _a2.absenceOfDigitsInNumericCharacterReference(this.consumed);
        return 0;
      }
      if (lastCp === CharCodes.SEMI) {
        this.consumed += 1;
      } else if (this.decodeMode === DecodingMode.Strict) {
        return 0;
      }
      this.emitCodePoint(replaceCodePoint(this.result), this.consumed);
      if (this.errors) {
        if (lastCp !== CharCodes.SEMI) {
          this.errors.missingSemicolonAfterCharacterReference();
        }
        this.errors.validateNumericCharacterReference(this.result);
      }
      return this.consumed;
    }
    /**
     * Parses a named entity.
     *
     * Equivalent to the `Named character reference state` in the HTML spec.
     *
     * @param str The string containing the entity (or a continuation of the entity).
     * @param offset The current offset.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    stateNamedEntity(str, offset) {
      const { decodeTree } = this;
      let current = decodeTree[this.treeIndex];
      let valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
      for (; offset < str.length; offset++, this.excess++) {
        const char = str.charCodeAt(offset);
        this.treeIndex = determineBranch(decodeTree, current, this.treeIndex + Math.max(1, valueLength), char);
        if (this.treeIndex < 0) {
          return this.result === 0 || // If we are parsing an attribute
          this.decodeMode === DecodingMode.Attribute && // We shouldn't have consumed any characters after the entity,
          (valueLength === 0 || // And there should be no invalid characters.
          isEntityInAttributeInvalidEnd(char)) ? 0 : this.emitNotTerminatedNamedEntity();
        }
        current = decodeTree[this.treeIndex];
        valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
        if (valueLength !== 0) {
          if (char === CharCodes.SEMI) {
            return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
          }
          if (this.decodeMode !== DecodingMode.Strict) {
            this.result = this.treeIndex;
            this.consumed += this.excess;
            this.excess = 0;
          }
        }
      }
      return -1;
    }
    /**
     * Emit a named entity that was not terminated with a semicolon.
     *
     * @returns The number of characters consumed.
     */
    emitNotTerminatedNamedEntity() {
      var _a2;
      const { result, decodeTree } = this;
      const valueLength = (decodeTree[result] & BinTrieFlags.VALUE_LENGTH) >> 14;
      this.emitNamedEntityData(result, valueLength, this.consumed);
      (_a2 = this.errors) === null || _a2 === void 0 ? void 0 : _a2.missingSemicolonAfterCharacterReference();
      return this.consumed;
    }
    /**
     * Emit a named entity.
     *
     * @param result The index of the entity in the decode tree.
     * @param valueLength The number of bytes in the entity.
     * @param consumed The number of characters consumed.
     *
     * @returns The number of characters consumed.
     */
    emitNamedEntityData(result, valueLength, consumed) {
      const { decodeTree } = this;
      this.emitCodePoint(valueLength === 1 ? decodeTree[result] & ~BinTrieFlags.VALUE_LENGTH : decodeTree[result + 1], consumed);
      if (valueLength === 3) {
        this.emitCodePoint(decodeTree[result + 2], consumed);
      }
      return consumed;
    }
    /**
     * Signal to the parser that the end of the input was reached.
     *
     * Remaining data will be emitted and relevant errors will be produced.
     *
     * @returns The number of characters consumed.
     */
    end() {
      var _a2;
      switch (this.state) {
        case EntityDecoderState.NamedEntity: {
          return this.result !== 0 && (this.decodeMode !== DecodingMode.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
        }
        // Otherwise, emit a numeric entity if we have one.
        case EntityDecoderState.NumericDecimal: {
          return this.emitNumericEntity(0, 2);
        }
        case EntityDecoderState.NumericHex: {
          return this.emitNumericEntity(0, 3);
        }
        case EntityDecoderState.NumericStart: {
          (_a2 = this.errors) === null || _a2 === void 0 ? void 0 : _a2.absenceOfDigitsInNumericCharacterReference(this.consumed);
          return 0;
        }
        case EntityDecoderState.EntityStart: {
          return 0;
        }
      }
    }
  };
  function getDecoder(decodeTree) {
    let ret = "";
    const decoder = new EntityDecoder(decodeTree, (str) => ret += fromCodePoint(str));
    return function decodeWithTrie(str, decodeMode) {
      let lastIndex = 0;
      let offset = 0;
      while ((offset = str.indexOf("&", offset)) >= 0) {
        ret += str.slice(lastIndex, offset);
        decoder.startEntity(decodeMode);
        const len = decoder.write(
          str,
          // Skip the "&"
          offset + 1
        );
        if (len < 0) {
          lastIndex = offset + decoder.end();
          break;
        }
        lastIndex = offset + len;
        offset = len === 0 ? lastIndex + 1 : lastIndex;
      }
      const result = ret + str.slice(lastIndex);
      ret = "";
      return result;
    };
  }
  function determineBranch(decodeTree, current, nodeIdx, char) {
    const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
    const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
    if (branchCount === 0) {
      return jumpOffset !== 0 && char === jumpOffset ? nodeIdx : -1;
    }
    if (jumpOffset) {
      const value = char - jumpOffset;
      return value < 0 || value >= branchCount ? -1 : decodeTree[nodeIdx + value] - 1;
    }
    let lo = nodeIdx;
    let hi = lo + branchCount - 1;
    while (lo <= hi) {
      const mid = lo + hi >>> 1;
      const midVal = decodeTree[mid];
      if (midVal < char) {
        lo = mid + 1;
      } else if (midVal > char) {
        hi = mid - 1;
      } else {
        return decodeTree[mid + branchCount];
      }
    }
    return -1;
  }
  var htmlDecoder = getDecoder(decode_data_html_default);
  var xmlDecoder = getDecoder(decode_data_xml_default);
  function decodeHTML(str, mode = DecodingMode.Legacy) {
    return htmlDecoder(str, mode);
  }
  function decodeHTMLStrict(str) {
    return htmlDecoder(str, DecodingMode.Strict);
  }

  // node_modules/entities/lib/esm/generated/encode-html.js
  function restoreDiff(arr) {
    for (let i = 1; i < arr.length; i++) {
      arr[i][0] += arr[i - 1][0] + 1;
    }
    return arr;
  }
  var encode_html_default = new Map(/* @__PURE__ */ restoreDiff([[9, "&Tab;"], [0, "&NewLine;"], [22, "&excl;"], [0, "&quot;"], [0, "&num;"], [0, "&dollar;"], [0, "&percnt;"], [0, "&amp;"], [0, "&apos;"], [0, "&lpar;"], [0, "&rpar;"], [0, "&ast;"], [0, "&plus;"], [0, "&comma;"], [1, "&period;"], [0, "&sol;"], [10, "&colon;"], [0, "&semi;"], [0, { v: "&lt;", n: 8402, o: "&nvlt;" }], [0, { v: "&equals;", n: 8421, o: "&bne;" }], [0, { v: "&gt;", n: 8402, o: "&nvgt;" }], [0, "&quest;"], [0, "&commat;"], [26, "&lbrack;"], [0, "&bsol;"], [0, "&rbrack;"], [0, "&Hat;"], [0, "&lowbar;"], [0, "&DiacriticalGrave;"], [5, { n: 106, o: "&fjlig;" }], [20, "&lbrace;"], [0, "&verbar;"], [0, "&rbrace;"], [34, "&nbsp;"], [0, "&iexcl;"], [0, "&cent;"], [0, "&pound;"], [0, "&curren;"], [0, "&yen;"], [0, "&brvbar;"], [0, "&sect;"], [0, "&die;"], [0, "&copy;"], [0, "&ordf;"], [0, "&laquo;"], [0, "&not;"], [0, "&shy;"], [0, "&circledR;"], [0, "&macr;"], [0, "&deg;"], [0, "&PlusMinus;"], [0, "&sup2;"], [0, "&sup3;"], [0, "&acute;"], [0, "&micro;"], [0, "&para;"], [0, "&centerdot;"], [0, "&cedil;"], [0, "&sup1;"], [0, "&ordm;"], [0, "&raquo;"], [0, "&frac14;"], [0, "&frac12;"], [0, "&frac34;"], [0, "&iquest;"], [0, "&Agrave;"], [0, "&Aacute;"], [0, "&Acirc;"], [0, "&Atilde;"], [0, "&Auml;"], [0, "&angst;"], [0, "&AElig;"], [0, "&Ccedil;"], [0, "&Egrave;"], [0, "&Eacute;"], [0, "&Ecirc;"], [0, "&Euml;"], [0, "&Igrave;"], [0, "&Iacute;"], [0, "&Icirc;"], [0, "&Iuml;"], [0, "&ETH;"], [0, "&Ntilde;"], [0, "&Ograve;"], [0, "&Oacute;"], [0, "&Ocirc;"], [0, "&Otilde;"], [0, "&Ouml;"], [0, "&times;"], [0, "&Oslash;"], [0, "&Ugrave;"], [0, "&Uacute;"], [0, "&Ucirc;"], [0, "&Uuml;"], [0, "&Yacute;"], [0, "&THORN;"], [0, "&szlig;"], [0, "&agrave;"], [0, "&aacute;"], [0, "&acirc;"], [0, "&atilde;"], [0, "&auml;"], [0, "&aring;"], [0, "&aelig;"], [0, "&ccedil;"], [0, "&egrave;"], [0, "&eacute;"], [0, "&ecirc;"], [0, "&euml;"], [0, "&igrave;"], [0, "&iacute;"], [0, "&icirc;"], [0, "&iuml;"], [0, "&eth;"], [0, "&ntilde;"], [0, "&ograve;"], [0, "&oacute;"], [0, "&ocirc;"], [0, "&otilde;"], [0, "&ouml;"], [0, "&div;"], [0, "&oslash;"], [0, "&ugrave;"], [0, "&uacute;"], [0, "&ucirc;"], [0, "&uuml;"], [0, "&yacute;"], [0, "&thorn;"], [0, "&yuml;"], [0, "&Amacr;"], [0, "&amacr;"], [0, "&Abreve;"], [0, "&abreve;"], [0, "&Aogon;"], [0, "&aogon;"], [0, "&Cacute;"], [0, "&cacute;"], [0, "&Ccirc;"], [0, "&ccirc;"], [0, "&Cdot;"], [0, "&cdot;"], [0, "&Ccaron;"], [0, "&ccaron;"], [0, "&Dcaron;"], [0, "&dcaron;"], [0, "&Dstrok;"], [0, "&dstrok;"], [0, "&Emacr;"], [0, "&emacr;"], [2, "&Edot;"], [0, "&edot;"], [0, "&Eogon;"], [0, "&eogon;"], [0, "&Ecaron;"], [0, "&ecaron;"], [0, "&Gcirc;"], [0, "&gcirc;"], [0, "&Gbreve;"], [0, "&gbreve;"], [0, "&Gdot;"], [0, "&gdot;"], [0, "&Gcedil;"], [1, "&Hcirc;"], [0, "&hcirc;"], [0, "&Hstrok;"], [0, "&hstrok;"], [0, "&Itilde;"], [0, "&itilde;"], [0, "&Imacr;"], [0, "&imacr;"], [2, "&Iogon;"], [0, "&iogon;"], [0, "&Idot;"], [0, "&imath;"], [0, "&IJlig;"], [0, "&ijlig;"], [0, "&Jcirc;"], [0, "&jcirc;"], [0, "&Kcedil;"], [0, "&kcedil;"], [0, "&kgreen;"], [0, "&Lacute;"], [0, "&lacute;"], [0, "&Lcedil;"], [0, "&lcedil;"], [0, "&Lcaron;"], [0, "&lcaron;"], [0, "&Lmidot;"], [0, "&lmidot;"], [0, "&Lstrok;"], [0, "&lstrok;"], [0, "&Nacute;"], [0, "&nacute;"], [0, "&Ncedil;"], [0, "&ncedil;"], [0, "&Ncaron;"], [0, "&ncaron;"], [0, "&napos;"], [0, "&ENG;"], [0, "&eng;"], [0, "&Omacr;"], [0, "&omacr;"], [2, "&Odblac;"], [0, "&odblac;"], [0, "&OElig;"], [0, "&oelig;"], [0, "&Racute;"], [0, "&racute;"], [0, "&Rcedil;"], [0, "&rcedil;"], [0, "&Rcaron;"], [0, "&rcaron;"], [0, "&Sacute;"], [0, "&sacute;"], [0, "&Scirc;"], [0, "&scirc;"], [0, "&Scedil;"], [0, "&scedil;"], [0, "&Scaron;"], [0, "&scaron;"], [0, "&Tcedil;"], [0, "&tcedil;"], [0, "&Tcaron;"], [0, "&tcaron;"], [0, "&Tstrok;"], [0, "&tstrok;"], [0, "&Utilde;"], [0, "&utilde;"], [0, "&Umacr;"], [0, "&umacr;"], [0, "&Ubreve;"], [0, "&ubreve;"], [0, "&Uring;"], [0, "&uring;"], [0, "&Udblac;"], [0, "&udblac;"], [0, "&Uogon;"], [0, "&uogon;"], [0, "&Wcirc;"], [0, "&wcirc;"], [0, "&Ycirc;"], [0, "&ycirc;"], [0, "&Yuml;"], [0, "&Zacute;"], [0, "&zacute;"], [0, "&Zdot;"], [0, "&zdot;"], [0, "&Zcaron;"], [0, "&zcaron;"], [19, "&fnof;"], [34, "&imped;"], [63, "&gacute;"], [65, "&jmath;"], [142, "&circ;"], [0, "&caron;"], [16, "&breve;"], [0, "&DiacriticalDot;"], [0, "&ring;"], [0, "&ogon;"], [0, "&DiacriticalTilde;"], [0, "&dblac;"], [51, "&DownBreve;"], [127, "&Alpha;"], [0, "&Beta;"], [0, "&Gamma;"], [0, "&Delta;"], [0, "&Epsilon;"], [0, "&Zeta;"], [0, "&Eta;"], [0, "&Theta;"], [0, "&Iota;"], [0, "&Kappa;"], [0, "&Lambda;"], [0, "&Mu;"], [0, "&Nu;"], [0, "&Xi;"], [0, "&Omicron;"], [0, "&Pi;"], [0, "&Rho;"], [1, "&Sigma;"], [0, "&Tau;"], [0, "&Upsilon;"], [0, "&Phi;"], [0, "&Chi;"], [0, "&Psi;"], [0, "&ohm;"], [7, "&alpha;"], [0, "&beta;"], [0, "&gamma;"], [0, "&delta;"], [0, "&epsi;"], [0, "&zeta;"], [0, "&eta;"], [0, "&theta;"], [0, "&iota;"], [0, "&kappa;"], [0, "&lambda;"], [0, "&mu;"], [0, "&nu;"], [0, "&xi;"], [0, "&omicron;"], [0, "&pi;"], [0, "&rho;"], [0, "&sigmaf;"], [0, "&sigma;"], [0, "&tau;"], [0, "&upsi;"], [0, "&phi;"], [0, "&chi;"], [0, "&psi;"], [0, "&omega;"], [7, "&thetasym;"], [0, "&Upsi;"], [2, "&phiv;"], [0, "&piv;"], [5, "&Gammad;"], [0, "&digamma;"], [18, "&kappav;"], [0, "&rhov;"], [3, "&epsiv;"], [0, "&backepsilon;"], [10, "&IOcy;"], [0, "&DJcy;"], [0, "&GJcy;"], [0, "&Jukcy;"], [0, "&DScy;"], [0, "&Iukcy;"], [0, "&YIcy;"], [0, "&Jsercy;"], [0, "&LJcy;"], [0, "&NJcy;"], [0, "&TSHcy;"], [0, "&KJcy;"], [1, "&Ubrcy;"], [0, "&DZcy;"], [0, "&Acy;"], [0, "&Bcy;"], [0, "&Vcy;"], [0, "&Gcy;"], [0, "&Dcy;"], [0, "&IEcy;"], [0, "&ZHcy;"], [0, "&Zcy;"], [0, "&Icy;"], [0, "&Jcy;"], [0, "&Kcy;"], [0, "&Lcy;"], [0, "&Mcy;"], [0, "&Ncy;"], [0, "&Ocy;"], [0, "&Pcy;"], [0, "&Rcy;"], [0, "&Scy;"], [0, "&Tcy;"], [0, "&Ucy;"], [0, "&Fcy;"], [0, "&KHcy;"], [0, "&TScy;"], [0, "&CHcy;"], [0, "&SHcy;"], [0, "&SHCHcy;"], [0, "&HARDcy;"], [0, "&Ycy;"], [0, "&SOFTcy;"], [0, "&Ecy;"], [0, "&YUcy;"], [0, "&YAcy;"], [0, "&acy;"], [0, "&bcy;"], [0, "&vcy;"], [0, "&gcy;"], [0, "&dcy;"], [0, "&iecy;"], [0, "&zhcy;"], [0, "&zcy;"], [0, "&icy;"], [0, "&jcy;"], [0, "&kcy;"], [0, "&lcy;"], [0, "&mcy;"], [0, "&ncy;"], [0, "&ocy;"], [0, "&pcy;"], [0, "&rcy;"], [0, "&scy;"], [0, "&tcy;"], [0, "&ucy;"], [0, "&fcy;"], [0, "&khcy;"], [0, "&tscy;"], [0, "&chcy;"], [0, "&shcy;"], [0, "&shchcy;"], [0, "&hardcy;"], [0, "&ycy;"], [0, "&softcy;"], [0, "&ecy;"], [0, "&yucy;"], [0, "&yacy;"], [1, "&iocy;"], [0, "&djcy;"], [0, "&gjcy;"], [0, "&jukcy;"], [0, "&dscy;"], [0, "&iukcy;"], [0, "&yicy;"], [0, "&jsercy;"], [0, "&ljcy;"], [0, "&njcy;"], [0, "&tshcy;"], [0, "&kjcy;"], [1, "&ubrcy;"], [0, "&dzcy;"], [7074, "&ensp;"], [0, "&emsp;"], [0, "&emsp13;"], [0, "&emsp14;"], [1, "&numsp;"], [0, "&puncsp;"], [0, "&ThinSpace;"], [0, "&hairsp;"], [0, "&NegativeMediumSpace;"], [0, "&zwnj;"], [0, "&zwj;"], [0, "&lrm;"], [0, "&rlm;"], [0, "&dash;"], [2, "&ndash;"], [0, "&mdash;"], [0, "&horbar;"], [0, "&Verbar;"], [1, "&lsquo;"], [0, "&CloseCurlyQuote;"], [0, "&lsquor;"], [1, "&ldquo;"], [0, "&CloseCurlyDoubleQuote;"], [0, "&bdquo;"], [1, "&dagger;"], [0, "&Dagger;"], [0, "&bull;"], [2, "&nldr;"], [0, "&hellip;"], [9, "&permil;"], [0, "&pertenk;"], [0, "&prime;"], [0, "&Prime;"], [0, "&tprime;"], [0, "&backprime;"], [3, "&lsaquo;"], [0, "&rsaquo;"], [3, "&oline;"], [2, "&caret;"], [1, "&hybull;"], [0, "&frasl;"], [10, "&bsemi;"], [7, "&qprime;"], [7, { v: "&MediumSpace;", n: 8202, o: "&ThickSpace;" }], [0, "&NoBreak;"], [0, "&af;"], [0, "&InvisibleTimes;"], [0, "&ic;"], [72, "&euro;"], [46, "&tdot;"], [0, "&DotDot;"], [37, "&complexes;"], [2, "&incare;"], [4, "&gscr;"], [0, "&hamilt;"], [0, "&Hfr;"], [0, "&Hopf;"], [0, "&planckh;"], [0, "&hbar;"], [0, "&imagline;"], [0, "&Ifr;"], [0, "&lagran;"], [0, "&ell;"], [1, "&naturals;"], [0, "&numero;"], [0, "&copysr;"], [0, "&weierp;"], [0, "&Popf;"], [0, "&Qopf;"], [0, "&realine;"], [0, "&real;"], [0, "&reals;"], [0, "&rx;"], [3, "&trade;"], [1, "&integers;"], [2, "&mho;"], [0, "&zeetrf;"], [0, "&iiota;"], [2, "&bernou;"], [0, "&Cayleys;"], [1, "&escr;"], [0, "&Escr;"], [0, "&Fouriertrf;"], [1, "&Mellintrf;"], [0, "&order;"], [0, "&alefsym;"], [0, "&beth;"], [0, "&gimel;"], [0, "&daleth;"], [12, "&CapitalDifferentialD;"], [0, "&dd;"], [0, "&ee;"], [0, "&ii;"], [10, "&frac13;"], [0, "&frac23;"], [0, "&frac15;"], [0, "&frac25;"], [0, "&frac35;"], [0, "&frac45;"], [0, "&frac16;"], [0, "&frac56;"], [0, "&frac18;"], [0, "&frac38;"], [0, "&frac58;"], [0, "&frac78;"], [49, "&larr;"], [0, "&ShortUpArrow;"], [0, "&rarr;"], [0, "&darr;"], [0, "&harr;"], [0, "&updownarrow;"], [0, "&nwarr;"], [0, "&nearr;"], [0, "&LowerRightArrow;"], [0, "&LowerLeftArrow;"], [0, "&nlarr;"], [0, "&nrarr;"], [1, { v: "&rarrw;", n: 824, o: "&nrarrw;" }], [0, "&Larr;"], [0, "&Uarr;"], [0, "&Rarr;"], [0, "&Darr;"], [0, "&larrtl;"], [0, "&rarrtl;"], [0, "&LeftTeeArrow;"], [0, "&mapstoup;"], [0, "&map;"], [0, "&DownTeeArrow;"], [1, "&hookleftarrow;"], [0, "&hookrightarrow;"], [0, "&larrlp;"], [0, "&looparrowright;"], [0, "&harrw;"], [0, "&nharr;"], [1, "&lsh;"], [0, "&rsh;"], [0, "&ldsh;"], [0, "&rdsh;"], [1, "&crarr;"], [0, "&cularr;"], [0, "&curarr;"], [2, "&circlearrowleft;"], [0, "&circlearrowright;"], [0, "&leftharpoonup;"], [0, "&DownLeftVector;"], [0, "&RightUpVector;"], [0, "&LeftUpVector;"], [0, "&rharu;"], [0, "&DownRightVector;"], [0, "&dharr;"], [0, "&dharl;"], [0, "&RightArrowLeftArrow;"], [0, "&udarr;"], [0, "&LeftArrowRightArrow;"], [0, "&leftleftarrows;"], [0, "&upuparrows;"], [0, "&rightrightarrows;"], [0, "&ddarr;"], [0, "&leftrightharpoons;"], [0, "&Equilibrium;"], [0, "&nlArr;"], [0, "&nhArr;"], [0, "&nrArr;"], [0, "&DoubleLeftArrow;"], [0, "&DoubleUpArrow;"], [0, "&DoubleRightArrow;"], [0, "&dArr;"], [0, "&DoubleLeftRightArrow;"], [0, "&DoubleUpDownArrow;"], [0, "&nwArr;"], [0, "&neArr;"], [0, "&seArr;"], [0, "&swArr;"], [0, "&lAarr;"], [0, "&rAarr;"], [1, "&zigrarr;"], [6, "&larrb;"], [0, "&rarrb;"], [15, "&DownArrowUpArrow;"], [7, "&loarr;"], [0, "&roarr;"], [0, "&hoarr;"], [0, "&forall;"], [0, "&comp;"], [0, { v: "&part;", n: 824, o: "&npart;" }], [0, "&exist;"], [0, "&nexist;"], [0, "&empty;"], [1, "&Del;"], [0, "&Element;"], [0, "&NotElement;"], [1, "&ni;"], [0, "&notni;"], [2, "&prod;"], [0, "&coprod;"], [0, "&sum;"], [0, "&minus;"], [0, "&MinusPlus;"], [0, "&dotplus;"], [1, "&Backslash;"], [0, "&lowast;"], [0, "&compfn;"], [1, "&radic;"], [2, "&prop;"], [0, "&infin;"], [0, "&angrt;"], [0, { v: "&ang;", n: 8402, o: "&nang;" }], [0, "&angmsd;"], [0, "&angsph;"], [0, "&mid;"], [0, "&nmid;"], [0, "&DoubleVerticalBar;"], [0, "&NotDoubleVerticalBar;"], [0, "&and;"], [0, "&or;"], [0, { v: "&cap;", n: 65024, o: "&caps;" }], [0, { v: "&cup;", n: 65024, o: "&cups;" }], [0, "&int;"], [0, "&Int;"], [0, "&iiint;"], [0, "&conint;"], [0, "&Conint;"], [0, "&Cconint;"], [0, "&cwint;"], [0, "&ClockwiseContourIntegral;"], [0, "&awconint;"], [0, "&there4;"], [0, "&becaus;"], [0, "&ratio;"], [0, "&Colon;"], [0, "&dotminus;"], [1, "&mDDot;"], [0, "&homtht;"], [0, { v: "&sim;", n: 8402, o: "&nvsim;" }], [0, { v: "&backsim;", n: 817, o: "&race;" }], [0, { v: "&ac;", n: 819, o: "&acE;" }], [0, "&acd;"], [0, "&VerticalTilde;"], [0, "&NotTilde;"], [0, { v: "&eqsim;", n: 824, o: "&nesim;" }], [0, "&sime;"], [0, "&NotTildeEqual;"], [0, "&cong;"], [0, "&simne;"], [0, "&ncong;"], [0, "&ap;"], [0, "&nap;"], [0, "&ape;"], [0, { v: "&apid;", n: 824, o: "&napid;" }], [0, "&backcong;"], [0, { v: "&asympeq;", n: 8402, o: "&nvap;" }], [0, { v: "&bump;", n: 824, o: "&nbump;" }], [0, { v: "&bumpe;", n: 824, o: "&nbumpe;" }], [0, { v: "&doteq;", n: 824, o: "&nedot;" }], [0, "&doteqdot;"], [0, "&efDot;"], [0, "&erDot;"], [0, "&Assign;"], [0, "&ecolon;"], [0, "&ecir;"], [0, "&circeq;"], [1, "&wedgeq;"], [0, "&veeeq;"], [1, "&triangleq;"], [2, "&equest;"], [0, "&ne;"], [0, { v: "&Congruent;", n: 8421, o: "&bnequiv;" }], [0, "&nequiv;"], [1, { v: "&le;", n: 8402, o: "&nvle;" }], [0, { v: "&ge;", n: 8402, o: "&nvge;" }], [0, { v: "&lE;", n: 824, o: "&nlE;" }], [0, { v: "&gE;", n: 824, o: "&ngE;" }], [0, { v: "&lnE;", n: 65024, o: "&lvertneqq;" }], [0, { v: "&gnE;", n: 65024, o: "&gvertneqq;" }], [0, { v: "&ll;", n: new Map(/* @__PURE__ */ restoreDiff([[824, "&nLtv;"], [7577, "&nLt;"]])) }], [0, { v: "&gg;", n: new Map(/* @__PURE__ */ restoreDiff([[824, "&nGtv;"], [7577, "&nGt;"]])) }], [0, "&between;"], [0, "&NotCupCap;"], [0, "&nless;"], [0, "&ngt;"], [0, "&nle;"], [0, "&nge;"], [0, "&lesssim;"], [0, "&GreaterTilde;"], [0, "&nlsim;"], [0, "&ngsim;"], [0, "&LessGreater;"], [0, "&gl;"], [0, "&NotLessGreater;"], [0, "&NotGreaterLess;"], [0, "&pr;"], [0, "&sc;"], [0, "&prcue;"], [0, "&sccue;"], [0, "&PrecedesTilde;"], [0, { v: "&scsim;", n: 824, o: "&NotSucceedsTilde;" }], [0, "&NotPrecedes;"], [0, "&NotSucceeds;"], [0, { v: "&sub;", n: 8402, o: "&NotSubset;" }], [0, { v: "&sup;", n: 8402, o: "&NotSuperset;" }], [0, "&nsub;"], [0, "&nsup;"], [0, "&sube;"], [0, "&supe;"], [0, "&NotSubsetEqual;"], [0, "&NotSupersetEqual;"], [0, { v: "&subne;", n: 65024, o: "&varsubsetneq;" }], [0, { v: "&supne;", n: 65024, o: "&varsupsetneq;" }], [1, "&cupdot;"], [0, "&UnionPlus;"], [0, { v: "&sqsub;", n: 824, o: "&NotSquareSubset;" }], [0, { v: "&sqsup;", n: 824, o: "&NotSquareSuperset;" }], [0, "&sqsube;"], [0, "&sqsupe;"], [0, { v: "&sqcap;", n: 65024, o: "&sqcaps;" }], [0, { v: "&sqcup;", n: 65024, o: "&sqcups;" }], [0, "&CirclePlus;"], [0, "&CircleMinus;"], [0, "&CircleTimes;"], [0, "&osol;"], [0, "&CircleDot;"], [0, "&circledcirc;"], [0, "&circledast;"], [1, "&circleddash;"], [0, "&boxplus;"], [0, "&boxminus;"], [0, "&boxtimes;"], [0, "&dotsquare;"], [0, "&RightTee;"], [0, "&dashv;"], [0, "&DownTee;"], [0, "&bot;"], [1, "&models;"], [0, "&DoubleRightTee;"], [0, "&Vdash;"], [0, "&Vvdash;"], [0, "&VDash;"], [0, "&nvdash;"], [0, "&nvDash;"], [0, "&nVdash;"], [0, "&nVDash;"], [0, "&prurel;"], [1, "&LeftTriangle;"], [0, "&RightTriangle;"], [0, { v: "&LeftTriangleEqual;", n: 8402, o: "&nvltrie;" }], [0, { v: "&RightTriangleEqual;", n: 8402, o: "&nvrtrie;" }], [0, "&origof;"], [0, "&imof;"], [0, "&multimap;"], [0, "&hercon;"], [0, "&intcal;"], [0, "&veebar;"], [1, "&barvee;"], [0, "&angrtvb;"], [0, "&lrtri;"], [0, "&bigwedge;"], [0, "&bigvee;"], [0, "&bigcap;"], [0, "&bigcup;"], [0, "&diam;"], [0, "&sdot;"], [0, "&sstarf;"], [0, "&divideontimes;"], [0, "&bowtie;"], [0, "&ltimes;"], [0, "&rtimes;"], [0, "&leftthreetimes;"], [0, "&rightthreetimes;"], [0, "&backsimeq;"], [0, "&curlyvee;"], [0, "&curlywedge;"], [0, "&Sub;"], [0, "&Sup;"], [0, "&Cap;"], [0, "&Cup;"], [0, "&fork;"], [0, "&epar;"], [0, "&lessdot;"], [0, "&gtdot;"], [0, { v: "&Ll;", n: 824, o: "&nLl;" }], [0, { v: "&Gg;", n: 824, o: "&nGg;" }], [0, { v: "&leg;", n: 65024, o: "&lesg;" }], [0, { v: "&gel;", n: 65024, o: "&gesl;" }], [2, "&cuepr;"], [0, "&cuesc;"], [0, "&NotPrecedesSlantEqual;"], [0, "&NotSucceedsSlantEqual;"], [0, "&NotSquareSubsetEqual;"], [0, "&NotSquareSupersetEqual;"], [2, "&lnsim;"], [0, "&gnsim;"], [0, "&precnsim;"], [0, "&scnsim;"], [0, "&nltri;"], [0, "&NotRightTriangle;"], [0, "&nltrie;"], [0, "&NotRightTriangleEqual;"], [0, "&vellip;"], [0, "&ctdot;"], [0, "&utdot;"], [0, "&dtdot;"], [0, "&disin;"], [0, "&isinsv;"], [0, "&isins;"], [0, { v: "&isindot;", n: 824, o: "&notindot;" }], [0, "&notinvc;"], [0, "&notinvb;"], [1, { v: "&isinE;", n: 824, o: "&notinE;" }], [0, "&nisd;"], [0, "&xnis;"], [0, "&nis;"], [0, "&notnivc;"], [0, "&notnivb;"], [6, "&barwed;"], [0, "&Barwed;"], [1, "&lceil;"], [0, "&rceil;"], [0, "&LeftFloor;"], [0, "&rfloor;"], [0, "&drcrop;"], [0, "&dlcrop;"], [0, "&urcrop;"], [0, "&ulcrop;"], [0, "&bnot;"], [1, "&profline;"], [0, "&profsurf;"], [1, "&telrec;"], [0, "&target;"], [5, "&ulcorn;"], [0, "&urcorn;"], [0, "&dlcorn;"], [0, "&drcorn;"], [2, "&frown;"], [0, "&smile;"], [9, "&cylcty;"], [0, "&profalar;"], [7, "&topbot;"], [6, "&ovbar;"], [1, "&solbar;"], [60, "&angzarr;"], [51, "&lmoustache;"], [0, "&rmoustache;"], [2, "&OverBracket;"], [0, "&bbrk;"], [0, "&bbrktbrk;"], [37, "&OverParenthesis;"], [0, "&UnderParenthesis;"], [0, "&OverBrace;"], [0, "&UnderBrace;"], [2, "&trpezium;"], [4, "&elinters;"], [59, "&blank;"], [164, "&circledS;"], [55, "&boxh;"], [1, "&boxv;"], [9, "&boxdr;"], [3, "&boxdl;"], [3, "&boxur;"], [3, "&boxul;"], [3, "&boxvr;"], [7, "&boxvl;"], [7, "&boxhd;"], [7, "&boxhu;"], [7, "&boxvh;"], [19, "&boxH;"], [0, "&boxV;"], [0, "&boxdR;"], [0, "&boxDr;"], [0, "&boxDR;"], [0, "&boxdL;"], [0, "&boxDl;"], [0, "&boxDL;"], [0, "&boxuR;"], [0, "&boxUr;"], [0, "&boxUR;"], [0, "&boxuL;"], [0, "&boxUl;"], [0, "&boxUL;"], [0, "&boxvR;"], [0, "&boxVr;"], [0, "&boxVR;"], [0, "&boxvL;"], [0, "&boxVl;"], [0, "&boxVL;"], [0, "&boxHd;"], [0, "&boxhD;"], [0, "&boxHD;"], [0, "&boxHu;"], [0, "&boxhU;"], [0, "&boxHU;"], [0, "&boxvH;"], [0, "&boxVh;"], [0, "&boxVH;"], [19, "&uhblk;"], [3, "&lhblk;"], [3, "&block;"], [8, "&blk14;"], [0, "&blk12;"], [0, "&blk34;"], [13, "&square;"], [8, "&blacksquare;"], [0, "&EmptyVerySmallSquare;"], [1, "&rect;"], [0, "&marker;"], [2, "&fltns;"], [1, "&bigtriangleup;"], [0, "&blacktriangle;"], [0, "&triangle;"], [2, "&blacktriangleright;"], [0, "&rtri;"], [3, "&bigtriangledown;"], [0, "&blacktriangledown;"], [0, "&dtri;"], [2, "&blacktriangleleft;"], [0, "&ltri;"], [6, "&loz;"], [0, "&cir;"], [32, "&tridot;"], [2, "&bigcirc;"], [8, "&ultri;"], [0, "&urtri;"], [0, "&lltri;"], [0, "&EmptySmallSquare;"], [0, "&FilledSmallSquare;"], [8, "&bigstar;"], [0, "&star;"], [7, "&phone;"], [49, "&female;"], [1, "&male;"], [29, "&spades;"], [2, "&clubs;"], [1, "&hearts;"], [0, "&diamondsuit;"], [3, "&sung;"], [2, "&flat;"], [0, "&natural;"], [0, "&sharp;"], [163, "&check;"], [3, "&cross;"], [8, "&malt;"], [21, "&sext;"], [33, "&VerticalSeparator;"], [25, "&lbbrk;"], [0, "&rbbrk;"], [84, "&bsolhsub;"], [0, "&suphsol;"], [28, "&LeftDoubleBracket;"], [0, "&RightDoubleBracket;"], [0, "&lang;"], [0, "&rang;"], [0, "&Lang;"], [0, "&Rang;"], [0, "&loang;"], [0, "&roang;"], [7, "&longleftarrow;"], [0, "&longrightarrow;"], [0, "&longleftrightarrow;"], [0, "&DoubleLongLeftArrow;"], [0, "&DoubleLongRightArrow;"], [0, "&DoubleLongLeftRightArrow;"], [1, "&longmapsto;"], [2, "&dzigrarr;"], [258, "&nvlArr;"], [0, "&nvrArr;"], [0, "&nvHarr;"], [0, "&Map;"], [6, "&lbarr;"], [0, "&bkarow;"], [0, "&lBarr;"], [0, "&dbkarow;"], [0, "&drbkarow;"], [0, "&DDotrahd;"], [0, "&UpArrowBar;"], [0, "&DownArrowBar;"], [2, "&Rarrtl;"], [2, "&latail;"], [0, "&ratail;"], [0, "&lAtail;"], [0, "&rAtail;"], [0, "&larrfs;"], [0, "&rarrfs;"], [0, "&larrbfs;"], [0, "&rarrbfs;"], [2, "&nwarhk;"], [0, "&nearhk;"], [0, "&hksearow;"], [0, "&hkswarow;"], [0, "&nwnear;"], [0, "&nesear;"], [0, "&seswar;"], [0, "&swnwar;"], [8, { v: "&rarrc;", n: 824, o: "&nrarrc;" }], [1, "&cudarrr;"], [0, "&ldca;"], [0, "&rdca;"], [0, "&cudarrl;"], [0, "&larrpl;"], [2, "&curarrm;"], [0, "&cularrp;"], [7, "&rarrpl;"], [2, "&harrcir;"], [0, "&Uarrocir;"], [0, "&lurdshar;"], [0, "&ldrushar;"], [2, "&LeftRightVector;"], [0, "&RightUpDownVector;"], [0, "&DownLeftRightVector;"], [0, "&LeftUpDownVector;"], [0, "&LeftVectorBar;"], [0, "&RightVectorBar;"], [0, "&RightUpVectorBar;"], [0, "&RightDownVectorBar;"], [0, "&DownLeftVectorBar;"], [0, "&DownRightVectorBar;"], [0, "&LeftUpVectorBar;"], [0, "&LeftDownVectorBar;"], [0, "&LeftTeeVector;"], [0, "&RightTeeVector;"], [0, "&RightUpTeeVector;"], [0, "&RightDownTeeVector;"], [0, "&DownLeftTeeVector;"], [0, "&DownRightTeeVector;"], [0, "&LeftUpTeeVector;"], [0, "&LeftDownTeeVector;"], [0, "&lHar;"], [0, "&uHar;"], [0, "&rHar;"], [0, "&dHar;"], [0, "&luruhar;"], [0, "&ldrdhar;"], [0, "&ruluhar;"], [0, "&rdldhar;"], [0, "&lharul;"], [0, "&llhard;"], [0, "&rharul;"], [0, "&lrhard;"], [0, "&udhar;"], [0, "&duhar;"], [0, "&RoundImplies;"], [0, "&erarr;"], [0, "&simrarr;"], [0, "&larrsim;"], [0, "&rarrsim;"], [0, "&rarrap;"], [0, "&ltlarr;"], [1, "&gtrarr;"], [0, "&subrarr;"], [1, "&suplarr;"], [0, "&lfisht;"], [0, "&rfisht;"], [0, "&ufisht;"], [0, "&dfisht;"], [5, "&lopar;"], [0, "&ropar;"], [4, "&lbrke;"], [0, "&rbrke;"], [0, "&lbrkslu;"], [0, "&rbrksld;"], [0, "&lbrksld;"], [0, "&rbrkslu;"], [0, "&langd;"], [0, "&rangd;"], [0, "&lparlt;"], [0, "&rpargt;"], [0, "&gtlPar;"], [0, "&ltrPar;"], [3, "&vzigzag;"], [1, "&vangrt;"], [0, "&angrtvbd;"], [6, "&ange;"], [0, "&range;"], [0, "&dwangle;"], [0, "&uwangle;"], [0, "&angmsdaa;"], [0, "&angmsdab;"], [0, "&angmsdac;"], [0, "&angmsdad;"], [0, "&angmsdae;"], [0, "&angmsdaf;"], [0, "&angmsdag;"], [0, "&angmsdah;"], [0, "&bemptyv;"], [0, "&demptyv;"], [0, "&cemptyv;"], [0, "&raemptyv;"], [0, "&laemptyv;"], [0, "&ohbar;"], [0, "&omid;"], [0, "&opar;"], [1, "&operp;"], [1, "&olcross;"], [0, "&odsold;"], [1, "&olcir;"], [0, "&ofcir;"], [0, "&olt;"], [0, "&ogt;"], [0, "&cirscir;"], [0, "&cirE;"], [0, "&solb;"], [0, "&bsolb;"], [3, "&boxbox;"], [3, "&trisb;"], [0, "&rtriltri;"], [0, { v: "&LeftTriangleBar;", n: 824, o: "&NotLeftTriangleBar;" }], [0, { v: "&RightTriangleBar;", n: 824, o: "&NotRightTriangleBar;" }], [11, "&iinfin;"], [0, "&infintie;"], [0, "&nvinfin;"], [4, "&eparsl;"], [0, "&smeparsl;"], [0, "&eqvparsl;"], [5, "&blacklozenge;"], [8, "&RuleDelayed;"], [1, "&dsol;"], [9, "&bigodot;"], [0, "&bigoplus;"], [0, "&bigotimes;"], [1, "&biguplus;"], [1, "&bigsqcup;"], [5, "&iiiint;"], [0, "&fpartint;"], [2, "&cirfnint;"], [0, "&awint;"], [0, "&rppolint;"], [0, "&scpolint;"], [0, "&npolint;"], [0, "&pointint;"], [0, "&quatint;"], [0, "&intlarhk;"], [10, "&pluscir;"], [0, "&plusacir;"], [0, "&simplus;"], [0, "&plusdu;"], [0, "&plussim;"], [0, "&plustwo;"], [1, "&mcomma;"], [0, "&minusdu;"], [2, "&loplus;"], [0, "&roplus;"], [0, "&Cross;"], [0, "&timesd;"], [0, "&timesbar;"], [1, "&smashp;"], [0, "&lotimes;"], [0, "&rotimes;"], [0, "&otimesas;"], [0, "&Otimes;"], [0, "&odiv;"], [0, "&triplus;"], [0, "&triminus;"], [0, "&tritime;"], [0, "&intprod;"], [2, "&amalg;"], [0, "&capdot;"], [1, "&ncup;"], [0, "&ncap;"], [0, "&capand;"], [0, "&cupor;"], [0, "&cupcap;"], [0, "&capcup;"], [0, "&cupbrcap;"], [0, "&capbrcup;"], [0, "&cupcup;"], [0, "&capcap;"], [0, "&ccups;"], [0, "&ccaps;"], [2, "&ccupssm;"], [2, "&And;"], [0, "&Or;"], [0, "&andand;"], [0, "&oror;"], [0, "&orslope;"], [0, "&andslope;"], [1, "&andv;"], [0, "&orv;"], [0, "&andd;"], [0, "&ord;"], [1, "&wedbar;"], [6, "&sdote;"], [3, "&simdot;"], [2, { v: "&congdot;", n: 824, o: "&ncongdot;" }], [0, "&easter;"], [0, "&apacir;"], [0, { v: "&apE;", n: 824, o: "&napE;" }], [0, "&eplus;"], [0, "&pluse;"], [0, "&Esim;"], [0, "&Colone;"], [0, "&Equal;"], [1, "&ddotseq;"], [0, "&equivDD;"], [0, "&ltcir;"], [0, "&gtcir;"], [0, "&ltquest;"], [0, "&gtquest;"], [0, { v: "&leqslant;", n: 824, o: "&nleqslant;" }], [0, { v: "&geqslant;", n: 824, o: "&ngeqslant;" }], [0, "&lesdot;"], [0, "&gesdot;"], [0, "&lesdoto;"], [0, "&gesdoto;"], [0, "&lesdotor;"], [0, "&gesdotol;"], [0, "&lap;"], [0, "&gap;"], [0, "&lne;"], [0, "&gne;"], [0, "&lnap;"], [0, "&gnap;"], [0, "&lEg;"], [0, "&gEl;"], [0, "&lsime;"], [0, "&gsime;"], [0, "&lsimg;"], [0, "&gsiml;"], [0, "&lgE;"], [0, "&glE;"], [0, "&lesges;"], [0, "&gesles;"], [0, "&els;"], [0, "&egs;"], [0, "&elsdot;"], [0, "&egsdot;"], [0, "&el;"], [0, "&eg;"], [2, "&siml;"], [0, "&simg;"], [0, "&simlE;"], [0, "&simgE;"], [0, { v: "&LessLess;", n: 824, o: "&NotNestedLessLess;" }], [0, { v: "&GreaterGreater;", n: 824, o: "&NotNestedGreaterGreater;" }], [1, "&glj;"], [0, "&gla;"], [0, "&ltcc;"], [0, "&gtcc;"], [0, "&lescc;"], [0, "&gescc;"], [0, "&smt;"], [0, "&lat;"], [0, { v: "&smte;", n: 65024, o: "&smtes;" }], [0, { v: "&late;", n: 65024, o: "&lates;" }], [0, "&bumpE;"], [0, { v: "&PrecedesEqual;", n: 824, o: "&NotPrecedesEqual;" }], [0, { v: "&sce;", n: 824, o: "&NotSucceedsEqual;" }], [2, "&prE;"], [0, "&scE;"], [0, "&precneqq;"], [0, "&scnE;"], [0, "&prap;"], [0, "&scap;"], [0, "&precnapprox;"], [0, "&scnap;"], [0, "&Pr;"], [0, "&Sc;"], [0, "&subdot;"], [0, "&supdot;"], [0, "&subplus;"], [0, "&supplus;"], [0, "&submult;"], [0, "&supmult;"], [0, "&subedot;"], [0, "&supedot;"], [0, { v: "&subE;", n: 824, o: "&nsubE;" }], [0, { v: "&supE;", n: 824, o: "&nsupE;" }], [0, "&subsim;"], [0, "&supsim;"], [2, { v: "&subnE;", n: 65024, o: "&varsubsetneqq;" }], [0, { v: "&supnE;", n: 65024, o: "&varsupsetneqq;" }], [2, "&csub;"], [0, "&csup;"], [0, "&csube;"], [0, "&csupe;"], [0, "&subsup;"], [0, "&supsub;"], [0, "&subsub;"], [0, "&supsup;"], [0, "&suphsub;"], [0, "&supdsub;"], [0, "&forkv;"], [0, "&topfork;"], [0, "&mlcp;"], [8, "&Dashv;"], [1, "&Vdashl;"], [0, "&Barv;"], [0, "&vBar;"], [0, "&vBarv;"], [1, "&Vbar;"], [0, "&Not;"], [0, "&bNot;"], [0, "&rnmid;"], [0, "&cirmid;"], [0, "&midcir;"], [0, "&topcir;"], [0, "&nhpar;"], [0, "&parsim;"], [9, { v: "&parsl;", n: 8421, o: "&nparsl;" }], [44343, { n: new Map(/* @__PURE__ */ restoreDiff([[56476, "&Ascr;"], [1, "&Cscr;"], [0, "&Dscr;"], [2, "&Gscr;"], [2, "&Jscr;"], [0, "&Kscr;"], [2, "&Nscr;"], [0, "&Oscr;"], [0, "&Pscr;"], [0, "&Qscr;"], [1, "&Sscr;"], [0, "&Tscr;"], [0, "&Uscr;"], [0, "&Vscr;"], [0, "&Wscr;"], [0, "&Xscr;"], [0, "&Yscr;"], [0, "&Zscr;"], [0, "&ascr;"], [0, "&bscr;"], [0, "&cscr;"], [0, "&dscr;"], [1, "&fscr;"], [1, "&hscr;"], [0, "&iscr;"], [0, "&jscr;"], [0, "&kscr;"], [0, "&lscr;"], [0, "&mscr;"], [0, "&nscr;"], [1, "&pscr;"], [0, "&qscr;"], [0, "&rscr;"], [0, "&sscr;"], [0, "&tscr;"], [0, "&uscr;"], [0, "&vscr;"], [0, "&wscr;"], [0, "&xscr;"], [0, "&yscr;"], [0, "&zscr;"], [52, "&Afr;"], [0, "&Bfr;"], [1, "&Dfr;"], [0, "&Efr;"], [0, "&Ffr;"], [0, "&Gfr;"], [2, "&Jfr;"], [0, "&Kfr;"], [0, "&Lfr;"], [0, "&Mfr;"], [0, "&Nfr;"], [0, "&Ofr;"], [0, "&Pfr;"], [0, "&Qfr;"], [1, "&Sfr;"], [0, "&Tfr;"], [0, "&Ufr;"], [0, "&Vfr;"], [0, "&Wfr;"], [0, "&Xfr;"], [0, "&Yfr;"], [1, "&afr;"], [0, "&bfr;"], [0, "&cfr;"], [0, "&dfr;"], [0, "&efr;"], [0, "&ffr;"], [0, "&gfr;"], [0, "&hfr;"], [0, "&ifr;"], [0, "&jfr;"], [0, "&kfr;"], [0, "&lfr;"], [0, "&mfr;"], [0, "&nfr;"], [0, "&ofr;"], [0, "&pfr;"], [0, "&qfr;"], [0, "&rfr;"], [0, "&sfr;"], [0, "&tfr;"], [0, "&ufr;"], [0, "&vfr;"], [0, "&wfr;"], [0, "&xfr;"], [0, "&yfr;"], [0, "&zfr;"], [0, "&Aopf;"], [0, "&Bopf;"], [1, "&Dopf;"], [0, "&Eopf;"], [0, "&Fopf;"], [0, "&Gopf;"], [1, "&Iopf;"], [0, "&Jopf;"], [0, "&Kopf;"], [0, "&Lopf;"], [0, "&Mopf;"], [1, "&Oopf;"], [3, "&Sopf;"], [0, "&Topf;"], [0, "&Uopf;"], [0, "&Vopf;"], [0, "&Wopf;"], [0, "&Xopf;"], [0, "&Yopf;"], [1, "&aopf;"], [0, "&bopf;"], [0, "&copf;"], [0, "&dopf;"], [0, "&eopf;"], [0, "&fopf;"], [0, "&gopf;"], [0, "&hopf;"], [0, "&iopf;"], [0, "&jopf;"], [0, "&kopf;"], [0, "&lopf;"], [0, "&mopf;"], [0, "&nopf;"], [0, "&oopf;"], [0, "&popf;"], [0, "&qopf;"], [0, "&ropf;"], [0, "&sopf;"], [0, "&topf;"], [0, "&uopf;"], [0, "&vopf;"], [0, "&wopf;"], [0, "&xopf;"], [0, "&yopf;"], [0, "&zopf;"]])) }], [8906, "&fflig;"], [0, "&filig;"], [0, "&fllig;"], [0, "&ffilig;"], [0, "&ffllig;"]]));

  // node_modules/entities/lib/esm/escape.js
  var xmlCodeMap = /* @__PURE__ */ new Map([
    [34, "&quot;"],
    [38, "&amp;"],
    [39, "&apos;"],
    [60, "&lt;"],
    [62, "&gt;"]
  ]);
  var getCodePoint = (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    String.prototype.codePointAt != null ? (str, index) => str.codePointAt(index) : (
      // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
      (c, index) => (c.charCodeAt(index) & 64512) === 55296 ? (c.charCodeAt(index) - 55296) * 1024 + c.charCodeAt(index + 1) - 56320 + 65536 : c.charCodeAt(index)
    )
  );
  function getEscaper(regex, map2) {
    return function escape3(data) {
      let match2;
      let lastIdx = 0;
      let result = "";
      while (match2 = regex.exec(data)) {
        if (lastIdx !== match2.index) {
          result += data.substring(lastIdx, match2.index);
        }
        result += map2.get(match2[0].charCodeAt(0));
        lastIdx = match2.index + 1;
      }
      return result + data.substring(lastIdx);
    };
  }
  var escapeUTF8 = getEscaper(/[&<>'"]/g, xmlCodeMap);
  var escapeAttribute = getEscaper(/["&\u00A0]/g, /* @__PURE__ */ new Map([
    [34, "&quot;"],
    [38, "&amp;"],
    [160, "&nbsp;"]
  ]));
  var escapeText = getEscaper(/[&<>\u00A0]/g, /* @__PURE__ */ new Map([
    [38, "&amp;"],
    [60, "&lt;"],
    [62, "&gt;"],
    [160, "&nbsp;"]
  ]));

  // node_modules/entities/lib/esm/index.js
  var EntityLevel;
  (function(EntityLevel2) {
    EntityLevel2[EntityLevel2["XML"] = 0] = "XML";
    EntityLevel2[EntityLevel2["HTML"] = 1] = "HTML";
  })(EntityLevel || (EntityLevel = {}));
  var EncodingMode;
  (function(EncodingMode2) {
    EncodingMode2[EncodingMode2["UTF8"] = 0] = "UTF8";
    EncodingMode2[EncodingMode2["ASCII"] = 1] = "ASCII";
    EncodingMode2[EncodingMode2["Extensive"] = 2] = "Extensive";
    EncodingMode2[EncodingMode2["Attribute"] = 3] = "Attribute";
    EncodingMode2[EncodingMode2["Text"] = 4] = "Text";
  })(EncodingMode || (EncodingMode = {}));

  // node_modules/markdown-it/lib/common/utils.mjs
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function isString(obj) {
    return _class(obj) === "[object String]";
  }
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  function has(object4, key) {
    return _hasOwnProperty.call(object4, key);
  }
  function assign(obj) {
    const sources = Array.prototype.slice.call(arguments, 1);
    sources.forEach(function(source) {
      if (!source) {
        return;
      }
      if (typeof source !== "object") {
        throw new TypeError(source + "must be object");
      }
      Object.keys(source).forEach(function(key) {
        obj[key] = source[key];
      });
    });
    return obj;
  }
  function arrayReplaceAt(src, pos, newElements) {
    return [].concat(src.slice(0, pos), newElements, src.slice(pos + 1));
  }
  function isValidEntityCode(c) {
    if (c >= 55296 && c <= 57343) {
      return false;
    }
    if (c >= 64976 && c <= 65007) {
      return false;
    }
    if ((c & 65535) === 65535 || (c & 65535) === 65534) {
      return false;
    }
    if (c >= 0 && c <= 8) {
      return false;
    }
    if (c === 11) {
      return false;
    }
    if (c >= 14 && c <= 31) {
      return false;
    }
    if (c >= 127 && c <= 159) {
      return false;
    }
    if (c > 1114111) {
      return false;
    }
    return true;
  }
  function fromCodePoint2(c) {
    if (c > 65535) {
      c -= 65536;
      const surrogate1 = 55296 + (c >> 10);
      const surrogate2 = 56320 + (c & 1023);
      return String.fromCharCode(surrogate1, surrogate2);
    }
    return String.fromCharCode(c);
  }
  var UNESCAPE_MD_RE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
  var ENTITY_RE = /&([a-z#][a-z0-9]{1,31});/gi;
  var UNESCAPE_ALL_RE = new RegExp(UNESCAPE_MD_RE.source + "|" + ENTITY_RE.source, "gi");
  var DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))$/i;
  function replaceEntityPattern(match2, name) {
    if (name.charCodeAt(0) === 35 && DIGITAL_ENTITY_TEST_RE.test(name)) {
      const code2 = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      if (isValidEntityCode(code2)) {
        return fromCodePoint2(code2);
      }
      return match2;
    }
    const decoded = decodeHTML(match2);
    if (decoded !== match2) {
      return decoded;
    }
    return match2;
  }
  function unescapeMd(str) {
    if (str.indexOf("\\") < 0) {
      return str;
    }
    return str.replace(UNESCAPE_MD_RE, "$1");
  }
  function unescapeAll(str) {
    if (str.indexOf("\\") < 0 && str.indexOf("&") < 0) {
      return str;
    }
    return str.replace(UNESCAPE_ALL_RE, function(match2, escaped, entity2) {
      if (escaped) {
        return escaped;
      }
      return replaceEntityPattern(match2, entity2);
    });
  }
  var HTML_ESCAPE_TEST_RE = /[&<>"]/;
  var HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
  var HTML_REPLACEMENTS = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  };
  function replaceUnsafeChar(ch) {
    return HTML_REPLACEMENTS[ch];
  }
  function escapeHtml(str) {
    if (HTML_ESCAPE_TEST_RE.test(str)) {
      return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
    }
    return str;
  }
  var REGEXP_ESCAPE_RE = /[.?*+^$[\]\\(){}|-]/g;
  function escapeRE(str) {
    return str.replace(REGEXP_ESCAPE_RE, "\\$&");
  }
  function isSpace(code2) {
    switch (code2) {
      case 9:
      case 32:
        return true;
    }
    return false;
  }
  function isWhiteSpace(code2) {
    if (code2 >= 8192 && code2 <= 8202) {
      return true;
    }
    switch (code2) {
      case 9:
      // \t
      case 10:
      // \n
      case 11:
      // \v
      case 12:
      // \f
      case 13:
      // \r
      case 32:
      case 160:
      case 5760:
      case 8239:
      case 8287:
      case 12288:
        return true;
    }
    return false;
  }
  function isPunctChar(ch) {
    return regex_default4.test(ch) || regex_default5.test(ch);
  }
  function isPunctCharCode(code2) {
    return isPunctChar(fromCodePoint2(code2));
  }
  function isMdAsciiPunct(ch) {
    switch (ch) {
      case 33:
      case 34:
      case 35:
      case 36:
      case 37:
      case 38:
      case 39:
      case 40:
      case 41:
      case 42:
      case 43:
      case 44:
      case 45:
      case 46:
      case 47:
      case 58:
      case 59:
      case 60:
      case 61:
      case 62:
      case 63:
      case 64:
      case 91:
      case 92:
      case 93:
      case 94:
      case 95:
      case 96:
      case 123:
      case 124:
      case 125:
      case 126:
        return true;
      default:
        return false;
    }
  }
  function normalizeReference(str) {
    str = str.trim().replace(/\s+/g, " ");
    if ("\u1E9E".toLowerCase() === "\u1E7E") {
      str = str.replace(/ẞ/g, "\xDF");
    }
    return str.toLowerCase().toUpperCase();
  }
  function isAsciiTrimmable(c) {
    return c === 32 || c === 9 || c === 10 || c === 13;
  }
  function asciiTrim(str) {
    let start = 0;
    for (; start < str.length; start++) {
      if (!isAsciiTrimmable(str.charCodeAt(start))) {
        break;
      }
    }
    let end = str.length - 1;
    for (; end >= start; end--) {
      if (!isAsciiTrimmable(str.charCodeAt(end))) {
        break;
      }
    }
    return str.slice(start, end + 1);
  }
  var lib = { mdurl: mdurl_exports, ucmicro: uc_exports };

  // node_modules/markdown-it/lib/helpers/index.mjs
  var helpers_exports = {};
  __export(helpers_exports, {
    parseLinkDestination: () => parseLinkDestination,
    parseLinkLabel: () => parseLinkLabel,
    parseLinkTitle: () => parseLinkTitle
  });

  // node_modules/markdown-it/lib/helpers/parse_link_label.mjs
  function parseLinkLabel(state, start, disableNested) {
    let level, found, marker, prevPos;
    const max = state.posMax;
    const oldPos = state.pos;
    state.pos = start + 1;
    level = 1;
    while (state.pos < max) {
      marker = state.src.charCodeAt(state.pos);
      if (marker === 93) {
        level--;
        if (level === 0) {
          found = true;
          break;
        }
      }
      prevPos = state.pos;
      state.md.inline.skipToken(state);
      if (marker === 91) {
        if (prevPos === state.pos - 1) {
          level++;
        } else if (disableNested) {
          state.pos = oldPos;
          return -1;
        }
      }
    }
    let labelEnd = -1;
    if (found) {
      labelEnd = state.pos;
    }
    state.pos = oldPos;
    return labelEnd;
  }

  // node_modules/markdown-it/lib/helpers/parse_link_destination.mjs
  function parseLinkDestination(str, start, max) {
    let code2;
    let pos = start;
    const result = {
      ok: false,
      pos: 0,
      str: ""
    };
    if (str.charCodeAt(pos) === 60) {
      pos++;
      while (pos < max) {
        code2 = str.charCodeAt(pos);
        if (code2 === 10) {
          return result;
        }
        if (code2 === 60) {
          return result;
        }
        if (code2 === 62) {
          result.pos = pos + 1;
          result.str = unescapeAll(str.slice(start + 1, pos));
          result.ok = true;
          return result;
        }
        if (code2 === 92 && pos + 1 < max) {
          pos += 2;
          continue;
        }
        pos++;
      }
      return result;
    }
    let level = 0;
    while (pos < max) {
      code2 = str.charCodeAt(pos);
      if (code2 === 32) {
        break;
      }
      if (code2 < 32 || code2 === 127) {
        break;
      }
      if (code2 === 92 && pos + 1 < max) {
        if (str.charCodeAt(pos + 1) === 32) {
          pos++;
          continue;
        }
        pos += 2;
        continue;
      }
      if (code2 === 40) {
        level++;
        if (level > 32) {
          return result;
        }
      }
      if (code2 === 41) {
        if (level === 0) {
          break;
        }
        level--;
      }
      pos++;
    }
    if (start === pos) {
      return result;
    }
    if (level !== 0) {
      return result;
    }
    result.str = unescapeAll(str.slice(start, pos));
    result.pos = pos;
    result.ok = true;
    return result;
  }

  // node_modules/markdown-it/lib/helpers/parse_link_title.mjs
  function parseLinkTitle(str, start, max, prev_state) {
    let code2;
    let pos = start;
    const state = {
      // if `true`, this is a valid link title
      ok: false,
      // if `true`, this link can be continued on the next line
      can_continue: false,
      // if `ok`, it's the position of the first character after the closing marker
      pos: 0,
      // if `ok`, it's the unescaped title
      str: "",
      // expected closing marker character code
      marker: 0
    };
    if (prev_state) {
      state.str = prev_state.str;
      state.marker = prev_state.marker;
    } else {
      if (pos >= max) {
        return state;
      }
      let marker = str.charCodeAt(pos);
      if (marker !== 34 && marker !== 39 && marker !== 40) {
        return state;
      }
      start++;
      pos++;
      if (marker === 40) {
        marker = 41;
      }
      state.marker = marker;
    }
    while (pos < max) {
      code2 = str.charCodeAt(pos);
      if (code2 === state.marker) {
        state.pos = pos + 1;
        state.str += unescapeAll(str.slice(start, pos));
        state.ok = true;
        return state;
      } else if (code2 === 40 && state.marker === 41) {
        return state;
      } else if (code2 === 92 && pos + 1 < max) {
        pos++;
      }
      pos++;
    }
    state.can_continue = true;
    state.str += unescapeAll(str.slice(start, pos));
    return state;
  }

  // node_modules/markdown-it/lib/renderer.mjs
  var default_rules = {};
  default_rules.code_inline = function(tokens, idx, options, env, slf) {
    const token3 = tokens[idx];
    return "<code" + slf.renderAttrs(token3) + ">" + escapeHtml(token3.content) + "</code>";
  };
  default_rules.code_block = function(tokens, idx, options, env, slf) {
    const token3 = tokens[idx];
    return "<pre" + slf.renderAttrs(token3) + "><code>" + escapeHtml(tokens[idx].content) + "</code></pre>\n";
  };
  default_rules.fence = function(tokens, idx, options, env, slf) {
    const token3 = tokens[idx];
    const info = token3.info ? unescapeAll(token3.info).trim() : "";
    let langName = "";
    let langAttrs = "";
    if (info) {
      const arr = info.split(/(\s+)/g);
      langName = arr[0];
      langAttrs = arr.slice(2).join("");
    }
    let highlighted;
    if (options.highlight) {
      highlighted = options.highlight(token3.content, langName, langAttrs) || escapeHtml(token3.content);
    } else {
      highlighted = escapeHtml(token3.content);
    }
    if (highlighted.indexOf("<pre") === 0) {
      return highlighted + "\n";
    }
    if (info) {
      const i = token3.attrIndex("class");
      const tmpAttrs = token3.attrs ? token3.attrs.slice() : [];
      if (i < 0) {
        tmpAttrs.push(["class", options.langPrefix + langName]);
      } else {
        tmpAttrs[i] = tmpAttrs[i].slice();
        tmpAttrs[i][1] += " " + options.langPrefix + langName;
      }
      const tmpToken = {
        attrs: tmpAttrs
      };
      return `<pre><code${slf.renderAttrs(tmpToken)}>${highlighted}</code></pre>
`;
    }
    return `<pre><code${slf.renderAttrs(token3)}>${highlighted}</code></pre>
`;
  };
  default_rules.image = function(tokens, idx, options, env, slf) {
    const token3 = tokens[idx];
    token3.attrs[token3.attrIndex("alt")][1] = slf.renderInlineAsText(token3.children, options, env);
    return slf.renderToken(tokens, idx, options);
  };
  default_rules.hardbreak = function(tokens, idx, options) {
    return options.xhtmlOut ? "<br />\n" : "<br>\n";
  };
  default_rules.softbreak = function(tokens, idx, options) {
    return options.breaks ? options.xhtmlOut ? "<br />\n" : "<br>\n" : "\n";
  };
  default_rules.text = function(tokens, idx) {
    return escapeHtml(tokens[idx].content);
  };
  default_rules.html_block = function(tokens, idx) {
    return tokens[idx].content;
  };
  default_rules.html_inline = function(tokens, idx) {
    return tokens[idx].content;
  };
  function Renderer() {
    this.rules = assign({}, default_rules);
  }
  Renderer.prototype.renderAttrs = function renderAttrs(token3) {
    let i, l, result;
    if (!token3.attrs) {
      return "";
    }
    result = "";
    for (i = 0, l = token3.attrs.length; i < l; i++) {
      result += " " + escapeHtml(token3.attrs[i][0]) + '="' + escapeHtml(token3.attrs[i][1]) + '"';
    }
    return result;
  };
  Renderer.prototype.renderToken = function renderToken(tokens, idx, options) {
    const token3 = tokens[idx];
    let result = "";
    if (token3.hidden) {
      return "";
    }
    if (token3.block && token3.nesting !== -1 && idx && tokens[idx - 1].hidden) {
      result += "\n";
    }
    result += (token3.nesting === -1 ? "</" : "<") + token3.tag;
    result += this.renderAttrs(token3);
    if (token3.nesting === 0 && options.xhtmlOut) {
      result += " /";
    }
    let needLf = false;
    if (token3.block) {
      needLf = true;
      if (token3.nesting === 1) {
        if (idx + 1 < tokens.length) {
          const nextToken = tokens[idx + 1];
          if (nextToken.type === "inline" || nextToken.hidden) {
            needLf = false;
          } else if (nextToken.nesting === -1 && nextToken.tag === token3.tag) {
            needLf = false;
          }
        }
      }
    }
    result += needLf ? ">\n" : ">";
    return result;
  };
  Renderer.prototype.renderInline = function(tokens, options, env) {
    let result = "";
    const rules = this.rules;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const type = tokens[i].type;
      if (typeof rules[type] !== "undefined") {
        result += rules[type](tokens, i, options, env, this);
      } else {
        result += this.renderToken(tokens, i, options);
      }
    }
    return result;
  };
  Renderer.prototype.renderInlineAsText = function(tokens, options, env) {
    let result = "";
    for (let i = 0, len = tokens.length; i < len; i++) {
      switch (tokens[i].type) {
        case "text":
          result += tokens[i].content;
          break;
        case "image":
          result += this.renderInlineAsText(tokens[i].children, options, env);
          break;
        case "html_inline":
        case "html_block":
          result += tokens[i].content;
          break;
        case "softbreak":
        case "hardbreak":
          result += "\n";
          break;
        default:
      }
    }
    return result;
  };
  Renderer.prototype.render = function(tokens, options, env) {
    let result = "";
    const rules = this.rules;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const type = tokens[i].type;
      if (type === "inline") {
        result += this.renderInline(tokens[i].children, options, env);
      } else if (typeof rules[type] !== "undefined") {
        result += rules[type](tokens, i, options, env, this);
      } else {
        result += this.renderToken(tokens, i, options, env);
      }
    }
    return result;
  };
  var renderer_default = Renderer;

  // node_modules/markdown-it/lib/ruler.mjs
  function Ruler() {
    this.__rules__ = [];
    this.__cache__ = null;
  }
  Ruler.prototype.__find__ = function(name) {
    for (let i = 0; i < this.__rules__.length; i++) {
      if (this.__rules__[i].name === name) {
        return i;
      }
    }
    return -1;
  };
  Ruler.prototype.__compile__ = function() {
    const self = this;
    const chains = [""];
    self.__rules__.forEach(function(rule) {
      if (!rule.enabled) {
        return;
      }
      rule.alt.forEach(function(altName) {
        if (chains.indexOf(altName) < 0) {
          chains.push(altName);
        }
      });
    });
    self.__cache__ = {};
    chains.forEach(function(chain) {
      self.__cache__[chain] = [];
      self.__rules__.forEach(function(rule) {
        if (!rule.enabled) {
          return;
        }
        if (chain && rule.alt.indexOf(chain) < 0) {
          return;
        }
        self.__cache__[chain].push(rule.fn);
      });
    });
  };
  Ruler.prototype.at = function(name, fn, options) {
    const index = this.__find__(name);
    const opt = options || {};
    if (index === -1) {
      throw new Error("Parser rule not found: " + name);
    }
    this.__rules__[index].fn = fn;
    this.__rules__[index].alt = opt.alt || [];
    this.__cache__ = null;
  };
  Ruler.prototype.before = function(beforeName, ruleName, fn, options) {
    const index = this.__find__(beforeName);
    const opt = options || {};
    if (index === -1) {
      throw new Error("Parser rule not found: " + beforeName);
    }
    this.__rules__.splice(index, 0, {
      name: ruleName,
      enabled: true,
      fn,
      alt: opt.alt || []
    });
    this.__cache__ = null;
  };
  Ruler.prototype.after = function(afterName, ruleName, fn, options) {
    const index = this.__find__(afterName);
    const opt = options || {};
    if (index === -1) {
      throw new Error("Parser rule not found: " + afterName);
    }
    this.__rules__.splice(index + 1, 0, {
      name: ruleName,
      enabled: true,
      fn,
      alt: opt.alt || []
    });
    this.__cache__ = null;
  };
  Ruler.prototype.push = function(ruleName, fn, options) {
    const opt = options || {};
    this.__rules__.push({
      name: ruleName,
      enabled: true,
      fn,
      alt: opt.alt || []
    });
    this.__cache__ = null;
  };
  Ruler.prototype.enable = function(list3, ignoreInvalid) {
    if (!Array.isArray(list3)) {
      list3 = [list3];
    }
    const result = [];
    list3.forEach(function(name) {
      const idx = this.__find__(name);
      if (idx < 0) {
        if (ignoreInvalid) {
          return;
        }
        throw new Error("Rules manager: invalid rule name " + name);
      }
      this.__rules__[idx].enabled = true;
      result.push(name);
    }, this);
    this.__cache__ = null;
    return result;
  };
  Ruler.prototype.enableOnly = function(list3, ignoreInvalid) {
    if (!Array.isArray(list3)) {
      list3 = [list3];
    }
    this.__rules__.forEach(function(rule) {
      rule.enabled = false;
    });
    this.enable(list3, ignoreInvalid);
  };
  Ruler.prototype.disable = function(list3, ignoreInvalid) {
    if (!Array.isArray(list3)) {
      list3 = [list3];
    }
    const result = [];
    list3.forEach(function(name) {
      const idx = this.__find__(name);
      if (idx < 0) {
        if (ignoreInvalid) {
          return;
        }
        throw new Error("Rules manager: invalid rule name " + name);
      }
      this.__rules__[idx].enabled = false;
      result.push(name);
    }, this);
    this.__cache__ = null;
    return result;
  };
  Ruler.prototype.getRules = function(chainName) {
    if (this.__cache__ === null) {
      this.__compile__();
    }
    return this.__cache__[chainName] || [];
  };
  var ruler_default = Ruler;

  // node_modules/markdown-it/lib/token.mjs
  function Token(type, tag, nesting) {
    this.type = type;
    this.tag = tag;
    this.attrs = null;
    this.map = null;
    this.nesting = nesting;
    this.level = 0;
    this.children = null;
    this.content = "";
    this.markup = "";
    this.info = "";
    this.meta = null;
    this.block = false;
    this.hidden = false;
  }
  Token.prototype.attrIndex = function attrIndex(name) {
    if (!this.attrs) {
      return -1;
    }
    const attrs2 = this.attrs;
    for (let i = 0, len = attrs2.length; i < len; i++) {
      if (attrs2[i][0] === name) {
        return i;
      }
    }
    return -1;
  };
  Token.prototype.attrPush = function attrPush(attrData) {
    if (this.attrs) {
      this.attrs.push(attrData);
    } else {
      this.attrs = [attrData];
    }
  };
  Token.prototype.attrSet = function attrSet(name, value) {
    const idx = this.attrIndex(name);
    const attrData = [name, value];
    if (idx < 0) {
      this.attrPush(attrData);
    } else {
      this.attrs[idx] = attrData;
    }
  };
  Token.prototype.attrGet = function attrGet(name) {
    const idx = this.attrIndex(name);
    let value = null;
    if (idx >= 0) {
      value = this.attrs[idx][1];
    }
    return value;
  };
  Token.prototype.attrJoin = function attrJoin(name, value) {
    const idx = this.attrIndex(name);
    if (idx < 0) {
      this.attrPush([name, value]);
    } else {
      this.attrs[idx][1] = this.attrs[idx][1] + " " + value;
    }
  };
  var token_default = Token;

  // node_modules/markdown-it/lib/rules_core/state_core.mjs
  function StateCore(src, md2, env) {
    this.src = src;
    this.env = env;
    this.tokens = [];
    this.inlineMode = false;
    this.md = md2;
  }
  StateCore.prototype.Token = token_default;
  var state_core_default = StateCore;

  // node_modules/markdown-it/lib/rules_core/normalize.mjs
  var NEWLINES_RE = /\r\n?|\n/g;
  var NULL_RE = /\0/g;
  function normalize(state) {
    let str;
    str = state.src.replace(NEWLINES_RE, "\n");
    str = str.replace(NULL_RE, "\uFFFD");
    state.src = str;
  }

  // node_modules/markdown-it/lib/rules_core/block.mjs
  function block(state) {
    let token3;
    if (state.inlineMode) {
      token3 = new state.Token("inline", "", 0);
      token3.content = state.src;
      token3.map = [0, 1];
      token3.children = [];
      state.tokens.push(token3);
    } else {
      state.md.block.parse(state.src, state.md, state.env, state.tokens);
    }
  }

  // node_modules/markdown-it/lib/rules_core/inline.mjs
  function inline(state) {
    const tokens = state.tokens;
    for (let i = 0, l = tokens.length; i < l; i++) {
      const tok = tokens[i];
      if (tok.type === "inline") {
        state.md.inline.parse(tok.content, state.md, state.env, tok.children);
      }
    }
  }

  // node_modules/markdown-it/lib/rules_core/linkify.mjs
  function isLinkOpen(str) {
    return /^<a[>\s]/i.test(str);
  }
  function isLinkClose(str) {
    return /^<\/a\s*>/i.test(str);
  }
  function linkify(state) {
    const blockTokens = state.tokens;
    if (!state.md.options.linkify) {
      return;
    }
    for (let j = 0, l = blockTokens.length; j < l; j++) {
      if (blockTokens[j].type !== "inline" || !state.md.linkify.pretest(blockTokens[j].content)) {
        continue;
      }
      const tokens = blockTokens[j].children;
      const replacements = [];
      let htmlLinkLevel = 0;
      for (let i = tokens.length - 1; i >= 0; i--) {
        const currentToken = tokens[i];
        if (currentToken.type === "link_close") {
          i--;
          while (tokens[i].level !== currentToken.level && tokens[i].type !== "link_open") {
            i--;
          }
          continue;
        }
        if (currentToken.type === "html_inline") {
          if (isLinkOpen(currentToken.content) && htmlLinkLevel > 0) {
            htmlLinkLevel--;
          }
          if (isLinkClose(currentToken.content)) {
            htmlLinkLevel++;
          }
        }
        if (htmlLinkLevel > 0) {
          continue;
        }
        if (currentToken.type === "text" && state.md.linkify.test(currentToken.content)) {
          const text3 = currentToken.content;
          let links = state.md.linkify.match(text3);
          const nodes = [];
          let level = currentToken.level;
          let lastPos = 0;
          if (links.length > 0 && links[0].index === 0 && i > 0 && tokens[i - 1].type === "text_special") {
            links = links.slice(1);
          }
          for (let ln = 0; ln < links.length; ln++) {
            const url = links[ln].url;
            const fullUrl = state.md.normalizeLink(url);
            if (!state.md.validateLink(fullUrl)) {
              continue;
            }
            let urlText = links[ln].text;
            if (!links[ln].schema) {
              urlText = state.md.normalizeLinkText("http://" + urlText).replace(/^http:\/\//, "");
            } else if (links[ln].schema === "mailto:" && !/^mailto:/i.test(urlText)) {
              urlText = state.md.normalizeLinkText("mailto:" + urlText).replace(/^mailto:/, "");
            } else {
              urlText = state.md.normalizeLinkText(urlText);
            }
            const pos = links[ln].index;
            if (pos > lastPos) {
              const token3 = new state.Token("text", "", 0);
              token3.content = text3.slice(lastPos, pos);
              token3.level = level;
              nodes.push(token3);
            }
            const token_o = new state.Token("link_open", "a", 1);
            token_o.attrs = [["href", fullUrl]];
            token_o.level = level++;
            token_o.markup = "linkify";
            token_o.info = "auto";
            nodes.push(token_o);
            const token_t = new state.Token("text", "", 0);
            token_t.content = urlText;
            token_t.level = level;
            nodes.push(token_t);
            const token_c = new state.Token("link_close", "a", -1);
            token_c.level = --level;
            token_c.markup = "linkify";
            token_c.info = "auto";
            nodes.push(token_c);
            lastPos = links[ln].lastIndex;
          }
          if (lastPos < text3.length) {
            const token3 = new state.Token("text", "", 0);
            token3.content = text3.slice(lastPos);
            token3.level = level;
            nodes.push(token3);
          }
          replacements.push({ index: i, nodes });
        }
      }
      if (replacements.length > 0) {
        let newTokensLength = tokens.length;
        for (const replacement of replacements) {
          newTokensLength += replacement.nodes.length - 1;
        }
        const newTokens = new Array(newTokensLength);
        let replacementIndex = 0;
        let newTokenIndex = 0;
        replacements.reverse();
        for (let i = 0; i < tokens.length; i++) {
          const replacement = replacements[replacementIndex];
          if (replacement?.index === i) {
            for (const node of replacement.nodes) {
              newTokens[newTokenIndex++] = node;
            }
            replacementIndex++;
          } else {
            newTokens[newTokenIndex++] = tokens[i];
          }
        }
        blockTokens[j].children = newTokens;
      }
    }
  }

  // node_modules/markdown-it/lib/rules_core/replacements.mjs
  var RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/;
  var SCOPED_ABBR_TEST_RE = /\((c|tm|r)\)/i;
  var SCOPED_ABBR_RE = /\((c|tm|r)\)/ig;
  var SCOPED_ABBR = {
    c: "\xA9",
    r: "\xAE",
    tm: "\u2122"
  };
  function replaceFn(match2, name) {
    return SCOPED_ABBR[name.toLowerCase()];
  }
  function replace_scoped(inlineTokens) {
    let inside_autolink = 0;
    for (let i = inlineTokens.length - 1; i >= 0; i--) {
      const token3 = inlineTokens[i];
      if (token3.type === "text" && !inside_autolink) {
        token3.content = token3.content.replace(SCOPED_ABBR_RE, replaceFn);
      }
      if (token3.type === "link_open" && token3.info === "auto") {
        inside_autolink--;
      }
      if (token3.type === "link_close" && token3.info === "auto") {
        inside_autolink++;
      }
    }
  }
  function replace_rare(inlineTokens) {
    let inside_autolink = 0;
    for (let i = inlineTokens.length - 1; i >= 0; i--) {
      const token3 = inlineTokens[i];
      if (token3.type === "text" && !inside_autolink) {
        if (RARE_RE.test(token3.content)) {
          token3.content = token3.content.replace(/\+-/g, "\xB1").replace(/\.{2,}/g, "\u2026").replace(/([?!])…/g, "$1..").replace(/([?!]){4,}/g, "$1$1$1").replace(/,{2,}/g, ",").replace(/(^|[^-])---(?=[^-]|$)/mg, "$1\u2014").replace(/(^|\s)--(?=\s|$)/mg, "$1\u2013").replace(/(^|[^-\s])--(?=[^-\s]|$)/mg, "$1\u2013");
        }
      }
      if (token3.type === "link_open" && token3.info === "auto") {
        inside_autolink--;
      }
      if (token3.type === "link_close" && token3.info === "auto") {
        inside_autolink++;
      }
    }
  }
  function replace(state) {
    let blkIdx;
    if (!state.md.options.typographer) {
      return;
    }
    for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
      if (state.tokens[blkIdx].type !== "inline") {
        continue;
      }
      if (SCOPED_ABBR_TEST_RE.test(state.tokens[blkIdx].content)) {
        replace_scoped(state.tokens[blkIdx].children);
      }
      if (RARE_RE.test(state.tokens[blkIdx].content)) {
        replace_rare(state.tokens[blkIdx].children);
      }
    }
  }

  // node_modules/markdown-it/lib/rules_core/smartquotes.mjs
  var QUOTE_TEST_RE = /['"]/;
  var QUOTE_RE = /['"]/g;
  var APOSTROPHE = "\u2019";
  var MAX_OPENERS = 1e3;
  function truncateStack(stack, heads, length) {
    while (stack.length > length) {
      const item = stack.pop();
      if (item.isSingleQuote) {
        heads.single = item.prevSameQuoteIdx;
      } else {
        heads.double = item.prevSameQuoteIdx;
      }
    }
  }
  function addReplacement(replacements, tokenIdx, pos, ch) {
    if (!replacements[tokenIdx]) {
      replacements[tokenIdx] = [];
    }
    replacements[tokenIdx].push({ pos, ch });
  }
  function applyReplacements(str, replacements) {
    let result = "";
    let lastPos = 0;
    replacements.sort((a, b) => a.pos - b.pos);
    for (let i = 0; i < replacements.length; i++) {
      const replacement = replacements[i];
      result += str.slice(lastPos, replacement.pos) + replacement.ch;
      lastPos = replacement.pos + 1;
    }
    return result + str.slice(lastPos);
  }
  function process_inlines(tokens, state) {
    let j;
    const stack = [];
    const heads = { single: -1, double: -1 };
    const replacements = {};
    for (let i = 0; i < tokens.length; i++) {
      const token3 = tokens[i];
      const thisLevel = tokens[i].level;
      for (j = stack.length - 1; j >= 0; j--) {
        if (stack[j].level <= thisLevel) {
          break;
        }
      }
      truncateStack(stack, heads, j + 1);
      if (token3.type !== "text") {
        continue;
      }
      const text3 = token3.content;
      let pos = 0;
      const max = text3.length;
      OUTER:
        while (pos < max) {
          QUOTE_RE.lastIndex = pos;
          const t = QUOTE_RE.exec(text3);
          if (!t) {
            break;
          }
          let canOpen = true;
          let canClose = true;
          pos = t.index + 1;
          const isSingle = t[0] === "'";
          let lastChar = 32;
          if (t.index - 1 >= 0) {
            lastChar = text3.charCodeAt(t.index - 1);
          } else {
            for (j = i - 1; j >= 0; j--) {
              if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
              if (!tokens[j].content) continue;
              lastChar = tokens[j].content.charCodeAt(tokens[j].content.length - 1);
              break;
            }
          }
          let nextChar = 32;
          if (pos < max) {
            nextChar = text3.charCodeAt(pos);
          } else {
            for (j = i + 1; j < tokens.length; j++) {
              if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
              if (!tokens[j].content) continue;
              nextChar = tokens[j].content.charCodeAt(0);
              break;
            }
          }
          const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctCharCode(lastChar);
          const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctCharCode(nextChar);
          const isLastWhiteSpace = isWhiteSpace(lastChar);
          const isNextWhiteSpace = isWhiteSpace(nextChar);
          if (isNextWhiteSpace) {
            canOpen = false;
          } else if (isNextPunctChar) {
            if (!(isLastWhiteSpace || isLastPunctChar)) {
              canOpen = false;
            }
          }
          if (isLastWhiteSpace) {
            canClose = false;
          } else if (isLastPunctChar) {
            if (!(isNextWhiteSpace || isNextPunctChar)) {
              canClose = false;
            }
          }
          if (nextChar === 34 && t[0] === '"') {
            if (lastChar >= 48 && lastChar <= 57) {
              canClose = canOpen = false;
            }
          }
          if (canOpen && canClose) {
            canOpen = isLastPunctChar;
            canClose = isNextPunctChar;
          }
          if (!canOpen && !canClose) {
            if (isSingle) {
              addReplacement(replacements, i, t.index, APOSTROPHE);
            }
            continue;
          }
          if (canClose) {
            j = isSingle ? heads.single : heads.double;
            if (j >= 0 && stack[j].level === thisLevel) {
              const item = stack[j];
              let openQuote;
              let closeQuote;
              if (isSingle) {
                openQuote = state.md.options.quotes[2];
                closeQuote = state.md.options.quotes[3];
              } else {
                openQuote = state.md.options.quotes[0];
                closeQuote = state.md.options.quotes[1];
              }
              addReplacement(replacements, i, t.index, closeQuote);
              addReplacement(replacements, item.tokenIdx, item.contentPos, openQuote);
              truncateStack(stack, heads, j);
              continue OUTER;
            }
          }
          if (canOpen) {
            if (stack.length >= MAX_OPENERS) {
              return;
            }
            stack.push({
              tokenIdx: i,
              contentPos: t.index,
              isSingleQuote: isSingle,
              level: thisLevel,
              // stack index of the previous opener of the same quote type, -1 if none
              prevSameQuoteIdx: isSingle ? heads.single : heads.double
            });
            if (isSingle) {
              heads.single = stack.length - 1;
            } else {
              heads.double = stack.length - 1;
            }
          } else if (canClose && isSingle) {
            addReplacement(replacements, i, t.index, APOSTROPHE);
          }
        }
    }
    Object.keys(replacements).forEach(function(tokenIdx) {
      tokens[tokenIdx].content = applyReplacements(tokens[tokenIdx].content, replacements[tokenIdx]);
    });
  }
  function smartquotes(state) {
    if (!state.md.options.typographer) {
      return;
    }
    for (let blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
      if (state.tokens[blkIdx].type !== "inline" || !QUOTE_TEST_RE.test(state.tokens[blkIdx].content)) {
        continue;
      }
      process_inlines(state.tokens[blkIdx].children, state);
    }
  }

  // node_modules/markdown-it/lib/rules_core/text_join.mjs
  function text_join(state) {
    let curr, last;
    const blockTokens = state.tokens;
    const l = blockTokens.length;
    for (let j = 0; j < l; j++) {
      if (blockTokens[j].type !== "inline") continue;
      const tokens = blockTokens[j].children;
      const max = tokens.length;
      for (curr = 0; curr < max; curr++) {
        if (tokens[curr].type === "text_special") {
          tokens[curr].type = "text";
        }
      }
      for (curr = last = 0; curr < max; curr++) {
        if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") {
          tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
        } else {
          if (curr !== last) {
            tokens[last] = tokens[curr];
          }
          last++;
        }
      }
      if (curr !== last) {
        tokens.length = last;
      }
    }
  }

  // node_modules/markdown-it/lib/parser_core.mjs
  var _rules = [
    ["normalize", normalize],
    ["block", block],
    ["inline", inline],
    ["linkify", linkify],
    ["replacements", replace],
    ["smartquotes", smartquotes],
    // `text_join` finds `text_special` tokens (for escape sequences)
    // and joins them with the rest of the text
    ["text_join", text_join]
  ];
  function Core() {
    this.ruler = new ruler_default();
    for (let i = 0; i < _rules.length; i++) {
      this.ruler.push(_rules[i][0], _rules[i][1]);
    }
  }
  Core.prototype.process = function(state) {
    const rules = this.ruler.getRules("");
    for (let i = 0, l = rules.length; i < l; i++) {
      rules[i](state);
    }
  };
  Core.prototype.State = state_core_default;
  var parser_core_default = Core;

  // node_modules/markdown-it/lib/rules_block/state_block.mjs
  function StateBlock(src, md2, env, tokens) {
    this.src = src;
    this.md = md2;
    this.env = env;
    this.tokens = tokens;
    this.bMarks = [];
    this.eMarks = [];
    this.tShift = [];
    this.sCount = [];
    this.bsCount = [];
    this.blkIndent = 0;
    this.line = 0;
    this.lineMax = 0;
    this.tight = false;
    this.ddIndent = -1;
    this.listIndent = -1;
    this.parentType = "root";
    this.level = 0;
    const s = this.src;
    for (let start = 0, pos = 0, indent = 0, offset = 0, len = s.length, indent_found = false; pos < len; pos++) {
      const ch = s.charCodeAt(pos);
      if (!indent_found) {
        if (isSpace(ch)) {
          indent++;
          if (ch === 9) {
            offset += 4 - offset % 4;
          } else {
            offset++;
          }
          continue;
        } else {
          indent_found = true;
        }
      }
      if (ch === 10 || pos === len - 1) {
        if (ch !== 10) {
          pos++;
        }
        this.bMarks.push(start);
        this.eMarks.push(pos);
        this.tShift.push(indent);
        this.sCount.push(offset);
        this.bsCount.push(0);
        indent_found = false;
        indent = 0;
        offset = 0;
        start = pos + 1;
      }
    }
    this.bMarks.push(s.length);
    this.eMarks.push(s.length);
    this.tShift.push(0);
    this.sCount.push(0);
    this.bsCount.push(0);
    this.lineMax = this.bMarks.length - 1;
  }
  StateBlock.prototype.push = function(type, tag, nesting) {
    const token3 = new token_default(type, tag, nesting);
    token3.block = true;
    if (nesting < 0) this.level--;
    token3.level = this.level;
    if (nesting > 0) this.level++;
    this.tokens.push(token3);
    return token3;
  };
  StateBlock.prototype.isEmpty = function isEmpty(line) {
    return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
  };
  StateBlock.prototype.skipEmptyLines = function skipEmptyLines(from) {
    for (let max = this.lineMax; from < max; from++) {
      if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) {
        break;
      }
    }
    return from;
  };
  StateBlock.prototype.skipSpaces = function skipSpaces(pos) {
    for (let max = this.src.length; pos < max; pos++) {
      const ch = this.src.charCodeAt(pos);
      if (!isSpace(ch)) {
        break;
      }
    }
    return pos;
  };
  StateBlock.prototype.skipSpacesBack = function skipSpacesBack(pos, min) {
    if (pos <= min) {
      return pos;
    }
    while (pos > min) {
      if (!isSpace(this.src.charCodeAt(--pos))) {
        return pos + 1;
      }
    }
    return pos;
  };
  StateBlock.prototype.skipChars = function skipChars(pos, code2) {
    for (let max = this.src.length; pos < max; pos++) {
      if (this.src.charCodeAt(pos) !== code2) {
        break;
      }
    }
    return pos;
  };
  StateBlock.prototype.skipCharsBack = function skipCharsBack(pos, code2, min) {
    if (pos <= min) {
      return pos;
    }
    while (pos > min) {
      if (code2 !== this.src.charCodeAt(--pos)) {
        return pos + 1;
      }
    }
    return pos;
  };
  StateBlock.prototype.getLines = function getLines(begin, end, indent, keepLastLF) {
    if (begin >= end) {
      return "";
    }
    const queue = new Array(end - begin);
    for (let i = 0, line = begin; line < end; line++, i++) {
      let lineIndent = 0;
      const lineStart = this.bMarks[line];
      let first = lineStart;
      let last;
      if (line + 1 < end || keepLastLF) {
        last = this.eMarks[line] + 1;
      } else {
        last = this.eMarks[line];
      }
      while (first < last && lineIndent < indent) {
        const ch = this.src.charCodeAt(first);
        if (isSpace(ch)) {
          if (ch === 9) {
            lineIndent += 4 - (lineIndent + this.bsCount[line]) % 4;
          } else {
            lineIndent++;
          }
        } else if (first - lineStart < this.tShift[line]) {
          lineIndent++;
        } else {
          break;
        }
        first++;
      }
      if (lineIndent > indent) {
        queue[i] = new Array(lineIndent - indent + 1).join(" ") + this.src.slice(first, last);
      } else {
        queue[i] = this.src.slice(first, last);
      }
    }
    return queue.join("");
  };
  StateBlock.prototype.Token = token_default;
  var state_block_default = StateBlock;

  // node_modules/markdown-it/lib/rules_block/table.mjs
  var MAX_AUTOCOMPLETED_CELLS = 65536;
  function getLine(state, line) {
    const pos = state.bMarks[line] + state.tShift[line];
    const max = state.eMarks[line];
    return state.src.slice(pos, max);
  }
  function escapedSplit(str) {
    const result = [];
    const max = str.length;
    let pos = 0;
    let ch = str.charCodeAt(pos);
    let isEscaped3 = false;
    let lastPos = 0;
    let current = "";
    while (pos < max) {
      if (ch === 124) {
        if (!isEscaped3) {
          result.push(current + str.substring(lastPos, pos));
          current = "";
          lastPos = pos + 1;
        } else {
          current += str.substring(lastPos, pos - 1);
          lastPos = pos;
        }
      }
      isEscaped3 = ch === 92;
      pos++;
      ch = str.charCodeAt(pos);
    }
    result.push(current + str.substring(lastPos));
    return result;
  }
  function table(state, startLine, endLine, silent) {
    if (startLine + 2 > endLine) {
      return false;
    }
    let nextLine = startLine + 1;
    if (state.sCount[nextLine] < state.blkIndent) {
      return false;
    }
    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      return false;
    }
    let pos = state.bMarks[nextLine] + state.tShift[nextLine];
    if (pos >= state.eMarks[nextLine]) {
      return false;
    }
    const firstCh = state.src.charCodeAt(pos++);
    if (firstCh !== 124 && firstCh !== 45 && firstCh !== 58) {
      return false;
    }
    if (pos >= state.eMarks[nextLine]) {
      return false;
    }
    const secondCh = state.src.charCodeAt(pos++);
    if (secondCh !== 124 && secondCh !== 45 && secondCh !== 58 && !isSpace(secondCh)) {
      return false;
    }
    if (firstCh === 45 && isSpace(secondCh)) {
      return false;
    }
    while (pos < state.eMarks[nextLine]) {
      const ch = state.src.charCodeAt(pos);
      if (ch !== 124 && ch !== 45 && ch !== 58 && !isSpace(ch)) {
        return false;
      }
      pos++;
    }
    let lineText = getLine(state, startLine + 1);
    let columns = lineText.split("|");
    const aligns = [];
    for (let i = 0; i < columns.length; i++) {
      const t = columns[i].trim();
      if (!t) {
        if (i === 0 || i === columns.length - 1) {
          continue;
        } else {
          return false;
        }
      }
      if (!/^:?-+:?$/.test(t)) {
        return false;
      }
      if (t.charCodeAt(t.length - 1) === 58) {
        aligns.push(t.charCodeAt(0) === 58 ? "center" : "right");
      } else if (t.charCodeAt(0) === 58) {
        aligns.push("left");
      } else {
        aligns.push("");
      }
    }
    lineText = getLine(state, startLine).trim();
    if (lineText.indexOf("|") === -1) {
      return false;
    }
    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }
    columns = escapedSplit(lineText);
    if (columns.length && columns[0] === "") columns.shift();
    if (columns.length && columns[columns.length - 1] === "") columns.pop();
    const columnCount = columns.length;
    if (columnCount === 0 || columnCount !== aligns.length) {
      return false;
    }
    if (silent) {
      return true;
    }
    const oldParentType = state.parentType;
    state.parentType = "table";
    const terminatorRules = state.md.block.ruler.getRules("blockquote");
    const token_to = state.push("table_open", "table", 1);
    const tableLines = [startLine, 0];
    token_to.map = tableLines;
    const token_tho = state.push("thead_open", "thead", 1);
    token_tho.map = [startLine, startLine + 1];
    const token_htro = state.push("tr_open", "tr", 1);
    token_htro.map = [startLine, startLine + 1];
    for (let i = 0; i < columns.length; i++) {
      const token_ho = state.push("th_open", "th", 1);
      if (aligns[i]) {
        token_ho.attrs = [["style", "text-align:" + aligns[i]]];
      }
      const token_il = state.push("inline", "", 0);
      token_il.content = columns[i].trim();
      token_il.children = [];
      state.push("th_close", "th", -1);
    }
    state.push("tr_close", "tr", -1);
    state.push("thead_close", "thead", -1);
    let tbodyLines;
    let autocompletedCells = 0;
    for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
      if (state.sCount[nextLine] < state.blkIndent) {
        break;
      }
      let terminate = false;
      for (let i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }
      if (terminate) {
        break;
      }
      lineText = getLine(state, nextLine).trim();
      if (!lineText) {
        break;
      }
      if (state.sCount[nextLine] - state.blkIndent >= 4) {
        break;
      }
      columns = escapedSplit(lineText);
      if (columns.length && columns[0] === "") columns.shift();
      if (columns.length && columns[columns.length - 1] === "") columns.pop();
      autocompletedCells += columnCount - columns.length;
      if (autocompletedCells > MAX_AUTOCOMPLETED_CELLS) {
        break;
      }
      if (nextLine === startLine + 2) {
        const token_tbo = state.push("tbody_open", "tbody", 1);
        token_tbo.map = tbodyLines = [startLine + 2, 0];
      }
      const token_tro = state.push("tr_open", "tr", 1);
      token_tro.map = [nextLine, nextLine + 1];
      for (let i = 0; i < columnCount; i++) {
        const token_tdo = state.push("td_open", "td", 1);
        if (aligns[i]) {
          token_tdo.attrs = [["style", "text-align:" + aligns[i]]];
        }
        const token_il = state.push("inline", "", 0);
        token_il.content = columns[i] ? columns[i].trim() : "";
        token_il.children = [];
        state.push("td_close", "td", -1);
      }
      state.push("tr_close", "tr", -1);
    }
    if (tbodyLines) {
      state.push("tbody_close", "tbody", -1);
      tbodyLines[1] = nextLine;
    }
    state.push("table_close", "table", -1);
    tableLines[1] = nextLine;
    state.parentType = oldParentType;
    state.line = nextLine;
    return true;
  }

  // node_modules/markdown-it/lib/rules_block/code.mjs
  function code(state, startLine, endLine) {
    if (state.sCount[startLine] - state.blkIndent < 4) {
      return false;
    }
    let nextLine = startLine + 1;
    let last = nextLine;
    while (nextLine < endLine) {
      if (state.isEmpty(nextLine)) {
        nextLine++;
        continue;
      }
      if (state.sCount[nextLine] - state.blkIndent >= 4) {
        nextLine++;
        last = nextLine;
        continue;
      }
      break;
    }
    state.line = last;
    const token3 = state.push("code_block", "code", 0);
    token3.content = state.getLines(startLine, last, 4 + state.blkIndent, false) + "\n";
    token3.map = [startLine, state.line];
    return true;
  }

  // node_modules/markdown-it/lib/rules_block/fence.mjs
  function fence2(state, startLine, endLine, silent) {
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    let max = state.eMarks[startLine];
    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }
    if (pos + 3 > max) {
      return false;
    }
    const marker = state.src.charCodeAt(pos);
    if (marker !== 126 && marker !== 96) {
      return false;
    }
    let mem = pos;
    pos = state.skipChars(pos, marker);
    let len = pos - mem;
    if (len < 3) {
      return false;
    }
    const markup = state.src.slice(mem, pos);
    const params = state.src.slice(pos, max);
    if (marker === 96) {
      if (params.indexOf(String.fromCharCode(marker)) >= 0) {
        return false;
      }
    }
    if (silent) {
      return true;
    }
    let nextLine = startLine;
    let haveEndMarker = false;
    for (; ; ) {
      nextLine++;
      if (nextLine >= endLine) {
        break;
      }
      pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];
      if (pos < max && state.sCount[nextLine] < state.blkIndent) {
        break;
      }
      if (state.src.charCodeAt(pos) !== marker) {
        continue;
      }
      if (state.sCount[nextLine] - state.blkIndent >= 4) {
        continue;
      }
      pos = state.skipChars(pos, marker);
      if (pos - mem < len) {
        continue;
      }
      pos = state.skipSpaces(pos);
      if (pos < max) {
        continue;
      }
      haveEndMarker = true;
      break;
    }
    len = state.sCount[startLine];
    state.line = nextLine + (haveEndMarker ? 1 : 0);
    const token3 = state.push("fence", "code", 0);
    token3.info = params;
    token3.content = state.getLines(startLine + 1, nextLine, len, true);
    token3.markup = markup;
    token3.map = [startLine, state.line];
    return true;
  }

  // node_modules/markdown-it/lib/rules_block/blockquote.mjs
  function blockquote(state, startLine, endLine, silent) {
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    let max = state.eMarks[startLine];
    const oldLineMax = state.lineMax;
    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }
    if (state.src.charCodeAt(pos) !== 62) {
      return false;
    }
    if (silent) {
      return true;
    }
    const oldBMarks = [];
    const oldBSCount = [];
    const oldSCount = [];
    const oldTShift = [];
    const terminatorRules = state.md.block.ruler.getRules("blockquote");
    const oldParentType = state.parentType;
    state.parentType = "blockquote";
    let lastLineEmpty = false;
    let nextLine;
    for (nextLine = startLine; nextLine < endLine; nextLine++) {
      const isOutdented = state.sCount[nextLine] < state.blkIndent;
      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];
      if (pos >= max) {
        break;
      }
      if (state.src.charCodeAt(pos++) === 62 && !isOutdented) {
        let initial = state.sCount[nextLine] + 1;
        let spaceAfterMarker;
        let adjustTab;
        if (state.src.charCodeAt(pos) === 32) {
          pos++;
          initial++;
          adjustTab = false;
          spaceAfterMarker = true;
        } else if (state.src.charCodeAt(pos) === 9) {
          spaceAfterMarker = true;
          if ((state.bsCount[nextLine] + initial) % 4 === 3) {
            pos++;
            initial++;
            adjustTab = false;
          } else {
            adjustTab = true;
          }
        } else {
          spaceAfterMarker = false;
        }
        let offset = initial;
        oldBMarks.push(state.bMarks[nextLine]);
        state.bMarks[nextLine] = pos;
        while (pos < max) {
          const ch = state.src.charCodeAt(pos);
          if (isSpace(ch)) {
            if (ch === 9) {
              offset += 4 - (offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
            } else {
              offset++;
            }
          } else {
            break;
          }
          pos++;
        }
        lastLineEmpty = pos >= max;
        oldBSCount.push(state.bsCount[nextLine]);
        state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);
        oldSCount.push(state.sCount[nextLine]);
        state.sCount[nextLine] = offset - initial;
        oldTShift.push(state.tShift[nextLine]);
        state.tShift[nextLine] = pos - state.bMarks[nextLine];
        continue;
      }
      if (lastLineEmpty) {
        break;
      }
      let terminate = false;
      for (let i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }
      if (terminate) {
        state.lineMax = nextLine;
        if (state.blkIndent !== 0) {
          oldBMarks.push(state.bMarks[nextLine]);
          oldBSCount.push(state.bsCount[nextLine]);
          oldTShift.push(state.tShift[nextLine]);
          oldSCount.push(state.sCount[nextLine]);
          state.sCount[nextLine] -= state.blkIndent;
        }
        break;
      }
      oldBMarks.push(state.bMarks[nextLine]);
      oldBSCount.push(state.bsCount[nextLine]);
      oldTShift.push(state.tShift[nextLine]);
      oldSCount.push(state.sCount[nextLine]);
      state.sCount[nextLine] = -1;
    }
    const oldIndent = state.blkIndent;
    state.blkIndent = 0;
    const token_o = state.push("blockquote_open", "blockquote", 1);
    token_o.markup = ">";
    const lines = [startLine, 0];
    token_o.map = lines;
    state.md.block.tokenize(state, startLine, nextLine);
    const token_c = state.push("blockquote_close", "blockquote", -1);
    token_c.markup = ">";
    state.lineMax = oldLineMax;
    state.parentType = oldParentType;
    lines[1] = state.line;
    for (let i = 0; i < oldTShift.length; i++) {
      state.bMarks[i + startLine] = oldBMarks[i];
      state.tShift[i + startLine] = oldTShift[i];
      state.sCount[i + startLine] = oldSCount[i];
      state.bsCount[i + startLine] = oldBSCount[i];
    }
    state.blkIndent = oldIndent;
    return true;
  }

  // node_modules/markdown-it/lib/rules_block/hr.mjs
  function hr(state, startLine, endLine, silent) {
    const max = state.eMarks[startLine];
    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    const marker = state.src.charCodeAt(pos++);
    if (marker !== 42 && marker !== 45 && marker !== 95) {
      return false;
    }
    let cnt = 1;
    while (pos < max) {
      const ch = state.src.charCodeAt(pos++);
      if (ch !== marker && !isSpace(ch)) {
        return false;
      }
      if (ch === marker) {
        cnt++;
      }
    }
    if (cnt < 3) {
      return false;
    }
    if (silent) {
      return true;
    }
    state.line = startLine + 1;
    const token3 = state.push("hr", "hr", 0);
    token3.map = [startLine, state.line];
    token3.markup = Array(cnt + 1).join(String.fromCharCode(marker));
    return true;
  }

  // node_modules/markdown-it/lib/rules_block/list.mjs
  function skipBulletListMarker(state, startLine) {
    const max = state.eMarks[startLine];
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    const marker = state.src.charCodeAt(pos++);
    if (marker !== 42 && marker !== 45 && marker !== 43) {
      return -1;
    }
    if (pos < max) {
      const ch = state.src.charCodeAt(pos);
      if (!isSpace(ch)) {
        return -1;
      }
    }
    return pos;
  }
  function skipOrderedListMarker(state, startLine) {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    let pos = start;
    if (pos + 1 >= max) {
      return -1;
    }
    let ch = state.src.charCodeAt(pos++);
    if (ch < 48 || ch > 57) {
      return -1;
    }
    for (; ; ) {
      if (pos >= max) {
        return -1;
      }
      ch = state.src.charCodeAt(pos++);
      if (ch >= 48 && ch <= 57) {
        if (pos - start >= 10) {
          return -1;
        }
        continue;
      }
      if (ch === 41 || ch === 46) {
        break;
      }
      return -1;
    }
    if (pos < max) {
      ch = state.src.charCodeAt(pos);
      if (!isSpace(ch)) {
        return -1;
      }
    }
    return pos;
  }
  function markTightParagraphs(state, idx) {
    const level = state.level + 2;
    for (let i = idx + 2, l = state.tokens.length - 2; i < l; i++) {
      if (state.tokens[i].level === level && state.tokens[i].type === "paragraph_open") {
        state.tokens[i + 2].hidden = true;
        state.tokens[i].hidden = true;
        i += 2;
      }
    }
  }
  function list2(state, startLine, endLine, silent) {
    let max, pos, start, token3;
    let nextLine = startLine;
    let tight = true;
    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      return false;
    }
    if (state.listIndent >= 0 && state.sCount[nextLine] - state.listIndent >= 4 && state.sCount[nextLine] < state.blkIndent) {
      return false;
    }
    let isTerminatingParagraph = false;
    if (silent && state.parentType === "paragraph") {
      if (state.sCount[nextLine] >= state.blkIndent) {
        isTerminatingParagraph = true;
      }
    }
    let isOrdered;
    let markerValue;
    let posAfterMarker;
    if ((posAfterMarker = skipOrderedListMarker(state, nextLine)) >= 0) {
      isOrdered = true;
      start = state.bMarks[nextLine] + state.tShift[nextLine];
      markerValue = Number(state.src.slice(start, posAfterMarker - 1));
      if (isTerminatingParagraph && markerValue !== 1) return false;
    } else if ((posAfterMarker = skipBulletListMarker(state, nextLine)) >= 0) {
      isOrdered = false;
    } else {
      return false;
    }
    if (isTerminatingParagraph) {
      if (state.skipSpaces(posAfterMarker) >= state.eMarks[nextLine]) return false;
    }
    if (silent) {
      return true;
    }
    const markerCharCode = state.src.charCodeAt(posAfterMarker - 1);
    const listTokIdx = state.tokens.length;
    if (isOrdered) {
      token3 = state.push("ordered_list_open", "ol", 1);
      if (markerValue !== 1) {
        token3.attrs = [["start", markerValue]];
      }
    } else {
      token3 = state.push("bullet_list_open", "ul", 1);
    }
    const listLines = [nextLine, 0];
    token3.map = listLines;
    token3.markup = String.fromCharCode(markerCharCode);
    let prevEmptyEnd = false;
    const terminatorRules = state.md.block.ruler.getRules("list");
    const oldParentType = state.parentType;
    state.parentType = "list";
    while (nextLine < endLine) {
      pos = posAfterMarker;
      max = state.eMarks[nextLine];
      const initial = state.sCount[nextLine] + posAfterMarker - (state.bMarks[nextLine] + state.tShift[nextLine]);
      let offset = initial;
      while (pos < max) {
        const ch = state.src.charCodeAt(pos);
        if (ch === 9) {
          offset += 4 - (offset + state.bsCount[nextLine]) % 4;
        } else if (ch === 32) {
          offset++;
        } else {
          break;
        }
        pos++;
      }
      const contentStart = pos;
      let indentAfterMarker;
      if (contentStart >= max) {
        indentAfterMarker = 1;
      } else {
        indentAfterMarker = offset - initial;
      }
      if (indentAfterMarker > 4) {
        indentAfterMarker = 1;
      }
      const indent = initial + indentAfterMarker;
      token3 = state.push("list_item_open", "li", 1);
      token3.markup = String.fromCharCode(markerCharCode);
      const itemLines = [nextLine, 0];
      token3.map = itemLines;
      if (isOrdered) {
        token3.info = state.src.slice(start, posAfterMarker - 1);
      }
      const oldTight = state.tight;
      const oldTShift = state.tShift[nextLine];
      const oldSCount = state.sCount[nextLine];
      const oldListIndent = state.listIndent;
      state.listIndent = state.blkIndent;
      state.blkIndent = indent;
      state.tight = true;
      state.tShift[nextLine] = contentStart - state.bMarks[nextLine];
      state.sCount[nextLine] = offset;
      if (contentStart >= max && state.isEmpty(nextLine + 1)) {
        state.line = Math.min(state.line + 2, endLine);
      } else {
        state.md.block.tokenize(state, nextLine, endLine, true);
      }
      if (!state.tight || prevEmptyEnd) {
        tight = false;
      }
      prevEmptyEnd = state.line - nextLine > 1 && state.isEmpty(state.line - 1);
      state.blkIndent = state.listIndent;
      state.listIndent = oldListIndent;
      state.tShift[nextLine] = oldTShift;
      state.sCount[nextLine] = oldSCount;
      state.tight = oldTight;
      token3 = state.push("list_item_close", "li", -1);
      token3.markup = String.fromCharCode(markerCharCode);
      nextLine = state.line;
      itemLines[1] = nextLine;
      if (nextLine >= endLine) {
        break;
      }
      if (state.sCount[nextLine] < state.blkIndent) {
        break;
      }
      if (state.sCount[nextLine] - state.blkIndent >= 4) {
        break;
      }
      let terminate = false;
      for (let i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }
      if (terminate) {
        break;
      }
      if (isOrdered) {
        posAfterMarker = skipOrderedListMarker(state, nextLine);
        if (posAfterMarker < 0) {
          break;
        }
        start = state.bMarks[nextLine] + state.tShift[nextLine];
      } else {
        posAfterMarker = skipBulletListMarker(state, nextLine);
        if (posAfterMarker < 0) {
          break;
        }
      }
      if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) {
        break;
      }
    }
    if (isOrdered) {
      token3 = state.push("ordered_list_close", "ol", -1);
    } else {
      token3 = state.push("bullet_list_close", "ul", -1);
    }
    token3.markup = String.fromCharCode(markerCharCode);
    listLines[1] = nextLine;
    state.line = nextLine;
    state.parentType = oldParentType;
    if (tight) {
      markTightParagraphs(state, listTokIdx);
    }
    return true;
  }

  // node_modules/markdown-it/lib/rules_block/reference.mjs
  function reference(state, startLine, _endLine, silent) {
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    let max = state.eMarks[startLine];
    let nextLine = startLine + 1;
    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }
    if (state.src.charCodeAt(pos) !== 91) {
      return false;
    }
    function getNextLine(nextLine2) {
      const endLine = state.lineMax;
      if (nextLine2 >= endLine || state.isEmpty(nextLine2)) {
        return null;
      }
      let isContinuation = false;
      if (state.sCount[nextLine2] - state.blkIndent > 3) {
        isContinuation = true;
      }
      if (state.sCount[nextLine2] < 0) {
        isContinuation = true;
      }
      if (!isContinuation) {
        const terminatorRules = state.md.block.ruler.getRules("reference");
        const oldParentType = state.parentType;
        state.parentType = "reference";
        let terminate = false;
        for (let i = 0, l = terminatorRules.length; i < l; i++) {
          if (terminatorRules[i](state, nextLine2, endLine, true)) {
            terminate = true;
            break;
          }
        }
        state.parentType = oldParentType;
        if (terminate) {
          return null;
        }
      }
      const pos2 = state.bMarks[nextLine2] + state.tShift[nextLine2];
      const max2 = state.eMarks[nextLine2];
      return state.src.slice(pos2, max2 + 1);
    }
    let str = state.src.slice(pos, max + 1);
    max = str.length;
    let labelEnd = -1;
    for (pos = 1; pos < max; pos++) {
      const ch = str.charCodeAt(pos);
      if (ch === 91) {
        return false;
      } else if (ch === 93) {
        labelEnd = pos;
        break;
      } else if (ch === 10) {
        const lineContent = getNextLine(nextLine);
        if (lineContent !== null) {
          str += lineContent;
          max = str.length;
          nextLine++;
        }
      } else if (ch === 92) {
        pos++;
        if (pos < max && str.charCodeAt(pos) === 10) {
          const lineContent = getNextLine(nextLine);
          if (lineContent !== null) {
            str += lineContent;
            max = str.length;
            nextLine++;
          }
        }
      }
    }
    if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 58) {
      return false;
    }
    for (pos = labelEnd + 2; pos < max; pos++) {
      const ch = str.charCodeAt(pos);
      if (ch === 10) {
        const lineContent = getNextLine(nextLine);
        if (lineContent !== null) {
          str += lineContent;
          max = str.length;
          nextLine++;
        }
      } else if (isSpace(ch)) {
      } else {
        break;
      }
    }
    const destRes = state.md.helpers.parseLinkDestination(str, pos, max);
    if (!destRes.ok) {
      return false;
    }
    const href = state.md.normalizeLink(destRes.str);
    if (!state.md.validateLink(href)) {
      return false;
    }
    pos = destRes.pos;
    const destEndPos = pos;
    const destEndLineNo = nextLine;
    const start = pos;
    for (; pos < max; pos++) {
      const ch = str.charCodeAt(pos);
      if (ch === 10) {
        const lineContent = getNextLine(nextLine);
        if (lineContent !== null) {
          str += lineContent;
          max = str.length;
          nextLine++;
        }
      } else if (isSpace(ch)) {
      } else {
        break;
      }
    }
    let titleRes = state.md.helpers.parseLinkTitle(str, pos, max);
    while (titleRes.can_continue) {
      const lineContent = getNextLine(nextLine);
      if (lineContent === null) break;
      str += lineContent;
      pos = max;
      max = str.length;
      nextLine++;
      titleRes = state.md.helpers.parseLinkTitle(str, pos, max, titleRes);
    }
    let title;
    if (pos < max && start !== pos && titleRes.ok) {
      title = titleRes.str;
      pos = titleRes.pos;
    } else {
      title = "";
      pos = destEndPos;
      nextLine = destEndLineNo;
    }
    while (pos < max) {
      const ch = str.charCodeAt(pos);
      if (!isSpace(ch)) {
        break;
      }
      pos++;
    }
    if (pos < max && str.charCodeAt(pos) !== 10) {
      if (title) {
        title = "";
        pos = destEndPos;
        nextLine = destEndLineNo;
        while (pos < max) {
          const ch = str.charCodeAt(pos);
          if (!isSpace(ch)) {
            break;
          }
          pos++;
        }
      }
    }
    if (pos < max && str.charCodeAt(pos) !== 10) {
      return false;
    }
    const label = normalizeReference(str.slice(1, labelEnd));
    if (!label) {
      return false;
    }
    if (silent) {
      return true;
    }
    if (typeof state.env.references === "undefined") {
      state.env.references = {};
    }
    if (typeof state.env.references[label] === "undefined") {
      state.env.references[label] = { title, href };
    }
    state.line = nextLine;
    return true;
  }

  // node_modules/markdown-it/lib/common/html_blocks.mjs
  var html_blocks_default = [
    "address",
    "article",
    "aside",
    "base",
    "basefont",
    "blockquote",
    "body",
    "caption",
    "center",
    "col",
    "colgroup",
    "dd",
    "details",
    "dialog",
    "dir",
    "div",
    "dl",
    "dt",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "frame",
    "frameset",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "head",
    "header",
    "hr",
    "html",
    "iframe",
    "legend",
    "li",
    "link",
    "main",
    "menu",
    "menuitem",
    "nav",
    "noframes",
    "ol",
    "optgroup",
    "option",
    "p",
    "param",
    "search",
    "section",
    "summary",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "title",
    "tr",
    "track",
    "ul"
  ];

  // node_modules/markdown-it/lib/common/html_re.mjs
  var attr_name = "[a-zA-Z_:][a-zA-Z0-9:._-]*";
  var unquoted = "[^\"'=<>`\\x00-\\x20]+";
  var single_quoted = "'[^']*'";
  var double_quoted = '"[^"]*"';
  var attr_value = "(?:" + unquoted + "|" + single_quoted + "|" + double_quoted + ")";
  var attribute = "(?:\\s+" + attr_name + "(?:\\s*=\\s*" + attr_value + ")?)";
  var open_tag = "<[A-Za-z][A-Za-z0-9\\-]*" + attribute + "*\\s*\\/?>";
  var close_tag = "<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>";
  var comment = "<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->";
  var processing = "<[?][\\s\\S]*?[?]>";
  var declaration = "<![A-Za-z][^>]*>";
  var cdata = "<!\\[CDATA\\[[\\s\\S]*?\\]\\]>";
  var HTML_TAG_RE = new RegExp("^(?:" + open_tag + "|" + close_tag + "|" + comment + "|" + processing + "|" + declaration + "|" + cdata + ")");
  var HTML_OPEN_CLOSE_TAG_RE = new RegExp("^(?:" + open_tag + "|" + close_tag + ")");

  // node_modules/markdown-it/lib/rules_block/html_block.mjs
  var HTML_SEQUENCES = [
    [/^<(script|pre|style|textarea)(?=(\s|>|$))/i, /<\/(script|pre|style|textarea)>/i, true],
    [/^<!--/, /-->/, true],
    [/^<\?/, /\?>/, true],
    [/^<![A-Za-z]/, />/, true],
    [/^<!\[CDATA\[/, /\]\]>/, true],
    [new RegExp("^</?(" + html_blocks_default.join("|") + ")(?=(\\s|/?>|$))", "i"), /^$/, true],
    [new RegExp(HTML_OPEN_CLOSE_TAG_RE.source + "\\s*$"), /^$/, false]
  ];
  function html_block(state, startLine, endLine, silent) {
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    let max = state.eMarks[startLine];
    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }
    if (!state.md.options.html) {
      return false;
    }
    if (state.src.charCodeAt(pos) !== 60) {
      return false;
    }
    let lineText = state.src.slice(pos, max);
    let i = 0;
    for (; i < HTML_SEQUENCES.length; i++) {
      if (HTML_SEQUENCES[i][0].test(lineText)) {
        break;
      }
    }
    if (i === HTML_SEQUENCES.length) {
      return false;
    }
    if (silent) {
      return HTML_SEQUENCES[i][2];
    }
    let nextLine = startLine + 1;
    const endsOnBlankLine = HTML_SEQUENCES[i][1].test("");
    if (!HTML_SEQUENCES[i][1].test(lineText)) {
      for (; nextLine < endLine; nextLine++) {
        if (state.sCount[nextLine] < state.blkIndent) {
          if (endsOnBlankLine || !state.isEmpty(nextLine)) {
            break;
          }
        }
        pos = state.bMarks[nextLine] + state.tShift[nextLine];
        max = state.eMarks[nextLine];
        lineText = state.src.slice(pos, max);
        if (HTML_SEQUENCES[i][1].test(lineText)) {
          if (lineText.length !== 0) {
            nextLine++;
          }
          break;
        }
      }
    }
    state.line = nextLine;
    const token3 = state.push("html_block", "", 0);
    token3.map = [startLine, nextLine];
    token3.content = state.getLines(startLine, nextLine, state.blkIndent, true);
    return true;
  }

  // node_modules/markdown-it/lib/rules_block/heading.mjs
  function heading2(state, startLine, endLine, silent) {
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    let max = state.eMarks[startLine];
    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }
    let ch = state.src.charCodeAt(pos);
    if (ch !== 35 || pos >= max) {
      return false;
    }
    let level = 1;
    ch = state.src.charCodeAt(++pos);
    while (ch === 35 && pos < max && level <= 6) {
      level++;
      ch = state.src.charCodeAt(++pos);
    }
    if (level > 6 || pos < max && !isSpace(ch)) {
      return false;
    }
    if (silent) {
      return true;
    }
    max = state.skipSpacesBack(max, pos);
    const tmp = state.skipCharsBack(max, 35, pos);
    if (tmp > pos && isSpace(state.src.charCodeAt(tmp - 1))) {
      max = tmp;
    }
    state.line = startLine + 1;
    const token_o = state.push("heading_open", "h" + String(level), 1);
    token_o.markup = "########".slice(0, level);
    token_o.map = [startLine, state.line];
    const token_i = state.push("inline", "", 0);
    token_i.content = asciiTrim(state.src.slice(pos, max));
    token_i.map = [startLine, state.line];
    token_i.children = [];
    const token_c = state.push("heading_close", "h" + String(level), -1);
    token_c.markup = "########".slice(0, level);
    return true;
  }

  // node_modules/markdown-it/lib/rules_block/lheading.mjs
  function lheading(state, startLine, endLine) {
    const terminatorRules = state.md.block.ruler.getRules("paragraph");
    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }
    const oldParentType = state.parentType;
    state.parentType = "paragraph";
    let level = 0;
    let marker;
    let nextLine = startLine + 1;
    for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
      if (state.sCount[nextLine] - state.blkIndent > 3) {
        continue;
      }
      if (state.sCount[nextLine] >= state.blkIndent) {
        let pos = state.bMarks[nextLine] + state.tShift[nextLine];
        const max = state.eMarks[nextLine];
        if (pos < max) {
          marker = state.src.charCodeAt(pos);
          if (marker === 45 || marker === 61) {
            pos = state.skipChars(pos, marker);
            pos = state.skipSpaces(pos);
            if (pos >= max) {
              level = marker === 61 ? 1 : 2;
              break;
            }
          }
        }
      }
      if (state.sCount[nextLine] < 0) {
        continue;
      }
      let terminate = false;
      for (let i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }
      if (terminate) {
        break;
      }
    }
    if (!level) {
      state.parentType = oldParentType;
      return false;
    }
    const content = asciiTrim(state.getLines(startLine, nextLine, state.blkIndent, false));
    state.line = nextLine + 1;
    const token_o = state.push("heading_open", "h" + String(level), 1);
    token_o.markup = String.fromCharCode(marker);
    token_o.map = [startLine, state.line];
    const token_i = state.push("inline", "", 0);
    token_i.content = content;
    token_i.map = [startLine, state.line - 1];
    token_i.children = [];
    const token_c = state.push("heading_close", "h" + String(level), -1);
    token_c.markup = String.fromCharCode(marker);
    state.parentType = oldParentType;
    return true;
  }

  // node_modules/markdown-it/lib/rules_block/paragraph.mjs
  function paragraph(state, startLine, endLine) {
    const terminatorRules = state.md.block.ruler.getRules("paragraph");
    const oldParentType = state.parentType;
    let nextLine = startLine + 1;
    state.parentType = "paragraph";
    for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
      if (state.sCount[nextLine] - state.blkIndent > 3) {
        continue;
      }
      if (state.sCount[nextLine] < 0) {
        continue;
      }
      let terminate = false;
      for (let i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }
      if (terminate) {
        break;
      }
    }
    const content = asciiTrim(state.getLines(startLine, nextLine, state.blkIndent, false));
    state.line = nextLine;
    const token_o = state.push("paragraph_open", "p", 1);
    token_o.map = [startLine, state.line];
    const token_i = state.push("inline", "", 0);
    token_i.content = content;
    token_i.map = [startLine, state.line];
    token_i.children = [];
    state.push("paragraph_close", "p", -1);
    state.parentType = oldParentType;
    return true;
  }

  // node_modules/markdown-it/lib/parser_block.mjs
  var _rules2 = [
    // First 2 params - rule name & source. Secondary array - list of rules,
    // which can be terminated by this one.
    ["table", table, ["paragraph", "reference"]],
    ["code", code],
    ["fence", fence2, ["paragraph", "reference", "blockquote", "list"]],
    ["blockquote", blockquote, ["paragraph", "reference", "blockquote", "list"]],
    ["hr", hr, ["paragraph", "reference", "blockquote", "list"]],
    ["list", list2, ["paragraph", "reference", "blockquote"]],
    ["reference", reference],
    ["html_block", html_block, ["paragraph", "reference", "blockquote"]],
    ["heading", heading2, ["paragraph", "reference", "blockquote"]],
    ["lheading", lheading],
    ["paragraph", paragraph]
  ];
  function ParserBlock() {
    this.ruler = new ruler_default();
    for (let i = 0; i < _rules2.length; i++) {
      this.ruler.push(_rules2[i][0], _rules2[i][1], { alt: (_rules2[i][2] || []).slice() });
    }
  }
  ParserBlock.prototype.tokenize = function(state, startLine, endLine) {
    const rules = this.ruler.getRules("");
    const len = rules.length;
    const maxNesting = state.md.options.maxNesting;
    let line = startLine;
    let hasEmptyLines = false;
    while (line < endLine) {
      state.line = line = state.skipEmptyLines(line);
      if (line >= endLine) {
        break;
      }
      if (state.sCount[line] < state.blkIndent) {
        break;
      }
      if (state.level >= maxNesting) {
        state.line = endLine;
        break;
      }
      const prevLine = state.line;
      let ok = false;
      for (let i = 0; i < len; i++) {
        ok = rules[i](state, line, endLine, false);
        if (ok) {
          if (prevLine >= state.line) {
            throw new Error("block rule didn't increment state.line");
          }
          break;
        }
      }
      if (!ok) throw new Error("none of the block rules matched");
      state.tight = !hasEmptyLines;
      if (state.isEmpty(state.line - 1)) {
        hasEmptyLines = true;
      }
      line = state.line;
      if (line < endLine && state.isEmpty(line)) {
        hasEmptyLines = true;
        line++;
        state.line = line;
      }
    }
  };
  ParserBlock.prototype.parse = function(src, md2, env, outTokens) {
    if (!src) {
      return;
    }
    const state = new this.State(src, md2, env, outTokens);
    this.tokenize(state, state.line, state.lineMax);
  };
  ParserBlock.prototype.State = state_block_default;
  var parser_block_default = ParserBlock;

  // node_modules/markdown-it/lib/rules_inline/state_inline.mjs
  function StateInline(src, md2, env, outTokens) {
    this.src = src;
    this.env = env;
    this.md = md2;
    this.tokens = outTokens;
    this.tokens_meta = Array(outTokens.length);
    this.pos = 0;
    this.posMax = this.src.length;
    this.level = 0;
    this.pending = "";
    this.pendingLevel = 0;
    this.cache = {};
    this.delimiters = [];
    this._prev_delimiters = [];
    this.backticks = {};
    this.backticksScanned = false;
    this.linkLevel = 0;
  }
  StateInline.prototype.pushPending = function() {
    const token3 = new token_default("text", "", 0);
    token3.content = this.pending;
    token3.level = this.pendingLevel;
    this.tokens.push(token3);
    this.pending = "";
    return token3;
  };
  StateInline.prototype.push = function(type, tag, nesting) {
    if (this.pending) {
      this.pushPending();
    }
    const token3 = new token_default(type, tag, nesting);
    let token_meta = null;
    if (nesting < 0) {
      this.level--;
      this.delimiters = this._prev_delimiters.pop();
    }
    token3.level = this.level;
    if (nesting > 0) {
      this.level++;
      this._prev_delimiters.push(this.delimiters);
      this.delimiters = [];
      token_meta = { delimiters: this.delimiters };
    }
    this.pendingLevel = this.level;
    this.tokens.push(token3);
    this.tokens_meta.push(token_meta);
    return token3;
  };
  StateInline.prototype.scanDelims = function(start, canSplitWord) {
    const max = this.posMax;
    const marker = this.src.charCodeAt(start);
    let lastChar;
    if (start === 0) {
      lastChar = 32;
    } else if (start === 1) {
      lastChar = this.src.charCodeAt(0);
      if ((lastChar & 63488) === 55296) {
        lastChar = 65533;
      }
    } else {
      lastChar = this.src.charCodeAt(start - 1);
      if ((lastChar & 64512) === 56320) {
        const highSurr = this.src.charCodeAt(start - 2);
        lastChar = (highSurr & 64512) === 55296 ? 65536 + (highSurr - 55296 << 10) + (lastChar - 56320) : 65533;
      } else if ((lastChar & 64512) === 55296) {
        lastChar = 65533;
      }
    }
    let pos = start;
    while (pos < max && this.src.charCodeAt(pos) === marker) {
      pos++;
    }
    const count = pos - start;
    let nextChar = pos < max ? this.src.charCodeAt(pos) : 32;
    if ((nextChar & 64512) === 55296) {
      const lowSurr = this.src.charCodeAt(pos + 1);
      nextChar = (lowSurr & 64512) === 56320 ? 65536 + (nextChar - 55296 << 10) + (lowSurr - 56320) : 65533;
    } else if ((nextChar & 64512) === 56320) {
      nextChar = 65533;
    }
    const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctCharCode(lastChar);
    const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctCharCode(nextChar);
    const isLastWhiteSpace = isWhiteSpace(lastChar);
    const isNextWhiteSpace = isWhiteSpace(nextChar);
    const left_flanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
    const right_flanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);
    const can_open = left_flanking && (canSplitWord || !right_flanking || isLastPunctChar);
    const can_close = right_flanking && (canSplitWord || !left_flanking || isNextPunctChar);
    return { can_open, can_close, length: count };
  };
  StateInline.prototype.Token = token_default;
  var state_inline_default = StateInline;

  // node_modules/markdown-it/lib/rules_inline/text.mjs
  function isTerminatorChar(ch) {
    switch (ch) {
      case 10:
      case 33:
      case 35:
      case 36:
      case 37:
      case 38:
      case 42:
      case 43:
      case 45:
      case 58:
      case 60:
      case 61:
      case 62:
      case 64:
      case 91:
      case 92:
      case 93:
      case 94:
      case 95:
      case 96:
      case 123:
      case 125:
      case 126:
        return true;
      default:
        return false;
    }
  }
  function text2(state, silent) {
    let pos = state.pos;
    while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos))) {
      pos++;
    }
    if (pos === state.pos) {
      return false;
    }
    if (!silent) {
      state.pending += state.src.slice(state.pos, pos);
    }
    state.pos = pos;
    return true;
  }

  // node_modules/markdown-it/lib/rules_inline/linkify.mjs
  function isAsciiAlpha(code2) {
    return code2 >= 65 && code2 <= 90 || code2 >= 97 && code2 <= 122;
  }
  function isSchemeChar(code2) {
    return code2 >= 65 && code2 <= 90 || code2 >= 97 && code2 <= 122 || code2 >= 48 && code2 <= 57 || code2 === 43 || code2 === 45 || code2 === 46;
  }
  function linkify2(state, silent) {
    if (!state.md.options.linkify) return false;
    if (state.linkLevel > 0) return false;
    const pos = state.pos;
    const max = state.posMax;
    if (pos + 3 > max) return false;
    if (state.src.charCodeAt(pos) !== 58) return false;
    if (state.src.charCodeAt(pos + 1) !== 47) return false;
    if (state.src.charCodeAt(pos + 2) !== 47) return false;
    const protoMin = pos - Math.min(10, state.pending.length, pos);
    let protoStart = pos;
    while (protoStart > protoMin && isSchemeChar(state.src.charCodeAt(protoStart - 1))) {
      protoStart--;
    }
    if (protoStart === pos || !isAsciiAlpha(state.src.charCodeAt(protoStart))) return false;
    const protoLength = pos - protoStart;
    const link2 = state.md.linkify.matchAtStart(state.src.slice(protoStart));
    if (!link2) return false;
    let url = link2.url;
    if (url.length <= protoLength) return false;
    let urlEnd = url.length;
    while (urlEnd > 0 && url.charCodeAt(urlEnd - 1) === 42) {
      urlEnd--;
    }
    if (urlEnd !== url.length) {
      url = url.slice(0, urlEnd);
    }
    const fullUrl = state.md.normalizeLink(url);
    if (!state.md.validateLink(fullUrl)) return false;
    if (!silent) {
      state.pending = state.pending.slice(0, -protoLength);
      const token_o = state.push("link_open", "a", 1);
      token_o.attrs = [["href", fullUrl]];
      token_o.markup = "linkify";
      token_o.info = "auto";
      const token_t = state.push("text", "", 0);
      token_t.content = state.md.normalizeLinkText(url);
      const token_c = state.push("link_close", "a", -1);
      token_c.markup = "linkify";
      token_c.info = "auto";
    }
    state.pos += url.length - protoLength;
    return true;
  }

  // node_modules/markdown-it/lib/rules_inline/newline.mjs
  function newline(state, silent) {
    let pos = state.pos;
    if (state.src.charCodeAt(pos) !== 10) {
      return false;
    }
    const pmax = state.pending.length - 1;
    const max = state.posMax;
    if (!silent) {
      if (pmax >= 0 && state.pending.charCodeAt(pmax) === 32) {
        if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 32) {
          let ws = pmax - 1;
          while (ws >= 1 && state.pending.charCodeAt(ws - 1) === 32) ws--;
          state.pending = state.pending.slice(0, ws);
          state.push("hardbreak", "br", 0);
        } else {
          state.pending = state.pending.slice(0, -1);
          state.push("softbreak", "br", 0);
        }
      } else {
        state.push("softbreak", "br", 0);
      }
    }
    pos++;
    while (pos < max && isSpace(state.src.charCodeAt(pos))) {
      pos++;
    }
    state.pos = pos;
    return true;
  }

  // node_modules/markdown-it/lib/rules_inline/escape.mjs
  var ESCAPED = [];
  for (let i = 0; i < 256; i++) {
    ESCAPED.push(0);
  }
  "\\!\"#$%&'()*+,./:;<=>?@[]^_`{|}~-".split("").forEach(function(ch) {
    ESCAPED[ch.charCodeAt(0)] = 1;
  });
  function escape2(state, silent) {
    let pos = state.pos;
    const max = state.posMax;
    if (state.src.charCodeAt(pos) !== 92) return false;
    pos++;
    if (pos >= max) return false;
    let ch1 = state.src.charCodeAt(pos);
    if (ch1 === 10) {
      if (!silent) {
        state.push("hardbreak", "br", 0);
      }
      pos++;
      while (pos < max) {
        ch1 = state.src.charCodeAt(pos);
        if (!isSpace(ch1)) break;
        pos++;
      }
      state.pos = pos;
      return true;
    }
    if (ch1 === 32) {
      if (!silent) {
        const token3 = state.push("text_special", "", 0);
        token3.content = "\\";
        token3.markup = "\\";
        token3.info = "escape";
      }
      state.pos = pos;
      return true;
    }
    let escapedStr = state.src[pos];
    if (ch1 >= 55296 && ch1 <= 56319 && pos + 1 < max) {
      const ch2 = state.src.charCodeAt(pos + 1);
      if (ch2 >= 56320 && ch2 <= 57343) {
        escapedStr += state.src[pos + 1];
        pos++;
      }
    }
    const origStr = "\\" + escapedStr;
    if (!silent) {
      const token3 = state.push("text_special", "", 0);
      if (ch1 < 256 && ESCAPED[ch1] !== 0) {
        token3.content = escapedStr;
      } else {
        token3.content = origStr;
      }
      token3.markup = origStr;
      token3.info = "escape";
    }
    state.pos = pos + 1;
    return true;
  }

  // node_modules/markdown-it/lib/rules_inline/backticks.mjs
  function backtick(state, silent) {
    let pos = state.pos;
    const ch = state.src.charCodeAt(pos);
    if (ch !== 96) {
      return false;
    }
    const start = pos;
    pos++;
    const max = state.posMax;
    while (pos < max && state.src.charCodeAt(pos) === 96) {
      pos++;
    }
    const marker = state.src.slice(start, pos);
    const openerLength = marker.length;
    if (state.backticksScanned && (state.backticks[openerLength] || 0) <= start) {
      if (!silent) state.pending += marker;
      state.pos += openerLength;
      return true;
    }
    let matchEnd = pos;
    let matchStart;
    while ((matchStart = state.src.indexOf("`", matchEnd)) !== -1) {
      matchEnd = matchStart + 1;
      while (matchEnd < max && state.src.charCodeAt(matchEnd) === 96) {
        matchEnd++;
      }
      const closerLength = matchEnd - matchStart;
      if (closerLength === openerLength) {
        if (!silent) {
          const token3 = state.push("code_inline", "code", 0);
          token3.markup = marker;
          token3.content = state.src.slice(pos, matchStart).replace(/\n/g, " ").replace(/^ (.+) $/, "$1");
        }
        state.pos = matchEnd;
        return true;
      }
      state.backticks[closerLength] = matchStart;
    }
    state.backticksScanned = true;
    if (!silent) state.pending += marker;
    state.pos += openerLength;
    return true;
  }

  // node_modules/markdown-it/lib/rules_inline/strikethrough.mjs
  function strikethrough_tokenize(state, silent) {
    const start = state.pos;
    const marker = state.src.charCodeAt(start);
    if (silent) {
      return false;
    }
    if (marker !== 126) {
      return false;
    }
    const scanned = state.scanDelims(state.pos, true);
    let len = scanned.length;
    const ch = String.fromCharCode(marker);
    if (len < 2) {
      return false;
    }
    let token3;
    if (len % 2) {
      token3 = state.push("text", "", 0);
      token3.content = ch;
      len--;
    }
    for (let i = 0; i < len; i += 2) {
      token3 = state.push("text", "", 0);
      token3.content = ch + ch;
      state.delimiters.push({
        marker,
        length: 0,
        // disable "rule of 3" length checks meant for emphasis
        token: state.tokens.length - 1,
        end: -1,
        open: scanned.can_open,
        close: scanned.can_close
      });
    }
    state.pos += scanned.length;
    return true;
  }
  function postProcess(state, delimiters) {
    let token3;
    const loneMarkers = [];
    const max = delimiters.length;
    for (let i = 0; i < max; i++) {
      const startDelim = delimiters[i];
      if (startDelim.marker !== 126) {
        continue;
      }
      if (startDelim.end === -1) {
        continue;
      }
      const endDelim = delimiters[startDelim.end];
      token3 = state.tokens[startDelim.token];
      token3.type = "s_open";
      token3.tag = "s";
      token3.nesting = 1;
      token3.markup = "~~";
      token3.content = "";
      token3 = state.tokens[endDelim.token];
      token3.type = "s_close";
      token3.tag = "s";
      token3.nesting = -1;
      token3.markup = "~~";
      token3.content = "";
      if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "~") {
        loneMarkers.push(endDelim.token - 1);
      }
    }
    while (loneMarkers.length) {
      const i = loneMarkers.pop();
      let j = i + 1;
      while (j < state.tokens.length && state.tokens[j].type === "s_close") {
        j++;
      }
      j--;
      if (i !== j) {
        token3 = state.tokens[j];
        state.tokens[j] = state.tokens[i];
        state.tokens[i] = token3;
      }
    }
  }
  function strikethrough_postProcess(state) {
    const tokens_meta = state.tokens_meta;
    const max = state.tokens_meta.length;
    postProcess(state, state.delimiters);
    for (let curr = 0; curr < max; curr++) {
      if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
        postProcess(state, tokens_meta[curr].delimiters);
      }
    }
  }
  var strikethrough_default = {
    tokenize: strikethrough_tokenize,
    postProcess: strikethrough_postProcess
  };

  // node_modules/markdown-it/lib/rules_inline/emphasis.mjs
  function emphasis_tokenize(state, silent) {
    const start = state.pos;
    const marker = state.src.charCodeAt(start);
    if (silent) {
      return false;
    }
    if (marker !== 95 && marker !== 42) {
      return false;
    }
    const scanned = state.scanDelims(state.pos, marker === 42);
    for (let i = 0; i < scanned.length; i++) {
      const token3 = state.push("text", "", 0);
      token3.content = String.fromCharCode(marker);
      state.delimiters.push({
        // Char code of the starting marker (number).
        //
        marker,
        // Total length of these series of delimiters.
        //
        length: scanned.length,
        // A position of the token this delimiter corresponds to.
        //
        token: state.tokens.length - 1,
        // If this delimiter is matched as a valid opener, `end` will be
        // equal to its position, otherwise it's `-1`.
        //
        end: -1,
        // Boolean flags that determine if this delimiter could open or close
        // an emphasis.
        //
        open: scanned.can_open,
        close: scanned.can_close
      });
    }
    state.pos += scanned.length;
    return true;
  }
  function postProcess2(state, delimiters) {
    const max = delimiters.length;
    for (let i = max - 1; i >= 0; i--) {
      const startDelim = delimiters[i];
      if (startDelim.marker !== 95 && startDelim.marker !== 42) {
        continue;
      }
      if (startDelim.end === -1) {
        continue;
      }
      const endDelim = delimiters[startDelim.end];
      const isStrong = i > 0 && delimiters[i - 1].end === startDelim.end + 1 && // check that first two markers match and adjacent
      delimiters[i - 1].marker === startDelim.marker && delimiters[i - 1].token === startDelim.token - 1 && // check that last two markers are adjacent (we can safely assume they match)
      delimiters[startDelim.end + 1].token === endDelim.token + 1;
      const ch = String.fromCharCode(startDelim.marker);
      const token_o = state.tokens[startDelim.token];
      token_o.type = isStrong ? "strong_open" : "em_open";
      token_o.tag = isStrong ? "strong" : "em";
      token_o.nesting = 1;
      token_o.markup = isStrong ? ch + ch : ch;
      token_o.content = "";
      const token_c = state.tokens[endDelim.token];
      token_c.type = isStrong ? "strong_close" : "em_close";
      token_c.tag = isStrong ? "strong" : "em";
      token_c.nesting = -1;
      token_c.markup = isStrong ? ch + ch : ch;
      token_c.content = "";
      if (isStrong) {
        state.tokens[delimiters[i - 1].token].content = "";
        state.tokens[delimiters[startDelim.end + 1].token].content = "";
        i--;
      }
    }
  }
  function emphasis_post_process(state) {
    const tokens_meta = state.tokens_meta;
    const max = state.tokens_meta.length;
    postProcess2(state, state.delimiters);
    for (let curr = 0; curr < max; curr++) {
      if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
        postProcess2(state, tokens_meta[curr].delimiters);
      }
    }
  }
  var emphasis_default = {
    tokenize: emphasis_tokenize,
    postProcess: emphasis_post_process
  };

  // node_modules/markdown-it/lib/rules_inline/link.mjs
  function link(state, silent) {
    let code2, label, res, ref;
    let href = "";
    let title = "";
    let start = state.pos;
    let parseReference = true;
    if (state.src.charCodeAt(state.pos) !== 91) {
      return false;
    }
    const oldPos = state.pos;
    const max = state.posMax;
    const labelStart = state.pos + 1;
    const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);
    if (labelEnd < 0) {
      return false;
    }
    let pos = labelEnd + 1;
    if (pos < max && state.src.charCodeAt(pos) === 40) {
      parseReference = false;
      pos++;
      for (; pos < max; pos++) {
        code2 = state.src.charCodeAt(pos);
        if (!isSpace(code2) && code2 !== 10) {
          break;
        }
      }
      if (pos >= max) {
        return false;
      }
      start = pos;
      res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
      if (res.ok) {
        href = state.md.normalizeLink(res.str);
        if (state.md.validateLink(href)) {
          pos = res.pos;
        } else {
          href = "";
        }
        start = pos;
        for (; pos < max; pos++) {
          code2 = state.src.charCodeAt(pos);
          if (!isSpace(code2) && code2 !== 10) {
            break;
          }
        }
        res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
        if (pos < max && start !== pos && res.ok) {
          title = res.str;
          pos = res.pos;
          for (; pos < max; pos++) {
            code2 = state.src.charCodeAt(pos);
            if (!isSpace(code2) && code2 !== 10) {
              break;
            }
          }
        }
      }
      if (pos >= max || state.src.charCodeAt(pos) !== 41) {
        parseReference = true;
      }
      pos++;
    }
    if (parseReference) {
      if (typeof state.env.references === "undefined") {
        return false;
      }
      if (pos < max && state.src.charCodeAt(pos) === 91) {
        start = pos + 1;
        pos = state.md.helpers.parseLinkLabel(state, pos);
        if (pos >= 0) {
          label = state.src.slice(start, pos++);
        } else {
          pos = labelEnd + 1;
        }
      } else {
        pos = labelEnd + 1;
      }
      if (!label) {
        label = state.src.slice(labelStart, labelEnd);
      }
      ref = state.env.references[normalizeReference(label)];
      if (!ref) {
        state.pos = oldPos;
        return false;
      }
      href = ref.href;
      title = ref.title;
    }
    if (!silent) {
      state.pos = labelStart;
      state.posMax = labelEnd;
      const token_o = state.push("link_open", "a", 1);
      const attrs2 = [["href", href]];
      token_o.attrs = attrs2;
      if (title) {
        attrs2.push(["title", title]);
      }
      state.linkLevel++;
      state.md.inline.tokenize(state);
      state.linkLevel--;
      state.push("link_close", "a", -1);
    }
    state.pos = pos;
    state.posMax = max;
    return true;
  }

  // node_modules/markdown-it/lib/rules_inline/image.mjs
  function image(state, silent) {
    let code2, content, label, pos, ref, res, title, start;
    let href = "";
    const oldPos = state.pos;
    const max = state.posMax;
    if (state.src.charCodeAt(state.pos) !== 33) {
      return false;
    }
    if (state.src.charCodeAt(state.pos + 1) !== 91) {
      return false;
    }
    const labelStart = state.pos + 2;
    const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);
    if (labelEnd < 0) {
      return false;
    }
    pos = labelEnd + 1;
    if (pos < max && state.src.charCodeAt(pos) === 40) {
      pos++;
      for (; pos < max; pos++) {
        code2 = state.src.charCodeAt(pos);
        if (!isSpace(code2) && code2 !== 10) {
          break;
        }
      }
      if (pos >= max) {
        return false;
      }
      start = pos;
      res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
      if (res.ok) {
        href = state.md.normalizeLink(res.str);
        if (state.md.validateLink(href)) {
          pos = res.pos;
        } else {
          href = "";
        }
      }
      start = pos;
      for (; pos < max; pos++) {
        code2 = state.src.charCodeAt(pos);
        if (!isSpace(code2) && code2 !== 10) {
          break;
        }
      }
      res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
      if (pos < max && start !== pos && res.ok) {
        title = res.str;
        pos = res.pos;
        for (; pos < max; pos++) {
          code2 = state.src.charCodeAt(pos);
          if (!isSpace(code2) && code2 !== 10) {
            break;
          }
        }
      } else {
        title = "";
      }
      if (pos >= max || state.src.charCodeAt(pos) !== 41) {
        state.pos = oldPos;
        return false;
      }
      pos++;
    } else {
      if (typeof state.env.references === "undefined") {
        return false;
      }
      if (pos < max && state.src.charCodeAt(pos) === 91) {
        start = pos + 1;
        pos = state.md.helpers.parseLinkLabel(state, pos);
        if (pos >= 0) {
          label = state.src.slice(start, pos++);
        } else {
          pos = labelEnd + 1;
        }
      } else {
        pos = labelEnd + 1;
      }
      if (!label) {
        label = state.src.slice(labelStart, labelEnd);
      }
      ref = state.env.references[normalizeReference(label)];
      if (!ref) {
        state.pos = oldPos;
        return false;
      }
      href = ref.href;
      title = ref.title;
    }
    if (!silent) {
      content = state.src.slice(labelStart, labelEnd);
      const tokens = [];
      state.md.inline.parse(
        content,
        state.md,
        state.env,
        tokens
      );
      const token3 = state.push("image", "img", 0);
      const attrs2 = [["src", href], ["alt", ""]];
      token3.attrs = attrs2;
      token3.children = tokens;
      token3.content = content;
      if (title) {
        attrs2.push(["title", title]);
      }
    }
    state.pos = pos;
    state.posMax = max;
    return true;
  }

  // node_modules/markdown-it/lib/rules_inline/autolink.mjs
  var EMAIL_RE = /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
  var AUTOLINK_RE = /^([a-zA-Z][a-zA-Z0-9+.-]{1,31}):([^<>\x00-\x20]*)$/;
  function autolink(state, silent) {
    let pos = state.pos;
    if (state.src.charCodeAt(pos) !== 60) {
      return false;
    }
    const start = state.pos;
    const max = state.posMax;
    for (; ; ) {
      if (++pos >= max) return false;
      const ch = state.src.charCodeAt(pos);
      if (ch === 60) return false;
      if (ch === 62) break;
    }
    const url = state.src.slice(start + 1, pos);
    if (AUTOLINK_RE.test(url)) {
      const fullUrl = state.md.normalizeLink(url);
      if (!state.md.validateLink(fullUrl)) {
        return false;
      }
      if (!silent) {
        const token_o = state.push("link_open", "a", 1);
        token_o.attrs = [["href", fullUrl]];
        token_o.markup = "autolink";
        token_o.info = "auto";
        const token_t = state.push("text", "", 0);
        token_t.content = state.md.normalizeLinkText(url);
        const token_c = state.push("link_close", "a", -1);
        token_c.markup = "autolink";
        token_c.info = "auto";
      }
      state.pos += url.length + 2;
      return true;
    }
    if (EMAIL_RE.test(url)) {
      const fullUrl = state.md.normalizeLink("mailto:" + url);
      if (!state.md.validateLink(fullUrl)) {
        return false;
      }
      if (!silent) {
        const token_o = state.push("link_open", "a", 1);
        token_o.attrs = [["href", fullUrl]];
        token_o.markup = "autolink";
        token_o.info = "auto";
        const token_t = state.push("text", "", 0);
        token_t.content = state.md.normalizeLinkText(url);
        const token_c = state.push("link_close", "a", -1);
        token_c.markup = "autolink";
        token_c.info = "auto";
      }
      state.pos += url.length + 2;
      return true;
    }
    return false;
  }

  // node_modules/markdown-it/lib/rules_inline/html_inline.mjs
  function isLinkOpen2(str) {
    return /^<a[>\s]/i.test(str);
  }
  function isLinkClose2(str) {
    return /^<\/a\s*>/i.test(str);
  }
  function isLetter(ch) {
    const lc = ch | 32;
    return lc >= 97 && lc <= 122;
  }
  function html_inline(state, silent) {
    if (!state.md.options.html) {
      return false;
    }
    const max = state.posMax;
    const pos = state.pos;
    if (state.src.charCodeAt(pos) !== 60 || pos + 2 >= max) {
      return false;
    }
    const ch = state.src.charCodeAt(pos + 1);
    if (ch !== 33 && ch !== 63 && ch !== 47 && !isLetter(ch)) {
      return false;
    }
    const match2 = state.src.slice(pos).match(HTML_TAG_RE);
    if (!match2) {
      return false;
    }
    if (!silent) {
      const token3 = state.push("html_inline", "", 0);
      token3.content = match2[0];
      if (isLinkOpen2(token3.content)) state.linkLevel++;
      if (isLinkClose2(token3.content)) state.linkLevel--;
    }
    state.pos += match2[0].length;
    return true;
  }

  // node_modules/markdown-it/lib/rules_inline/entity.mjs
  var DIGITAL_RE = /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i;
  var NAMED_RE = /^&([a-z][a-z0-9]{1,31});/i;
  function entity(state, silent) {
    const pos = state.pos;
    const max = state.posMax;
    if (state.src.charCodeAt(pos) !== 38) return false;
    if (pos + 1 >= max) return false;
    const ch = state.src.charCodeAt(pos + 1);
    if (ch === 35) {
      const match2 = state.src.slice(pos).match(DIGITAL_RE);
      if (match2) {
        if (!silent) {
          const code2 = match2[1][0].toLowerCase() === "x" ? parseInt(match2[1].slice(1), 16) : parseInt(match2[1], 10);
          const token3 = state.push("text_special", "", 0);
          token3.content = isValidEntityCode(code2) ? fromCodePoint2(code2) : fromCodePoint2(65533);
          token3.markup = match2[0];
          token3.info = "entity";
        }
        state.pos += match2[0].length;
        return true;
      }
    } else {
      const match2 = state.src.slice(pos).match(NAMED_RE);
      if (match2) {
        const decoded = decodeHTMLStrict(match2[0]);
        if (decoded !== match2[0]) {
          if (!silent) {
            const token3 = state.push("text_special", "", 0);
            token3.content = decoded;
            token3.markup = match2[0];
            token3.info = "entity";
          }
          state.pos += match2[0].length;
          return true;
        }
      }
    }
    return false;
  }

  // node_modules/markdown-it/lib/rules_inline/balance_pairs.mjs
  function processDelimiters(delimiters) {
    const openersBottom = {};
    const max = delimiters.length;
    if (!max) return;
    let headerIdx = 0;
    let lastTokenIdx = -2;
    const jumps = [];
    for (let closerIdx = 0; closerIdx < max; closerIdx++) {
      const closer = delimiters[closerIdx];
      jumps.push(0);
      if (delimiters[headerIdx].marker !== closer.marker || lastTokenIdx !== closer.token - 1) {
        headerIdx = closerIdx;
      }
      lastTokenIdx = closer.token;
      closer.length = closer.length || 0;
      if (!closer.close) continue;
      if (!openersBottom.hasOwnProperty(closer.marker)) {
        openersBottom[closer.marker] = [-1, -1, -1, -1, -1, -1];
      }
      const minOpenerIdx = openersBottom[closer.marker][(closer.open ? 3 : 0) + closer.length % 3];
      let openerIdx = headerIdx - jumps[headerIdx] - 1;
      let newMinOpenerIdx = openerIdx;
      for (; openerIdx > minOpenerIdx; openerIdx -= jumps[openerIdx] + 1) {
        const opener = delimiters[openerIdx];
        if (opener.marker !== closer.marker) continue;
        if (opener.open && opener.end < 0) {
          let isOddMatch = false;
          if (opener.close || closer.open) {
            if ((opener.length + closer.length) % 3 === 0) {
              if (opener.length % 3 !== 0 || closer.length % 3 !== 0) {
                isOddMatch = true;
              }
            }
          }
          if (!isOddMatch) {
            const lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ? jumps[openerIdx - 1] + 1 : 0;
            jumps[closerIdx] = closerIdx - openerIdx + lastJump;
            jumps[openerIdx] = lastJump;
            closer.open = false;
            opener.end = closerIdx;
            opener.close = false;
            newMinOpenerIdx = -1;
            lastTokenIdx = -2;
            break;
          }
        }
      }
      if (newMinOpenerIdx !== -1) {
        openersBottom[closer.marker][(closer.open ? 3 : 0) + (closer.length || 0) % 3] = newMinOpenerIdx;
      }
    }
  }
  function link_pairs(state) {
    const tokens_meta = state.tokens_meta;
    const max = state.tokens_meta.length;
    processDelimiters(state.delimiters);
    for (let curr = 0; curr < max; curr++) {
      if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
        processDelimiters(tokens_meta[curr].delimiters);
      }
    }
  }

  // node_modules/markdown-it/lib/rules_inline/fragments_join.mjs
  function fragments_join(state) {
    let curr, last;
    let level = 0;
    const tokens = state.tokens;
    const max = state.tokens.length;
    for (curr = last = 0; curr < max; curr++) {
      if (tokens[curr].nesting < 0) level--;
      tokens[curr].level = level;
      if (tokens[curr].nesting > 0) level++;
      if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") {
        tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
      } else {
        if (curr !== last) {
          tokens[last] = tokens[curr];
        }
        last++;
      }
    }
    if (curr !== last) {
      tokens.length = last;
    }
  }

  // node_modules/markdown-it/lib/parser_inline.mjs
  var _rules3 = [
    ["text", text2],
    ["linkify", linkify2],
    ["newline", newline],
    ["escape", escape2],
    ["backticks", backtick],
    ["strikethrough", strikethrough_default.tokenize],
    ["emphasis", emphasis_default.tokenize],
    ["link", link],
    ["image", image],
    ["autolink", autolink],
    ["html_inline", html_inline],
    ["entity", entity]
  ];
  var _rules22 = [
    ["balance_pairs", link_pairs],
    ["strikethrough", strikethrough_default.postProcess],
    ["emphasis", emphasis_default.postProcess],
    // rules for pairs separate '**' into its own text tokens, which may be left unused,
    // rule below merges unused segments back with the rest of the text
    ["fragments_join", fragments_join]
  ];
  function ParserInline() {
    this.ruler = new ruler_default();
    for (let i = 0; i < _rules3.length; i++) {
      this.ruler.push(_rules3[i][0], _rules3[i][1]);
    }
    this.ruler2 = new ruler_default();
    for (let i = 0; i < _rules22.length; i++) {
      this.ruler2.push(_rules22[i][0], _rules22[i][1]);
    }
  }
  ParserInline.prototype.skipToken = function(state) {
    const pos = state.pos;
    const rules = this.ruler.getRules("");
    const len = rules.length;
    const maxNesting = state.md.options.maxNesting;
    const cache = state.cache;
    if (typeof cache[pos] !== "undefined") {
      state.pos = cache[pos];
      return;
    }
    let ok = false;
    if (state.level < maxNesting) {
      for (let i = 0; i < len; i++) {
        state.level++;
        ok = rules[i](state, true);
        state.level--;
        if (ok) {
          if (pos >= state.pos) {
            throw new Error("inline rule didn't increment state.pos");
          }
          break;
        }
      }
    } else {
      state.pos = state.posMax;
    }
    if (!ok) {
      state.pos++;
    }
    cache[pos] = state.pos;
  };
  ParserInline.prototype.tokenize = function(state) {
    const rules = this.ruler.getRules("");
    const len = rules.length;
    const end = state.posMax;
    const maxNesting = state.md.options.maxNesting;
    while (state.pos < end) {
      const prevPos = state.pos;
      let ok = false;
      if (state.level < maxNesting) {
        for (let i = 0; i < len; i++) {
          ok = rules[i](state, false);
          if (ok) {
            if (prevPos >= state.pos) {
              throw new Error("inline rule didn't increment state.pos");
            }
            break;
          }
        }
      }
      if (ok) {
        if (state.pos >= end) {
          break;
        }
        continue;
      }
      state.pending += state.src[state.pos++];
    }
    if (state.pending) {
      state.pushPending();
    }
  };
  ParserInline.prototype.parse = function(str, md2, env, outTokens) {
    const state = new this.State(str, md2, env, outTokens);
    this.tokenize(state);
    const rules = this.ruler2.getRules("");
    const len = rules.length;
    for (let i = 0; i < len; i++) {
      rules[i](state);
    }
  };
  ParserInline.prototype.State = state_inline_default;
  var parser_inline_default = ParserInline;

  // node_modules/linkify-it/lib/re.mjs
  function re_default(opts) {
    const re = {};
    opts = opts || {};
    re.src_Any = regex_default.source;
    re.src_Cc = regex_default2.source;
    re.src_Z = regex_default6.source;
    re.src_P = regex_default4.source;
    re.src_ZPCc = [re.src_Z, re.src_P, re.src_Cc].join("|");
    re.src_ZCc = [re.src_Z, re.src_Cc].join("|");
    const text_separators = "[><\uFF5C]";
    re.src_pseudo_letter = `(?:(?!${text_separators}|${re.src_ZPCc})${re.src_Any})`;
    re.src_ip4 = "(?:(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)";
    re.src_auth = `(?:(?:(?!${re.src_ZCc}|[@/\\[\\]()]).){1,50}@)?`;
    re.src_port = "(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?";
    re.src_host_terminator = `(?=$|${text_separators}|${re.src_ZPCc})(?!${opts["---"] ? "-(?!--)|" : "-|"}_|:\\d|\\.-|\\.(?!$|${re.src_ZPCc}))`;
    re.src_path = `(?:[/?#](?:(?!${re.src_ZCc}|${text_separators}|[()[\\]{}.,"'?!\\-;]).|\\[(?:(?!${re.src_ZCc}|\\]).)*\\]|\\((?:(?!${re.src_ZCc}|[)]).)*\\)|\\{(?:(?!${re.src_ZCc}|[}]).)*\\}|\\"(?:(?!${re.src_ZCc}|["]).)+\\"|\\'(?:(?!${re.src_ZCc}|[']).)+\\'|\\'(?=${re.src_pseudo_letter}|[-])|\\.{2,}[a-zA-Z0-9%/&]|\\.(?!${re.src_ZCc}|[.]|$)|` + (opts["---"] ? "\\-(?!--(?:[^-]|$))(?:-*)|" : "\\-+|") + // allow `,,,` in paths
    `,(?!${re.src_ZCc}|$)|;(?!${re.src_ZCc}|$)|\\!+(?!${re.src_ZCc}|[!]|$)|\\?(?!${re.src_ZCc}|[?]|$))+|\\/)?`;
    re.src_email_name = '[\\-;:&=\\+\\$,\\.a-zA-Z0-9_][\\-;:&=\\+\\$,\\"\\.a-zA-Z0-9_]{0,63}';
    re.src_xn = "xn--[a-z0-9\\-]{1,59}";
    re.src_domain_root = // Allow letters & digits (http://test1)
    "(?:" + re.src_xn + `|${re.src_pseudo_letter}{1,63})`;
    re.src_domain = "(?:" + re.src_xn + `|(?:${re.src_pseudo_letter})|(?:${re.src_pseudo_letter}(?:-|${re.src_pseudo_letter}){0,61}${re.src_pseudo_letter}))`;
    re.src_host = `(?:(?:(?:(?:${re.src_domain})\\.)*${re.src_domain}))`;
    re.tpl_host_fuzzy = "(?:" + re.src_ip4 + `|(?:(?:(?:${re.src_domain})\\.)+(?:%TLDS%)))`;
    re.tpl_host_no_ip_fuzzy = `(?:(?:(?:${re.src_domain})\\.)+(?:%TLDS%))`;
    re.src_host_strict = re.src_host + re.src_host_terminator;
    re.tpl_host_fuzzy_strict = re.tpl_host_fuzzy + re.src_host_terminator;
    re.src_host_port_strict = re.src_host + re.src_port + re.src_host_terminator;
    re.tpl_host_port_fuzzy_strict = re.tpl_host_fuzzy + re.src_port + re.src_host_terminator;
    re.tpl_host_port_no_ip_fuzzy_strict = re.tpl_host_no_ip_fuzzy + re.src_port + re.src_host_terminator;
    re.tpl_host_fuzzy_test = `localhost|www\\.|\\.\\d{1,3}\\.|(?:\\.(?:%TLDS%)(?:${re.src_ZPCc}|>|$))`;
    re.tpl_email_fuzzy = `(^|${text_separators}|"|\\(|${re.src_ZCc})(${re.src_email_name}@${re.tpl_host_fuzzy_strict})`;
    re.tpl_link_fuzzy = // Fuzzy link can't be prepended with .:/\- and non punctuation.
    // but can start with > (markdown blockquote)
    `(^|(?![.:/\\-_@])(?:[$+<=>^\`|\uFF5C]|${re.src_ZPCc}))((?![$+<=>^\`|\uFF5C])${re.tpl_host_port_fuzzy_strict}${re.src_path})`;
    re.tpl_link_no_ip_fuzzy = // Fuzzy link can't be prepended with .:/\- and non punctuation.
    // but can start with > (markdown blockquote)
    `(^|(?![.:/\\-_@])(?:[$+<=>^\`|\uFF5C]|${re.src_ZPCc}))((?![$+<=>^\`|\uFF5C])${re.tpl_host_port_no_ip_fuzzy_strict}${re.src_path})`;
    return re;
  }

  // node_modules/linkify-it/index.mjs
  function assign2(obj) {
    const sources = Array.prototype.slice.call(arguments, 1);
    sources.forEach(function(source) {
      if (!source) {
        return;
      }
      Object.keys(source).forEach(function(key) {
        obj[key] = source[key];
      });
    });
    return obj;
  }
  function _class2(obj) {
    return Object.prototype.toString.call(obj);
  }
  function isString2(obj) {
    return _class2(obj) === "[object String]";
  }
  function isObject(obj) {
    return _class2(obj) === "[object Object]";
  }
  function isRegExp(obj) {
    return _class2(obj) === "[object RegExp]";
  }
  function isFunction(obj) {
    return _class2(obj) === "[object Function]";
  }
  function escapeRE2(str) {
    return str.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
  }
  var defaultOptions = {
    fuzzyLink: true,
    fuzzyEmail: true,
    fuzzyIP: false
  };
  function isOptionsObj(obj) {
    return Object.keys(obj || {}).reduce(function(acc, k) {
      return acc || defaultOptions.hasOwnProperty(k);
    }, false);
  }
  var defaultSchemas = {
    "http:": {
      validate: function(text3, pos, self) {
        const tail = text3.slice(pos);
        if (!self.re.http) {
          self.re.http = new RegExp(
            `^\\/\\/${self.re.src_auth}${self.re.src_host_port_strict}${self.re.src_path}`,
            "i"
          );
        }
        if (self.re.http.test(tail)) {
          return tail.match(self.re.http)[0].length;
        }
        return 0;
      }
    },
    "https:": "http:",
    "ftp:": "http:",
    "//": {
      validate: function(text3, pos, self) {
        const tail = text3.slice(pos);
        if (!self.re.no_http) {
          self.re.no_http = new RegExp(
            "^" + self.re.src_auth + // Don't allow single-level domains, because of false positives like '//test'
            // with code comments
            `(?:localhost|(?:(?:${self.re.src_domain})\\.)+${self.re.src_domain_root})` + self.re.src_port + self.re.src_host_terminator + self.re.src_path,
            "i"
          );
        }
        if (self.re.no_http.test(tail)) {
          if (pos >= 3 && text3[pos - 3] === ":") {
            return 0;
          }
          if (pos >= 3 && text3[pos - 3] === "/") {
            return 0;
          }
          return tail.match(self.re.no_http)[0].length;
        }
        return 0;
      }
    },
    "mailto:": {
      validate: function(text3, pos, self) {
        const tail = text3.slice(pos);
        if (!self.re.mailto) {
          self.re.mailto = new RegExp(
            `^${self.re.src_email_name}@${self.re.src_host_strict}`,
            "i"
          );
        }
        if (self.re.mailto.test(tail)) {
          return tail.match(self.re.mailto)[0].length;
        }
        return 0;
      }
    }
  };
  var tlds_2ch_src_re = "a[cdefgilmnoqrstuwxz]|b[abdefghijmnorstvwyz]|c[acdfghiklmnoruvwxyz]|d[ejkmoz]|e[cegrstu]|f[ijkmor]|g[abdefghilmnpqrstuwy]|h[kmnrtu]|i[delmnoqrst]|j[emop]|k[eghimnprwyz]|l[abcikrstuvy]|m[acdeghklmnopqrstuvwxyz]|n[acefgilopruz]|om|p[aefghklmnrstwy]|qa|r[eosuw]|s[abcdeghijklmnortuvxyz]|t[cdfghjklmnortvwz]|u[agksyz]|v[aceginu]|w[fs]|y[et]|z[amw]";
  var tlds_default = "biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|\u0440\u0444".split("|");
  function createValidator(re) {
    return function(text3, pos) {
      const tail = text3.slice(pos);
      if (re.test(tail)) {
        return tail.match(re)[0].length;
      }
      return 0;
    };
  }
  function createNormalizer() {
    return function(match2, self) {
      self.normalize(match2);
    };
  }
  function compile(self) {
    const re = self.re = re_default(self.__opts__);
    const tlds2 = self.__tlds__.slice();
    self.onCompile();
    if (!self.__tlds_replaced__) {
      tlds2.push(tlds_2ch_src_re);
    }
    tlds2.push(re.src_xn);
    re.src_tlds = tlds2.join("|");
    function untpl(tpl) {
      return tpl.replace("%TLDS%", re.src_tlds);
    }
    re.email_fuzzy = RegExp(untpl(re.tpl_email_fuzzy), "i");
    re.email_fuzzy_global = RegExp(untpl(re.tpl_email_fuzzy), "ig");
    re.link_fuzzy = RegExp(untpl(re.tpl_link_fuzzy), "i");
    re.link_fuzzy_global = RegExp(untpl(re.tpl_link_fuzzy), "ig");
    re.link_no_ip_fuzzy = RegExp(untpl(re.tpl_link_no_ip_fuzzy), "i");
    re.link_no_ip_fuzzy_global = RegExp(untpl(re.tpl_link_no_ip_fuzzy), "ig");
    re.host_fuzzy_test = RegExp(untpl(re.tpl_host_fuzzy_test), "i");
    const aliases = [];
    self.__compiled__ = {};
    function schemaError(name, val) {
      throw new Error(`(LinkifyIt) Invalid schema "${name}": ${val}`);
    }
    Object.keys(self.__schemas__).forEach(function(name) {
      const val = self.__schemas__[name];
      if (val === null) {
        return;
      }
      const compiled = { validate: null, link: null };
      self.__compiled__[name] = compiled;
      if (isObject(val)) {
        if (isRegExp(val.validate)) {
          compiled.validate = createValidator(val.validate);
        } else if (isFunction(val.validate)) {
          compiled.validate = val.validate;
        } else {
          schemaError(name, val);
        }
        if (isFunction(val.normalize)) {
          compiled.normalize = val.normalize;
        } else if (!val.normalize) {
          compiled.normalize = createNormalizer();
        } else {
          schemaError(name, val);
        }
        return;
      }
      if (isString2(val)) {
        aliases.push(name);
        return;
      }
      schemaError(name, val);
    });
    aliases.forEach(function(alias) {
      if (!self.__compiled__[self.__schemas__[alias]]) {
        return;
      }
      self.__compiled__[alias].validate = self.__compiled__[self.__schemas__[alias]].validate;
      self.__compiled__[alias].normalize = self.__compiled__[self.__schemas__[alias]].normalize;
    });
    self.__compiled__[""] = { validate: null, normalize: createNormalizer() };
    const slist = Object.keys(self.__compiled__).filter(function(name) {
      return name.length > 0 && self.__compiled__[name];
    }).map(escapeRE2).join("|");
    self.re.schema_test = RegExp(`(^|(?!_)(?:[><\uFF5C]|${re.src_ZPCc}))(${slist})`, "i");
    self.re.schema_search = RegExp(`(^|(?!_)(?:[><\uFF5C]|${re.src_ZPCc}))(${slist})`, "ig");
    self.re.schema_at_start = RegExp(`^${self.re.schema_search.source}`, "i");
    self.re.pretest = RegExp(
      `(${self.re.schema_test.source})|(${self.re.host_fuzzy_test.source})|@`,
      "i"
    );
  }
  function Match(text3, schema, index, lastIndex) {
    const raw = text3.slice(index, lastIndex);
    this.schema = schema.toLowerCase();
    this.index = index;
    this.lastIndex = lastIndex;
    this.raw = raw;
    this.text = raw;
    this.url = raw;
  }
  function LinkifyIt(schemas, options) {
    if (!(this instanceof LinkifyIt)) {
      return new LinkifyIt(schemas, options);
    }
    if (!options) {
      if (isOptionsObj(schemas)) {
        options = schemas;
        schemas = {};
      }
    }
    this.__opts__ = assign2({}, defaultOptions, options);
    this.__schemas__ = assign2({}, defaultSchemas, schemas);
    this.__compiled__ = {};
    this.__tlds__ = tlds_default;
    this.__tlds_replaced__ = false;
    this.re = {};
    compile(this);
  }
  LinkifyIt.prototype.add = function add(schema, definition2) {
    this.__schemas__[schema] = definition2;
    compile(this);
    return this;
  };
  LinkifyIt.prototype.set = function set(options) {
    this.__opts__ = assign2(this.__opts__, options);
    return this;
  };
  LinkifyIt.prototype.test = function test(text3) {
    if (!text3.length) {
      return false;
    }
    let m, re;
    if (this.re.schema_test.test(text3)) {
      re = this.re.schema_search;
      re.lastIndex = 0;
      while ((m = re.exec(text3)) !== null) {
        if (this.testSchemaAt(text3, m[2], re.lastIndex)) {
          return true;
        }
      }
    }
    if (this.__opts__.fuzzyLink && this.__compiled__["http:"]) {
      if (text3.search(this.re.host_fuzzy_test) >= 0) {
        if (text3.match(this.__opts__.fuzzyIP ? this.re.link_fuzzy : this.re.link_no_ip_fuzzy) !== null) {
          return true;
        }
      }
    }
    if (this.__opts__.fuzzyEmail && this.__compiled__["mailto:"]) {
      if (text3.indexOf("@") >= 0) {
        if (text3.match(this.re.email_fuzzy) !== null) {
          return true;
        }
      }
    }
    return false;
  };
  LinkifyIt.prototype.pretest = function pretest(text3) {
    return this.re.pretest.test(text3);
  };
  LinkifyIt.prototype.testSchemaAt = function testSchemaAt(text3, schema, pos) {
    if (!this.__compiled__[schema.toLowerCase()]) {
      return 0;
    }
    return this.__compiled__[schema.toLowerCase()].validate(text3, pos, this);
  };
  LinkifyIt.prototype.match = function match(text3) {
    const result = [];
    const type_schemed = [];
    const type_fuzzy_link = [];
    const type_fuzzy_email = [];
    let m, len, re;
    function choose(a, b) {
      if (!a) {
        return b;
      }
      if (!b) {
        return a;
      }
      if (a.index !== b.index) {
        return a.index < b.index ? a : b;
      }
      return a.lastIndex >= b.lastIndex ? a : b;
    }
    if (!text3.length) {
      return null;
    }
    if (this.re.schema_test.test(text3)) {
      re = this.re.schema_search;
      re.lastIndex = 0;
      while ((m = re.exec(text3)) !== null) {
        len = this.testSchemaAt(text3, m[2], re.lastIndex);
        if (len) {
          type_schemed.push({
            schema: m[2],
            index: m.index + m[1].length,
            lastIndex: m.index + m[0].length + len
          });
        }
      }
    }
    if (this.__opts__.fuzzyLink && this.__compiled__["http:"]) {
      re = this.__opts__.fuzzyIP ? this.re.link_fuzzy_global : this.re.link_no_ip_fuzzy_global;
      re.lastIndex = 0;
      while ((m = re.exec(text3)) !== null) {
        type_fuzzy_link.push({
          schema: "",
          index: m.index + m[1].length,
          lastIndex: m.index + m[0].length
        });
      }
    }
    if (this.__opts__.fuzzyEmail && this.__compiled__["mailto:"]) {
      re = this.re.email_fuzzy_global;
      re.lastIndex = 0;
      while ((m = re.exec(text3)) !== null) {
        type_fuzzy_email.push({
          schema: "mailto:",
          index: m.index + m[1].length,
          lastIndex: m.index + m[0].length
        });
      }
    }
    const indexes = [0, 0, 0];
    let lastIndex = 0;
    for (; ; ) {
      const candidates = [
        type_schemed[indexes[0]],
        type_fuzzy_email[indexes[1]],
        type_fuzzy_link[indexes[2]]
      ];
      const candidate = choose(choose(candidates[0], candidates[1]), candidates[2]);
      if (!candidate) {
        break;
      }
      if (candidate === candidates[0]) {
        indexes[0]++;
      } else if (candidate === candidates[1]) {
        indexes[1]++;
      } else {
        indexes[2]++;
      }
      if (candidate.index < lastIndex) {
        continue;
      }
      const match2 = new Match(text3, candidate.schema, candidate.index, candidate.lastIndex);
      this.__compiled__[match2.schema].normalize(match2, this);
      result.push(match2);
      lastIndex = candidate.lastIndex;
    }
    if (result.length) {
      return result;
    }
    return null;
  };
  LinkifyIt.prototype.matchAtStart = function matchAtStart(text3) {
    if (!text3.length) return null;
    const m = this.re.schema_at_start.exec(text3);
    if (!m) return null;
    const len = this.testSchemaAt(text3, m[2], m[0].length);
    if (!len) return null;
    const match2 = new Match(text3, m[2], m.index + m[1].length, m.index + m[0].length + len);
    this.__compiled__[match2.schema].normalize(match2, this);
    return match2;
  };
  LinkifyIt.prototype.tlds = function tlds(list3, keepOld) {
    list3 = Array.isArray(list3) ? list3 : [list3];
    if (!keepOld) {
      this.__tlds__ = list3.slice();
      this.__tlds_replaced__ = true;
      compile(this);
      return this;
    }
    this.__tlds__ = this.__tlds__.concat(list3).sort().filter(function(el, idx, arr) {
      return el !== arr[idx - 1];
    }).reverse();
    compile(this);
    return this;
  };
  LinkifyIt.prototype.normalize = function normalize2(match2) {
    if (!match2.schema) {
      match2.url = `http://${match2.url}`;
    }
    if (match2.schema === "mailto:" && !/^mailto:/i.test(match2.url)) {
      match2.url = `mailto:${match2.url}`;
    }
  };
  LinkifyIt.prototype.onCompile = function onCompile() {
  };
  var linkify_it_default = LinkifyIt;

  // node_modules/punycode.js/punycode.es6.js
  var maxInt = 2147483647;
  var base = 36;
  var tMin = 1;
  var tMax = 26;
  var skew = 38;
  var damp = 700;
  var initialBias = 72;
  var initialN = 128;
  var delimiter = "-";
  var regexPunycode = /^xn--/;
  var regexNonASCII = /[^\0-\x7F]/;
  var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g;
  var errors = {
    "overflow": "Overflow: input needs wider integers to process",
    "not-basic": "Illegal input >= 0x80 (not a basic code point)",
    "invalid-input": "Invalid input"
  };
  var baseMinusTMin = base - tMin;
  var floor = Math.floor;
  var stringFromCharCode = String.fromCharCode;
  function error2(type) {
    throw new RangeError(errors[type]);
  }
  function map(array, callback) {
    const result = [];
    let length = array.length;
    while (length--) {
      result[length] = callback(array[length]);
    }
    return result;
  }
  function mapDomain(domain, callback) {
    const parts = domain.split("@");
    let result = "";
    if (parts.length > 1) {
      result = parts[0] + "@";
      domain = parts[1];
    }
    domain = domain.replace(regexSeparators, ".");
    const labels = domain.split(".");
    const encoded = map(labels, callback).join(".");
    return result + encoded;
  }
  function ucs2decode(string) {
    const output = [];
    let counter = 0;
    const length = string.length;
    while (counter < length) {
      const value = string.charCodeAt(counter++);
      if (value >= 55296 && value <= 56319 && counter < length) {
        const extra = string.charCodeAt(counter++);
        if ((extra & 64512) == 56320) {
          output.push(((value & 1023) << 10) + (extra & 1023) + 65536);
        } else {
          output.push(value);
          counter--;
        }
      } else {
        output.push(value);
      }
    }
    return output;
  }
  var ucs2encode = (codePoints) => String.fromCodePoint(...codePoints);
  var basicToDigit = function(codePoint) {
    if (codePoint >= 48 && codePoint < 58) {
      return 26 + (codePoint - 48);
    }
    if (codePoint >= 65 && codePoint < 91) {
      return codePoint - 65;
    }
    if (codePoint >= 97 && codePoint < 123) {
      return codePoint - 97;
    }
    return base;
  };
  var digitToBasic = function(digit, flag) {
    return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
  };
  var adapt = function(delta, numPoints, firstTime) {
    let k = 0;
    delta = firstTime ? floor(delta / damp) : delta >> 1;
    delta += floor(delta / numPoints);
    for (; delta > baseMinusTMin * tMax >> 1; k += base) {
      delta = floor(delta / baseMinusTMin);
    }
    return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
  };
  var decode2 = function(input) {
    const output = [];
    const inputLength = input.length;
    let i = 0;
    let n = initialN;
    let bias = initialBias;
    let basic = input.lastIndexOf(delimiter);
    if (basic < 0) {
      basic = 0;
    }
    for (let j = 0; j < basic; ++j) {
      if (input.charCodeAt(j) >= 128) {
        error2("not-basic");
      }
      output.push(input.charCodeAt(j));
    }
    for (let index = basic > 0 ? basic + 1 : 0; index < inputLength; ) {
      const oldi = i;
      for (let w = 1, k = base; ; k += base) {
        if (index >= inputLength) {
          error2("invalid-input");
        }
        const digit = basicToDigit(input.charCodeAt(index++));
        if (digit >= base) {
          error2("invalid-input");
        }
        if (digit > floor((maxInt - i) / w)) {
          error2("overflow");
        }
        i += digit * w;
        const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
        if (digit < t) {
          break;
        }
        const baseMinusT = base - t;
        if (w > floor(maxInt / baseMinusT)) {
          error2("overflow");
        }
        w *= baseMinusT;
      }
      const out = output.length + 1;
      bias = adapt(i - oldi, out, oldi == 0);
      if (floor(i / out) > maxInt - n) {
        error2("overflow");
      }
      n += floor(i / out);
      i %= out;
      output.splice(i++, 0, n);
    }
    return String.fromCodePoint(...output);
  };
  var encode2 = function(input) {
    const output = [];
    input = ucs2decode(input);
    const inputLength = input.length;
    let n = initialN;
    let delta = 0;
    let bias = initialBias;
    for (const currentValue of input) {
      if (currentValue < 128) {
        output.push(stringFromCharCode(currentValue));
      }
    }
    const basicLength = output.length;
    let handledCPCount = basicLength;
    if (basicLength) {
      output.push(delimiter);
    }
    while (handledCPCount < inputLength) {
      let m = maxInt;
      for (const currentValue of input) {
        if (currentValue >= n && currentValue < m) {
          m = currentValue;
        }
      }
      const handledCPCountPlusOne = handledCPCount + 1;
      if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
        error2("overflow");
      }
      delta += (m - n) * handledCPCountPlusOne;
      n = m;
      for (const currentValue of input) {
        if (currentValue < n && ++delta > maxInt) {
          error2("overflow");
        }
        if (currentValue === n) {
          let q = delta;
          for (let k = base; ; k += base) {
            const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
            if (q < t) {
              break;
            }
            const qMinusT = q - t;
            const baseMinusT = base - t;
            output.push(
              stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
            );
            q = floor(qMinusT / baseMinusT);
          }
          output.push(stringFromCharCode(digitToBasic(q, 0)));
          bias = adapt(delta, handledCPCountPlusOne, handledCPCount === basicLength);
          delta = 0;
          ++handledCPCount;
        }
      }
      ++delta;
      ++n;
    }
    return output.join("");
  };
  var toUnicode = function(input) {
    return mapDomain(input, function(string) {
      return regexPunycode.test(string) ? decode2(string.slice(4).toLowerCase()) : string;
    });
  };
  var toASCII = function(input) {
    return mapDomain(input, function(string) {
      return regexNonASCII.test(string) ? "xn--" + encode2(string) : string;
    });
  };
  var punycode = {
    /**
     * A string representing the current Punycode.js version number.
     * @memberOf punycode
     * @type String
     */
    "version": "2.3.1",
    /**
     * An object of methods to convert from JavaScript's internal character
     * representation (UCS-2) to Unicode code points, and back.
     * @see <https://mathiasbynens.be/notes/javascript-encoding>
     * @memberOf punycode
     * @type Object
     */
    "ucs2": {
      "decode": ucs2decode,
      "encode": ucs2encode
    },
    "decode": decode2,
    "encode": encode2,
    "toASCII": toASCII,
    "toUnicode": toUnicode
  };
  var punycode_es6_default = punycode;

  // node_modules/markdown-it/lib/presets/default.mjs
  var default_default = {
    options: {
      // Enable HTML tags in source
      html: false,
      // Use '/' to close single tags (<br />)
      xhtmlOut: false,
      // Convert '\n' in paragraphs into <br>
      breaks: false,
      // CSS language prefix for fenced blocks
      langPrefix: "language-",
      // autoconvert URL-like texts to links
      linkify: false,
      // Enable some language-neutral replacements + quotes beautification
      typographer: false,
      // Double + single quotes replacement pairs, when typographer enabled,
      // and smartquotes on. Could be either a String or an Array.
      //
      // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
      // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
      quotes: "\u201C\u201D\u2018\u2019",
      /* “”‘’ */
      // Highlighter function. Should return escaped HTML,
      // or '' if the source string is not changed and should be escaped externaly.
      // If result starts with <pre... internal wrapper is skipped.
      //
      // function (/*str, lang*/) { return ''; }
      //
      highlight: null,
      // Internal protection, recursion limit
      maxNesting: 100
    },
    components: {
      core: {},
      block: {},
      inline: {}
    }
  };

  // node_modules/markdown-it/lib/presets/zero.mjs
  var zero_default = {
    options: {
      // Enable HTML tags in source
      html: false,
      // Use '/' to close single tags (<br />)
      xhtmlOut: false,
      // Convert '\n' in paragraphs into <br>
      breaks: false,
      // CSS language prefix for fenced blocks
      langPrefix: "language-",
      // autoconvert URL-like texts to links
      linkify: false,
      // Enable some language-neutral replacements + quotes beautification
      typographer: false,
      // Double + single quotes replacement pairs, when typographer enabled,
      // and smartquotes on. Could be either a String or an Array.
      //
      // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
      // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
      quotes: "\u201C\u201D\u2018\u2019",
      /* “”‘’ */
      // Highlighter function. Should return escaped HTML,
      // or '' if the source string is not changed and should be escaped externaly.
      // If result starts with <pre... internal wrapper is skipped.
      //
      // function (/*str, lang*/) { return ''; }
      //
      highlight: null,
      // Internal protection, recursion limit
      maxNesting: 20
    },
    components: {
      core: {
        rules: [
          "normalize",
          "block",
          "inline",
          "text_join"
        ]
      },
      block: {
        rules: [
          "paragraph"
        ]
      },
      inline: {
        rules: [
          "text"
        ],
        rules2: [
          "balance_pairs",
          "fragments_join"
        ]
      }
    }
  };

  // node_modules/markdown-it/lib/presets/commonmark.mjs
  var commonmark_default = {
    options: {
      // Enable HTML tags in source
      html: true,
      // Use '/' to close single tags (<br />)
      xhtmlOut: true,
      // Convert '\n' in paragraphs into <br>
      breaks: false,
      // CSS language prefix for fenced blocks
      langPrefix: "language-",
      // autoconvert URL-like texts to links
      linkify: false,
      // Enable some language-neutral replacements + quotes beautification
      typographer: false,
      // Double + single quotes replacement pairs, when typographer enabled,
      // and smartquotes on. Could be either a String or an Array.
      //
      // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
      // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
      quotes: "\u201C\u201D\u2018\u2019",
      /* “”‘’ */
      // Highlighter function. Should return escaped HTML,
      // or '' if the source string is not changed and should be escaped externaly.
      // If result starts with <pre... internal wrapper is skipped.
      //
      // function (/*str, lang*/) { return ''; }
      //
      highlight: null,
      // Internal protection, recursion limit
      maxNesting: 20
    },
    components: {
      core: {
        rules: [
          "normalize",
          "block",
          "inline",
          "text_join"
        ]
      },
      block: {
        rules: [
          "blockquote",
          "code",
          "fence",
          "heading",
          "hr",
          "html_block",
          "lheading",
          "list",
          "reference",
          "paragraph"
        ]
      },
      inline: {
        rules: [
          "autolink",
          "backticks",
          "emphasis",
          "entity",
          "escape",
          "html_inline",
          "image",
          "link",
          "newline",
          "text"
        ],
        rules2: [
          "balance_pairs",
          "emphasis",
          "fragments_join"
        ]
      }
    }
  };

  // node_modules/markdown-it/lib/index.mjs
  var config2 = {
    default: default_default,
    zero: zero_default,
    commonmark: commonmark_default
  };
  var BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
  var GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/;
  function validateLink(url) {
    const str = url.trim().toLowerCase();
    return BAD_PROTO_RE.test(str) ? GOOD_DATA_RE.test(str) : true;
  }
  var RECODE_HOSTNAME_FOR = ["http:", "https:", "mailto:"];
  function normalizeLink(url) {
    const parsed = parse_default(url, true);
    if (parsed.hostname) {
      if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
        try {
          parsed.hostname = punycode_es6_default.toASCII(parsed.hostname);
        } catch (er) {
        }
      }
    }
    return encode_default(format2(parsed));
  }
  function normalizeLinkText(url) {
    const parsed = parse_default(url, true);
    if (parsed.hostname) {
      if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
        try {
          parsed.hostname = punycode_es6_default.toUnicode(parsed.hostname);
        } catch (er) {
        }
      }
    }
    return decode_default(format2(parsed), decode_default.defaultChars + "%");
  }
  function MarkdownIt(presetName, options) {
    if (!(this instanceof MarkdownIt)) {
      return new MarkdownIt(presetName, options);
    }
    if (!options) {
      if (!isString(presetName)) {
        options = presetName || {};
        presetName = "default";
      }
    }
    this.inline = new parser_inline_default();
    this.block = new parser_block_default();
    this.core = new parser_core_default();
    this.renderer = new renderer_default();
    this.linkify = new linkify_it_default();
    this.validateLink = validateLink;
    this.normalizeLink = normalizeLink;
    this.normalizeLinkText = normalizeLinkText;
    this.utils = utils_exports;
    this.helpers = assign({}, helpers_exports);
    this.options = {};
    this.configure(presetName);
    if (options) {
      this.set(options);
    }
  }
  MarkdownIt.prototype.set = function(options) {
    assign(this.options, options);
    return this;
  };
  MarkdownIt.prototype.configure = function(presets) {
    const self = this;
    if (isString(presets)) {
      const presetName = presets;
      presets = config2[presetName];
      if (!presets) {
        throw new Error('Wrong `markdown-it` preset "' + presetName + '", check name');
      }
    }
    if (!presets) {
      throw new Error("Wrong `markdown-it` preset, can't be empty");
    }
    if (presets.options) {
      self.set(presets.options);
    }
    if (presets.components) {
      Object.keys(presets.components).forEach(function(name) {
        if (presets.components[name].rules) {
          self[name].ruler.enableOnly(presets.components[name].rules);
        }
        if (presets.components[name].rules2) {
          self[name].ruler2.enableOnly(presets.components[name].rules2);
        }
      });
    }
    return this;
  };
  MarkdownIt.prototype.enable = function(list3, ignoreInvalid) {
    let result = [];
    if (!Array.isArray(list3)) {
      list3 = [list3];
    }
    ["core", "block", "inline"].forEach(function(chain) {
      result = result.concat(this[chain].ruler.enable(list3, true));
    }, this);
    result = result.concat(this.inline.ruler2.enable(list3, true));
    const missed = list3.filter(function(name) {
      return result.indexOf(name) < 0;
    });
    if (missed.length && !ignoreInvalid) {
      throw new Error("MarkdownIt. Failed to enable unknown rule(s): " + missed);
    }
    return this;
  };
  MarkdownIt.prototype.disable = function(list3, ignoreInvalid) {
    let result = [];
    if (!Array.isArray(list3)) {
      list3 = [list3];
    }
    ["core", "block", "inline"].forEach(function(chain) {
      result = result.concat(this[chain].ruler.disable(list3, true));
    }, this);
    result = result.concat(this.inline.ruler2.disable(list3, true));
    const missed = list3.filter(function(name) {
      return result.indexOf(name) < 0;
    });
    if (missed.length && !ignoreInvalid) {
      throw new Error("MarkdownIt. Failed to disable unknown rule(s): " + missed);
    }
    return this;
  };
  MarkdownIt.prototype.use = function(plugin) {
    const args = [this].concat(Array.prototype.slice.call(arguments, 1));
    plugin.apply(plugin, args);
    return this;
  };
  MarkdownIt.prototype.parse = function(src, env) {
    if (typeof src !== "string") {
      throw new Error("Input data should be a String");
    }
    const state = new this.core.State(src, this, env);
    this.core.process(state);
    return state.tokens;
  };
  MarkdownIt.prototype.render = function(src, env) {
    env = env || {};
    return this.renderer.render(this.parse(src, env), this.options, env);
  };
  MarkdownIt.prototype.parseInline = function(src, env) {
    const state = new this.core.State(src, this, env);
    state.inlineMode = true;
    this.core.process(state);
    return state.tokens;
  };
  MarkdownIt.prototype.renderInline = function(src, env) {
    env = env || {};
    return this.renderer.render(this.parseInline(src, env), this.options, env);
  };
  var lib_default = MarkdownIt;

  // node_modules/markdown-it-footnote/index.mjs
  function render_footnote_anchor_name(tokens, idx, options, env) {
    const n = Number(tokens[idx].meta.id + 1).toString();
    let prefix = "";
    if (typeof env.docId === "string") prefix = `-${env.docId}-`;
    return prefix + n;
  }
  function render_footnote_caption(tokens, idx) {
    let n = Number(tokens[idx].meta.id + 1).toString();
    if (tokens[idx].meta.subId > 0) n += `:${tokens[idx].meta.subId}`;
    return `[${n}]`;
  }
  function render_footnote_ref(tokens, idx, options, env, slf) {
    const id2 = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
    const caption = slf.rules.footnote_caption(tokens, idx, options, env, slf);
    let refid = id2;
    if (tokens[idx].meta.subId > 0) refid += `:${tokens[idx].meta.subId}`;
    return `<sup class="footnote-ref"><a href="#fn${id2}" id="fnref${refid}">${caption}</a></sup>`;
  }
  function render_footnote_block_open(tokens, idx, options) {
    return (options.xhtmlOut ? '<hr class="footnotes-sep" />\n' : '<hr class="footnotes-sep">\n') + '<section class="footnotes">\n<ol class="footnotes-list">\n';
  }
  function render_footnote_block_close() {
    return "</ol>\n</section>\n";
  }
  function render_footnote_open(tokens, idx, options, env, slf) {
    let id2 = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
    if (tokens[idx].meta.subId > 0) id2 += `:${tokens[idx].meta.subId}`;
    return `<li id="fn${id2}" class="footnote-item">`;
  }
  function render_footnote_close() {
    return "</li>\n";
  }
  function render_footnote_anchor(tokens, idx, options, env, slf) {
    let id2 = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
    if (tokens[idx].meta.subId > 0) id2 += `:${tokens[idx].meta.subId}`;
    return ` <a href="#fnref${id2}" class="footnote-backref">\u21A9\uFE0E</a>`;
  }
  function footnote_plugin(md2) {
    const parseLinkLabel2 = md2.helpers.parseLinkLabel;
    const isSpace2 = md2.utils.isSpace;
    md2.renderer.rules.footnote_ref = render_footnote_ref;
    md2.renderer.rules.footnote_block_open = render_footnote_block_open;
    md2.renderer.rules.footnote_block_close = render_footnote_block_close;
    md2.renderer.rules.footnote_open = render_footnote_open;
    md2.renderer.rules.footnote_close = render_footnote_close;
    md2.renderer.rules.footnote_anchor = render_footnote_anchor;
    md2.renderer.rules.footnote_caption = render_footnote_caption;
    md2.renderer.rules.footnote_anchor_name = render_footnote_anchor_name;
    function footnote_def(state, startLine, endLine, silent) {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      if (start + 4 > max) return false;
      if (state.src.charCodeAt(start) !== 91) return false;
      if (state.src.charCodeAt(start + 1) !== 94) return false;
      let pos;
      for (pos = start + 2; pos < max; pos++) {
        if (state.src.charCodeAt(pos) === 32) return false;
        if (state.src.charCodeAt(pos) === 93) {
          break;
        }
      }
      if (pos === start + 2) return false;
      if (pos + 1 >= max || state.src.charCodeAt(++pos) !== 58) return false;
      if (silent) return true;
      pos++;
      if (!state.env.footnotes) state.env.footnotes = {};
      if (!state.env.footnotes.refs) state.env.footnotes.refs = {};
      const label = state.src.slice(start + 2, pos - 2);
      state.env.footnotes.refs[`:${label}`] = -1;
      const token_fref_o = new state.Token("footnote_reference_open", "", 1);
      token_fref_o.meta = { label };
      token_fref_o.level = state.level++;
      state.tokens.push(token_fref_o);
      const oldBMark = state.bMarks[startLine];
      const oldTShift = state.tShift[startLine];
      const oldSCount = state.sCount[startLine];
      const oldParentType = state.parentType;
      const posAfterColon = pos;
      const initial = state.sCount[startLine] + pos - (state.bMarks[startLine] + state.tShift[startLine]);
      let offset = initial;
      while (pos < max) {
        const ch = state.src.charCodeAt(pos);
        if (isSpace2(ch)) {
          if (ch === 9) {
            offset += 4 - offset % 4;
          } else {
            offset++;
          }
        } else {
          break;
        }
        pos++;
      }
      state.tShift[startLine] = pos - posAfterColon;
      state.sCount[startLine] = offset - initial;
      state.bMarks[startLine] = posAfterColon;
      state.blkIndent += 4;
      state.parentType = "footnote";
      if (state.sCount[startLine] < state.blkIndent) {
        state.sCount[startLine] += state.blkIndent;
      }
      state.md.block.tokenize(state, startLine, endLine, true);
      state.parentType = oldParentType;
      state.blkIndent -= 4;
      state.tShift[startLine] = oldTShift;
      state.sCount[startLine] = oldSCount;
      state.bMarks[startLine] = oldBMark;
      const token_fref_c = new state.Token("footnote_reference_close", "", -1);
      token_fref_c.level = --state.level;
      state.tokens.push(token_fref_c);
      return true;
    }
    function footnote_inline(state, silent) {
      const max = state.posMax;
      const start = state.pos;
      if (start + 2 >= max) return false;
      if (state.src.charCodeAt(start) !== 94) return false;
      if (state.src.charCodeAt(start + 1) !== 91) return false;
      const labelStart = start + 2;
      const labelEnd = parseLinkLabel2(state, start + 1);
      if (labelEnd < 0) return false;
      if (!silent) {
        if (!state.env.footnotes) state.env.footnotes = {};
        if (!state.env.footnotes.list) state.env.footnotes.list = [];
        const footnoteId = state.env.footnotes.list.length;
        const tokens = [];
        state.md.inline.parse(
          state.src.slice(labelStart, labelEnd),
          state.md,
          state.env,
          tokens
        );
        const token3 = state.push("footnote_ref", "", 0);
        token3.meta = { id: footnoteId };
        state.env.footnotes.list[footnoteId] = {
          content: state.src.slice(labelStart, labelEnd),
          tokens
        };
      }
      state.pos = labelEnd + 1;
      state.posMax = max;
      return true;
    }
    function footnote_ref(state, silent) {
      const max = state.posMax;
      const start = state.pos;
      if (start + 3 > max) return false;
      if (!state.env.footnotes || !state.env.footnotes.refs) return false;
      if (state.src.charCodeAt(start) !== 91) return false;
      if (state.src.charCodeAt(start + 1) !== 94) return false;
      let pos;
      for (pos = start + 2; pos < max; pos++) {
        if (state.src.charCodeAt(pos) === 32) return false;
        if (state.src.charCodeAt(pos) === 10) return false;
        if (state.src.charCodeAt(pos) === 93) {
          break;
        }
      }
      if (pos === start + 2) return false;
      if (pos >= max) return false;
      pos++;
      const label = state.src.slice(start + 2, pos - 1);
      if (typeof state.env.footnotes.refs[`:${label}`] === "undefined") return false;
      if (!silent) {
        if (!state.env.footnotes.list) state.env.footnotes.list = [];
        let footnoteId;
        if (state.env.footnotes.refs[`:${label}`] < 0) {
          footnoteId = state.env.footnotes.list.length;
          state.env.footnotes.list[footnoteId] = { label, count: 0 };
          state.env.footnotes.refs[`:${label}`] = footnoteId;
        } else {
          footnoteId = state.env.footnotes.refs[`:${label}`];
        }
        const footnoteSubId = state.env.footnotes.list[footnoteId].count;
        state.env.footnotes.list[footnoteId].count++;
        const token3 = state.push("footnote_ref", "", 0);
        token3.meta = { id: footnoteId, subId: footnoteSubId, label };
      }
      state.pos = pos;
      state.posMax = max;
      return true;
    }
    function footnote_tail(state) {
      let tokens;
      let current;
      let currentLabel;
      let insideRef = false;
      const refTokens = {};
      if (!state.env.footnotes) {
        return;
      }
      state.tokens = state.tokens.filter(function(tok) {
        if (tok.type === "footnote_reference_open") {
          insideRef = true;
          current = [];
          currentLabel = tok.meta.label;
          return false;
        }
        if (tok.type === "footnote_reference_close") {
          insideRef = false;
          refTokens[":" + currentLabel] = current;
          return false;
        }
        if (insideRef) {
          current.push(tok);
        }
        return !insideRef;
      });
      if (!state.env.footnotes.list) {
        return;
      }
      const list3 = state.env.footnotes.list;
      state.tokens.push(new state.Token("footnote_block_open", "", 1));
      for (let i = 0, l = list3.length; i < l; i++) {
        const token_fo = new state.Token("footnote_open", "", 1);
        token_fo.meta = { id: i, label: list3[i].label };
        state.tokens.push(token_fo);
        if (list3[i].tokens) {
          tokens = [];
          const token_po = new state.Token("paragraph_open", "p", 1);
          token_po.block = true;
          tokens.push(token_po);
          const token_i = new state.Token("inline", "", 0);
          token_i.children = list3[i].tokens;
          token_i.content = list3[i].content;
          tokens.push(token_i);
          const token_pc = new state.Token("paragraph_close", "p", -1);
          token_pc.block = true;
          tokens.push(token_pc);
        } else if (list3[i].label) {
          tokens = refTokens[`:${list3[i].label}`];
        }
        if (tokens) state.tokens = state.tokens.concat(tokens);
        let lastParagraph;
        if (state.tokens[state.tokens.length - 1].type === "paragraph_close") {
          lastParagraph = state.tokens.pop();
        } else {
          lastParagraph = null;
        }
        const t = list3[i].count > 0 ? list3[i].count : 1;
        for (let j = 0; j < t; j++) {
          const token_a = new state.Token("footnote_anchor", "", 0);
          token_a.meta = { id: i, subId: j, label: list3[i].label };
          state.tokens.push(token_a);
        }
        if (lastParagraph) {
          state.tokens.push(lastParagraph);
        }
        state.tokens.push(new state.Token("footnote_close", "", -1));
      }
      state.tokens.push(new state.Token("footnote_block_close", "", -1));
    }
    md2.block.ruler.before("reference", "footnote_def", footnote_def, { alt: ["paragraph", "reference"] });
    md2.inline.ruler.after("image", "footnote_inline", footnote_inline);
    md2.inline.ruler.after("footnote_inline", "footnote_ref", footnote_ref);
    md2.core.ruler.after("inline", "footnote_tail", footnote_tail);
  }

  // src/merge.js
  var MAX_BYTES = 262144;
  var MAX_LINES = 32768;
  var MAX_CELLS = 12e3;
  var MAX_WORK = 2e6;
  var MAX_MS = 250;
  var MergeError = class extends Error {
    constructor(code2, message) {
      super(message);
      this.code = code2;
      const diagnostic = describeDiagnostic(message);
      this.messageId = diagnostic.id;
      this.messageArgs = diagnostic.args;
    }
  };
  var byteCount = (value) => new TextEncoder().encode(value).length;
  function validate(value) {
    if (typeof value !== "string" || /[\uD800-\uDFFF\0]/u.test(value))
      throw new MergeError("MERGE_INPUT", "Candidates must be valid UTF-8 text");
    if (byteCount(value) > MAX_BYTES)
      throw new MergeError(
        "MERGE_BUDGET",
        "Each candidate is limited to 256 KiB. Download for manual comparison"
      );
    const lines = value.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || [];
    if (lines.length > MAX_LINES)
      throw new MergeError("MERGE_BUDGET", "Each candidate is limited to 32,768 lines");
    return lines;
  }
  function units(lines, charge) {
    const parser = new lib_default({ html: true, maxNesting: 32 }).use(footnote_plugin);
    const tokens = [];
    charge();
    parser.block.parse(lines.join("").replace(/\r\n|\r/g, "\n"), parser, {}, tokens);
    charge(tokens.length);
    const fences = /* @__PURE__ */ new Map(), html = /* @__PURE__ */ new Map();
    for (const token3 of tokens) {
      if (!token3.map || token3.map[0] < 0 || token3.map[1] > lines.length) continue;
      if (token3.type === "fence") fences.set(token3.map[0], token3.map[1]);
      if (token3.type === "html_block") html.set(token3.map[0], token3.map[1]);
    }
    const out = [];
    for (let n = 0; n < lines.length; n++) {
      charge();
      const start = n, text3 = lines[n].replace(/[\r\n]+$/, "");
      if (n === 0 && text3 === "---" && /^markbridge: 1(?:\r\n|\r|\n)$/.test(lines[n + 1] || "")) {
        while (++n < lines.length && lines[n].replace(/[\r\n]+$/, "") !== "---") charge();
      } else if (html.has(n)) n = html.get(n) - 1;
      else if (/^:::mbb:v1\b/.test(text3)) {
        let depth = 1;
        while (++n < lines.length) {
          charge();
          const content = lines[n].replace(/[\r\n]+$/, "");
          if (fences.has(n)) n = fences.get(n) - 1;
          else if (html.has(n)) n = html.get(n) - 1;
          else if (/^:::mbb:v1\b/.test(content)) depth++;
          else if (/^:::mbb:end[ \t]*$/.test(content) && --depth === 0) break;
        }
      } else if (fences.has(n)) n = fences.get(n) - 1;
      n = Math.min(n, lines.length - 1);
      out.push({ text: lines.slice(start, n + 1).join(""), line: start + 1 });
    }
    return out;
  }
  function planMerge(base2, mine, latest) {
    const begin = Date.now();
    let work = 0;
    const charge = (amount = 1) => {
      work += amount;
      if (work > MAX_WORK || Date.now() - begin > MAX_MS)
        throw new MergeError(
          "MERGE_BUDGET",
          "Merge computation exceeded its budget. Preserve the candidate and compare manually"
        );
    };
    const linesA = validate(base2), linesB = validate(mine), linesC = validate(latest);
    if (mine === base2) return { schema: 1, parts: [{ text: latest }], conflicts: [] };
    if (latest === base2) return { schema: 1, parts: [{ text: mine }], conflicts: [] };
    if (mine === latest) return { schema: 1, parts: [{ text: mine }], conflicts: [] };
    const a = units(linesA, charge), b = units(linesB, charge), c = units(linesC, charge);
    const changes = (other, side) => {
      const counts = (array) => {
        const map2 = /* @__PURE__ */ new Map();
        array.forEach(({ text: text3 }, index) => {
          charge();
          const prev = map2.get(text3);
          map2.set(text3, { count: (prev?.count || 0) + 1, index });
        });
        return map2;
      };
      const ca = counts(a), cb = counts(other), pairs = [];
      for (const [text3, entry2] of ca)
        if (entry2.count === 1 && cb.get(text3)?.count === 1)
          pairs.push([entry2.index, cb.get(text3).index]);
      pairs.sort((x, y) => x[0] - y[0]);
      const tails = [], previous = new Int32Array(pairs.length);
      pairs.forEach(([_, index], n) => {
        let lo = 0, hi = tails.length;
        while (lo < hi) {
          charge();
          const middle = lo + hi >>> 1;
          if (pairs[tails[middle]][1] < index) lo = middle + 1;
          else hi = middle;
        }
        previous[n] = lo ? tails[lo - 1] : -1;
        tails[lo] = n;
      });
      const anchors = [];
      for (let n = tails.at(-1) ?? -1; n >= 0; n = previous[n]) anchors.push(pairs[n]);
      anchors.reverse();
      const edits2 = [];
      let ambiguous = false;
      const gap = (as, ae, bs, be) => {
        while (as < ae && bs < be && a[as].text === other[bs].text) {
          charge();
          as++;
          bs++;
        }
        while (as < ae && bs < be && a[ae - 1].text === other[be - 1].text) {
          charge();
          ae--;
          be--;
        }
        if (as === ae && bs === be) return;
        for (let n = as; n < ae; n++)
          if (a[n].text.trim() && ca.get(a[n].text).count > 1) ambiguous = true;
        for (let n = bs; n < be; n++)
          if (other[n].text.trim() && cb.get(other[n].text).count > 1) ambiguous = true;
        const na = ae - as, nb = be - bs;
        if (!na || !nb) {
          edits2.push({
            start: as,
            end: ae,
            text: other.slice(bs, be).map((v) => v.text).join(""),
            side
          });
          return;
        }
        if ((na + 1) * (nb + 1) > MAX_CELLS)
          throw new MergeError(
            "MERGE_BUDGET",
            "The local difference exceeds 12,000 cells. Compare manually"
          );
        const width = nb + 1, table2 = new Uint16Array((na + 1) * width);
        for (let i2 = na - 1; i2 >= 0; i2--)
          for (let j2 = nb - 1; j2 >= 0; j2--) {
            charge();
            table2[i2 * width + j2] = a[as + i2].text === other[bs + j2].text ? 1 + table2[(i2 + 1) * width + j2 + 1] : Math.max(table2[(i2 + 1) * width + j2], table2[i2 * width + j2 + 1]);
          }
        let i = 0, j = 0, pending2 = null;
        const flush = () => {
          if (pending2) edits2.push(pending2);
          pending2 = null;
        };
        while (i < na || j < nb) {
          charge();
          if (i < na && j < nb && a[as + i].text === other[bs + j].text) {
            flush();
            i++;
            j++;
          } else {
            pending2 ||= { start: as + i, end: as + i, text: "", side };
            if (i < na && (j === nb || table2[(i + 1) * width + j] >= table2[i * width + j + 1]))
              pending2.end = as + ++i;
            else pending2.text += other[bs + j++].text;
          }
        }
        flush();
      };
      let ai = 0, bi = 0;
      for (const [an, bn] of anchors) {
        gap(ai, an, bi, bn);
        ai = an + 1;
        bi = bn + 1;
      }
      gap(ai, a.length, bi, other.length);
      return ambiguous && edits2.length ? [
        {
          start: 0,
          end: a.length,
          text: other.map((v) => v.text).join(""),
          side,
          ambiguous: true
        }
      ] : edits2;
    };
    const edits = [...changes(b, "mine"), ...changes(c, "latest")].sort(
      (x, y) => x.start - y.start || x.end - y.end
    );
    const groups = [];
    for (const edit of edits) {
      charge();
      const last = groups.at(-1);
      if (last && (edit.start < last.end && edit.end > last.start || (edit.start === edit.end || last.start === last.end) && edit.start === last.start)) {
        last.edits.push(edit);
        last.end = Math.max(last.end, edit.end);
      } else groups.push({ start: edit.start, end: edit.end, edits: [edit] });
    }
    const parts = [], conflicts = [];
    let cursor = 0;
    const slice = (start, end) => a.slice(start, end).map((v) => v.text).join("");
    const apply = (group, side) => {
      let cursor2 = group.start, value = "";
      for (const edit of group.edits.filter((v) => v.side === side)) {
        value += slice(cursor2, edit.start) + edit.text;
        cursor2 = edit.end;
      }
      return value + slice(cursor2, group.end);
    };
    for (const group of groups) {
      parts.push({ text: slice(cursor, group.start) });
      const mineText = apply(group, "mine"), latestText = apply(group, "latest");
      const mineChanged = group.edits.some((v) => v.side === "mine"), latestChanged = group.edits.some((v) => v.side === "latest");
      if (mineChanged && latestChanged && mineText !== latestText || group.edits.some((v) => v.ambiguous)) {
        if (conflicts.length >= 128)
          throw new MergeError(
            "MERGE_BUDGET",
            "More than 128 conflicts were found. Download the candidate and resolve them manually"
          );
        const hunk = {
          id: "h" + conflicts.length,
          base: slice(group.start, group.end),
          mine: mineText,
          latest: latestText,
          line: a[group.start]?.line || validate(base2).length + 1,
          ambiguous: group.edits.some((v) => v.ambiguous)
        };
        conflicts.push(hunk);
        parts.push({ conflict: hunk.id });
      } else parts.push({ text: mineChanged ? mineText : latestText });
      cursor = group.end;
    }
    parts.push({ text: slice(cursor, a.length) });
    charge();
    return { schema: 1, parts, conflicts };
  }
  function resolveMerge(plan, choices = {}) {
    if (Object.keys(choices).some((id2) => !plan.conflicts.some((v) => v.id === id2)))
      throw new MergeError("MERGE_CHOICE", "Unknown conflict choice");
    const conflicts = new Map(plan.conflicts.map((h) => [h.id, h]));
    const source = plan.parts.map((part) => {
      if (!part.conflict) return part.text;
      const choice = choices[part.conflict];
      if (!["mine", "latest", "base"].includes(choice))
        throw new MergeError("MERGE_CHOICE", "Choose every conflict explicitly");
      return conflicts.get(part.conflict)[choice];
    }).join("");
    validate(source);
    return source;
  }
  function mergeMetadata(base2, mine, latest, choices = {}) {
    const values = {}, conflicts = [];
    for (const key of ["title", "post_status", "featured_media"]) {
      if (mine[key] === base2[key]) values[key] = latest[key];
      else if (latest[key] === base2[key] || mine[key] === latest[key]) values[key] = mine[key];
      else if (["mine", "latest", "base"].includes(choices[key]))
        values[key] = { mine, latest, base: base2 }[choices[key]][key];
      else conflicts.push({ key, base: base2[key], mine: mine[key], latest: latest[key] });
    }
    return { values, conflicts };
  }

  // plugin/includes/php-converter/block-capabilities.json
  var block_capabilities_default = {
    "core/paragraph": {},
    "core/heading": {
      level: "integer"
    },
    "core/quote": {},
    "core/separator": {},
    "core/image": {
      id: "integer",
      sizeSlug: "string",
      linkDestination: "string"
    },
    "core/table": {},
    "core/html": {},
    "core/more": {},
    "mbb/footnotes": {},
    "mbb/footnote": {
      label: "string"
    },
    "core/list": {
      ordered: "boolean",
      start: "integer"
    },
    "core/list-item": {},
    "mbb/list": {
      ordered: "boolean",
      start: "integer"
    },
    "mbb/list-item": {},
    "mbb/task-item": {
      content: "string",
      checked: "boolean"
    },
    "mbb/code": {
      code: "string",
      language: "string"
    },
    "mbb/math": {
      tex: "string"
    },
    "mbb/collapse": {
      id: "string",
      title: "string",
      open: "boolean",
      version: "integer"
    },
    "mbb/steps": {
      id: "string",
      title: "string",
      mode: "string",
      previous: "boolean",
      next: "boolean",
      full: "boolean",
      version: "integer"
    },
    "mbb/step": {
      id: "string",
      title: "string",
      version: "integer"
    },
    "mbb/code-compare": {
      id: "string",
      leftTitle: "string",
      rightTitle: "string",
      leftHighlights: "string",
      rightHighlights: "string",
      version: "integer",
      codeLeft: "string",
      languageLeft: "string",
      codeRight: "string",
      languageRight: "string"
    },
    "mbb/component": {
      id: "string",
      component: "string",
      componentVersion: "string",
      params: "object",
      version: "integer",
      activity: "object"
    },
    "mbb/frontmatter": {
      version: "integer",
      raw: "string"
    },
    "mbb/code-tabs": {
      id: "string",
      defaultTab: "string",
      tabs: "array",
      version: "integer"
    },
    "core/group": {
      tagName: "string",
      anchor: "string",
      ariaLabel: "string",
      className: "string",
      layout: "array"
    },
    "core/details": {
      summary: "string",
      showContent: "boolean",
      anchor: "string",
      name: "string"
    },
    "core/buttons": {
      anchor: "string",
      layout: "array"
    },
    "core/button": {
      anchor: "string",
      url: "string",
      title: "string",
      text: "string",
      linkTarget: "string",
      rel: "string",
      tagName: "string",
      type: "string"
    },
    "mbb/object": {
      id: "string",
      kind: "string",
      caption: "string",
      version: "integer"
    },
    "mbb/statement": {
      id: "string",
      kind: "string",
      title: "string",
      open: "boolean",
      version: "integer"
    },
    "mbb/bibliography": {
      id: "string",
      style: "string",
      origins: "array",
      entries: "array",
      version: "integer"
    },
    "core/gallery": {
      columns: "integer",
      imageCrop: "boolean"
    },
    "mbb/identity": {
      namespace: "string",
      document: "string",
      version: "integer"
    },
    "core/code": {
      anchor: "string",
      className: "string"
    },
    "core/preformatted": {
      anchor: "string",
      className: "string"
    },
    "core/columns": {
      verticalAlignment: "string",
      isStackedOnMobile: "boolean",
      anchor: "string",
      className: "string"
    },
    "core/column": {
      verticalAlignment: "string",
      width: "string",
      anchor: "string",
      className: "string"
    }
  };

  // src/footnotes.js
  var formatRegistered = false;
  function registerFootnotes() {
    const el = wp.element.createElement;
    const { useState } = wp.element;
    const { useBlockProps, useInnerBlocksProps, InnerBlocks, RichTextToolbarButton } = wp.blockEditor;
    if (!wp.blocks.getBlockType("mbb/footnotes")) {
      wp.blocks.registerBlockType("mbb/footnotes", {
        apiVersion: 3,
        title: translate("Footnote definitions"),
        category: "text",
        supports: { html: false },
        edit: () => el(
          "section",
          useBlockProps({ className: "mbb-footnotes" }),
          el("strong", { contentEditable: false }, translate("Footnote definitions")),
          el(
            "ol",
            useInnerBlocksProps(
              {},
              {
                allowedBlocks: ["mbb/footnote"],
                template: [["mbb/footnote", { label: "note" }, [["core/paragraph"]]]],
                templateLock: false
              }
            )
          )
        ),
        save: () => el(
          "section",
          useBlockProps.save({ className: "mbb-footnotes" }),
          el("ol", useInnerBlocksProps.save())
        )
      });
      wp.blocks.registerBlockType("mbb/footnote", {
        apiVersion: 3,
        title: translate("Footnote"),
        category: "text",
        parent: ["mbb/footnotes"],
        attributes: { label: { type: "string", default: "" } },
        supports: { html: false },
        edit: ({ attributes, setAttributes }) => el(
          "li",
          useBlockProps({ "data-mbb-footnote": attributes.label }),
          el(wp.components.TextControl, {
            label: translate("Footnote name"),
            value: attributes.label,
            onChange: (label) => setAttributes({ label })
          }),
          el(InnerBlocks, {
            template: [["core/paragraph"]],
            templateLock: false
          })
        ),
        save: ({ attributes }) => el(
          "li",
          useBlockProps.save({ "data-mbb-footnote": attributes.label }),
          el(InnerBlocks.Content)
        )
      });
    }
    if (!formatRegistered) {
      formatRegistered = true;
      wp.richText.registerFormatType("mbb/footnote-ref", {
        title: translate("Footnote reference"),
        tagName: "span",
        className: "mbb-footnote-ref",
        attributes: { "data-mbb-footnote": "data-mbb-footnote" },
        edit: ({ isActive, value, onChange, activeAttributes }) => {
          const [open, setOpen] = useState(false);
          const [label, setLabel] = useState("");
          const current = activeAttributes?.["data-mbb-footnote"] || "";
          const submit = () => {
            if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(label)) return;
            let start = value.start;
            let end = value.end;
            if (isActive) {
              const hasFormat = (index) => (value.formats[index] || []).some((format3) => format3.type === "mbb/footnote-ref");
              const candidates = [...value.text.matchAll(/\[\^[\p{L}\p{N}_-]+\]/gu)].filter(
                (match2) => {
                  const first = match2.index;
                  const last = first + match2[0].length;
                  if (start < first || end > last) return false;
                  for (let index = first; index < last; index++) if (!hasFormat(index)) return false;
                  return true;
                }
              );
              const marker2 = candidates.find((match2) => match2[0] === `[^${current}]`) || candidates[0];
              if (!marker2) return;
              start = marker2.index;
              end = start + marker2[0].length;
            } else {
              for (let index = start; index < end; index++)
                if ((value.formats[index] || []).some((format3) => format3.type === "mbb/footnote-ref"))
                  return;
            }
            const marker = `[^${label}]`;
            const inserted = wp.richText.insert(value, marker, start, end);
            onChange(
              wp.richText.applyFormat(
                inserted,
                {
                  type: "mbb/footnote-ref",
                  attributes: { "data-mbb-footnote": label }
                },
                start,
                start + marker.length
              )
            );
            setOpen(false);
          };
          return el(
            wp.element.Fragment,
            {},
            el(RichTextToolbarButton, {
              icon: "editor-ol",
              title: translate("Insert or edit footnote reference"),
              isActive,
              onClick: () => {
                setLabel(current);
                setOpen(true);
              }
            }),
            open && el(
              wp.components.Popover,
              { onClose: () => setOpen(false), focusOnMount: "firstElement" },
              el(
                "div",
                { style: { padding: "12px", minWidth: "220px" } },
                el(wp.components.TextControl, {
                  label: translate("Footnote name"),
                  value: label,
                  onChange: setLabel,
                  onKeyDown: (event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submit();
                    }
                  }
                }),
                el(
                  wp.components.Button,
                  {
                    variant: "primary",
                    onClick: submit,
                    disabled: !/^[\p{L}\p{N}_-]{1,64}$/u.test(label)
                  },
                  translate("Insert reference")
                )
              )
            )
          );
        }
      });
    }
  }

  // src/native-math-conversion.js
  var mathNS = "http://www.w3.org/1998/Math/MathML";
  var mathTags = /* @__PURE__ */ new Set([
    "semantics",
    "mrow",
    "mi",
    "mn",
    "mo",
    "mfrac",
    "msup",
    "msub",
    "msubsup",
    "msqrt",
    "mroot",
    "mover",
    "munder",
    "munderover",
    "mtable",
    "mtr",
    "mtd",
    "mtext",
    "mspace",
    "mpadded",
    "mphantom",
    "menclose",
    "mmultiscripts",
    "mprescripts",
    "none",
    "annotation"
  ]);
  var mathAttributes = /* @__PURE__ */ new Set([
    "encoding",
    "lspace",
    "rspace",
    "stretchy",
    "fence",
    "separator",
    "form",
    "mathvariant",
    "mathsize",
    "minsize",
    "maxsize",
    "displaystyle",
    "scriptlevel",
    "accent",
    "accentunder",
    "linethickness",
    "bevelled",
    "mathcolor",
    "mathbackground",
    "width",
    "height",
    "depth",
    "voffset",
    "notation",
    "columnalign",
    "rowalign",
    "groupalign",
    "columnspacing",
    "rowspacing",
    "framespacing",
    "columnlines",
    "rowlines",
    "frame",
    "side",
    "minlabelspacing",
    "movablelimits",
    "largeop",
    "symmetric"
  ]);
  var isEscaped = (text3, index) => {
    let slashes = 0;
    while (index - slashes - 1 >= 0 && text3[index - slashes - 1] === "\\") slashes++;
    return slashes % 2 === 1;
  };
  function inspectNativeMath({ tex, mathML = "", attributes = {}, inline: inline3 = false }, owner) {
    if (typeof tex !== "string" || !tex.trim() || tex.length > 2e4)
      return "The native formula has no usable TeX or exceeds its length budget.";
    if (inline3 && (tex.trim() !== tex || /[\r\n]/.test(tex)))
      return "Inline formulas must occupy one line without leading or trailing whitespace.";
    for (let index = 0; index < tex.length; index++) {
      if (tex[index] === "$" && !isEscaped(tex, index))
        return "TeX contains unescaped dollar signs and cannot be converted without loss.";
    }
    const allowed = inline3 ? /* @__PURE__ */ new Set(["data-latex"]) : /* @__PURE__ */ new Set(["latex", "mathML"]);
    if (Object.keys(attributes).some((key) => !allowed.has(key)))
      return "The native formula has extra styles or attributes and cannot be converted without loss.";
    if (typeof mathML !== "string") return "The native MathML is invalid.";
    if (!mathML) return null;
    if (/<!|<\?|\]\]>/.test(mathML)) return "The native MathML contains unsupported structure.";
    const parser = new owner.defaultView.DOMParser();
    const parsed = parser.parseFromString(
      `<math xmlns="${mathNS}">${mathML}</math>`,
      "application/xml"
    );
    if (parsed.querySelector("parsererror")) return "The native MathML could not be parsed.";
    const root = parsed.documentElement;
    if (root.children.length !== 1 || root.firstElementChild.localName !== "semantics" || root.firstElementChild.children.length < 2 || [...root.childNodes, ...root.firstElementChild.childNodes].some(
      (node) => node.nodeType === 3 && node.textContent.trim()
    ))
      return "The native MathML lacks verifiable semantic structure.";
    let annotations = 0;
    for (const element of root.querySelectorAll("*")) {
      if (element.namespaceURI !== mathNS || !mathTags.has(element.localName))
        return "The native MathML contains unsupported elements.";
      for (const attribute2 of element.attributes) {
        if (attribute2.namespaceURI || !mathAttributes.has(attribute2.localName))
          return "The native MathML contains unsupported attributes.";
      }
      if (element.localName === "annotation") {
        annotations++;
        if (element.getAttribute("encoding") !== "application/x-tex" || element.textContent !== tex)
          return "TeX inside native MathML differs from the formula source.";
      }
    }
    if (annotations !== 1) return "The native MathML lacks a unique TeX source annotation.";
    return null;
  }
  function mathTree(markup, owner) {
    const parsed = new owner.defaultView.DOMParser().parseFromString(
      `<math xmlns="${mathNS}">${markup}</math>`,
      "application/xml"
    );
    if (parsed.querySelector("parsererror")) return null;
    const normalize3 = (node) => {
      if (node.nodeType === 3) {
        if (!node.textContent.trim() && !["mi", "mn", "mo", "mtext", "annotation"].includes(node.parentNode.localName))
          return null;
        return ["text", node.textContent];
      }
      if (node.nodeType !== 1) return ["unsupported", node.nodeType];
      return [
        node.namespaceURI,
        node.localName,
        [...node.attributes].map((attr) => [attr.namespaceURI, attr.name, attr.value]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
        [...node.childNodes].map(normalize3).filter(Boolean)
      ];
    };
    return JSON.stringify(normalize3(parsed.documentElement));
  }
  async function verifyNativeMathML(tex, mathML, display, owner) {
    if (!mathML) return null;
    try {
      const { default: latexToMathML } = await import("@wordpress/latex-to-mathml");
      const generated = latexToMathML(tex, { displayMode: display });
      const originalTree = mathTree(mathML, owner);
      const generatedTree = mathTree(generated, owner);
      return originalTree && originalTree === generatedTree ? null : "The native formula's display structure differs from its TeX and cannot be converted without loss.";
    } catch {
      return "The native formula's display structure could not be verified. Preserve the native formula.";
    }
  }
  async function verifyRenderedMath(tex, display, owner) {
    try {
      const html = await MBB_MATH.render(tex, display);
      const template = owner.createElement("template");
      template.innerHTML = html;
      return template.content.querySelector("mjx-merror,[data-mbb-math-error]") ? "The formula engine cannot parse this TeX." : null;
    } catch (error3) {
      return error3?.message || "The formula engine did not verify this TeX.";
    }
  }

  // src/inline-math-editor.js
  var FORMAT = "mbb/math";
  var records = /* @__PURE__ */ new WeakMap();
  var sheets = /* @__PURE__ */ new Map();
  var observedDocuments = /* @__PURE__ */ new WeakSet();
  var observedFrames = /* @__PURE__ */ new WeakSet();
  var pendingHost = null;
  var selectedHost = null;
  var baseCSS = ":host{display:inline-block;vertical-align:baseline;white-space:nowrap;cursor:pointer}mjx-container{display:inline-block;margin:0!important;max-width:none}";
  function refreshShadowStyles(entry2, css) {
    if (entry2.css === css) return;
    entry2.css = css;
    if (entry2.sheet) entry2.sheet.replaceSync(css + baseCSS);
    for (const style of entry2.styles) {
      if (style.isConnected) style.textContent = css + baseCSS;
      else entry2.styles.delete(style);
    }
  }
  var escapeHTML = (text3) => String(text3).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  var valueSignature = (value) => JSON.stringify([value.text, value.formats, value.replacements]);
  var caretExpectation = (root, before, after, position, tex) => ({
    root,
    position,
    tex,
    beforeSignature: valueSignature(before),
    expectedSignature: valueSignature(after),
    expectedStart: after.start,
    expectedEnd: after.end
  });
  var isEscaped2 = (text3, index) => {
    let slashes = 0;
    while (index - slashes - 1 >= 0 && text3[index - slashes - 1] === "\\") slashes++;
    return slashes % 2 === 1;
  };
  var hasUnescapedDollar = (text3) => {
    for (let index = 0; index < text3.length; index++) {
      if (text3[index] === "$" && !isEscaped2(text3, index)) return true;
    }
    return false;
  };
  var validTex = (tex) => typeof tex === "string" && tex.length > 0 && tex.length <= 2e4 && tex.trim() === tex && !/[\r\n]/.test(tex) && !hasUnescapedDollar(tex);
  function typedMathRange(value) {
    const end = value.start;
    if (end !== value.end || !end || value.text[end - 1] !== "$") return null;
    const close = end - 1;
    if (isEscaped2(value.text, close) || value.text[close - 1] === "$") return null;
    for (let open = close - 1; open >= Math.max(0, close - 202); open--) {
      const char = value.text[open];
      if (char === "\n" || char === "\r" || char === "\uFFFC") return null;
      if (char !== "$") continue;
      if (isEscaped2(value.text, open) || value.text[open - 1] === "$" || value.replacements[open - 1]?.type === FORMAT)
        return null;
      const tex = value.text.slice(open + 1, close);
      if (tex.length > 200 || !validTex(tex) || /^[\d\s.,]+$/.test(tex) || value.replacements.slice(open, end).some(Boolean) || value.formats.slice(open, end).some((formats) => formats?.length))
        return null;
      return { start: open, end, tex };
    }
    return null;
  }
  function placeCaretAfterMath(root, value, position) {
    if (!root?.isConnected || value.replacements[position]?.type !== FORMAT) return false;
    const ordinal = value.replacements.slice(0, position).filter((item) => item?.type === FORMAT).length;
    const host = root.querySelectorAll("span.mbb-math[data-mbb-tex]")[ordinal];
    if (!host) return false;
    const object4 = host.closest("[data-rich-text-bogus]") || host;
    const owner = root.ownerDocument;
    const range = owner.createRange();
    range.setStartAfter(object4);
    range.collapse(true);
    const selection = owner.defaultView.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }
  function shadowStyles(host, shadow) {
    const owner = host.ownerDocument;
    globalThis.MBB_MATH?.registerDocument?.(owner);
    const mathCSS = document.querySelector("style[data-mbb-chtml]")?.textContent || "";
    let entry2 = sheets.get(owner);
    if (!entry2) {
      entry2 = { css: null, sheet: null, styles: /* @__PURE__ */ new Set() };
      sheets.set(owner, entry2);
    }
    refreshShadowStyles(entry2, mathCSS);
    if ("adoptedStyleSheets" in shadow && owner.defaultView.CSSStyleSheet) {
      if (!entry2.sheet) {
        entry2.sheet = new owner.defaultView.CSSStyleSheet();
        entry2.sheet.replaceSync(mathCSS + baseCSS);
      }
      if (shadow.adoptedStyleSheets[0] !== entry2.sheet) shadow.adoptedStyleSheets = [entry2.sheet];
      return null;
    }
    const style = owner.createElement("style");
    style.textContent = mathCSS + baseCSS;
    entry2.styles.add(style);
    return style;
  }
  function paint(host) {
    const record = records.get(host);
    if (!record || !host.isConnected || host.getAttribute("data-mbb-tex") !== record.tex) return;
    const state = selectedHost === host || !record.html ? "source" : "rendered";
    if (record.painted === state && host.shadowRoot) return;
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    const style = shadowStyles(host, shadow);
    record.painted = state;
    if (state === "source") {
      shadow.replaceChildren(...style ? [style] : [], host.ownerDocument.createElement("slot"));
      return;
    }
    const rendered = host.ownerDocument.createElement("span");
    rendered.innerHTML = record.html;
    shadow.replaceChildren(...style ? [style] : [], rendered);
  }
  function decorate(owner) {
    for (const host of owner.querySelectorAll("span.mbb-math[data-mbb-tex]")) {
      if (!host.closest('[contenteditable="true"]')) continue;
      const tex = host.getAttribute("data-mbb-tex");
      const wrapper = host.parentElement;
      if (wrapper?.getAttribute("contenteditable") === "false") {
        wrapper.tabIndex = 0;
        wrapper.setAttribute("role", "button");
        wrapper.setAttribute("aria-label", format(translate("Edit inline formula: %1$s"), tex));
      }
      if (records.get(host)?.tex === tex) {
        paint(host);
        continue;
      }
      const record = { tex, html: null, painted: null };
      records.set(host, record);
      paint(host);
      MBB_MATH.render(tex, false).then(
        (html) => {
          if (records.get(host) !== record) return;
          const template = owner.createElement("template");
          template.innerHTML = html;
          if (!template.content.querySelector("mjx-merror,[data-mbb-math-error]")) record.html = html;
          paint(host);
        },
        () => {
          if (records.get(host) === record) paint(host);
        }
      );
    }
  }
  function formulaFrom(target, owner) {
    const node = target?.nodeType === 1 ? target : target?.parentElement;
    const host = node?.closest?.("span.mbb-math[data-mbb-tex]");
    if (host && host.ownerDocument === owner && records.has(host)) return host;
    const wrapper = node?.closest?.('[data-rich-text-bogus][contenteditable="false"]');
    const nested = wrapper?.querySelector("span.mbb-math[data-mbb-tex]");
    return nested && records.has(nested) ? nested : null;
  }
  function observeDocument(owner) {
    if (!owner?.body || observedDocuments.has(owner)) return;
    observedDocuments.add(owner);
    let scheduled = false;
    const scan = () => {
      scheduled = false;
      decorate(owner);
      for (const frame of owner.querySelectorAll("iframe")) {
        if (frame.hidden) continue;
        try {
          observeDocument(frame.contentDocument);
          if (!observedFrames.has(frame)) {
            observedFrames.add(frame);
            frame.addEventListener("load", () => observeDocument(frame.contentDocument));
          }
        } catch {
        }
      }
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      owner.defaultView.requestAnimationFrame(scan);
    };
    new owner.defaultView.MutationObserver(schedule).observe(owner.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-mbb-tex"]
    });
    owner.addEventListener(
      "click",
      (event) => {
        const host = formulaFrom(event.target, owner);
        if (!host) return;
        pendingHost = host;
        host.dispatchEvent(
          new owner.defaultView.CustomEvent("mbb-inline-math-open", { bubbles: true })
        );
      },
      true
    );
    owner.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const host = formulaFrom(event.target, owner);
        if (!host) return;
        event.preventDefault();
        event.stopPropagation();
        pendingHost = host;
        host.closest('[contenteditable="true"]')?.focus();
        host.dispatchEvent(
          new owner.defaultView.CustomEvent("mbb-inline-math-open", { bubbles: true })
        );
      },
      true
    );
    scan();
  }
  function installInlineMathDecorations() {
    globalThis.MBB_MATH?.subscribeStyles?.((css) => {
      for (const [owner, entry2] of sheets) {
        const frame = owner.defaultView?.frameElement;
        if (owner !== document && (!frame || !frame.isConnected || frame.contentDocument !== owner)) {
          sheets.delete(owner);
          continue;
        }
        refreshShadowStyles(entry2, css);
      }
    });
    observeDocument(document);
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", () => observeDocument(document), { once: true });
  }
  function SmallPreview({ tex }) {
    const el = wp.element.createElement;
    const [html, setHTML] = wp.element.useState("");
    const [error3, setError] = wp.element.useState("");
    wp.element.useEffect(() => {
      let active = true;
      setHTML("");
      setError("");
      const timer = setTimeout(() => {
        MBB_MATH.render(tex, false).then(
          (result) => {
            if (active) setHTML(result);
          },
          (reason) => {
            if (active) setError(translateError(reason));
          }
        );
      }, 250);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [tex]);
    return el(
      "div",
      {
        className: "mbb-inline-math-small-preview",
        style: {
          marginTop: "10px",
          padding: "10px 6px 14px",
          minHeight: "3em",
          fontSize: "16px",
          lineHeight: 1.7,
          overflowX: "auto"
        }
      },
      el("small", {}, translate("Formula preview (not written to the body)")),
      error3 ? el("code", { role: "status" }, error3) : html ? el("div", { dangerouslySetInnerHTML: { __html: html } }) : el("code", {}, tex)
    );
  }
  function InlineMathEdit({ contentRef, value, onChange, onFocus, isVisible = true }) {
    const el = wp.element.createElement;
    const [selected, setSelected] = wp.element.useState(null);
    const [creating, setCreating] = wp.element.useState(false);
    const [draft, setDraft] = wp.element.useState("");
    const [error3, setError] = wp.element.useState("");
    const [nativeError, setNativeError] = wp.element.useState("");
    const [nativeBusy, setNativeBusy] = wp.element.useState(false);
    const [creationValidation, setCreationValidation] = wp.element.useState({
      tex: "",
      status: "idle"
    });
    const selectedRef = wp.element.useRef(null);
    const openedTexRef = wp.element.useRef(null);
    const creationRef = wp.element.useRef(null);
    const typedRef = wp.element.useRef(null);
    const caretRef = wp.element.useRef(null);
    const valueRef = wp.element.useRef(value);
    const onChangeRef = wp.element.useRef(onChange);
    const nativeEpoch = wp.element.useRef(0);
    const registry2 = wp.data.useRegistry();
    valueRef.current = value;
    onChangeRef.current = onChange;
    const editable = contentRef.current;
    const close = (restoreFocus = false) => {
      const previous = selectedRef.current;
      selectedRef.current = null;
      selectedHost = null;
      setSelected(null);
      setCreating(false);
      creationRef.current = null;
      setError("");
      if (previous?.isConnected) {
        paint(previous);
        if (restoreFocus) previous.parentElement?.focus();
      }
    };
    const open = (host) => {
      if (!host || !contentRef.current?.contains(host)) return;
      const previous = selectedRef.current;
      if (previous && previous !== host) {
        selectedHost = null;
        paint(previous);
      }
      pendingHost = null;
      selectedRef.current = host;
      setCreating(false);
      creationRef.current = null;
      openedTexRef.current = host.getAttribute("data-mbb-tex");
      selectedHost = host;
      setSelected(host);
      setDraft(host.getAttribute("data-mbb-tex") || "");
      setError("");
      paint(host);
    };
    wp.element.useLayoutEffect(() => {
      const root = contentRef.current;
      if (!root) return;
      if (pendingHost && root.contains(pendingHost)) open(pendingHost);
      const requestOpen = (event) => open(event.target.closest("span.mbb-math[data-mbb-tex]"));
      root.addEventListener("mbb-inline-math-open", requestOpen);
      return () => root.removeEventListener("mbb-inline-math-open", requestOpen);
    }, [editable, contentRef]);
    wp.element.useEffect(() => {
      const root = contentRef.current;
      if (!root) return;
      const onBeforeInput = (event) => {
        if (event.inputType !== "insertText" || event.data !== "$" || event.isComposing || !root.contains(event.target) || root.matches("code,pre") || root.closest('[data-type="core/code"],pre,code') || valueRef.current.start !== valueRef.current.end)
          return;
        const original = valueRef.current;
        const literal = wp.richText.insert(original, "$", original.start, original.end);
        const range = typedMathRange(literal);
        if (!range) return;
        typedRef.current = {
          root,
          beforeText: original.text,
          text: literal.text,
          position: literal.start,
          range
        };
      };
      root.addEventListener("beforeinput", onBeforeInput, true);
      return () => root.removeEventListener("beforeinput", onBeforeInput, true);
    }, [editable, contentRef]);
    wp.element.useEffect(() => {
      const root = contentRef.current;
      if (!root) return;
      const onKeyDown = (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.repeat || event.defaultPrevented || !root.contains(event.target) || root.closest("[data-type]")?.getAttribute("data-type") !== "core/paragraph")
          return;
        const current = valueRef.current;
        if (current?.text !== "$$" || current.start !== 2 || current.end !== 2 || current.replacements.some(Boolean) || current.formats.some((formats) => formats?.length))
          return;
        const editor = registry2.select("core/block-editor");
        const clientId = editor.getSelectedBlockClientId();
        if (!clientId || root.closest("[data-block]")?.getAttribute("data-block") !== clientId || editor.getBlock(clientId)?.name !== "core/paragraph" || !editor.canInsertBlockType("mbb/math", editor.getBlockRootClientId(clientId)))
          return;
        const actions = registry2.dispatch("core/block-editor");
        if (typeof actions.__unstableMarkLastChangeAsPersistent !== "function" || typeof actions.__unstableMarkAutomaticChange !== "function")
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        actions.__unstableMarkLastChangeAsPersistent();
        actions.replaceBlock(clientId, wp.blocks.createBlock("mbb/math", { tex: "" }));
        actions.__unstableMarkAutomaticChange();
      };
      root.addEventListener("keydown", onKeyDown, true);
      return () => root.removeEventListener("keydown", onKeyDown, true);
    }, [editable, contentRef, registry2]);
    wp.element.useLayoutEffect(() => {
      const pending2 = typedRef.current;
      if (!pending2 || pending2.root !== contentRef.current || value.text === pending2.beforeText)
        return;
      typedRef.current = null;
      if (value.text !== pending2.text || value.start !== pending2.position || value.end !== value.start)
        return;
      const history = registry2.dispatch("core/block-editor");
      if (typeof history?.__unstableMarkLastChangeAsPersistent !== "function" || typeof history?.__unstableMarkAutomaticChange !== "function")
        return;
      history.__unstableMarkLastChangeAsPersistent();
      const next = wp.richText.insertObject(
        value,
        {
          type: FORMAT,
          attributes: { tex: pending2.range.tex },
          innerHTML: escapeHTML("$" + pending2.range.tex + "$")
        },
        pending2.range.start,
        pending2.range.end
      );
      caretRef.current = caretExpectation(
        pending2.root,
        value,
        next,
        pending2.range.start,
        pending2.range.tex
      );
      onChange(next);
      onFocus?.();
      history.__unstableMarkAutomaticChange();
    }, [value, onChange, onFocus, contentRef, registry2]);
    wp.element.useLayoutEffect(() => {
      const pending2 = caretRef.current;
      if (!pending2 || pending2.root !== contentRef.current) return;
      const signature = valueSignature(value);
      if (signature === pending2.beforeSignature) return;
      if (signature !== pending2.expectedSignature || value.start !== pending2.expectedStart || value.end !== pending2.expectedEnd) {
        caretRef.current = null;
        return;
      }
      const replacement = value.replacements[pending2.position];
      if (replacement?.type !== FORMAT || replacement.attributes?.tex !== pending2.tex) {
        caretRef.current = null;
        return;
      }
      const owner = pending2.root.ownerDocument;
      owner.defaultView.queueMicrotask(() => {
        if (caretRef.current !== pending2) return;
        const latest = valueRef.current;
        const selection = owner.defaultView.getSelection();
        if (valueSignature(latest) !== pending2.expectedSignature || latest.start !== pending2.expectedStart || latest.end !== pending2.expectedEnd || !pending2.root.isConnected || owner.activeElement !== pending2.root || !pending2.root.contains(selection.anchorNode) || !pending2.root.contains(selection.focusNode)) {
          caretRef.current = null;
          return;
        }
        if (placeCaretAfterMath(pending2.root, value, pending2.position)) caretRef.current = null;
      });
    }, [value, contentRef]);
    wp.element.useEffect(
      () => () => {
        nativeEpoch.current++;
        caretRef.current = null;
        if (selectedRef.current) {
          selectedHost = null;
          paint(selectedRef.current);
          selectedRef.current = null;
        }
      },
      []
    );
    wp.element.useEffect(() => {
      if (selected && (!selected.isConnected || !contentRef.current?.contains(selected))) close();
    }, [selected, value]);
    wp.element.useEffect(() => {
      if (!creating) return;
      if (!validTex(draft)) {
        setCreationValidation({ tex: draft, status: "invalid", message: "" });
        return;
      }
      let active = true;
      setCreationValidation({ tex: draft, status: "pending" });
      const timer = setTimeout(() => {
        MBB_MATH.render(draft, false).then(
          (html) => {
            if (!active) return;
            const template = (contentRef.current?.ownerDocument || document).createElement(
              "template"
            );
            template.innerHTML = html;
            setCreationValidation(
              template.content.querySelector("mjx-merror,[data-mbb-math-error]") ? { tex: draft, status: "invalid", message: translate("The formula cannot be typeset.") } : { tex: draft, status: "valid" }
            );
          },
          (reason) => {
            if (active) setCreationValidation({ tex: draft, status: "invalid", message: translateError(reason) });
          }
        );
      }, 250);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [creating, draft, contentRef]);
    const startCreating = () => {
      const current = valueRef.current;
      if (!current || current.start === void 0 || current.end === void 0) return;
      const start = Math.min(current.start, current.end);
      const end = Math.max(current.start, current.end);
      const selection = wp.richText.slice(current, start, end);
      const text3 = wp.richText.getTextContent(selection);
      creationRef.current = {
        start,
        end,
        signature: valueSignature(current),
        invalid: selection.replacements.some(Boolean) || selection.formats.some((formats) => formats?.length)
      };
      setDraft(text3);
      setError(
        creationRef.current.invalid ? translate("The selection contains other formatting or objects. Select plain text first.") : ""
      );
      setCreating(true);
    };
    const coreObject = wp.richText.getActiveObject(value);
    const canConvertCore = coreObject?.type === "core/math";
    const corePositions = [];
    if (canConvertCore)
      value.replacements.forEach((item, index) => {
        if (item?.type === "core/math") corePositions.push(index);
      });
    const coreOrdinal = corePositions.indexOf(value.start);
    const coreAnchor = coreOrdinal >= 0 ? contentRef.current?.querySelectorAll("math[data-latex]")[coreOrdinal] : null;
    const convertCore = async () => {
      const current = valueRef.current;
      const object4 = wp.richText.getActiveObject(current);
      const root = contentRef.current;
      if (!root || object4?.type !== "core/math") return;
      const positions = [];
      current.replacements.forEach((item, index) => {
        if (item?.type === "core/math") positions.push(index);
      });
      const ordinal = positions.indexOf(current.start);
      const host = root.querySelectorAll("math[data-latex]")[ordinal];
      if (ordinal < 0 || !host || host.getAttributeNames().some((name) => name !== "data-latex") || host.getAttribute("data-latex") !== object4.attributes?.["data-latex"] || current.formats[current.start]?.length)
        return setNativeError(
          translate(
            "The native formula has extra formatting or attributes and cannot be converted without loss."
          )
        );
      const tex = object4.attributes["data-latex"];
      const problem = inspectNativeMath(
        { tex, mathML: object4.innerHTML || "", attributes: object4.attributes, inline: true },
        root.ownerDocument
      );
      if (problem) return setNativeError(translate(problem));
      const signature = valueSignature(current);
      const start = current.start;
      const end = current.end;
      const epoch = ++nativeEpoch.current;
      setNativeBusy(true);
      setNativeError("");
      const structureProblem = await verifyNativeMathML(
        tex,
        object4.innerHTML || "",
        false,
        root.ownerDocument
      );
      if (epoch !== nativeEpoch.current) return;
      if (structureProblem) {
        setNativeBusy(false);
        return setNativeError(translate(structureProblem));
      }
      const renderingProblem = await verifyRenderedMath(tex, false, root.ownerDocument);
      if (epoch !== nativeEpoch.current) return;
      setNativeBusy(false);
      if (renderingProblem) return setNativeError(translate(renderingProblem));
      const latest = valueRef.current;
      if (!root.isConnected || !root.contains(host) || latest.start !== start || latest.end !== end || valueSignature(latest) !== signature || host.getAttribute("data-latex") !== tex)
        return setNativeError(
          translate("The native formula changed during verification. Select it again before converting.")
        );
      const next = wp.richText.insertObject(
        latest,
        { type: FORMAT, attributes: { tex }, innerHTML: escapeHTML("$" + tex + "$") },
        start,
        end
      );
      caretRef.current = caretExpectation(root, latest, next, start, tex);
      onChangeRef.current(next);
      onFocus?.();
      setNativeError("");
    };
    wp.element.useEffect(() => {
      if (!canConvertCore) {
        nativeEpoch.current++;
        setNativeError("");
        setNativeBusy(false);
      }
    }, [canConvertCore, value]);
    const save = () => {
      if (creating) {
        const current = valueRef.current;
        const selection = creationRef.current;
        if (!current || !selection || valueSignature(current) !== selection.signature)
          return setError(translate("The body changed. Select it again before creating a formula."));
        if (selection.invalid)
          return setError(
            translate("The selection contains other formatting or objects. Select plain text first.")
          );
        if (!validTex(draft))
          return setError(translate("Enter single-line TeX without unescaped dollar signs."));
        if (creationValidation.tex !== draft || creationValidation.status !== "valid")
          return setError(translate("Wait for successful typesetting before applying the formula."));
        const root2 = contentRef.current;
        if (!root2) return setError(translate("The body changed. Select it again before creating a formula."));
        const next2 = wp.richText.insertObject(
          current,
          { type: FORMAT, attributes: { tex: draft }, innerHTML: escapeHTML("$" + draft + "$") },
          selection.start,
          selection.end
        );
        caretRef.current = caretExpectation(root2, current, next2, selection.start, draft);
        onChangeRef.current(next2);
        close(true);
        onFocus?.();
        return;
      }
      const root = contentRef.current, host = selectedRef.current;
      if (!root || !host || !root.contains(host))
        return setError(translate("The formula changed. Select it again."));
      const spans = [...root.querySelectorAll("span.mbb-math[data-mbb-tex]")];
      const ordinal = spans.indexOf(host);
      const positions = [];
      valueRef.current.replacements.forEach((item, index) => {
        if (item?.type === FORMAT) positions.push(index);
      });
      const position = positions[ordinal];
      if (position === void 0 || host.dataset.mbbTex !== openedTexRef.current || valueRef.current.replacements[position]?.attributes?.tex !== openedTexRef.current)
        return setError(translate("The current formula could not be located. Select it again."));
      if (!draft.trim() || /[\r\n]/.test(draft)) return setError(translate("Enter single-line TeX."));
      const next = wp.richText.insertObject(
        valueRef.current,
        {
          type: FORMAT,
          attributes: { tex: draft },
          innerHTML: escapeHTML("$" + draft + "$")
        },
        position,
        position + 1
      );
      onChangeRef.current(next);
      close();
    };
    if (!isVisible) return null;
    return el(
      wp.element.Fragment,
      {},
      el(wp.blockEditor.RichTextToolbarButton, {
        icon: "editor-customchar",
        title: translate("Math (MathJax)"),
        onClick: startCreating,
        isActive: creating || !!selected
      }),
      canConvertCore ? el(wp.blockEditor.RichTextToolbarButton, {
        icon: "update",
        title: translate("Convert native math to inline formula (MathJax)"),
        onClick: convertCore,
        disabled: nativeBusy
      }) : null,
      canConvertCore && coreAnchor ? el(
        wp.components.Popover,
        {
          anchor: coreAnchor,
          placement: "bottom-end",
          focusOnMount: false,
          className: "mbb-native-math-inline-action"
        },
        el(
          wp.components.Button,
          {
            variant: "secondary",
            onClick: convertCore,
            disabled: nativeBusy,
            "aria-busy": nativeBusy,
            className: "mbb-native-math-convert"
          },
          nativeBusy ? translate("Verifying the formula\u2026") : translate("Convert to inline formula (MathJax)")
        )
      ) : null,
      nativeError ? el(
        wp.components.Popover,
        {
          anchor: contentRef.current,
          placement: "bottom-start",
          onClose: () => setNativeError("")
        },
        el("p", { role: "alert", style: { padding: "10px" } }, nativeError)
      ) : null,
      selected || creating ? el(
        wp.components.Popover,
        {
          anchor: selected || editable,
          placement: "bottom-start",
          onClose: () => close(true),
          focusOnMount: "firstElement",
          className: "mbb-inline-math-popover"
        },
        el(
          "div",
          { style: { padding: "12px", width: "min(360px, 80vw)" } },
          el(
            "label",
            {},
            translate("TeX source"),
            el("textarea", {
              className: "mbb-inline-math-source",
              value: draft,
              rows: 2,
              style: { display: "block", width: "100%", boxSizing: "border-box" },
              onChange: (event) => {
                setDraft(event.target.value);
                setError("");
              },
              onKeyDown: (event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  close(true);
                }
              }
            })
          ),
          el(
            wp.components.Button,
            {
              variant: "primary",
              onClick: save,
              disabled: creating && (creationValidation.tex !== draft || creationValidation.status !== "valid")
            },
            translate("Apply formula")
          ),
          el(
            wp.components.Button,
            { variant: "tertiary", onClick: () => close(true) },
            translate("Cancel")
          ),
          error3 ? el("p", { role: "alert" }, error3) : null,
          creating && creationValidation.status === "pending" ? el("p", { role: "status" }, translate("Validating the formula\u2026")) : null,
          creating && creationValidation.message ? el("p", { role: "alert" }, creationValidation.message) : null,
          el(SmallPreview, { tex: draft })
        )
      ) : null
    );
  }

  // src/native-math-ui.js
  function registerNativeMathConversion() {
    const el = wp.element.createElement;
    const CoreMathEdit = ({ BlockEdit, ...props }) => {
      const [error3, setError] = wp.element.useState("");
      const [busy, setBusy] = wp.element.useState(false);
      const registry2 = wp.data.useRegistry();
      const active = wp.element.useRef(true);
      const requestEpoch = wp.element.useRef(0);
      wp.element.useLayoutEffect(() => {
        active.current = true;
        return () => {
          active.current = false;
          requestEpoch.current++;
        };
      }, [props.clientId, props.isSelected]);
      wp.element.useEffect(() => {
        if (!props.isSelected) {
          setBusy(false);
          setError("");
        }
      }, [props.isSelected]);
      const convert2 = async () => {
        if (!props.isSelected || busy) return;
        const block2 = registry2.select("core/block-editor").getBlock(props.clientId);
        if (!block2 || block2.name !== "core/math") return;
        const signature = JSON.stringify([block2.attributes, block2.innerBlocks]);
        const tex = block2.attributes.latex;
        const problem = block2.innerBlocks.length > 0 ? translate("The native formula contains nested blocks and cannot be converted without loss.") : inspectNativeMath(
          {
            tex,
            mathML: block2.attributes.mathML || "",
            attributes: block2.attributes
          },
          document
        );
        if (problem) return setError(translate(problem));
        const epoch = ++requestEpoch.current;
        setError("");
        setBusy(true);
        const structureProblem = await verifyNativeMathML(
          tex,
          block2.attributes.mathML || "",
          true,
          document
        );
        if (!active.current || epoch !== requestEpoch.current) return;
        if (structureProblem) {
          setBusy(false);
          return setError(translate(structureProblem));
        }
        const renderingProblem = await verifyRenderedMath(tex, true, document);
        if (!active.current || epoch !== requestEpoch.current) return;
        setBusy(false);
        if (renderingProblem) return setError(translate(renderingProblem));
        const current = registry2.select("core/block-editor").getBlock(props.clientId);
        if (!current || current.name !== "core/math" || JSON.stringify([current.attributes, current.innerBlocks]) !== signature || registry2.select("core/block-editor").getSelectedBlockClientId() !== props.clientId)
          return setError(
            translate("The native formula changed during verification. Select it again before converting.")
          );
        registry2.dispatch("core/block-editor").replaceBlock(props.clientId, wp.blocks.createBlock("mbb/math", { tex }));
      };
      return el(
        wp.element.Fragment,
        {},
        props.isSelected ? el(
          "div",
          { className: "mbb-native-math-block-action" },
          el(
            wp.components.Button,
            {
              variant: "secondary",
              onClick: convert2,
              disabled: busy,
              "aria-busy": busy,
              className: "mbb-native-math-convert"
            },
            busy ? translate("Verifying the formula\u2026") : translate("Convert to display formula (MathJax)")
          )
        ) : null,
        el(BlockEdit, props),
        props.isSelected ? el(
          wp.blockEditor.BlockControls,
          {},
          el(
            wp.components.ToolbarGroup,
            {},
            el(wp.components.ToolbarButton, {
              label: translate("Convert to display formula (MathJax)"),
              onClick: convert2,
              disabled: busy,
              children: translate("Convert to display formula")
            })
          )
        ) : null,
        props.isSelected && error3 ? el("div", { role: "alert", className: "mbb-math-conversion-error" }, error3) : null
      );
    };
    const withCoreMathConversion = (BlockEdit) => (props) => props.name === "core/math" ? el(CoreMathEdit, { BlockEdit, ...props }) : el(BlockEdit, props);
    wp.hooks.addFilter("editor.BlockEdit", "mbb/native-math-conversion", withCoreMathConversion);
  }

  // src/kernel.js
  var VERSION = "0.2.0";
  var ConversionError = class extends Error {
    constructor(code2, message, location = "") {
      super(message);
      this.name = "ConversionError";
      this.code = code2;
      this.location = location;
      const diagnostic = describeDiagnostic(message);
      this.messageId = diagnostic.id;
      this.messageArgs = diagnostic.args;
    }
  };
  var supportedBlocks = Object.keys(block_capabilities_default);
  function configureBlockAdapters2(snapshot, register2 = true) {
    configureBlockAdapters(snapshot, fail);
    if (register2) registerStaticBlockAdapters(fail);
  }
  function formatLocation(location = "") {
    const line = /^line:(\d+)(?::(\d+))?$/.exec(location);
    if (line)
      return line[2] ? format(translate("Markdown line %1$s, column %2$s"), line[1], line[2]) : format(translate("Block at Markdown line %1$s"), line[1]);
    const block2 = /^blocks((?:\[\d+\])+)(?:\.attributes(?:\.([a-zA-Z][a-zA-Z0-9_-]{0,63}))?)?$/.exec(
      location
    );
    if (block2) {
      const path = [...block2[1].matchAll(/\[(\d+)\]/g)].map((match2) => Number(match2[1]) + 1).join(" \u2192 ");
      return location.includes(".attributes") ? format(translate("Block %1$s, attribute %2$s"), path, block2[2] || "") : format(translate("Block %1$s"), path);
    }
    const serialized = /^serialized:(\d+)$/.exec(location);
    return serialized ? format(translate("Near serialized block character %1$s"), Number(serialized[1]) + 1) : "";
  }
  var atLocation = (location, action) => {
    try {
      return action();
    } catch (error3) {
      if (error3 instanceof ConversionError && !error3.location) error3.location = location;
      throw error3;
    }
  };
  var canonical = (s) => {
    const t = document.createElement("template");
    t.innerHTML = s;
    const comments = document.createTreeWalker(t.content, 128);
    for (let n; n = comments.nextNode(); ) {
      const match2 = /^ wp:gallery (\{[\s\S]*\}) $/.exec(n.data);
      if (!match2) continue;
      try {
        const attrs2 = JSON.parse(match2[1]);
        if (attrs2.linkTo !== "none" || JSON.stringify(attrs2) !== match2[1]) continue;
        delete attrs2.linkTo;
        n.data = " wp:gallery" + (Object.keys(attrs2).length ? " " + JSON.stringify(attrs2) : "") + " ";
      } catch (_error) {
      }
    }
    for (const n of t.content.querySelectorAll("*")) {
      const attrs2 = [...n.attributes].map((a) => [a.name, a.value]).sort(([a], [b]) => a.localeCompare(b));
      for (const a of [...n.attributes]) n.removeAttribute(a.name);
      for (const [name, value] of attrs2) n.setAttribute(name, value);
    }
    return t.innerHTML;
  };
  var fail = (code2, message, location) => {
    throw new ConversionError(code2, message, location);
  };
  var esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  var boundaryMD = new lib_default({ html: true });
  var md = new lib_default({ html: true, linkify: false, typographer: false, breaks: false });
  var legacyMD = new lib_default({ html: true, linkify: false, typographer: false, breaks: false });
  function renderInlineAsText(tokens, options, env) {
    return tokens.map(
      (t) => t.type === "image" ? this.renderInlineAsText(t.children || [], options, env) : ["text", "text_special", "code_inline"].includes(t.type) ? t.content : ["softbreak", "hardbreak"].includes(t.type) ? "\n" : ""
    ).join("");
  }
  md.renderer.renderInlineAsText = renderInlineAsText;
  legacyMD.renderer.renderInlineAsText = renderInlineAsText;
  var mathBlockRule = (state, start, end, silent) => {
    const begin = state.bMarks[start] + state.tShift[start];
    if (state.src.slice(begin, state.eMarks[start]).trim() !== "$$") return false;
    let last = start + 1;
    while (last < end && state.src.slice(state.bMarks[last] + state.tShift[last], state.eMarks[last]).trim() !== "$$")
      last++;
    if (last === end)
      fail("UNCLOSED_MATH", "The block formula closing $$ is missing", `line:${start + 1}`);
    if (silent) return true;
    const token3 = state.push("mbb_math", "", 0);
    token3.content = state.getLines(start + 1, last, state.blkIndent, false);
    token3.map = [start, last + 1];
    state.line = last + 1;
    return true;
  };
  var mathInlineRule = (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== "$") return false;
    if (state.src[start + 1] === "$")
      fail("MATH_DELIMITER", "Block formula delimiters $$ must each occupy their own line");
    let end = start + 1;
    for (; end < state.posMax; end++) {
      if (state.src[end] === "\n") return false;
      if (state.src[end] === "\\") {
        end++;
        continue;
      }
      if (state.src[end] === "$") break;
    }
    if (end === state.posMax || end === start + 1) return false;
    if (!silent) {
      const t = state.push("mbb_inline_math", "", 0);
      t.content = state.src.slice(start + 1, end);
    }
    state.pos = end + 1;
    return true;
  };
  for (const parser of [md, legacyMD]) {
    parser.block.ruler.before("fence", "mbb_math", mathBlockRule, {
      alt: ["paragraph", "reference", "blockquote", "list"]
    });
    parser.inline.ruler.before("escape", "mbb_math", mathInlineRule);
    parser.renderer.rules.mbb_inline_math = (tokens, idx) => `<span class="mbb-math" data-mbb-tex="${esc(tokens[idx].content)}">${esc("$" + tokens[idx].content + "$")}</span>`;
  }
  var footnoteLabel = /^[\p{L}\p{N}_-]{1,64}$/u;
  var validFootnoteLabel = (label, location = "") => {
    if (typeof label !== "string" || !footnoteLabel.test(label))
      fail(
        "FOOTNOTE_LABEL",
        "A footnote name must contain 1\u201364 letters, digits, underscores, or hyphens",
        location
      );
    return label;
  };
  md.use(footnote_plugin);
  installTechnicalInline(md, fail);
  installTechnicalInline(legacyMD, fail);
  md.inline.ruler.before("footnote_ref", "mbb_literal_html_code_ref", (state, silent) => {
    const match2 = state.src.slice(state.pos, state.posMax).match(/^\[\^[^\]\n]+\]/u);
    if (!match2) return false;
    let depth = 0;
    for (const token3 of state.tokens) {
      if (token3.type !== "html_inline") continue;
      if (/^<(?:code|pre)(?:\s|>)/i.test(token3.content)) depth++;
      else if (/^<\/(?:code|pre)\s*>/i.test(token3.content)) depth = Math.max(0, depth - 1);
    }
    if (!depth) return false;
    if (!silent) state.push("text", "", 0).content = match2[0];
    state.pos += match2[0].length;
    return true;
  });
  md.renderer.rules.footnote_ref = (tokens, idx) => {
    const label = validFootnoteLabel(tokens[idx].meta?.label);
    return `<span class="mbb-footnote-ref" data-mbb-footnote="${esc(label)}">[^${esc(label)}]</span>`;
  };
  md.core.ruler.before("footnote_tail", "mbb_footnote_validate", (state) => {
    const definitions = /* @__PURE__ */ new Map();
    const references = /* @__PURE__ */ new Set();
    let definition2 = null;
    for (const token3 of state.tokens) {
      if (token3.type === "footnote_reference_open") {
        const label = validFootnoteLabel(token3.meta?.label, loc({ token: token3 }));
        if (definitions.has(label))
          fail("FOOTNOTE_DUPLICATE", "Duplicate footnote definition", loc({ token: token3 }));
        definitions.set(label, loc({ token: token3 }));
        definition2 = label;
      } else if (token3.type === "footnote_reference_close") definition2 = null;
      if (token3.type !== "inline") continue;
      let rawCode = 0;
      for (const child of token3.children || []) {
        if (child.type === "html_inline") {
          if (/^<(?:code|pre)(?:\s|>)/i.test(child.content)) rawCode++;
          else if (/^<\/(?:code|pre)\s*>/i.test(child.content)) rawCode = Math.max(0, rawCode - 1);
        }
        if (rawCode) continue;
        if (child.type === "footnote_ref") {
          const label = validFootnoteLabel(child.meta?.label);
          if (definition2)
            fail(
              "FOOTNOTE_NESTED",
              "Footnote definitions must not contain footnote references",
              loc({ token: token3 })
            );
          references.add(label);
        } else if (child.type === "text" && /\[\^[^\]\s]+\]/u.test(child.content)) {
          fail("FOOTNOTE_MISSING", "A footnote reference has no definition", loc({ token: token3 }));
        }
      }
    }
    for (const [label, location] of definitions)
      if (!references.has(label))
        fail("FOOTNOTE_ORPHAN", "A footnote definition is not referenced", location);
    state.env.mbbDefinitionOrder = [...definitions.keys()];
  });
  function api() {
    if (!globalThis.wp?.blocks) fail("ENVIRONMENT", "A real WordPress block runtime is required");
    return wp.blocks;
  }
  function makeHTML(content) {
    return api().createBlock("core/html", {}, [], [content]);
  }
  function make(name, attrs2 = {}, children = []) {
    return api().createBlock(name, attrs2, children);
  }
  function safeURL(value) {
    const decoded = value.replace(/[\u0000-\u0020\u007f]/g, "");
    if (/^(?:javascript|vbscript|data|file):/i.test(decoded) || /^[a-z][a-z\d+.-]*:/i.test(decoded) && !/^(?:https?|mailto):/i.test(decoded))
      fail("UNSAFE_URL", "Disallowed URL scheme");
  }
  var tags2 = new Set(
    "p br strong em s del span font code pre blockquote ul ol li a img table thead tbody tr th td hr h1 h2 h3 h4 h5 h6".split(
      " "
    )
  );
  var attrs = {
    a: ["href", "title", "id"],
    img: ["src", "alt", "title", "style", "width", "height"],
    p: ["style"],
    span: ["style", "class"],
    font: ["color", "style"],
    ol: ["start"]
  };
  function safeHTML(html, allowMath = false) {
    technicalRawHTML(html, fail);
    if (/<!|<\/?(?:html|head|body)\b/i.test(html))
      fail("UNSAFE_HTML", "HTML document containers are not allowed");
    const doc = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
    const walk = (node) => {
      if (node.nodeType === 3) return;
      if (node.nodeType !== 1)
        fail("UNSAFE_HTML", "HTML comments and non-text nodes are unsupported");
      const tag = node.localName;
      const math = allowMath && tag === "span" && node.className === "mbb-math" && node.hasAttribute("data-mbb-tex");
      const footnote = tag === "span" && node.className === "mbb-footnote-ref" && node.hasAttribute("data-mbb-footnote");
      const technical = tag === "span" && ["mbb-xref", "mbb-cite"].includes(node.className);
      if (technical) technicalReference(node.outerHTML, fail);
      if (!tags2.has(tag) && !math) fail("UNSUPPORTED_HTML", format("Unsupported HTML tag %1$s", tag));
      for (const a of node.attributes) {
        if (!(technical ? [
          "class",
          "data-mbb-target",
          "data-mbb-keys",
          "data-mbb-version",
          "data-mbb-namespace",
          "data-mbb-document",
          "data-mbb-kind"
        ] : math ? ["class", "data-mbb-tex"] : footnote ? ["class", "data-mbb-footnote"] : attrs[tag] || []).includes(a.name))
          fail("UNSAFE_HTML_ATTRIBUTE", format("Unsupported attribute %1$s.%2$s", tag, a.name));
        if (["href", "src"].includes(a.name)) safeURL(a.value);
        if (a.name === "style")
          for (const rule of a.value.split(";").filter((x) => x.trim())) {
            const parts = rule.split(":");
            const key = parts[0].trim().toLowerCase(), value = (parts[1] || "").trim();
            const values = {
              color: /^(?:[a-z]+|#[0-9a-f]{3,8})$/i,
              "background-color": /^(?:[a-z]+|#[0-9a-f]{3,8})$/i,
              "font-weight": /^(?:normal|bold|[1-9]00)$/,
              "font-size": /^\d+(?:\.\d+)?(?:px|em|rem|%)$/,
              "text-align": /^(?:left|right|center|justify)$/,
              zoom: /^\d+(?:\.\d+)?%?$/
            };
            if (parts.length !== 2 || !values[key]?.test(value))
              fail("UNSAFE_STYLE", "Unsupported or unsafe style");
          }
        if (a.name === "class" && !math && !footnote && !technical && a.value !== "wzf-exercise-hint")
          fail("UNSAFE_HTML_ATTRIBUTE", "Unsupported display class");
        if (a.name === "color" && !/^(?:[a-z]+|#[0-9a-f]{3,8})$/i.test(a.value))
          fail("UNSAFE_STYLE", "Unsafe color");
        if (["width", "height"].includes(a.name) && !/^\d+(?:\.\d+)?(?:px|%)?$/.test(a.value))
          fail("UNSAFE_STYLE", "Unsafe image dimensions");
      }
      if (math && node.textContent !== "$" + node.getAttribute("data-mbb-tex") + "$")
        fail("MATH_MISMATCH", "Inline formula source differs from its display text");
      if (footnote) {
        const label = validFootnoteLabel(node.getAttribute("data-mbb-footnote"));
        if (node.textContent !== `[^${label}]` || node.children.length)
          fail("FOOTNOTE_MISMATCH", "The footnote marker differs from its name");
      }
      for (const c of node.childNodes) walk(c);
    };
    if (doc.head.childNodes.length) fail("UNSAFE_HTML", "HTML head nodes are not allowed");
    for (const node of doc.body.childNodes) walk(node);
    return doc.body;
  }
  function htmlMath(raw) {
    return raw.replace(
      /<(pre|code)\b[^>]*>[\s\S]*?<\/\1>|<span\b[^>]*data-mbb-tex[^>]*>[\s\S]*?<\/span>|(?<!\\)\$(?!\$)(?:\\.|[^$\n])+?(?<!\\)\$/g,
      (m) => {
        if (m[0] !== "$") return m;
        const tex = m.slice(1, -1);
        return '<span class="mbb-math" data-mbb-tex="' + esc(tex) + '">' + esc(m) + "</span>";
      }
    );
  }
  function htmlSource(html) {
    const root = safeHTML(html, true), math = [];
    if (!root.querySelector("span.mbb-math[data-mbb-tex]")) return html;
    let prefix = "MBBHTMLMATH";
    while (html.includes(prefix)) prefix += "X";
    for (const n of root.querySelectorAll("span.mbb-math[data-mbb-tex]")) {
      const key = prefix + math.length + "END";
      math.push("$" + n.getAttribute("data-mbb-tex") + "$");
      n.replaceWith(root.ownerDocument.createTextNode(key));
    }
    let result = root.innerHTML;
    math.forEach((tex, i) => {
      result = result.replace(prefix + i + "END", () => tex);
    });
    return result;
  }
  function tree(tokens) {
    const root = { children: [] }, stack = [root];
    for (const token3 of tokens) {
      if (token3.nesting === -1) {
        stack.pop();
        continue;
      }
      const node = { token: token3, children: [] };
      stack.at(-1).children.push(node);
      if (token3.nesting === 1) stack.push(node);
    }
    return root.children;
  }
  var loc = (node) => node.token.map ? `line:${node.token.map[0] + 1}` : "";
  function inline2(token3) {
    const allowed = /* @__PURE__ */ new Set([
      "text",
      "softbreak",
      "hardbreak",
      "code_inline",
      "strong_open",
      "strong_close",
      "em_open",
      "em_close",
      "s_open",
      "s_close",
      "link_open",
      "link_close",
      "image",
      "html_inline",
      "mbb_technical_reference",
      "mbb_inline_math",
      "footnote_ref"
    ]);
    for (const t of token3.children || []) {
      if (!allowed.has(t.type))
        fail("UNSUPPORTED_INLINE", format("Unsupported inline syntax %1$s", t.type), loc({ token: token3 }));
      if (t.type === "image" && t.children?.some((child) => child.type === "mbb_technical_reference"))
        fail("TECHNICAL_REFERENCE", "Technical references must not be inside links or images");
      for (const [key, value] of t.attrs || []) if (["href", "src"].includes(key)) safeURL(value);
      if (t.type === "html_inline" && /^<(?:class\s+[^<>]+|sstream|stdexcept|vector|functional|optional|iostream|memory|simplecounter|int|float|t|string|typename)>$/i.test(
        t.content
      ))
        t.type = "text";
    }
    const result = md.renderer.renderInline(token3.children, md.options, {});
    safeHTML(result, true);
    return result;
  }
  function paragraph2(node) {
    if (node.children.length !== 1 || node.children[0].token.type !== "inline")
      fail("INVALID_AST", "Paragraph parsing failed", loc(node));
    return inline2(node.children[0].token);
  }
  function taskParagraph(node) {
    if (node?.token.type !== "paragraph_open" || node.children.length !== 1) return null;
    const token3 = node.children[0].token;
    const marker = token3.content.match(/^\[([ xX])\](?:[ \t]+|$)/);
    if (!marker || token3.children?.[0]?.type !== "text") return null;
    const first = token3.children[0].content;
    if (!first.startsWith(marker[0].trimEnd())) return null;
    const children = token3.children.map(
      (child, index) => index === 0 ? { ...child, content: first.slice(marker[0].length) } : child
    );
    const content = inline2({ ...token3, children });
    return { checked: marker[1].toLowerCase() === "x", content };
  }
  function convert(nodes, legacyTasks = false, teachingNonce = "") {
    return nodes.map(
      (node) => atLocation(loc(node), () => {
        const t = node.token;
        switch (t.type) {
          case "paragraph_open": {
            const content = paragraph2(node);
            const parts = node.children[0].token.children;
            if (/^<a id="[^"]+"><\/a>$/.test(content)) return makeHTML(content);
            if (/<a id="[^"]+"><\/a>/.test(content))
              fail(
                "INLINE_ANCHOR",
                "An empty anchor must occupy a separate paragraph to prevent editor tag loss",
                loc(node)
              );
            if (parts.length === 1 && parts[0].type === "image") {
              const image2 = safeHTML(content).querySelector("img");
              return make("core/image", {
                url: image2.getAttribute("src"),
                alt: image2.getAttribute("alt") || "",
                ...image2.hasAttribute("title") ? { title: image2.getAttribute("title") } : {}
              });
            }
            return make("core/paragraph", { content });
          }
          case "heading_open":
            return make("core/heading", { level: Number(t.tag.slice(1)), content: paragraph2(node) });
          case "hr":
            return make("core/separator");
          case "fence":
          case "code_block":
            if (!/^[\w+-]*$/.test(t.info.trim()))
              fail(
                "CODE_INFO",
                "Code language tokens do not support additional parameters",
                loc(node)
              );
            return make("mbb/code", { code: t.content, language: t.info.trim() });
          case "mbb_math":
            return make("mbb/math", { tex: t.content });
          case "html_block": {
            const marker = teachingMarker(t.content, teachingNonce);
            if (marker) return { teachingMarker: marker };
            if (/^<!--\s*more\s*-->\s*$/.test(t.content)) return make("core/more");
            const protectedHTML = htmlMath(t.content), root = safeHTML(protectedHTML, true);
            return makeHTML(
              protectedHTML.replace(
                /style=(["'])(.*?)\1/g,
                (_, q, value) => "style=" + q + value.trim().replace(/;\s*$/, "") + q
              )
            );
          }
          case "blockquote_open":
            return make("core/quote", {}, convert(node.children, legacyTasks, teachingNonce));
          case "footnote_block_open":
            return make(
              "mbb/footnotes",
              {},
              node.children.map((note) => {
                if (note.token.type !== "footnote_open")
                  fail("FOOTNOTE_STRUCTURE", "Unsupported footnote definition structure", loc(note));
                const label = validFootnoteLabel(note.token.meta?.label);
                return make(
                  "mbb/footnote",
                  { label },
                  convert(note.children, legacyTasks, teachingNonce)
                );
              })
            );
          case "bullet_list_open":
          case "ordered_list_open": {
            const hasTask = (items2) => items2.some(
              (item) => taskParagraph(item.children[0]) || item.children.some(
                (child) => ["bullet_list_open", "ordered_list_open"].includes(child.token.type) && hasTask(child.children)
              )
            );
            const complex = (items2) => items2.some(
              (item) => item.children[0]?.token.type !== "paragraph_open" || item.children.slice(1).some(
                (n) => !["bullet_list_open", "ordered_list_open"].includes(n.token.type) || complex(n.children)
              )
            );
            if (complex(node.children) || !legacyTasks && hasTask(node.children))
              return make(
                "mbb/list",
                { ordered: t.type === "ordered_list_open", start: Number(t.attrGet("start") || 1) },
                node.children.map((item) => {
                  const task = !legacyTasks && taskParagraph(item.children[0]);
                  return task ? make(
                    "mbb/task-item",
                    task,
                    convert(item.children.slice(1), legacyTasks, teachingNonce)
                  ) : make("mbb/list-item", {}, convert(item.children, legacyTasks, teachingNonce));
                })
              );
            const items = node.children.map((item) => {
              if (item.token.type !== "list_item_open" || item.children[0]?.token.type !== "paragraph_open")
                fail("LIST_STRUCTURE", "Unsupported list item structure", loc(item));
              if (legacyTasks && /^\[[ xX]\]\s/.test(item.children[0].children[0].token.content))
                fail("TASK_LIST", "Task lists are not supported here", loc(item));
              const content = paragraph2(item.children[0]);
              const nested = item.children.slice(1);
              return make("core/list-item", { content }, convert(nested, legacyTasks, teachingNonce));
            });
            return make(
              "core/list",
              {
                ordered: t.type === "ordered_list_open",
                ...t.attrGet("start") ? { start: Number(t.attrGet("start")) } : {}
              },
              items
            );
          }
          case "table_open": {
            const data = { head: [], body: [], foot: [] };
            for (const section of node.children) {
              const key = section.token.type === "thead_open" ? "head" : "body";
              data[key] = section.children.map((row) => ({
                cells: row.children.map((cell) => {
                  const style = cell.token.attrGet("style") || "";
                  return {
                    content: paragraph2(cell),
                    tag: cell.token.tag,
                    ...style ? { align: style.split(":")[1] } : {}
                  };
                })
              }));
            }
            return make("core/table", data);
          }
          default:
            fail("UNSUPPORTED_BLOCK", format("Unsupported Markdown node %1$s", t.type), loc(node));
        }
      })
    );
  }
  function checkSource(source) {
    if (typeof source !== "string" || new Blob([source]).size > 262144)
      fail("INPUT_LIMIT", "The source must be a string of at most 256 KiB");
    if (/[\uD800-\uDFFF]/u.test(source)) fail("INPUT_ENCODING", "The source must be valid Unicode");
    if (source.includes("\0")) fail("INVALID_INPUT", "The source contains NUL");
  }
  function directiveDataProjection(source) {
    return source.replace(
      /(^|[\r\n])(:::mbb:v1 [a-z][a-z0-9-]* (\{[^\r\n]*\}))(?=[\r\n]|$)/g,
      (whole, prefix, header, raw) => {
        try {
          const value = JSON.parse(raw);
          if (!value || typeof value !== "object" || Array.isArray(value)) return whole;
          return prefix + " ".repeat(header.length);
        } catch {
          return whole;
        }
      }
    );
  }
  function displayBoundaries(source) {
    const projection = directiveDataProjection(source);
    const ignored = /* @__PURE__ */ new Set();
    for (const t of boundaryMD.parse(projection, {}))
      if (["fence", "code_block"].includes(t.type) && t.map)
        for (let i = t.map[0]; i < t.map[1]; i++) ignored.add(i);
    const htmlCode = [...projection.matchAll(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi)].map((m) => [
      m.index,
      m.index + m[0].length
    ]);
    const marks = [];
    let offset = 0, fence3 = null, code2 = 0, lineIndex = 0;
    for (const line of projection.split("\n")) {
      if (ignored.has(lineIndex++)) {
        offset += line.length + 1;
        continue;
      }
      if (line.startsWith(":::mbb:") && line.replace(/\r$/, "") !== ":::mbb:end" && !htmlCode.some(([a, b]) => offset >= a && offset < b))
        return source;
      const f = line.match(/^\s*(`{3,}|~{3,})/);
      if (f && !code2) {
        if (!fence3) fence3 = f[1];
        else if (f[1][0] === fence3[0] && f[1].length >= fence3.length) fence3 = null;
        offset += line.length + 1;
        continue;
      }
      if (!fence3)
        for (let i = 0; i < line.length; i++) {
          if (htmlCode.some(([a, b]) => offset + i >= a && offset + i < b)) continue;
          if (line[i] === "\\" && !code2) {
            i++;
            continue;
          }
          if (line[i] === "`") {
            let n = 1;
            while (line[i + n] === "`") n++;
            if (!code2) code2 = n;
            else if (code2 === n) code2 = 0;
            i += n - 1;
            continue;
          }
          if (!code2 && line.slice(i, i + 2) === "$$") {
            marks.push({
              pos: offset + i,
              own: /^(?: {0,3}>[ \t]?)*\s*\$\$\s*$/.test(line),
              indent: line.match(/^\s*/)[0]
            });
            i++;
          }
        }
      offset += line.length + 1;
    }
    if (marks.length % 2)
      fail(
        "UNCLOSED_MATH",
        "The block formula lacks paired $$ delimiters",
        `line:${source.slice(0, marks.at(-1).pos).split("\n").length}`
      );
    for (let i = marks.length - 2; i >= 0; i -= 2) {
      const a = marks[i], b = marks[i + 1];
      if (a.own && b.own) continue;
      const tex = source.slice(a.pos + 2, b.pos).trim();
      source = source.slice(0, a.pos) + "\n\n" + a.indent + "$$\n" + tex + "\n" + a.indent + "$$\n\n" + source.slice(b.pos + 2);
    }
    return source;
  }
  function parseSource(source, legacyTasks = false, legacyFootnotes = false, normalized = displayBoundaries(source)) {
    checkSource(source);
    if (!legacyFootnotes) {
      const linkProbe = directiveDataProjection(normalized).replace(/^:::mbb:[^\r\n]*/gm, (header) => " ".repeat(header.length)).replace(/^([ \t]{0,3})\[\^[^\]\n]+\]:/gm, "$1MBBFOOTNOTE:");
      for (const token3 of legacyMD.parse(linkProbe, {})) {
        if (token3.type !== "inline") continue;
        let linkDepth = 0;
        for (const child of token3.children || []) {
          if (child.type === "image" && /\[\^[^\]\s]+\]/u.test(child.content))
            fail("FOOTNOTE_IN_LINK", "Image text must not contain footnote references");
          if (child.type === "link_open" || child.type === "html_inline" && /^<a(?:\s|>)/i.test(child.content))
            linkDepth++;
          else if (child.type === "link_close" || child.type === "html_inline" && /^<\/a\s*>/i.test(child.content))
            linkDepth = Math.max(0, linkDepth - 1);
          else if (linkDepth && child.type === "text" && /\[\^[^\]\s]+\]/u.test(child.content))
            fail("FOOTNOTE_IN_LINK", "Link text must not contain footnote references");
        }
      }
    }
    const ignoredTeaching = /* @__PURE__ */ new Set();
    const teachingFences = boundaryMD.parse(directiveDataProjection(normalized), {});
    for (const token3 of teachingFences)
      if (["fence", "code_block"].includes(token3.type) && token3.map)
        for (let line = token3.map[0]; line < token3.map[1]; line++) ignoredTeaching.add(line);
    const teachingNonce = [...crypto.getRandomValues(new Uint8Array(16))].map((value) => value.toString(16).padStart(2, "0")).join("");
    normalized = teachingSource(normalized, fail, ignoredTeaching, teachingNonce, teachingFences);
    const env = {};
    const tokens = (legacyFootnotes ? legacyMD : md).parse(normalized, env);
    if (legacyFootnotes && Object.keys(env.references || {}).some((x) => x.startsWith("^")))
      fail("UNSUPPORTED_FOOTNOTE", "Footnotes are not supported here");
    const roots = tree(tokens.filter((token3) => token3.type !== "footnote_anchor"));
    const order = env.mbbDefinitionOrder || [];
    for (const root of roots)
      if (root.token.type === "footnote_block_open")
        root.children.sort(
          (a, b) => order.indexOf(a.token.meta?.label) - order.indexOf(b.token.meta?.label)
        );
    return assembleTeaching(convert(roots, legacyTasks, teachingNonce), make, fail);
  }
  function blocksFromSource(source, legacyTasks = false, legacyFootnotes = false, reportSource = true, legacyFrontmatter = false) {
    checkSource(source);
    let normalized = source;
    let removedHeader = false;
    try {
      const front = legacyFrontmatter ? null : parseFrontmatter(source, fail);
      const body = front ? front.body : source;
      removedHeader = !!front;
      normalized = displayBoundaries(body);
      const blocks = parseSource(body, legacyTasks, legacyFootnotes, normalized);
      return front ? [make("mbb/frontmatter", { version: 1, raw: front.raw }), ...blocks] : blocks;
    } catch (error3) {
      if ((!reportSource || removedHeader || normalized !== source) && error3 instanceof ConversionError && /^line:/.test(error3.location))
        error3.location = "";
      throw error3;
    }
  }
  function toBlocks(source, legacyTasks = false, legacyFootnotes = false, legacyFrontmatter = false) {
    return blocksFromSource(source, legacyTasks, legacyFootnotes, true, legacyFrontmatter);
  }
  function textMD(text3) {
    return text3.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/[\\`*{}\[\]()#+\-.!_$|>]/g, "\\$&").replace(/(^|\n)(:::mbb:)/g, "$1\\$2");
  }
  function codeMD(code2) {
    const n = Math.max(0, ...(code2.match(/`+/g) || []).map((s) => s.length)) + 1;
    const fence3 = "`".repeat(n);
    const pad = /^`|`$/.test(code2) || /^ .* $/.test(code2) && /\S/.test(code2) ? " " : "";
    return fence3 + pad + code2 + pad + fence3;
  }
  function inlineMD(html) {
    const root = safeHTML(html, true);
    const walk = (n) => {
      if (n.nodeType === 3) return textMD(n.textContent);
      const inside = () => [...n.childNodes].map(walk).join("");
      const rawTag = () => "<" + n.localName + [...n.attributes].map((a) => " " + a.name + '="' + esc(a.value) + '"').join("") + ">" + inside() + "</" + n.localName + ">";
      switch (n.localName) {
        case "strong":
          return "**" + inside() + "**";
        case "em":
          return "*" + inside() + "*";
        case "s":
          return "~~" + inside() + "~~";
        case "del":
          return n.outerHTML;
        case "code":
          return codeMD(n.textContent);
        case "br":
          return "<br>";
        case "a":
          if (n.hasAttribute("id")) return n.outerHTML;
          return "[" + inside() + "](<" + n.getAttribute("href").replace(/>/g, "%3E") + ">" + (n.hasAttribute("title") ? ' "' + n.getAttribute("title").replace(/"/g, "&quot;") + '"' : "") + ")";
        case "img":
          if (n.hasAttribute("style") || n.hasAttribute("width") || n.hasAttribute("height"))
            return n.outerHTML;
          return "![" + textMD(n.getAttribute("alt") || "") + "](<" + n.getAttribute("src").replace(/>/g, "%3E") + ">" + (n.hasAttribute("title") ? ' "' + n.getAttribute("title").replace(/"/g, "&quot;") + '"' : "") + ")";
        case "font":
          return rawTag();
        case "span":
          if (["mbb-xref", "mbb-cite"].includes(n.className))
            return technicalReference(n.outerHTML, fail).raw;
          return n.hasAttribute("data-mbb-tex") ? "$" + n.getAttribute("data-mbb-tex") + "$" : n.hasAttribute("data-mbb-footnote") ? "[^" + validFootnoteLabel(n.getAttribute("data-mbb-footnote")) + "]" : rawTag();
        default:
          fail("UNSUPPORTED_INLINE_HTML", format("Unsupported inline HTML export %1$s", n.localName));
      }
    };
    return [...root.childNodes].map(walk).join("");
  }
  function taskItemMarkdown(item, at, includeInner = true) {
    const a = item.attributes;
    if (typeof a.content !== "string" || typeof a.checked !== "boolean")
      fail("TASK_STRUCTURE", "Invalid task item state or content", at);
    const first = "[" + (a.checked ? "x" : " ") + "] " + inlineMD(a.content);
    return includeInner && item.innerBlocks.length ? first + "\n\n" + rawMarkdown(item.innerBlocks, at) : first;
  }
  function rawMarkdown(blocks, path = "blocks") {
    if (path === "blocks" && blocks[0]?.name === "mbb/frontmatter") {
      const raw = blocks[0].attributes.raw;
      return raw + (blocks.length > 1 ? (raw.endsWith("\n") ? "\n" : "\n\n") + rawMarkdown(blocks.slice(1), "blocks") : "");
    }
    if (path === "blocks" && blocks.filter((b) => b.name === "mbb/footnotes").length > 1)
      fail("FOOTNOTE_STRUCTURE", "A document may contain only one footnote definition section");
    if (path === "blocks" && blocks.some((b, i) => b.name === "mbb/footnotes" && i !== blocks.length - 1))
      fail(
        "FOOTNOTE_STRUCTURE",
        "The footnote definition section must be at the end of the document"
      );
    return blocks.map(
      (b, i) => atLocation(`${path}[${i}]`, () => {
        const at = `${path}[${i}]`;
        if (b.isValid === false) fail("INVALID_BLOCK", "An invalid block cannot be exported", at);
        const a = b.attributes;
        if (!Object.hasOwn(block_capabilities_default, b.name) && !staticAdapterKind(b.name))
          fail("UNSUPPORTED_BLOCK", "This block cannot yet be converted to Markdown", at);
        const inner = b.innerBlocks || [];
        if (teachingKind(b.name))
          return teachingMarkdown(
            b,
            nativeAdapterKind(b.name) === "button" ? "<p>" + buttonText(
              wp.richText.RichTextData && a.text instanceof wp.richText.RichTextData ? a.text.toString() : a.text,
              fail
            ) + "</p>" : rawMarkdown(inner, at),
            fail
          );
        switch (b.name) {
          case "mbb/footnotes":
            if (path !== "blocks" || inner.length === 0 || inner.some((n) => n.name !== "mbb/footnote"))
              fail(
                "FOOTNOTE_STRUCTURE",
                "The footnote definition section must be last and contain definitions",
                at
              );
            return inner.map((note, j) => {
              const label = validFootnoteLabel(note.attributes.label, `${at}[${j}]`);
              if (!note.innerBlocks?.length)
                fail("FOOTNOTE_STRUCTURE", "Footnote definitions must not be empty", at);
              const body = rawMarkdown(note.innerBlocks, `${at}[${j}]`).trimEnd().split("\n");
              return `[^${label}]: ${body[0]}` + body.slice(1).map((line) => "\n" + (line ? "    " + line : "")).join("");
            }).join("\n\n");
          case "mbb/footnote":
            fail(
              "FOOTNOTE_STRUCTURE",
              "Footnote definitions must be inside the footnote section",
              at
            );
          case "core/paragraph":
            return inlineMD(a.content);
          case "core/gallery":
            return mediaDirective(
              "gallery",
              mediaGalleryAttributes(a, fail),
              rawMarkdown(inner, at)
            );
          case "core/image": {
            const metadata = mediaImageAttributes(a, fail);
            const imageSource = inlineMD(
              '<img src="' + esc(a.url) + '" alt="' + esc(a.alt || "") + '"' + (a.title ? ' title="' + esc(a.title) + '"' : "") + ">"
            );
            return Object.keys(metadata).length ? mediaDirective("image", metadata, imageSource) : imageSource;
          }
          case "core/heading":
            return "#".repeat(a.level || 2) + " " + inlineMD(a.content);
          case "core/separator":
            return "---";
          case "core/more":
            if (a.customText || a.noTeaser)
              fail("MORE_OPTIONS", "Custom more-separator attributes are not supported", at);
            return "<!--more-->";
          case "mbb/code": {
            if (!/^[\w+-]*$/.test(a.language || ""))
              fail("CODE_INFO", "Invalid code language", at);
            if (!a.code.endsWith("\n"))
              fail("CODE_TRAILING_NEWLINE", "Fenced code must preserve its trailing newline", at);
            const n = Math.max(3, ...(a.code.match(/`+/g) || []).map((x) => x.length + 1));
            const f = "`".repeat(n);
            return f + (a.language || "") + "\n" + a.code + f;
          }
          case "mbb/math":
            if (/(^|\n)\s*\$\$\s*(\n|$)/.test(a.tex))
              fail("MATH_DELIMITER", "Formula source contains a standalone delimiter line", at);
            return "$$\n" + a.tex + "\n$$";
          case "core/html": {
            const html = b.innerContent?.join("") ?? a.content;
            if (typeof html !== "string" || inner.length)
              fail("HTML_STRUCTURE", "Unsupported HTML block structure", at);
            return htmlSource(html).trimEnd();
          }
          case "core/quote":
            return rawMarkdown(inner, at).split("\n").map((l) => "> " + l).join("\n");
          case "mbb/list":
            return inner.map((item, j) => {
              if (!["mbb/list-item", "mbb/task-item"].includes(item.name))
                fail("LIST_STRUCTURE", "A complex list contains a non-list item", at);
              const marker = a.ordered ? String((a.start || 1) + j) + ". " : "- ";
              const body = item.name === "mbb/task-item" ? taskItemMarkdown(item, `${at}[${j}]`) : rawMarkdown(item.innerBlocks, `${at}[${j}]`);
              const lines = body.trimEnd().split("\n");
              return marker + lines[0] + lines.slice(1).map((l) => "\n" + " ".repeat(marker.length) + l).join("");
            }).join("\n\n");
          case "core/list":
            return inner.map((item, j) => {
              if (item.name !== "core/list-item")
                fail("LIST_STRUCTURE", "A list contains a non-list item", at);
              const marker = a.ordered ? String((a.start || 1) + j) + ". " : "- ";
              return marker + inlineMD(item.attributes.content) + (item.innerBlocks.length ? (item.innerBlocks.every((x) => x.name === "core/list") ? "\n" : "\n\n") + rawMarkdown(item.innerBlocks, `${at}[${j}]`).split("\n").map((l) => " ".repeat(marker.length) + l).join("\n") : "");
            }).join("\n");
          case "core/table": {
            if (a.head?.length !== 1 || a.foot?.length)
              fail("TABLE_STRUCTURE", "A table requires exactly one header and no footer", at);
            const rows = [...a.head, ...a.body];
            const width = a.head[0].cells.length;
            if (rows.some((r) => r.cells.length !== width))
              fail("TABLE_STRUCTURE", "Table column counts differ", at);
            const row = (r) => "| " + r.cells.map((c) => inlineMD(c.content).replace(/\n/g, " ")).join(" | ") + " |";
            const align = "| " + a.head[0].cells.map((c) => ({ left: ":---", center: ":---:", right: "---:" })[c.align] || "---").join(" | ") + " |";
            return [row(a.head[0]), align, ...a.body.map(row)].join("\n");
          }
          default:
            fail("UNSUPPORTED_BLOCK", format("Block %1$s cannot be exported to Markdown", b.name), at);
        }
      })
    ).join("\n\n") + "\n";
  }
  function toMarkdown(blocks, context) {
    if (globalThis.MarkBridgeParameterDrafts?.pending() || adapterDraftPending())
      fail(
        "COMPONENT_DRAFT",
        "Parameters have not been applied. Apply or discard the parameter input before saving."
      );
    if (context?.origin !== "markdown_import")
      fail("ORIGIN_REQUIRED", "Reverse conversion requires an explicit Markdown source document");
    validateTeaching(blocks, fail);
    validateFrontmatter(blocks, fail);
    const result = rawMarkdown(blocks);
    checkSource(result);
    const original = api().serialize(blocks);
    checkSource(original);
    validateAdaptersSerialized(original, fail, teachingJSON);
    const regenerated = api().serialize(blocksFromSource(result, false, false, false));
    if (canonical(original) !== canonical(regenerated)) {
      const regeneratedBlocks = blocksFromSource(result, false, false, false);
      const difference = (left, right, path = "blocks") => {
        for (let i = 0; i < left.length; i++) {
          const at = `${path}[${i}]`;
          if (!right[i]) return at;
          if (canonical(api().serialize([left[i]])) === canonical(api().serialize([right[i]])))
            continue;
          if (left[i].name !== right[i].name || (left[i].innerBlocks || []).length !== (right[i].innerBlocks || []).length)
            return at;
          const child = difference(left[i].innerBlocks || [], right[i].innerBlocks || [], at);
          if (child) return child;
          for (const key of Object.keys(left[i].attributes || {})) {
            if (JSON.stringify(left[i].attributes[key]) !== JSON.stringify(right[i].attributes?.[key]) && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key))
              return `${at}.attributes.${key}`;
          }
          return at;
        }
        return "";
      };
      fail(
        "LOSSY_ROUNDTRIP",
        "Conversion cannot preserve all current block content or attributes. Export was blocked",
        difference(blocks, regeneratedBlocks)
      );
    }
    return result;
  }
  function importDocument(source, documentId) {
    if (typeof documentId !== "string" || !documentId.trim())
      fail("DOCUMENT_ID", "A stable document_id is required");
    const blocks = toBlocks(source);
    checkSource(api().serialize(blocks));
    toMarkdown(blocks, { origin: "markdown_import" });
    toMarkdown(api().parse(api().serialize(blocks)), { origin: "markdown_import" });
    return {
      schema: 1,
      converter: VERSION,
      origin: "markdown_import",
      documentId,
      source,
      serialized: api().serialize(blocks)
    };
  }
  function rewriteDocumentImages(base2, mappings) {
    exportDocument(base2, base2?.serialized);
    const verified = importPairedDocument(base2.source, base2.serialized, base2.documentId);
    const serialized = rewriteSerializedImageURLs(verified.serialized, mappings, fail);
    if (serialized === verified.serialized) return verified;
    return importDocument(exportDocument(verified, serialized), base2.documentId);
  }
  function portableDocumentImages(base2, mappings) {
    validateMedia(api().parse(base2?.serialized || ""), fail, true);
    exportDocument(base2, base2?.serialized);
    const verified = importPairedDocument(base2.source, base2.serialized, base2.documentId);
    const expected = rewriteSerializedImageURLs(verified.serialized, mappings, fail, true);
    if (!mappings.length) return verified;
    const source = portableImageSource(verified.source, mappings, fail);
    const result = importDocument(source, base2.documentId);
    if (result.serialized !== expected)
      fail(
        "EXPORT_PROJECTION",
        "Image references cannot be reliably projected while preserving the remaining body bytes"
      );
    return result;
  }
  function relocateDocumentImages(base2, mappings, portable = false) {
    exportDocument(base2, base2?.serialized);
    const verified = importPairedDocument(base2.source, base2.serialized, base2.documentId);
    const map2 = /* @__PURE__ */ new Map();
    if (!Array.isArray(mappings) || mappings.length > 256)
      fail("MEDIA_RELOCATION", "Invalid cross-site media association map");
    for (const item of mappings) {
      const keys2 = Object.keys(item || {}).sort().join(",");
      if (keys2 !== (portable ? "from,to" : "from,id,to") || typeof item.from !== "string" || typeof item.to !== "string" || !portable && (!Number.isSafeInteger(item.id) || item.id < 1) || map2.has(item.from))
        fail("MEDIA_RELOCATION", "Invalid cross-site media association map");
      map2.set(item.from, item);
    }
    rewriteSerializedImageURLs(
      verified.serialized,
      mappings.map(({ from, to }) => ({ from, to })),
      fail,
      portable
    );
    const walk = (blocks) => blocks.map((block2) => {
      if (block2.name === "core/image") {
        const mapping = map2.get(block2.attributes.url);
        if (!mapping) {
          if (portable || block2.attributes.id)
            fail(
              "MEDIA_RELOCATION",
              "Every cross-site native image requires a verified association"
            );
          return block2;
        }
        const attrs2 = { ...block2.attributes };
        if (portable) delete attrs2.id;
        else attrs2.id = mapping.id;
        return api().createBlock(block2.name, attrs2);
      }
      return block2.innerBlocks.length ? api().cloneBlock(block2, {}, walk(block2.innerBlocks)) : block2;
    });
    const serialized = rewriteSerializedImageURLs(
      api().serialize(walk(api().parse(verified.serialized))),
      mappings.map(({ from, to }) => ({ from, to })),
      fail,
      portable
    );
    const copyBlocks = (blocks) => blocks.map((block2) => {
      if (block2.name === "core/html") {
        const content = (block2.innerContent?.join("") ?? block2.attributes.content).replace(
          /^[ \t\r\n\v\0]+|[ \t\r\n\v\0]+$/g,
          ""
        );
        return { ...block2, attributes: { ...block2.attributes, content }, innerContent: [content] };
      }
      return { ...block2, innerBlocks: copyBlocks(block2.innerBlocks || []) };
    });
    return importDocument(
      toMarkdown(copyBlocks(api().parse(serialized)), { origin: "markdown_import" }),
      base2.documentId
    );
  }
  function snapshotKind(source, serialized) {
    for (const legacyFrontmatter of [false, true])
      for (const [legacyTasks, legacyFootnotes] of [
        [false, false],
        [true, true],
        [false, true]
      ]) {
        try {
          if (api().serialize(toBlocks(source, legacyTasks, legacyFootnotes, legacyFrontmatter)) === serialized)
            return legacyFootnotes || legacyFrontmatter ? "legacy" : "current";
        } catch (_error) {
        }
      }
    return null;
  }
  function importPairedDocument(source, serialized, documentId) {
    checkSource(source);
    checkSource(serialized);
    if (typeof documentId !== "string" || !documentId.trim())
      fail("DOCUMENT_ID", "A stable document_id is required");
    if (typeof serialized !== "string" || !snapshotKind(source, serialized))
      fail("SNAPSHOT_MISMATCH", "The source and block snapshots do not match");
    return {
      schema: 1,
      converter: VERSION,
      origin: "markdown_import",
      documentId,
      source,
      serialized
    };
  }
  function exportDocument(document2, serialized) {
    if (globalThis.MarkBridgeParameterDrafts?.pending() || adapterDraftPending())
      fail(
        "COMPONENT_DRAFT",
        "Parameters have not been applied. Apply or discard the parameter input before saving."
      );
    checkSource(serialized);
    checkSource(document2?.serialized);
    checkSource(document2?.source);
    if (document2?.schema !== 1 || !["0.1.2", VERSION].includes(document2.converter) || document2.origin !== "markdown_import")
      fail("DOCUMENT_MODEL", "Unsupported origin or model version");
    const kind = snapshotKind(document2.source, document2.serialized);
    if (!kind) fail("SNAPSHOT_MISMATCH", "The source and block snapshots do not match");
    if (kind === "legacy" && canonical(serialized) === canonical(document2.serialized))
      return document2.source;
    validateMediaSerialized(serialized, fail);
    validateTeachingSerialized(serialized, fail);
    validateAdaptersSerialized(serialized, fail, teachingJSON);
    validateFrontmatterSerialized(serialized, fail);
    const blocks = api().parse(serialized);
    const normalized = toMarkdown(blocks, document2);
    if (blocks.some(function adapted(b) {
      return !!nativeAdapterKind(b.name) || !!staticAdapterKind(b.name) || (b.innerBlocks || []).some(adapted);
    }) && canonical(serialized) !== canonical(api().serialize(blocksFromSource(normalized))))
      fail("ROUNDTRIP", "Native adapter serialized attributes or HTML cannot round-trip exactly");
    return canonical(serialized) === canonical(document2.serialized) ? document2.source : normalized;
  }
  function MathPreview({ tex, display = false }) {
    const el = wp.element.createElement;
    const previewRef = wp.element.useRef(null);
    const [html, setHTML] = wp.element.useState("");
    const [error3, setError] = wp.element.useState("");
    const [retry, setRetry] = wp.element.useState(0);
    wp.element.useEffect(() => {
      let active = true;
      setHTML("");
      setError("");
      const timer = setTimeout(() => {
        if (!globalThis.MBB_MATH) return;
        MBB_MATH.registerDocument?.(previewRef.current?.ownerDocument);
        MBB_MATH.render(tex, display).then(
          (h) => {
            if (active) setHTML(h);
          },
          (e) => {
            if (active) setError(e.message);
          }
        );
      }, 250);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [tex, display, retry]);
    return el(
      "div",
      { className: "mbb-math-preview", contentEditable: false, ref: previewRef },
      el("small", {}, translate("Formula preview (not written to the body)")),
      error3 ? el(
        wp.element.Fragment,
        {},
        el("code", {}, error3),
        el(
          "button",
          { type: "button", onClick: () => setRetry((v) => v + 1) },
          translate("Retry formula typesetting")
        )
      ) : html ? el("div", { dangerouslySetInnerHTML: { __html: html } }) : el("code", {}, tex)
    );
  }
  function register() {
    registerFrontmatter();
    registerTeaching();
    registerFootnotes();
    const el = wp.element.createElement;
    const convertPlainList = (block2) => {
      if (block2.name === "core/list") return block2;
      if (block2.name !== "mbb/list" || !block2.innerBlocks?.length) return null;
      const items = block2.innerBlocks.map((item) => {
        if (item.name !== "mbb/list-item" || item.innerBlocks?.[0]?.name !== "core/paragraph")
          return null;
        const nested = item.innerBlocks.slice(1).map(convertPlainList);
        if (nested.some((child) => !child)) return null;
        return make("core/list-item", { content: item.innerBlocks[0].attributes.content }, nested);
      });
      if (items.some((item) => !item)) return null;
      return make(
        "core/list",
        {
          ordered: block2.attributes.ordered,
          ...block2.attributes.start !== 1 ? { start: block2.attributes.start } : {}
        },
        items
      );
    };
    if (!api().getBlockType("mbb/list")) {
      api().registerBlockType("mbb/list", {
        apiVersion: 3,
        title: translate("Multi-paragraph list"),
        category: "text",
        attributes: {
          ordered: { type: "boolean", default: false },
          start: { type: "number", default: 1 }
        },
        supports: { html: false },
        edit: ({ attributes: a, clientId, isSelected }) => {
          const children = wp.data.useSelect(
            (select) => select("core/block-editor").getBlocks(clientId),
            [clientId]
          );
          const { removeBlock, replaceBlock } = wp.data.useDispatch("core/block-editor");
          const plain4 = convertPlainList({ name: "mbb/list", attributes: a, innerBlocks: children });
          return el(
            wp.element.Fragment,
            {},
            isSelected && (children.length === 0 || plain4) ? el(
              wp.blockEditor.BlockControls,
              {},
              el(
                wp.components.ToolbarGroup,
                {},
                children.length === 0 ? el(wp.components.ToolbarButton, {
                  label: translate("Delete empty list"),
                  onClick: () => removeBlock(clientId),
                  children: translate("Delete empty list")
                }) : el(wp.components.ToolbarButton, {
                  label: translate("Convert to ordinary list"),
                  onClick: () => replaceBlock(clientId, plain4),
                  children: translate("Convert to ordinary list")
                })
              )
            ) : null,
            el(
              a.ordered ? "ol" : "ul",
              wp.blockEditor.useInnerBlocksProps(
                wp.blockEditor.useBlockProps(a.ordered ? { start: a.start } : {}),
                {
                  allowedBlocks: ["mbb/list-item", "mbb/task-item"],
                  template: [["mbb/list-item"]],
                  templateLock: false
                }
              )
            )
          );
        },
        save: ({ attributes: a }) => el(
          a.ordered ? "ol" : "ul",
          wp.blockEditor.useInnerBlocksProps.save(
            wp.blockEditor.useBlockProps.save(a.ordered ? { start: a.start } : {})
          )
        )
      });
      api().registerBlockType("mbb/list-item", {
        apiVersion: 3,
        title: translate("List item"),
        category: "text",
        parent: ["mbb/list"],
        supports: { html: false },
        edit: () => el(
          "li",
          wp.blockEditor.useInnerBlocksProps(wp.blockEditor.useBlockProps(), {
            template: [["core/paragraph"]]
          })
        ),
        save: () => el("li", wp.blockEditor.useInnerBlocksProps.save(wp.blockEditor.useBlockProps.save()))
      });
      api().registerBlockType("mbb/task-item", {
        apiVersion: 3,
        title: translate("Task item"),
        category: "text",
        parent: ["mbb/list"],
        attributes: {
          content: { type: "string", default: "" },
          checked: { type: "boolean", default: false }
        },
        supports: { html: false },
        edit: ({ attributes: a, setAttributes }) => el(
          "li",
          wp.blockEditor.useBlockProps(),
          el(
            "div",
            { className: "mbb-task-control", contentEditable: false },
            el(wp.components.CheckboxControl, {
              label: translate("Completed"),
              checked: a.checked,
              onChange: (checked) => setAttributes({ checked })
            })
          ),
          el(wp.blockEditor.RichText, {
            tagName: "p",
            "aria-label": translate("Task content"),
            value: a.content,
            onChange: (content) => setAttributes({ content }),
            placeholder: translate("Task content")
          }),
          el(wp.blockEditor.InnerBlocks)
        ),
        save: ({ attributes: a }) => el(
          "li",
          wp.blockEditor.useBlockProps.save(),
          el(
            "p",
            {},
            "[" + (a.checked ? "x" : " ") + "] ",
            el(wp.blockEditor.RichText.Content, { tagName: "span", value: a.content })
          ),
          el(wp.blockEditor.InnerBlocks.Content)
        )
      });
      api().registerBlockVariation("mbb/list", {
        name: "task-list",
        title: translate("Task list"),
        description: translate("Insert a checkable task list."),
        scope: ["inserter"],
        innerBlocks: [["mbb/task-item", { checked: false, content: "" }]]
      });
    }
    if (api().getBlockType("mbb/math")) return;
    for (const [name, field, label] of [
      ["mbb/math", "tex", translate("Display formula")],
      ["mbb/code", "code", translate("Code")]
    ]) {
      api().registerBlockType(name, {
        apiVersion: 3,
        title: label,
        category: "text",
        attributes: {
          [field]: { type: "string", default: "" },
          ...field === "code" ? { language: { type: "string", default: "" } } : {}
        },
        supports: { html: false },
        edit: ({ attributes, setAttributes, isSelected }) => {
          const sourceRef = wp.element.useRef(null);
          wp.element.useEffect(() => {
            if (field !== "tex" || !isSelected || attributes.tex || !sourceRef.current) return;
            const owner = sourceRef.current.ownerDocument;
            const timer = owner.defaultView.setTimeout(() => sourceRef.current?.focus(), 0);
            return () => owner.defaultView.clearTimeout(timer);
          }, [isSelected]);
          return el(
            "div",
            wp.blockEditor.useBlockProps(),
            field === "code" ? el(wp.components.TextControl, {
              label: translate("Language"),
              value: attributes.language,
              onChange: (language) => setAttributes({ language })
            }) : null,
            field === "code" || isSelected ? el(wp.components.TextareaControl, {
              label: field === "tex" ? translate("TeX source") : label,
              value: attributes[field],
              ref: sourceRef,
              onChange: (value) => setAttributes({ [field]: value })
            }) : null,
            field === "tex" ? el(MathPreview, { tex: attributes.tex, display: true }) : null
          );
        },
        save: ({ attributes }) => el(
          "pre",
          wp.blockEditor.useBlockProps.save(),
          el(
            "code",
            field === "code" ? { className: attributes.language ? "language-" + attributes.language : void 0 } : { className: "mbb-tex" },
            attributes[field]
          )
        )
      });
    }
    wp.richText.registerFormatType("mbb/math", {
      title: translate("Inline formula source"),
      tagName: "span",
      className: "mbb-math",
      attributes: { tex: "data-mbb-tex" },
      contentEditable: false,
      edit: InlineMathEdit
    });
    installInlineMathDecorations();
    registerNativeMathConversion();
    registerWritingPatterns(toBlocks);
  }
  var converterOnly = typeof window !== "undefined" && window.MBB_CONVERTER_ONLY === true;
  if (!converterOnly) register();
  configureBlockAdapters2(globalThis.MBB_ADAPTERS || [], !converterOnly);
  function copyActivity(blocks, clientId) {
    validateTeaching(blocks, fail);
    let selected, identity;
    const walk = (list3) => {
      for (const b of list3) {
        if (b.clientId === clientId) selected = b;
        if (b.name === "mbb/identity") identity = b.attributes;
        walk(b.innerBlocks || []);
      }
    };
    walk(blocks);
    const copy = cloneActivity(selected, identity, api().createBlock, fail);
    validateTeaching([...blocks, copy], fail);
    const source = rawMarkdown([copy]);
    checkSource(source);
    return { source, blocks: [copy] };
  }
  function createActivity(component, version2) {
    const id2 = "activity-" + [...crypto.getRandomValues(new Uint8Array(12))].map((n) => n.toString(16).padStart(2, "0")).join("");
    const source = globalThis.MarkBridgeComponentAuthors.create(component, version2, id2), blocks = toBlocks(source);
    if (blocks.length !== 1 || blocks[0].name !== "mbb/component" || blocks[0].attributes.id !== id2 || blocks[0].attributes.component !== component || blocks[0].attributes.componentVersion !== version2 || blocks[0].attributes.version !== 2)
      fail(
        "ACTIVITY_RELATION",
        "Activity relations require a closed map of unique local static targets"
      );
    return source;
  }
  return __toCommonJS(kernel_exports);
})();
