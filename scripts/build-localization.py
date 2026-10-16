#!/usr/bin/env python3
"""Build deterministic gettext/Jed catalogs from the reviewed English message catalog."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
parser.add_argument(
    "--wp-cli",
    type=Path,
    help="Explicit WP-CLI phar, used only for isolated extraction verification",
)
parser.add_argument("--php", default="php")
args = parser.parse_args()
source = ROOT / "plugin/languages/messages.json"
messages = json.loads(source.read_text())
plurals = json.loads((source.parent / "plurals.json").read_text())
plural_keys = {key for item in plurals for key in [item["single"], item["plural"]]}
messages = {key: value for key, value in messages.items() if key not in plural_keys}
header = {
    "Project-Id-Version": "MarkBridge",
    "Report-Msgid-Bugs-To": "https://github.com/wzf2000/MarkBridge/issues",
    "POT-Creation-Date": "1970-01-01 00:00+0000",
    "PO-Revision-Date": "1970-01-01 00:00+0000",
    "Last-Translator": "MarkBridge contributors",
    "Language-Team": "MarkBridge contributors",
    "MIME-Version": "1.0",
    "Content-Type": "text/plain; charset=UTF-8",
    "Content-Transfer-Encoding": "8bit",
    "X-Domain": "markbridge",
}


def quote(value):
    return json.dumps(value, ensure_ascii=False)


def po(language):
    fields = dict(header)
    fields["Language"] = language
    if language:
        fields["Plural-Forms"] = "nplurals=1; plural=0;"
    result = ['msgid ""', 'msgstr ""']
    result.extend(quote(k + ": " + v + "\n") for k, v in fields.items())
    result.append("")
    for item in plurals:
        result.extend(
            [
                "#, php-format",
                "#: plugin/editor-ui.js",
                "msgid " + quote(item["single"]),
                "msgid_plural " + quote(item["plural"]),
                "msgstr[0] " + quote(item["zh"] if language else ""),
            ]
        )
        if not language:
            result.append("msgstr[1] " + quote(""))
        result.append("")
    for key, value in sorted(messages.items()):
        if not key or not isinstance(value, str) or not value:
            raise RuntimeError("Empty or invalid catalog entry")
        placeholders = lambda text: sorted(re.findall(r"%(?:\d+\$)?[sd]", text))
        if placeholders(key) != placeholders(value):
            raise RuntimeError("Placeholder mismatch: " + key)
        if placeholders(key):
            result.append("#, php-format")
        result.extend(
            [
                "#: plugin/i18n.js",
                "msgid " + quote(key),
                "msgstr " + quote(value if language else ""),
                "",
            ]
        )
    return "\n".join(result).encode()


outputs = {"markbridge.pot": po(""), "markbridge-zh_CN.po": po("zh_CN")}
diagnostic_path = ROOT / "plugin/includes/php-converter/diagnostics.json"
diagnostic_body = (
    json.dumps(sorted({*messages, *plural_keys}), ensure_ascii=False, indent=2) + "\n"
).encode()
if args.check:
    if diagnostic_path.read_bytes() != diagnostic_body:
        raise RuntimeError("Stale diagnostic catalog")
else:
    diagnostic_path.write_bytes(diagnostic_body)
with tempfile.TemporaryDirectory(prefix="markbridge-i18n-") as directory:
    temporary = Path(directory)
    po_file = temporary / "markbridge-zh_CN.po"
    po_file.write_bytes(outputs["markbridge-zh_CN.po"])
    pot_file = temporary / "markbridge.pot"
    pot_file.write_bytes(outputs["markbridge.pot"])
    subprocess.run(
        ["msgfmt", "--check-format", "-o", str(temporary / "pot.mo"), str(pot_file)], check=True
    )
    subprocess.run(
        ["msgfmt", "--check", "--check-format", "-o", str(temporary / "catalog.mo"), str(po_file)],
        check=True,
    )
    outputs["markbridge-zh_CN.mo"] = (temporary / "catalog.mo").read_bytes()
    if args.wp_cli:
        if not args.wp_cli.is_absolute() or not args.wp_cli.is_file() or args.wp_cli.is_symlink():
            raise RuntimeError("Use an explicit regular WP-CLI phar path")
        # WP-CLI does not extract custom boundary helpers. Verify a generated literal extraction view;
        # it contains no WordPress bootstrap, private paths, credentials, or runtime data.
        view = temporary / "extraction"
        view.mkdir()
        (view / "messages.php").write_text(
            "<?php\n"
            + "\n".join(
                "__(" + "'" + key.replace("\\", "\\\\").replace("'", "\\'") + "', 'markbridge');"
                for key in sorted(messages)
            )
            + "\n"
        )
        subprocess.run(
            [
                args.php,
                str(args.wp_cli),
                "i18n",
                "make-pot",
                str(view),
                str(temporary / "verified.pot"),
                "--domain=markbridge",
                "--slug=markbridge",
                "--skip-js",
                "--skip-audit",
                "--headers=" + json.dumps(header),
            ],
            check=True,
        )
        subprocess.run(
            [
                args.php,
                str(args.wp_cli),
                "i18n",
                "make-json",
                str(po_file),
                str(temporary / "jed"),
                "--no-purge",
            ],
            check=True,
        )

locale_data = {
    "": {"domain": "markbridge", "lang": "zh_CN", "plural-forms": "nplurals=1; plural=0;"}
}
locale_data.update({key: [value] for key, value in sorted(messages.items())})
locale_data.update({item["single"]: [item["zh"]] for item in plurals})
jed = {
    "translation-revision-date": "1970-01-01 00:00+0000",
    "generator": "MarkBridge deterministic catalog builder",
    "domain": "messages",
    "locale_data": {"messages": locale_data},
}
# WordPress checks the stable handle catalog before deriving a content-hashed filename.
handles = [
    "mbb-i18n",
    "mbb-kernel",
    "mbb-math",
    "mbb-math-explorer",
    "mbb-teaching",
    "mbb-components",
    "mbb-presentation",
    "mbb-presentation-loader",
    "mbb-editor-ui",
    "mbb-revisions-ui",
    "mbb-local-recovery",
    "mbb-resource-ui",
    "mbb-export-ui",
    "mbb-static-export",
    "mbb-batch-ui",
    "mbb-emoji",
]
for handle in handles:
    handle_jed = (
        jed if handle == "mbb-i18n" else {**jed, "locale_data": {"messages": {"": locale_data[""]}}}
    )
    outputs["markbridge-zh_CN-" + handle + ".json"] = (
        json.dumps(handle_jed, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode()
outputs["catalog-manifest.json"] = (
    json.dumps(
        {
            "schema": 1,
            "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "files": {
                name: hashlib.sha256(body).hexdigest() for name, body in sorted(outputs.items())
            },
        },
        indent=2,
        sort_keys=True,
    )
    + "\n"
).encode()
for name, body in outputs.items():
    target = source.parent / name
    if args.check:
        if not target.is_file() or target.read_bytes() != body:
            raise RuntimeError("Stale localization output: " + name)
    else:
        target.write_bytes(body)
print(
    "Verified" if args.check else "Built",
    len(messages),
    "complete translations;",
    len(outputs),
    "deterministic outputs",
)
