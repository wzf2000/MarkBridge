"""Restricted probe assertions; not a production compatibility suite."""

import json
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parent
PHP = [
    os.environ.get("MARKBRIDGE_TEST_PHP", "php"),
    "-d",
    "disable_functions=exec,shell_exec,system,passthru,proc_open,popen,pcntl_exec",
    str(ROOT / "cli.php"),
]


def convert(mode, value):
    request = {"mode": mode, "source" if mode == "markdown" else "serialized": value}
    return request_php(request)


def request_php(request):
    process = subprocess.run(
        PHP, input=json.dumps(request), text=True, capture_output=True, timeout=10
    )
    return json.loads(process.stdout)


class ProbeTests(unittest.TestCase):
    def test_historical_html_text_profile_requires_a_complete_snapshot(self):
        source = "Before $x>y$ and $z>0$; literal &amp;gt;.\n"
        current = convert("markdown", source)
        self.assertTrue(current["ok"], current)
        historical = current["serialized"].replace("$x&gt;y$", "$x>y$").replace("$z&gt;0$", "$z>0$")
        restored = request_php(
            {
                "mode": "paired_restore",
                "source": source,
                "serialized": historical,
                "documentId": "historical-gt",
            }
        )
        self.assertTrue(restored["ok"], restored)
        self.assertEqual(restored["source"], source)
        self.assertEqual(restored["serialized"], historical)
        self.assertEqual(restored["snapshot_kind"], "current:html-text-gt-v1")
        self.assertIn('data-mbb-tex="x&gt;y"', historical)
        self.assertIn("literal &amp;gt;", historical)
        for tampered in [
            historical.replace('data-mbb-tex="x&gt;y"', 'data-mbb-tex="x>y"'),
            current["serialized"].replace("$x&gt;y$", "$x>y$"),
            historical + "\n",
            historical.replace("Before", "Forged"),
            historical.replace("wp:paragraph", 'wp:paragraph {"extra":"&gt;"}', 1),
        ]:
            with self.subTest(tampered=tampered[:80]):
                result = request_php(
                    {
                        "mode": "paired_restore",
                        "source": source,
                        "serialized": tampered,
                        "documentId": "historical-gt",
                    }
                )
                self.assertFalse(result["ok"], result)
                self.assertEqual(result["code"], "SNAPSHOT_MISMATCH")
        # Literal entity code uses its content attribute as its model. The
        # profile changes its rendered text only, never the comment JSON.
        code_source = "```\n&gt;\n```\n"
        code = convert("markdown", code_source)
        self.assertTrue(code["ok"], code)
        old_code = code["serialized"].replace("<code>&gt;", "<code>>")
        result = request_php(
            {
                "mode": "paired_restore",
                "source": code_source,
                "serialized": old_code,
                "documentId": "historical-code",
            }
        )
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["source"], code_source)
        self.assertIn('"code":"\\u0026gt;\\n"', result["serialized"])
        bad_comment = old_code.replace('"code":"\\u0026gt;\\n"', '"code":">\\n"')
        self.assertFalse(
            request_php(
                {
                    "mode": "paired_restore",
                    "source": code_source,
                    "serialized": bad_comment,
                    "documentId": "historical-code",
                }
            )["ok"]
        )
        unsafe = (
            '<p><span class="mbb-math" data-mbb-tex="x&gt;y" onclick="alert(1)">$x>y$</span></p>\n'
        )
        result = request_php(
            {
                "mode": "paired_restore",
                "source": unsafe,
                "serialized": "<!-- wp:html -->\n" + unsafe.rstrip() + "\n<!-- /wp:html -->",
                "documentId": "unsafe-profile",
            }
        )
        self.assertFalse(result["ok"], result)

    def test_historical_profile_keeps_tags_quotes_comments_and_capacity(self):
        library = os.environ.get(
            "MARKBRIDGE_TEST_CONVERTER_LIBRARY",
            str(ROOT.parent.parent / "plugin/includes/php-converter/Converter.php"),
        )
        code = (
            "require $argv[1]; $c=new \\MarkBridge\\Probe\\Converter(); "
            "$profile=new ReflectionMethod($c,'htmlTextGtV1'); "
            "$blocks=new ReflectionMethod($c,'markdownBlocks'); "
            "$serialize=new ReflectionMethod($c,'serializeAll'); "
            "$q=json_decode(stream_get_contents(STDIN),true); "
            "$candidate=$serialize->invoke($c,$blocks->invoke($c,$q['source'])); "
            "echo json_encode(['tokens'=>$profile->invoke(null,$q['tokens']), "
            "'bytes'=>strlen($candidate),'historical'=>$profile->invoke(null,$candidate)]);"
        )
        tokens = '<!-- wp:test {"literal":"&gt;","quoted":"x>y"} -->\n<a title="quoted > and &gt;" href="https://example.com/?a=&gt;">&gt; &amp;gt; &#62;</a>\n<!-- /wp:test -->'
        source = "$" + ">" * 45000 + "$\n"
        process = subprocess.run(
            [PHP[0], PHP[1], PHP[2], "-r", code, library],
            input=json.dumps({"tokens": tokens, "source": source}),
            text=True,
            capture_output=True,
            timeout=10,
        )
        self.assertEqual(process.returncode, 0, process.stderr)
        result = json.loads(process.stdout)
        self.assertEqual(
            result["tokens"], tokens.replace(">&gt; &amp;gt; &#62;<", ">> &amp;gt; &#62;<")
        )
        self.assertLess(len(source.encode()), 262144)
        self.assertGreater(result["bytes"], 262144)
        self.assertLess(len(result["historical"].encode()), 262144)
        refusal = request_php(
            {
                "mode": "paired_restore",
                "source": source,
                "serialized": result["historical"],
                "documentId": "profile-capacity",
            }
        )
        self.assertFalse(refusal["ok"], refusal)

    def test_existing_math_span_is_idempotent_without_authorizing_children(self):
        marker = '<span class="mbb-math" data-mbb-tex="a*b*c">$a*b*c$</span>'
        entity = '<span data-mbb-tex="x&gt;y" class="mbb-math">$x&gt;y$</span>'
        valid = [
            "Before " + marker + ".\n",
            "**Before " + entity + " after.**\n",
            "<strong>" + marker + "</strong>\n",
            "- [x] " + entity + "\n",
            "| math |\n| --- |\n| " + entity + " |\n",
            "<p>" + entity + "</p>\n",
            'Before <span class="mbb-math" data-mbb-tex="x&amp;amp;y">$x&amp;amp;y$</span>.\n',
            'Before <span class="mbb-math" data-mbb-tex="a\\$b">$a\\$b$</span>.\n',
            'Before <span class="mbb-math" data-mbb-tex="x&#62;y">$x&#x3e;y$</span>.\n',
            'Before <span class="mbb-math" data-mbb-tex="x&lt;3">$x&lt;3$</span>.\n',
        ]
        for source in valid:
            with self.subTest(source=source):
                result = convert("markdown", source)
                self.assertTrue(result["ok"], result)
                self.assertEqual(result["serialized"].count('class="mbb-math"'), 1)
                reverse = convert("blocks", result["serialized"])
                self.assertTrue(reverse["ok"], reverse)
                self.assertEqual(
                    convert("markdown", reverse["source"])["serialized"], result["serialized"]
                )
                self.assertTrue(
                    request_php(
                        {
                            "mode": "paired_restore",
                            "source": source,
                            "serialized": result["serialized"],
                            "documentId": "prewrapped-math",
                        }
                    )["ok"]
                )
        plain_comparison = convert("markdown", "Before $x<3$.\n")
        self.assertTrue(plain_comparison["ok"], plain_comparison)
        self.assertFalse(
            convert(
                "markdown", 'Before <span class="mbb-math" data-mbb-tex="x&lt;3">$x<3$</span>.\n'
            )["ok"]
        )
        original = convert("markdown", "Before " + entity + ".\n")
        edited_html = (
            original["serialized"]
            .replace('data-mbb-tex="x&gt;y"', 'data-mbb-tex="z&gt;0"')
            .replace("$x&gt;y$", "$z&gt;0$")
        )
        edited = convert("blocks", edited_html)
        self.assertTrue(edited["ok"], edited)
        self.assertIn("$z>0$", edited["source"])
        self.assertNotIn("$x>y$", edited["source"])
        self.assertEqual(convert("markdown", edited["source"])["serialized"], edited_html)
        for partial in [
            original["serialized"].replace('data-mbb-tex="x&gt;y"', 'data-mbb-tex="z&gt;0"'),
            original["serialized"].replace("$x&gt;y$", "$z&gt;0$"),
        ]:
            self.assertFalse(convert("blocks", partial)["ok"])
        for child in [
            "<strong>$x$</strong>",
            "<code>$x$</code>",
            '<span class="mbb-math" data-mbb-tex="x">$x$</span>',
        ]:
            self.assertFalse(
                convert(
                    "markdown",
                    'Before <span class="mbb-math" data-mbb-tex="x">' + child + "</span>.\n",
                )["ok"]
            )
        for tex, literal in [
            ("&lt;strong&gt;x&lt;/strong&gt;", "$<strong>x</strong>$"),
            ("&lt;script&gt;x&lt;/script&gt;", "$<script>x</script>$"),
            ("&lt;img src=x onerror=alert(1)&gt;", "$<img src=x onerror=alert(1)>$"),
            ("x&gt;y", "$x&amp;gt;y$"),
            ("x&amp;gt;y", "$x&gt;y$"),
        ]:
            result = convert(
                "markdown",
                'Before <span class="mbb-math" data-mbb-tex="'
                + tex
                + '">'
                + literal
                + "</span>.\n",
            )
            self.assertFalse(result["ok"], result)
        for tag in [
            '<span class="mbb-math" data-mbb-tex="x" onclick="alert(1)">',
            '<span class="wzf-exercise-hint" data-mbb-tex="x">',
            '<span class="mbb-math" data-mbb-tex="x" data-mbb-tex="x">',
        ]:
            self.assertFalse(convert("markdown", "Before " + tag + "$x$</span>.\n")["ok"])
        self.assertFalse(convert("markdown", "<b>" + entity + "</b>\n")["ok"])
        code = convert("markdown", "`" + marker + "`\n")
        self.assertTrue(code["ok"], code)
        self.assertNotIn("<span ", code["serialized"])
        # Existing PHP core/html reverse limitation: it reconstructs bare <3
        # inside HTML text, which the strict HTML parser refuses on reimport.
        # Node accepts this source; ordinary inline encoded math above works.
        raw_html = convert(
            "markdown",
            '<p><span class="mbb-math" data-mbb-tex="x&lt;3">$x&lt;3$</span></p>\n',
        )
        self.assertFalse(raw_html["ok"], raw_html)
        self.assertEqual(raw_html["code"], "HTML_PARSE")

    def test_terminal_inline_breaks_survive_real_reverse(self):
        for source in [
            "before $x$<br>\n",
            "before $x$<br><br>\n",
            "**before $x$<br>**\n",
            "before $x$<br>after\n",
        ]:
            with self.subTest(source=source):
                result = convert("markdown", source)
                self.assertTrue(result["ok"], result)
                reverse = convert("blocks", result["serialized"])
                self.assertTrue(reverse["ok"], reverse)
                self.assertEqual(
                    convert("markdown", reverse["source"])["serialized"], result["serialized"]
                )
                unsafe = result["serialized"].replace("<br>", '<br onclick="alert(1)">', 1)
                self.assertFalse(convert("blocks", unsafe)["ok"])
        # An extra terminal HTML text LF cannot be represented exactly.
        # Both engines keep the edited-block gate closed for that addition.
        result = convert("markdown", "before $x$<br>\n")
        reverse = convert("blocks", result["serialized"].replace("<br></p>", "<br>\n</p>"))
        self.assertFalse(reverse["ok"], reverse)
        self.assertEqual(reverse["code"], "ROUNDTRIP")

    def test_nested_code_preserves_blank_line_whitespace(self):
        cases = [
            ("- item\n  ```text\n  before\n    \n  after\n  ```\n", "before\n  \nafter\n"),
            ("- item\n  ```text\n  before\n  \t\n  after\n  ```\n", "before\n\t\nafter\n"),
            ("- item\n\n      before\n        \n      after\n", "before\n  \nafter\n"),
            (
                "- item\n  > ```text\n  > before\n \t>\t\t\n  > after\n  > ```\n",
                "before\n\t\t\nafter\n",
            ),
            ("> - ```text\n>   before\n  >      \n>   after\n>   ```\n", "before\n   \nafter\n"),
        ]
        for source, literal in cases:
            with self.subTest(source=source):
                result = convert("markdown", source)
                self.assertTrue(result["ok"], result)
                reverse = convert("blocks", result["serialized"])
                self.assertTrue(reverse["ok"], reverse)
                self.assertEqual(self._nested_code_literal(result["serialized"]), literal)
                self.assertEqual(
                    convert("markdown", reverse["source"])["serialized"], result["serialized"]
                )

    @staticmethod
    def _nested_code_literal(serialized):
        # These are complete known generated block comments, not a parser for
        # accepting arbitrary block input. The converter itself uses WP parsing.
        import re

        comment = re.search(r"<!-- wp:mbb/code (.+?) -->", serialized)
        return json.loads(comment[1])["code"]

    def test_element_text_entities_preserve_the_block_content_model(self):
        for value in ["a & b", "&&", "&name", "&amp;", "&copy;", "&#x3C;", "&unknown;", "&AMP;"]:
            source = "```text\n" + value + "\n```\n"
            with self.subTest(value=value):
                result = convert("markdown", source)
                self.assertTrue(result["ok"], result)
                reverse = convert("blocks", result["serialized"])
                self.assertTrue(reverse["ok"], reverse)
                self.assertIn(value + "\n", reverse["source"])
                self.assertEqual(
                    convert("markdown", reverse["source"])["serialized"], result["serialized"]
                )
                # Only the content attribute and its matching rendered HTML
                # can authorize literal entity spelling; unrelated text cannot.
                forged = result["serialized"].replace("</code>", "tampered</code>")
                refusal = convert("blocks", forged)
                self.assertFalse(refusal["ok"], refusal)
                self.assertEqual(refusal["code"], "CONTENT_MISMATCH")

    def test_raw_html_math_keeps_protected_markup_lexical_spelling(self):
        cases = [
            "<p><code>$x>y$</code> $z>0$</p>\n",
            '<p><a href="https://example.com" title="quote &quot; ok">Link</a> $x>y$</p>\n',
            '<p><span style="color:red">ordinary</span> $x>y$</p>\n',
            '<p><span style="color:red">$x>y$</span> $z>0$</p>\n',
        ]
        for source in cases:
            with self.subTest(source=source):
                result = convert("markdown", source)
                self.assertTrue(result["ok"], result)
                reverse = convert("blocks", result["serialized"])
                self.assertTrue(reverse["ok"], reverse)
                self.assertEqual(reverse["source"], source)
        # Prefix-shaped ordinary text never participates in placeholder search.
        source = "<p>MBBHTMLMATH" + "X" * 240000 + " $x>y$</p>\n"
        result = convert("markdown", source)
        self.assertTrue(result["ok"], result)
        self.assertEqual(convert("blocks", result["serialized"])["source"], source)

    def test_html_escaping_matches_the_serialization_context(self):
        cases = [
            ("Plain \"word\" 'single' > & < 3.\n", "\"word\" 'single' > &amp; &lt; 3."),
            ("Compare $x>y$.\n", 'data-mbb-tex="x&gt;y" class="mbb-math">$x&gt;y$'),
            (
                'Text $\\text{"word"}$.\n',
                'data-mbb-tex="\\text{&quot;word&quot;}" class="mbb-math">$\\text{"word"}$',
            ),
            (
                "```text\n\"double\" 'single' > & <\n```\n",
                '<code class="language-text">"double" \'single\' > &amp; &lt;',
            ),
            ('- [x] "word" > 3\n', "<span>&quot;word&quot; &gt; 3</span>"),
            ('| cell |\n| --- |\n| `"word" > 3` |\n', "<code>&quot;word&quot; &gt; 3</code>"),
            ('<p>$\\text{"word"}$ and $x>y$.</p>\n', "$\\text{&quot;word&quot;}$"),
        ]
        for source, expected in cases:
            with self.subTest(source=source):
                result = convert("markdown", source)
                self.assertTrue(result["ok"], result)
                self.assertIn(expected, result["serialized"])
                reverse = convert("blocks", result["serialized"])
                self.assertTrue(reverse["ok"], reverse)
                self.assertEqual(
                    convert("markdown", reverse["source"])["serialized"], result["serialized"]
                )
                # Source admission remains an exact complete snapshot check.
                forged = request_php(
                    {
                        "mode": "paired_restore",
                        "documentId": "escaping-test",
                        "source": "Different source.\n",
                        "serialized": result["serialized"],
                    }
                )
                self.assertFalse(forged["ok"], forged)
                self.assertEqual(forged["code"], "SNAPSHOT_MISMATCH")

    def test_block_comment_json_preserves_slashes_quotes_and_unicode(self):
        # Reflection exercises values at JSON string boundaries directly. The
        # source fixtures separately exercise complete Markdown/block paths.
        values = [
            "\\",
            "中文\\",
            "x\\\\",
            'x\\"',
            "\\u4e2d",
            '" -- < > &',
            "中文\u2028B\u2029C",
        ]
        library = ROOT.parent.parent / "plugin/includes/php-converter/Converter.php"
        code = (
            "require $argv[1]; "
            "$method=new ReflectionMethod(\\MarkBridge\\Probe\\Converter::class, 'commentJson'); "
            "$out=[]; foreach(json_decode(stream_get_contents(STDIN),true) as $value) "
            "$out[]=$method->invoke(null,['code'=>$value]); echo json_encode($out);"
        )
        process = subprocess.run(
            [PHP[0], PHP[1], PHP[2], "-r", code, str(library)],
            input=json.dumps(values),
            text=True,
            capture_output=True,
            timeout=10,
        )
        self.assertEqual(process.returncode, 0, process.stderr)
        for value, actual in zip(values, json.loads(process.stdout)):
            with self.subTest(value=value):
                expected = json.dumps({"code": value}, ensure_ascii=False, separators=(",", ":"))
                # WordPress 7.1 serializeAttributes replacement order.
                for before, after in [
                    ("\\\\", "\\u005c"),
                    ("--", "\\u002d\\u002d"),
                    ("<", "\\u003c"),
                    (">", "\\u003e"),
                    ("&", "\\u0026"),
                    ('\\"', "\\u0022"),
                ]:
                    expected = expected.replace(before, after)
                self.assertEqual(actual, expected)
                self.assertEqual(json.loads(actual), {"code": value})

    def test_actual_block_edit_is_exported(self):
        original = convert("markdown", "# Title\n\nOriginal **bold**.\n")
        self.assertTrue(original["ok"], original)
        modified = original["serialized"].replace("Original", "Changed")
        reverse = convert("blocks", modified)
        self.assertTrue(reverse["ok"], reverse)
        self.assertIn("Changed", reverse["source"])
        self.assertNotIn("Original", reverse["source"])
        self.assertEqual(convert("markdown", reverse["source"])["serialized"], modified)

    def test_reverse_ignores_untrusted_cached_source(self):
        initial = convert("markdown", "Actual **content**.\n")
        self.assertTrue(initial["ok"], initial)
        result = request_php(
            {
                "mode": "blocks",
                "serialized": initial["serialized"],
                "source": "FORGED CACHED SOURCE",
                "base": {"source": "FORGED CACHED SOURCE"},
            }
        )
        self.assertTrue(result["ok"], result)
        self.assertIn("Actual", result["source"])
        self.assertNotIn("FORGED", result["source"])

    def test_invalid_requests(self):
        for request in [
            None,
            [],
            {},
            {"mode": "unknown"},
            {"mode": "markdown", "source": []},
            {"mode": "blocks", "serialized": 1},
            {"mode": "paired_restore", "source": "x", "serialized": "x"},
        ]:
            with self.subTest(request=request):
                self.assertFalse(request_php(request)["ok"])

    def test_unknown_attributes_and_malformed_structure(self):
        cases = [
            "<!-- wp:third-party/widget --><div>Keep me</div><!-- /wp:third-party/widget -->",
            '<!-- wp:paragraph {"align":"right"} --><p>Text</p><!-- /wp:paragraph -->',
            '<!-- wp:paragraph --><p style="color:red">Text</p><!-- /wp:paragraph -->',
            '<!-- wp:paragraph --><p onclick="alert(1)">Text</p><!-- /wp:paragraph -->',
            "<!-- wp:paragraph --><p>Text</p><!-- /wp:heading -->",
            '<!-- wp:heading {"level":2,"level":3} --><h3 class="wp-block-heading">Text</h3><!-- /wp:heading -->',
            '<!-- wp:heading {"level":"2"} --><h2 class="wp-block-heading">Text</h2><!-- /wp:heading -->',
            "<!-- wp:paragraph --><p>Text</p>",
            "<!-- wp:paragraph --><p>Text</p><!-- /wp:paragraph -->UNTRACKED",
            '<!-- wp:paragraph --><p><a href="https://example.com" href="javascript:bad">link</a></p><!-- /wp:paragraph -->',
        ]
        for value in cases:
            with self.subTest(value=value):
                self.assertFalse(convert("blocks", value)["ok"])

    def test_no_silent_html_or_script_link_acceptance(self):
        for value in [
            "<script>alert(1)</script>",
            '<span style="position:absolute">Text</span>',
            "[bad](javascript:alert%281%29)",
        ]:
            with self.subTest(value=value):
                self.assertFalse(convert("markdown", value)["ok"])

    def test_input_and_nesting_limit(self):
        for value in ["x" * 262145, "a\0b", "> " * 40 + "nested"]:
            with self.subTest(length=len(value)):
                self.assertFalse(convert("markdown", value)["ok"])

    def test_required_source_contract(self):
        for item in json.loads((ROOT / "fixtures.json").read_text()):
            with self.subTest(id=item["id"]):
                result = convert("markdown", item["source"])
                self.assertEqual(result["ok"], item["expected_php"], result)
                if result["ok"]:
                    self.assertEqual(result["source"], item["source"])

    def test_new_block_edits_are_really_exported(self):
        cases = [
            ("![Original](https://example.com/image.png)\n", "Original", "Changed"),
            ("| Name | Value |\n| --- | --- |\n| Original | 1 |\n", "Original", "Changed"),
            ("Text[^n].\n\n[^n]: Original note.\n", "Original", "Changed"),
        ]
        for source, old, new in cases:
            with self.subTest(source=source):
                original = convert("markdown", source)
                self.assertTrue(original["ok"], original)
                edited = original["serialized"].replace(old, new)
                exported = convert("blocks", edited)
                self.assertTrue(exported["ok"], exported)
                self.assertIn(new, exported["source"])
                self.assertNotIn(old, exported["source"])
                self.assertEqual(convert("markdown", exported["source"])["serialized"], edited)

    def test_new_block_attributes_and_reference_integrity(self):
        cases = [
            ("![alt](https://example.com/a.png)\n", 'alt="alt"', 'alt="alt" onerror="bad()"'),
            ("| a | b |\n| --- | --- |\n| c | d |\n", "<td>", '<td colspan="2">'),
            ("Text[^n].\n\n[^n]: Note.\n", 'data-mbb-footnote="n"', 'data-mbb-footnote="missing"'),
            ("Text[^n].\n\n[^n]: Note.\n", "[^n]", "[^other]"),
        ]
        for source, old, new in cases:
            with self.subTest(source=source, attribute=new):
                result = convert("markdown", source)
                self.assertTrue(result["ok"], result)
                self.assertIn(old, result["serialized"])
                self.assertFalse(convert("blocks", result["serialized"].replace(old, new))["ok"])

    def test_exact_historical_pairs_and_tamper_rejection(self):
        for item in json.loads((ROOT / "paired-fixtures.json").read_text()):
            with self.subTest(id=item["id"]):
                request = {"mode": "paired_restore", **item}
                restored = request_php(request)
                self.assertTrue(restored["ok"], restored)
                self.assertEqual(restored["source"], item["source"])
                self.assertEqual(restored["serialized"], item["serialized"])
                self.assertFalse(
                    request_php({**request, "serialized": item["serialized"] + "tamper"})["ok"]
                )
                self.assertFalse(
                    request_php({**request, "source": item["source"] + "\nChanged."})["ok"]
                )
                self.assertFalse(request_php({**request, "documentId": ""})["ok"])
                self.assertFalse(request_php({**request, "documentId": " \t"})["ok"])
                equivalent = request_php({**request, "source": item["source"] + "\n"})
                self.assertTrue(equivalent["ok"], equivalent)
                self.assertEqual(equivalent["source"], item["source"] + "\n")
                self.assertFalse(
                    request_php({**request, "serialized": item["serialized"] + "\n"})["ok"]
                )

    def test_paired_restore_is_not_an_html_bypass(self):
        for source, html in [
            ("<script>bad()</script>\n", "<script>bad()</script>"),
            ('<p onclick="bad()">Text</p>\n', '<p onclick="bad()">Text</p>'),
        ]:
            with self.subTest(source=source):
                result = request_php(
                    {
                        "mode": "paired_restore",
                        "source": source,
                        "serialized": "<!-- wp:html -->\n" + html + "\n<!-- /wp:html -->",
                        "documentId": "unsafe-snapshot",
                    }
                )
                self.assertFalse(result["ok"])

    def test_footnote_container_integrity(self):
        result = convert("markdown", "Text[^a] and [^b].\n\n[^a]: A.\n\n[^b]: B.\n")
        self.assertTrue(result["ok"], result)
        first, marker, notes = result["serialized"].partition("<!-- wp:mbb/footnotes -->")
        self.assertTrue(marker)
        for altered in [
            marker + notes,
            marker + notes + "\n\n" + first.rstrip(),
            result["serialized"].replace('"label":"b"', '"label":"a"'),
        ]:
            with self.subTest(altered=altered[:80]):
                self.assertFalse(convert("blocks", altered)["ok"])

    def test_escaped_and_entity_task_markers_not_checked(self):
        for value in [
            "- \\[x] literal\n",
            "- &#91;x&#93; literal\n",
            "- &lbrack;x&rbrack; literal\n",
            "- [&#120;] literal\n",
        ]:
            with self.subTest(value=value):
                result = convert("markdown", value)
                # Conservative rejection is acceptable for this experiment.
                if result["ok"]:
                    self.assertNotIn("mbb/task-item", result["serialized"])

    def test_task_marker_before_continuation(self):
        result = convert("markdown", "- [x]\n  done\n")
        self.assertTrue(result["ok"], result)
        self.assertNotIn("mbb/task-item", result["serialized"])
        self.assertIn("<br>", result["serialized"])

    def test_original_source_is_retained(self):
        value = "# Title\n\nText.\n\n[unused]: https://example.com\n"
        result = convert("markdown", value)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["source"], value)
        self.assertIn("normalized_source", result)

    def test_code_does_not_become_math_or_tasks(self):
        value = "```text\n$x$\n- [x] literal\n[^note]\n```\n"
        result = convert("markdown", value)
        self.assertTrue(result["ok"], result)
        self.assertNotIn("wp:mbb/math", result["serialized"])
        self.assertNotIn("wp:mbb/task-item", result["serialized"])
        self.assertEqual(convert("blocks", result["serialized"])["source"], value)


if __name__ == "__main__":
    unittest.main()
