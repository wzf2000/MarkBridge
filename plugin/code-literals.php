<?php
// Reading projection only. Stored block HTML and Markdown are never rewritten.
function mbb_code_literal_html(string $html): string
{
    if (!str_contains($html, '[')) {
        return $html;
    }
    // WordPress 7.1 is the plugin minimum. It exposes no public raw token offsets;
    // one supported bookmark gives the protected span, without private state/reflection.
    $parser = new class ($html) extends WP_HTML_Tag_Processor {
        public function literal_span(): array
        {
            $this->set_bookmark('mbb-literal');
            $span = $this->bookmarks['mbb-literal'];
            $range = [$span->start, $span->length];
            $this->release_bookmark('mbb-literal');
            return $range;
        }
    };
    $stack = [];
    $overflow = 0;
    $cursor = 0;
    $parts = [];
    // One linear scan, one bookmark and at most 32 stack entries. Valid deeper
    // nesting uses a counter. Output is at most five times input; never truncate.
    while ($parser->next_token()) {
        if ($parser->get_token_type() === '#tag') {
            $tag = $parser->get_tag();
            if (!in_array($tag, ['PRE', 'CODE'], true)) {
                continue;
            }
            if (!$parser->is_tag_closer()) {
                if ($overflow || count($stack) === 32) {
                    ++$overflow;
                } else {
                    $stack[] = $tag;
                }
            } elseif ($overflow) {
                --$overflow;
            } elseif (in_array($tag, $stack, true)) {
                do {
                    $closed = array_pop($stack);
                } while ($closed !== $tag);
            }
        } elseif (($stack || $overflow) && $parser->get_token_type() === '#text') {
            [$start, $length] = $parser->literal_span();
            $raw = substr($html, $start, $length);
            if (!str_contains($raw, '[')) {
                continue;
            }
            $parts[] = substr($html, $cursor, $start - $cursor);
            $parts[] = str_replace('[', '&#91;', $raw);
            $cursor = $start + $length;
        }
    }
    // Unclosed pre/code stays literal through EOF. An incomplete HTML token is
    // opaque: keep its remaining bytes, without guessing at tags or attributes.
    if (!$parts) {
        return $html;
    }
    $parts[] = substr($html, $cursor);
    return implode('', $parts);
}
function mbb_protect_code_shortcodes($html)
{
    return mbb_managed(get_the_ID()) ? mbb_code_literal_html($html) : $html;
}
// After do_blocks (9), before do_shortcode (11), also when Companion owns presentation.
add_filter('the_content', 'mbb_protect_code_shortcodes', 10);
